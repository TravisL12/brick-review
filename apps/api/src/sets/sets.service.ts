import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { BricksetService } from '../brickset/brickset.service';
import { parseSetNumList } from '../common/set-num.util';
import type { ImportSetsDto } from './dto';

const CHUNK = 400;

@Injectable()
export class SetsService implements OnModuleInit {
  private readonly logger = new Logger(SetsService.name);
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
    private readonly brickset: BricksetService,
  ) {}

  async list() {
    const sets = await this.prisma.legoSet.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: { _count: { select: { parts: true } } },
    });
    return sets.map(({ _count, ...set }) => ({ ...set, inventoryLines: _count.parts }));
  }

  async stats() {
    const [sets, ready, pending, errored, parts] = await Promise.all([
      this.prisma.legoSet.count(),
      this.prisma.legoSet.count({ where: { syncStatus: 'ready' } }),
      this.prisma.legoSet.count({ where: { syncStatus: { in: ['pending', 'syncing'] } } }),
      this.prisma.legoSet.count({ where: { syncStatus: 'error' } }),
      this.prisma.setPart.count(),
    ]);
    const distinct = await this.prisma.setPart.findMany({
      distinct: ['partNum'],
      select: { partNum: true },
    });
    return {
      sets,
      ready,
      pending,
      errored,
      inventoryLines: parts,
      distinctParts: distinct.length,
      rebrickableKeyConfigured: this.rebrickable.isConfigured(),
      bricksetKeyConfigured: this.brickset.isConfigured(),
    };
  }

  /** Accepts a pasted blob and/or an explicit array; creates rows and starts syncing. */
  async importSets(dto: ImportSetsDto) {
    const raw = [dto.text ?? '', ...(dto.setNums ?? [])].join('\n');
    const { setNums, invalid } = parseSetNumList(raw);

    const existing = await this.prisma.legoSet.findMany({
      where: { setNum: { in: setNums } },
      select: { setNum: true },
    });
    const existingSet = new Set(existing.map((s) => s.setNum));
    const toCreate = setNums.filter((s) => !existingSet.has(s));

    for (const setNum of toCreate) {
      await this.prisma.legoSet.create({ data: { setNum, syncStatus: 'pending' } });
    }

    void this.runSyncQueue();

    return {
      requested: setNums.length,
      added: toCreate.length,
      duplicates: setNums.filter((s) => existingSet.has(s)),
      invalid,
      setNums: toCreate,
    };
  }

  /** Older rows were synced before theme names and image lists existed. */
  async onModuleInit(): Promise<void> {
    await this.backfillThemeNames();
    // Both take minutes across a whole collection; neither may hold up boot.
    void this.backfillImages().then(() => this.warmThumbnails());
  }

  private async backfillThemeNames(): Promise<void> {
    if (!this.rebrickable.isConfigured()) return;
    const stale = await this.prisma.legoSet.findMany({
      where: { themeName: null, themeId: { not: null } },
      select: { id: true, themeId: true },
    });
    if (stale.length === 0) return;

    for (const set of stale) {
      const themeName = await this.rebrickable.getThemePath(set.themeId);
      if (themeName) {
        await this.prisma.legoSet.update({ where: { id: set.id }, data: { themeName } });
      }
    }
    this.logger.log(`Backfilled theme names for ${stale.length} set(s)`);
  }

  /**
   * Sets synced before Brickset support have no picture rows. Fill them in once,
   * without a full resync — the inventory they already hold is still good.
   */
  private async backfillImages(): Promise<void> {
    if (!this.brickset.isConfigured()) return;
    const missing = await this.prisma.legoSet.findMany({
      where: { syncStatus: 'ready', images: { none: {} } },
      select: { id: true, setNum: true, imgUrl: true, bricksetId: true },
    });
    if (missing.length === 0) return;

    this.logger.log(`Backfilling images for ${missing.length} set(s)…`);
    let filled = 0;
    for (const set of missing) {
      try {
        const bricksetId = await this.syncImages(set.id, set.setNum, set.imgUrl, set.bricksetId);
        if (bricksetId !== set.bricksetId) {
          await this.prisma.legoSet.update({ where: { id: set.id }, data: { bricksetId } });
        }
        filled += 1;
      } catch (err) {
        this.logger.warn(`Image backfill failed for ${set.setNum}: ${String(err)}`);
      }
    }
    this.logger.log(`Backfilled images for ${filled} set(s)`);
  }

  /**
   * Rebrickable renders thumbnails on demand, so a set synced before warming
   * existed still has cold gallery sizes. Re-warming is idempotent and costs
   * ~35ms per already-warm preset, so it is cheap enough to simply run at boot.
   */
  private async warmThumbnails(): Promise<void> {
    const sets = await this.prisma.legoSet.findMany({
      where: { imgUrl: { not: null } },
      select: { setNum: true, imgUrl: true },
    });
    if (sets.length === 0) return;

    const startedAt = Date.now();
    for (const set of sets) await this.rebrickable.warmThumbs(set.imgUrl);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    this.logger.log(`Warmed gallery thumbnails for ${sets.length} set(s) in ${seconds}s`);
  }

  /** One set with aggregate inventory figures for the detail page. */
  async findOne(setNum: string) {
    const set = await this.prisma.legoSet.findUnique({
      where: { setNum },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, url: true, thumbUrl: true, source: true },
        },
      },
    });
    if (!set) throw new NotFoundException(`Set ${setNum} is not in the collection`);

    const parts = await this.prisma.setPart.findMany({
      where: { setId: set.id },
      select: { partNum: true, colorId: true, quantity: true, isSpare: true },
    });

    const regular = parts.filter((p) => !p.isSpare);
    const spares = parts.filter((p) => p.isSpare);

    return {
      ...set,
      // Rows synced before image support have no SetImage children; show the one
      // picture they do have rather than an empty carousel.
      images:
        set.images.length > 0
          ? set.images
          : set.imgUrl
            ? [{ id: `${set.id}-primary`, url: set.imgUrl, thumbUrl: null, source: 'rebrickable' }]
            : [],
      summary: {
        inventoryLines: parts.length,
        totalPieces: regular.reduce((sum, p) => sum + p.quantity, 0),
        distinctParts: new Set(parts.map((p) => p.partNum)).size,
        distinctColors: new Set(parts.map((p) => p.colorId)).size,
        spareLines: spares.length,
        sparePieces: spares.reduce((sum, p) => sum + p.quantity, 0),
      },
    };
  }

  /** Full inventory for one set. Local SQLite, so the whole list ships at once. */
  async findParts(setNum: string) {
    const set = await this.prisma.legoSet.findUnique({
      where: { setNum },
      select: { id: true },
    });
    if (!set) throw new NotFoundException(`Set ${setNum} is not in the collection`);

    const parts = await this.prisma.setPart.findMany({
      where: { setId: set.id },
      orderBy: [{ isSpare: 'asc' }, { quantity: 'desc' }, { partNum: 'asc' }],
      select: {
        id: true,
        partNum: true,
        name: true,
        imgUrl: true,
        colorId: true,
        colorName: true,
        colorHex: true,
        quantity: true,
        isSpare: true,
        elementId: true,
      },
    });

    await this.ensureColorAliases();

    // BrickLink uses its own part and colour ids; resolve both so links land correctly.
    const partNums = [...new Set(parts.map((p) => p.partNum))];
    const blPartIds = new Map<string, string>();
    for (let i = 0; i < partNums.length; i += CHUNK) {
      const aliases = await this.prisma.partAlias.findMany({
        where: { source: 'BrickLink', partNum: { in: partNums.slice(i, i + CHUNK) } },
        select: { partNum: true, externalId: true },
        orderBy: { externalId: 'asc' },
      });
      for (const alias of aliases) {
        if (!blPartIds.has(alias.partNum)) blPartIds.set(alias.partNum, alias.externalId);
      }
    }

    const colorIds = [...new Set(parts.map((p) => p.colorId).filter((c): c is number => c != null))];
    const blColorIds = new Map<number, number>();
    if (colorIds.length > 0) {
      const colors = await this.prisma.colorAlias.findMany({
        where: { id: { in: colorIds }, bricklinkId: { not: null } },
        select: { id: true, bricklinkId: true },
      });
      for (const color of colors) {
        if (color.bricklinkId != null) blColorIds.set(color.id, color.bricklinkId);
      }
    }

    return parts.map((part) => {
      const blPart = blPartIds.get(part.partNum);
      const blColor = part.colorId != null ? blColorIds.get(part.colorId) : undefined;
      return {
        ...part,
        bricklinkId: blPart ?? null,
        links: {
          // Rebrickable redirects /parts/{id}/ to its canonical slug, and ignores a
          // colour segment, so link the plain part page.
          rebrickable: `https://rebrickable.com/parts/${encodeURIComponent(part.partNum)}/`,
          bricklink: blPart
            ? `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(
                blPart,
              )}${blColor != null ? `&idColor=${blColor}` : ''}`
            : null,
        },
      };
    });
  }

  /**
   * Populates the Rebrickable -> BrickLink colour map. One API call, stored once;
   * failures are non-fatal because links degrade to part-only.
   */
  private async ensureColorAliases(): Promise<void> {
    if (!this.rebrickable.isConfigured()) return;
    const known = await this.prisma.colorAlias.count();
    if (known > 0) return;

    try {
      const colors = await this.rebrickable.getColors();
      const rows = colors.map((color) => ({
        id: color.id,
        name: color.name,
        rgb: color.rgb ?? null,
        bricklinkId: color.external_ids?.BrickLink?.ext_ids?.[0] ?? null,
      }));
      for (let i = 0; i < rows.length; i += CHUNK) {
        await this.prisma.colorAlias.createMany({ data: rows.slice(i, i + CHUNK) });
      }
      this.logger.log(`Cached ${rows.length} colour aliases`);
    } catch (err) {
      this.logger.warn(`Could not cache colour aliases: ${String(err)}`);
    }
  }

  async remove(setNum: string) {
    const set = await this.prisma.legoSet.findUnique({ where: { setNum } });
    if (!set) throw new NotFoundException(`Set ${setNum} is not in the collection`);
    await this.prisma.legoSet.delete({ where: { setNum } });
    return { removed: setNum };
  }

  async resync(setNum: string) {
    const set = await this.prisma.legoSet.findUnique({ where: { setNum } });
    if (!set) throw new NotFoundException(`Set ${setNum} is not in the collection`);
    await this.prisma.legoSet.update({
      where: { setNum },
      data: { syncStatus: 'pending', syncError: null },
    });
    void this.runSyncQueue();
    return { queued: setNum };
  }

  async retryFailed() {
    const { count } = await this.prisma.legoSet.updateMany({
      where: { syncStatus: 'error' },
      data: { syncStatus: 'pending', syncError: null },
    });
    void this.runSyncQueue();
    return { queued: count };
  }

  /**
   * Drains every pending set one at a time. Safe to call concurrently — the
   * `syncing` guard collapses overlapping calls into the single running drain.
   */
  async runSyncQueue(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      for (;;) {
        const next = await this.prisma.legoSet.findFirst({
          where: { syncStatus: 'pending' },
          orderBy: { createdAt: 'asc' },
        });
        if (!next) break;

        await this.prisma.legoSet.update({
          where: { id: next.id },
          data: { syncStatus: 'syncing' },
        });

        try {
          await this.syncOne(next);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Sync failed for ${next.setNum}: ${message}`);
          await this.prisma.legoSet.update({
            where: { id: next.id },
            data: { syncStatus: 'error', syncError: message.slice(0, 500) },
          });
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private async syncOne(set: { id: string; setNum: string; bricksetId: number | null }): Promise<void> {
    const { id: setId, setNum } = set;
    const details = await this.rebrickable.getSet(setNum);
    const inventory = await this.rebrickable.getSetParts(setNum);
    const themeName = await this.rebrickable.getThemePath(details.theme_id);

    // Collapse duplicate inventory lines — the unique key is (set, part, color, spare).
    const lines = new Map<string, {
      setId: string;
      partNum: string;
      name: string | null;
      imgUrl: string | null;
      colorId: number | null;
      colorName: string | null;
      colorHex: string | null;
      quantity: number;
      isSpare: boolean;
      elementId: string | null;
    }>();
    const aliases = new Map<string, { source: string; externalId: string; partNum: string }>();

    for (const entry of inventory) {
      const partNum = entry.part.part_num;
      const colorId = entry.color?.id ?? null;
      const key = `${partNum}|${colorId}|${entry.is_spare}`;
      const existing = lines.get(key);
      if (existing) {
        existing.quantity += entry.quantity;
      } else {
        lines.set(key, {
          setId,
          partNum,
          name: entry.part.name ?? null,
          imgUrl: entry.part.part_img_url ?? null,
          colorId,
          colorName: entry.color?.name ?? null,
          colorHex: entry.color?.rgb ?? null,
          quantity: entry.quantity,
          isSpare: entry.is_spare,
          elementId: entry.element_id ?? null,
        });
      }

      // Rebrickable part_num is itself a valid lookup key.
      aliases.set(`Rebrickable|${partNum}|${partNum}`, {
        source: 'Rebrickable',
        externalId: partNum,
        partNum,
      });
      for (const [source, ids] of Object.entries(entry.part.external_ids ?? {})) {
        for (const externalId of ids ?? []) {
          if (!externalId) continue;
          aliases.set(`${source}|${externalId}|${partNum}`, { source, externalId, partNum });
        }
      }
    }

    await this.prisma.setPart.deleteMany({ where: { setId } });
    const rows = [...lines.values()];
    for (let i = 0; i < rows.length; i += CHUNK) {
      await this.prisma.setPart.createMany({ data: rows.slice(i, i + CHUNK) });
    }

    await this.saveAliases([...aliases.values()]);

    const bricksetId = await this.syncImages(
      setId,
      setNum,
      details.set_img_url,
      set.bricksetId,
    );

    await this.prisma.legoSet.update({
      where: { id: setId },
      data: {
        name: details.name,
        year: details.year,
        themeId: details.theme_id,
        themeName,
        numParts: details.num_parts,
        imgUrl: details.set_img_url,
        bricksetId,
        syncStatus: 'ready',
        syncError: null,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Synced ${setNum}: ${rows.length} inventory lines, ${aliases.size} aliases`);
  }

  /**
   * Rebuilds a set's picture list: the Rebrickable box shot first, then Brickset's
   * additional photos. Returns the Brickset id so the caller can cache it.
   */
  private async syncImages(
    setId: string,
    setNum: string,
    rebrickableImg: string | null,
    knownBricksetId: number | null,
  ): Promise<number | null> {
    const rows: { url: string; thumbUrl: string | null; source: string; sortOrder: number }[] = [];

    if (rebrickableImg) {
      rows.push({ url: rebrickableImg, thumbUrl: null, source: 'rebrickable', sortOrder: 0 });
    }

    const { bricksetId, images } = await this.brickset.getSetImages(setNum, knownBricksetId);
    for (const img of images) {
      rows.push({
        url: img.url,
        thumbUrl: img.thumbUrl,
        source: 'brickset',
        sortOrder: rows.length,
      });
    }

    // (setId, url) is unique, and the two sources can point at the same file.
    const seen = new Set<string>();
    const unique = rows.filter((row) => {
      if (seen.has(row.url)) return false;
      seen.add(row.url);
      return true;
    });

    await this.prisma.setImage.deleteMany({ where: { setId } });
    if (unique.length > 0) {
      await this.prisma.setImage.createMany({
        data: unique.map((row) => ({ ...row, setId })),
      });
    }

    // Have the CDN render the gallery sizes now rather than under the first viewer.
    await this.rebrickable.warmThumbs(rebrickableImg);
    return bricksetId;
  }

  /** SQLite has no createMany(skipDuplicates), so filter against what is already stored. */
  private async saveAliases(
    candidates: { source: string; externalId: string; partNum: string }[],
  ): Promise<void> {
    if (candidates.length === 0) return;

    const partNums = [...new Set(candidates.map((a) => a.partNum))];
    const known = new Set<string>();
    for (let i = 0; i < partNums.length; i += CHUNK) {
      const existing = await this.prisma.partAlias.findMany({
        where: { partNum: { in: partNums.slice(i, i + CHUNK) } },
        select: { source: true, externalId: true, partNum: true },
      });
      for (const a of existing) known.add(`${a.source}|${a.externalId}|${a.partNum}`);
    }

    const fresh = candidates.filter(
      (a) => !known.has(`${a.source}|${a.externalId}|${a.partNum}`),
    );
    for (let i = 0; i < fresh.length; i += CHUNK) {
      await this.prisma.partAlias.createMany({ data: fresh.slice(i, i + CHUNK) });
    }
  }
}
