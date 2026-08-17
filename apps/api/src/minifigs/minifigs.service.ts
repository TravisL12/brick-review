import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { chunk } from '../common/chunk.util';
import { CatalogAliasService } from '../sets/catalog-alias.service';
import { mapInventory } from '../sets/inventory.mapper';

/** One set a fig turns up in, as shown on the fig's gallery tile. */
interface MinifigOwner {
  setNum: string;
  setName: string | null;
  themeName: string | null;
  quantity: number;
}

/** The same fig across every set that ships it. */
interface MinifigSummary {
  figNum: string;
  name: string | null;
  imgUrl: string | null;
  /** Every copy the collection holds, counting duplicates within a set. */
  totalQuantity: number;
  sets: MinifigOwner[];
}

@Injectable()
export class MinifigsService {
  private readonly logger = new Logger(MinifigsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
    private readonly aliases: CatalogAliasService,
  ) {}

  /**
   * Every minifig in the collection, folded by fig number: the same character can
   * ship in several sets, and the gallery shows it once with its origins listed.
   */
  async list(): Promise<MinifigSummary[]> {
    const rows = await this.prisma.setMinifig.findMany({
      orderBy: [{ name: 'asc' }, { figNum: 'asc' }],
      select: {
        figNum: true,
        name: true,
        imgUrl: true,
        quantity: true,
        set: { select: { setNum: true, name: true, themeName: true } },
      },
    });

    const byFig = new Map<string, MinifigSummary>();
    for (const row of rows) {
      let fig = byFig.get(row.figNum);
      if (!fig) {
        fig = {
          figNum: row.figNum,
          name: row.name,
          imgUrl: row.imgUrl,
          totalQuantity: 0,
          sets: [],
        };
        byFig.set(row.figNum, fig);
      }
      // Earlier rows can predate a fig gaining a picture upstream; take the first one there is.
      fig.imgUrl ??= row.imgUrl;
      fig.totalQuantity += row.quantity;
      fig.sets.push({
        setNum: row.set.setNum,
        setName: row.set.name,
        themeName: row.set.themeName,
        quantity: row.quantity,
      });
    }

    for (const fig of byFig.values()) {
      fig.sets.sort((a, b) => a.setNum.localeCompare(b.setNum, undefined, { numeric: true }));
    }
    return [...byFig.values()];
  }

  /**
   * One fig, with the sets it came out of and the pieces it is built from.
   *
   * A fig's own inventory is a separate Rebrickable call per fig, so pulling all
   * of them at set-sync time would add a rate-limited request per fig for pages
   * that may never be opened. It is fetched on the first view instead and cached
   * from then on — the first load of a given fig pays roughly a second.
   */
  async findOne(figNum: string) {
    const owners = await this.prisma.setMinifig.findMany({
      where: { figNum },
      orderBy: { set: { setNum: 'asc' } },
      select: {
        name: true,
        imgUrl: true,
        quantity: true,
        set: { select: { setNum: true, name: true, imgUrl: true, themeName: true, year: true } },
      },
    });
    if (owners.length === 0) {
      throw new NotFoundException(`Minifig ${figNum} is not in the collection`);
    }

    const fig = await this.ensureDetail(figNum, owners[0]);

    const parts = await this.prisma.minifigPart.findMany({
      where: { minifigId: fig.id },
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

    return {
      figNum: fig.figNum,
      name: fig.name,
      imgUrl: fig.imgUrl,
      numParts: fig.numParts,
      partsSyncedAt: fig.partsSyncedAt,
      syncError: fig.partsSyncedAt == null ? 'Could not load this fig from Rebrickable' : null,
      totalQuantity: owners.reduce((sum, o) => sum + o.quantity, 0),
      sets: owners.map((o) => ({
        setNum: o.set.setNum,
        setName: o.set.name,
        setImgUrl: o.set.imgUrl,
        themeName: o.set.themeName,
        year: o.set.year,
        quantity: o.quantity,
      })),
      parts: await this.aliases.decorateParts(parts),
    };
  }

  /** Drops the cached inventory so the next read pulls it again. */
  async resync(figNum: string) {
    const fig = await this.prisma.minifig.findUnique({ where: { figNum } });
    if (fig) {
      await this.prisma.minifig.update({
        where: { figNum },
        data: { partsSyncedAt: null },
      });
    }
    return this.findOne(figNum);
  }

  /**
   * Returns the cached fig row, pulling its catalogue entry and inventory the
   * first time. The name and picture the owning set already gave us seed the row,
   * so the page still renders if Rebrickable is unreachable.
   */
  private async ensureDetail(
    figNum: string,
    seed: { name: string | null; imgUrl: string | null },
  ) {
    const fig = await this.prisma.minifig.upsert({
      where: { figNum },
      create: { figNum, name: seed.name, imgUrl: seed.imgUrl },
      update: {},
    });
    if (fig.partsSyncedAt) return fig;

    try {
      const [details, inventory] = await Promise.all([
        this.rebrickable.getMinifig(figNum),
        this.rebrickable.getMinifigParts(figNum),
      ]);
      const { lines, aliases } = mapInventory(inventory);

      await this.prisma.minifigPart.deleteMany({ where: { minifigId: fig.id } });
      for (const batch of chunk(lines)) {
        await this.prisma.minifigPart.createMany({
          data: batch.map((line) => ({ ...line, minifigId: fig.id })),
        });
      }
      await this.aliases.saveParts(aliases);

      this.logger.log(`Cached ${lines.length} part line(s) for ${figNum}`);
      return await this.prisma.minifig.update({
        where: { id: fig.id },
        data: {
          name: details.name ?? fig.name,
          imgUrl: details.set_img_url ?? fig.imgUrl,
          numParts: details.num_parts,
          partsSyncedAt: new Date(),
        },
      });
    } catch (err) {
      // The fig still has a name, a picture and its owning sets without this.
      this.logger.warn(`Could not load minifig ${figNum}: ${String(err)}`);
      return fig;
    }
  }

  async stats() {
    const [lines, figs] = await Promise.all([
      this.prisma.setMinifig.aggregate({ _sum: { quantity: true }, _count: true }),
      this.prisma.setMinifig.findMany({ distinct: ['figNum'], select: { figNum: true } }),
    ]);
    return {
      distinctFigs: figs.length,
      totalFigs: lines._sum.quantity ?? 0,
      lines: lines._count,
    };
  }
}
