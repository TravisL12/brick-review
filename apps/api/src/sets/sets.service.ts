import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { BricksetService } from '../brickset/brickset.service';
import { CatalogAliasService } from './catalog-alias.service';
import { SetSyncService } from './set-sync.service';
import type { ImportSetsDto } from './dto';

/** Reads the collection for the UI; queueing and syncing live in SetSyncService. */
@Injectable()
export class SetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
    private readonly brickset: BricksetService,
    private readonly aliases: CatalogAliasService,
    private readonly sync: SetSyncService,
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

  importSets(dto: ImportSetsDto) {
    return this.sync.importSets(dto);
  }

  resync(setNum: string) {
    return this.sync.resync(setNum);
  }

  retryFailed() {
    return this.sync.retryFailed();
  }

  runSyncQueue(): Promise<void> {
    return this.sync.runSyncQueue();
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

    await this.aliases.ensureColors();

    // BrickLink uses its own part and colour ids; resolve both so links land correctly.
    const blPartIds = await this.aliases.bricklinkPartIds([
      ...new Set(parts.map((p) => p.partNum)),
    ]);
    const blColorIds = await this.aliases.bricklinkColorIds([
      ...new Set(parts.map((p) => p.colorId).filter((c): c is number => c != null)),
    ]);

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

  async remove(setNum: string) {
    const set = await this.prisma.legoSet.findUnique({ where: { setNum } });
    if (!set) throw new NotFoundException(`Set ${setNum} is not in the collection`);
    await this.prisma.legoSet.delete({ where: { setNum } });
    return { removed: setNum };
  }
}
