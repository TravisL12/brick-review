import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { chunk } from '../common/chunk.util';
import type { PartAliasRow } from './inventory.mapper';

/** Where one inventory row can be looked up outside the app. */
export interface PartLinks {
  rebrickable: string;
  bricklink: string | null;
}

/**
 * Owns the Rebrickable -> external catalogue id maps. Brickognize answers in
 * BrickLink ids and the collection is keyed by Rebrickable part numbers, so
 * every cross-catalogue link goes through here.
 */
@Injectable()
export class CatalogAliasService {
  private readonly logger = new Logger(CatalogAliasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
  ) {}

  /** SQLite has no createMany(skipDuplicates), so filter against what is already stored. */
  async saveParts(candidates: PartAliasRow[]): Promise<void> {
    if (candidates.length === 0) return;

    const partNums = [...new Set(candidates.map((a) => a.partNum))];
    const known = new Set<string>();
    for (const batch of chunk(partNums)) {
      const existing = await this.prisma.partAlias.findMany({
        where: { partNum: { in: batch } },
        select: { source: true, externalId: true, partNum: true },
      });
      for (const a of existing) known.add(`${a.source}|${a.externalId}|${a.partNum}`);
    }

    const fresh = candidates.filter(
      (a) => !known.has(`${a.source}|${a.externalId}|${a.partNum}`),
    );
    for (const batch of chunk(fresh)) {
      await this.prisma.partAlias.createMany({ data: batch });
    }
  }

  /**
   * Attaches the BrickLink id and the outbound catalogue links to inventory rows.
   * Set inventories and minifig inventories are the same shape and want the same
   * links, so the lookup lives here rather than in either caller.
   */
  async decorateParts<T extends { partNum: string; colorId: number | null }>(
    parts: T[],
  ): Promise<(T & { bricklinkId: string | null; links: PartLinks })[]> {
    await this.ensureColors();

    // BrickLink uses its own part and colour ids; resolve both so links land correctly.
    const blPartIds = await this.bricklinkPartIds([...new Set(parts.map((p) => p.partNum))]);
    const blColorIds = await this.bricklinkColorIds([
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

  /** BrickLink part id per Rebrickable part number; the lowest id wins when a part has several. */
  async bricklinkPartIds(partNums: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const batch of chunk(partNums)) {
      const aliases = await this.prisma.partAlias.findMany({
        where: { source: 'BrickLink', partNum: { in: batch } },
        select: { partNum: true, externalId: true },
        orderBy: { externalId: 'asc' },
      });
      for (const alias of aliases) {
        if (!out.has(alias.partNum)) out.set(alias.partNum, alias.externalId);
      }
    }
    return out;
  }

  /** BrickLink colour id per Rebrickable colour id, for colour-accurate deep links. */
  async bricklinkColorIds(colorIds: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    if (colorIds.length === 0) return out;

    const colors = await this.prisma.colorAlias.findMany({
      where: { id: { in: colorIds }, bricklinkId: { not: null } },
      select: { id: true, bricklinkId: true },
    });
    for (const color of colors) {
      if (color.bricklinkId != null) out.set(color.id, color.bricklinkId);
    }
    return out;
  }

  /**
   * Populates the Rebrickable -> BrickLink colour map. One API call, stored once;
   * failures are non-fatal because links degrade to part-only.
   */
  async ensureColors(): Promise<void> {
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
      for (const batch of chunk(rows)) {
        await this.prisma.colorAlias.createMany({ data: batch });
      }
      this.logger.log(`Cached ${rows.length} colour aliases`);
    } catch (err) {
      this.logger.warn(`Could not cache colour aliases: ${String(err)}`);
    }
  }
}
