import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { BricksetService } from '../brickset/brickset.service';
import { CatalogAliasService } from './catalog-alias.service';
import { SetSyncService } from './set-sync.service';
import type { ImportSetsDto } from './dto';

/**
 * Reads one user's collection for the UI; queueing and syncing live in SetSyncService.
 *
 * Every query here filters on `userId`. A set number is unique per user, not
 * globally, so the compound `userId_setNum` key is what identifies a row — a bare
 * `where: { setNum }` would reach into other people's collections.
 */
@Injectable()
export class SetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
    private readonly brickset: BricksetService,
    private readonly aliases: CatalogAliasService,
    private readonly sync: SetSyncService,
  ) {}

  async list(userId: string) {
    const sets = await this.prisma.legoSet.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      include: { _count: { select: { parts: true } } },
    });
    return sets.map(({ _count, ...set }) => ({ ...set, inventoryLines: _count.parts }));
  }

  async stats(userId: string) {
    const [sets, ready, pending, errored, parts] = await Promise.all([
      this.prisma.legoSet.count({ where: { userId } }),
      this.prisma.legoSet.count({ where: { userId, syncStatus: 'ready' } }),
      this.prisma.legoSet.count({
        where: { userId, syncStatus: { in: ['pending', 'syncing'] } },
      }),
      this.prisma.legoSet.count({ where: { userId, syncStatus: 'error' } }),
      this.prisma.setPart.count({ where: { set: { userId } } }),
    ]);
    const distinct = await this.prisma.setPart.findMany({
      where: { set: { userId } },
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

  importSets(userId: string, dto: ImportSetsDto) {
    return this.sync.importSets(userId, dto);
  }

  resync(userId: string, setNum: string) {
    return this.sync.resync(userId, setNum);
  }

  retryFailed(userId: string) {
    return this.sync.retryFailed(userId);
  }

  runSyncQueue(): Promise<void> {
    return this.sync.runSyncQueue();
  }

  /** One set with aggregate inventory figures for the detail page. */
  async findOne(userId: string, setNum: string) {
    const set = await this.prisma.legoSet.findUnique({
      where: { userId_setNum: { userId, setNum } },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, url: true, thumbUrl: true, source: true },
        },
        // Small enough (a handful per set) to ship with the header rather than
        // making the detail page wait on a third request.
        minifigs: {
          orderBy: [{ name: 'asc' }, { figNum: 'asc' }],
          select: { id: true, figNum: true, name: true, imgUrl: true, quantity: true },
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
  async findParts(userId: string, setNum: string) {
    const set = await this.prisma.legoSet.findUnique({
      where: { userId_setNum: { userId, setNum } },
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

    return this.aliases.decorateParts(parts);
  }

  async remove(userId: string, setNum: string) {
    const key = { userId_setNum: { userId, setNum } };
    const set = await this.prisma.legoSet.findUnique({ where: key });
    if (!set) throw new NotFoundException(`Set ${setNum} is not in the collection`);
    await this.prisma.legoSet.delete({ where: key });
    return { removed: setNum };
  }
}
