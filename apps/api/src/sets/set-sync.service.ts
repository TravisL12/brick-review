import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { chunk } from '../common/chunk.util';
import { parseSetNumList } from '../common/set-num.util';
import { CatalogAliasService } from './catalog-alias.service';
import { SetImagesService } from './set-images.service';
import { mapInventory } from './inventory.mapper';
import type { ImportSetsDto } from './dto';

/** The columns a sync needs off a queued row. */
interface QueuedSet {
  id: string;
  setNum: string;
  bricksetId: number | null;
}

/** Fetches sets from the upstream APIs and writes them into the collection. */
@Injectable()
export class SetSyncService {
  private readonly logger = new Logger(SetSyncService.name);
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
    private readonly aliases: CatalogAliasService,
    private readonly images: SetImagesService,
  ) {}

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

  /**
   * Replaces a set's minifig list. Kept off the main sync path's failure route on
   * purpose: a set is still perfectly usable without its fig list, so a failure
   * here is logged and the previously stored figs are left alone rather than
   * dropping the whole sync — and the set back to `error` — over a side dish.
   *
   * Returns how many figs were stored, or null if the lookup failed, so the caller
   * only stamps `minifigsSyncedAt` on success and the backfill can retry otherwise.
   */
  async syncMinifigs(setId: string, setNum: string): Promise<number | null> {
    let figs;
    try {
      figs = await this.rebrickable.getSetMinifigs(setNum);
    } catch (err) {
      this.logger.warn(`Minifig sync failed for ${setNum}: ${String(err)}`);
      return null;
    }

    await this.prisma.setMinifig.deleteMany({ where: { setId } });
    if (figs.length > 0) {
      await this.prisma.setMinifig.createMany({
        data: figs.map((fig) => ({
          setId,
          figNum: fig.set_num,
          name: fig.set_name,
          imgUrl: fig.set_img_url,
          quantity: fig.quantity,
        })),
      });
      // The fig gallery reaches for the same presets the set gallery does.
      for (const fig of figs) await this.rebrickable.warmThumbs(fig.set_img_url);
    }
    return figs.length;
  }

  private async syncOne(set: QueuedSet): Promise<void> {
    const { id: setId, setNum } = set;
    const details = await this.rebrickable.getSet(setNum);
    const inventory = await this.rebrickable.getSetParts(setNum);
    const themeName = await this.rebrickable.getThemePath(details.theme_id);
    const figCount = await this.syncMinifigs(setId, setNum);

    const { lines, aliases } = mapInventory(inventory);

    await this.prisma.setPart.deleteMany({ where: { setId } });
    for (const batch of chunk(lines)) {
      await this.prisma.setPart.createMany({ data: batch.map((line) => ({ ...line, setId })) });
    }

    await this.aliases.saveParts(aliases);

    const bricksetId = await this.images.sync(
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
        ...(figCount != null ? { minifigsSyncedAt: new Date() } : {}),
      },
    });

    this.logger.log(
      `Synced ${setNum}: ${lines.length} inventory lines, ${aliases.length} aliases, ` +
        `${figCount ?? 'no'} minifigs`,
    );
  }
}
