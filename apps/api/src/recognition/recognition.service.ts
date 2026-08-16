import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrickognizeService } from '../brickognize/brickognize.service';
import type { BrickognizeItem, BrickognizeSearchType } from '../brickognize/brickognize.types';
import type { ObservationDto } from './dto';

interface OwnedLine {
  setNum: string;
  setName: string | null;
  setImgUrl: string | null;
  partNum: string;
  colorId: number | null;
  colorName: string | null;
  colorHex: string | null;
  quantity: number;
  isSpare: boolean;
}

@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brickognize: BrickognizeService,
  ) {}

  async identify(
    image: Buffer,
    filename: string,
    mimetype: string,
    searchType: BrickognizeSearchType = 'parts',
    minScore = 0,
  ) {
    const result = await this.brickognize.predict(image, filename, mimetype, searchType);
    const items = result.items.filter((i) => i.score >= minScore);

    // Brickognize speaks BrickLink ids; the collection is keyed by Rebrickable part numbers.
    const partNumsByItem = await this.resolvePartNums(items);
    const allPartNums = [...new Set([...partNumsByItem.values()].flat())];
    const ownedByPartNum = await this.findOwnedLines(allPartNums);

    const candidates = items.map((item) => {
      const partNums = partNumsByItem.get(item.id) ?? [];
      const owned = partNums.flatMap((p) => ownedByPartNum.get(p) ?? []);
      return {
        id: item.id,
        name: item.name,
        imgUrl: item.img_url,
        category: item.category,
        type: item.type,
        score: item.score,
        externalSites: item.external_sites,
        /** Rebrickable part numbers this catalog id maps to. */
        partNums,
        /** Best guess canonical part number for session tracking. */
        partNum: partNums[0] ?? item.id,
        inCollection: owned.length > 0,
        ownedIn: owned,
      };
    });

    const setMatches = this.aggregateSetMatches(candidates);

    await this.prisma.scanEvent
      .create({
        data: {
          listingId: result.listing_id,
          searchType,
          candidates: JSON.stringify(items),
          topPartNum: candidates[0]?.partNum ?? null,
          topScore: candidates[0]?.score ?? null,
          matchedSets: JSON.stringify(setMatches.map((m) => m.setNum)),
        },
      })
      .catch((err: unknown) => this.logger.warn(`Could not record scan: ${String(err)}`));

    return {
      listingId: result.listing_id,
      boundingBox: result.bounding_box,
      candidates,
      setMatches,
    };
  }

  /**
   * Ranks the user's sets against everything seen so far in a scan session.
   * Coverage answers "which set do these bricks belong to" far better than a single frame.
   */
  async rank(observations: ObservationDto[]) {
    const weights = new Map<string, number>();
    for (const obs of observations) {
      if (!obs.partNum) continue;
      weights.set(obs.partNum, (weights.get(obs.partNum) ?? 0) + (obs.weight ?? 1));
    }
    const partNums = [...weights.keys()];
    if (partNums.length === 0) {
      return { observedParts: 0, matchedParts: 0, unmatchedParts: [], sets: [] };
    }

    const ownedByPartNum = await this.findOwnedLines(partNums);
    const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);

    const bySet = new Map<
      string,
      {
        setNum: string;
        name: string | null;
        imgUrl: string | null;
        matchedWeight: number;
        matchedParts: { partNum: string; colorName: string | null; quantity: number }[];
      }
    >();

    for (const partNum of partNums) {
      const lines = ownedByPartNum.get(partNum) ?? [];
      // A part may appear in several colors within one set; count the part once per set.
      const seenInSet = new Set<string>();
      for (const line of lines) {
        if (seenInSet.has(line.setNum)) continue;
        seenInSet.add(line.setNum);

        let entry = bySet.get(line.setNum);
        if (!entry) {
          entry = {
            setNum: line.setNum,
            name: line.setName,
            imgUrl: line.setImgUrl,
            matchedWeight: 0,
            matchedParts: [],
          };
          bySet.set(line.setNum, entry);
        }
        entry.matchedWeight += weights.get(partNum) ?? 1;
        entry.matchedParts.push({
          partNum,
          colorName: line.colorName,
          quantity: line.quantity,
        });
      }
    }

    const unmatched = partNums.filter((p) => (ownedByPartNum.get(p) ?? []).length === 0);

    const sets = [...bySet.values()]
      .map((entry) => ({
        ...entry,
        distinctPartsMatched: entry.matchedParts.length,
        /** Share of the observed evidence this set explains. */
        coverage: totalWeight > 0 ? entry.matchedWeight / totalWeight : 0,
      }))
      .sort(
        (a, b) => b.coverage - a.coverage || b.distinctPartsMatched - a.distinctPartsMatched,
      );

    return {
      observedParts: partNums.length,
      matchedParts: partNums.length - unmatched.length,
      unmatchedParts: unmatched,
      sets,
    };
  }

  /** Maps each Brickognize catalog id to the Rebrickable part numbers it could be. */
  private async resolvePartNums(items: BrickognizeItem[]): Promise<Map<string, string[]>> {
    const ids = [...new Set(items.map((i) => i.id))];
    const out = new Map<string, string[]>();
    if (ids.length === 0) return out;

    const aliases = await this.prisma.partAlias.findMany({
      where: { externalId: { in: ids } },
      select: { externalId: true, partNum: true },
    });

    for (const id of ids) out.set(id, []);
    for (const alias of aliases) {
      const list = out.get(alias.externalId);
      if (list && !list.includes(alias.partNum)) list.push(alias.partNum);
    }
    // Unknown ids still resolve to themselves — Rebrickable and BrickLink agree far more
    // often than not, so this catches parts in sets that have not been synced yet.
    for (const id of ids) {
      const list = out.get(id)!;
      if (!list.includes(id)) list.push(id);
    }
    return out;
  }

  /** Every owned inventory line for the given part numbers, grouped by part number. */
  private async findOwnedLines(partNums: string[]): Promise<Map<string, OwnedLine[]>> {
    const out = new Map<string, OwnedLine[]>();
    if (partNums.length === 0) return out;

    const rows = await this.prisma.setPart.findMany({
      where: { partNum: { in: partNums }, set: { syncStatus: 'ready' } },
      include: { set: { select: { setNum: true, name: true, imgUrl: true } } },
      orderBy: { quantity: 'desc' },
    });

    for (const row of rows) {
      const line: OwnedLine = {
        setNum: row.set.setNum,
        setName: row.set.name,
        setImgUrl: row.set.imgUrl,
        partNum: row.partNum,
        colorId: row.colorId,
        colorName: row.colorName,
        colorHex: row.colorHex,
        quantity: row.quantity,
        isSpare: row.isSpare,
      };
      const list = out.get(row.partNum);
      if (list) list.push(line);
      else out.set(row.partNum, [line]);
    }
    return out;
  }

  /** Collapses per-candidate ownership into a per-set ranking for a single frame. */
  private aggregateSetMatches(
    candidates: { score: number; id: string; name: string; partNum: string; ownedIn: OwnedLine[] }[],
  ) {
    const bySet = new Map<
      string,
      {
        setNum: string;
        name: string | null;
        imgUrl: string | null;
        bestScore: number;
        matches: {
          candidateId: string;
          candidateName: string;
          partNum: string;
          colorName: string | null;
          colorHex: string | null;
          quantity: number;
          isSpare: boolean;
          score: number;
        }[];
      }
    >();

    for (const candidate of candidates) {
      for (const line of candidate.ownedIn) {
        let entry = bySet.get(line.setNum);
        if (!entry) {
          entry = {
            setNum: line.setNum,
            name: line.setName,
            imgUrl: line.setImgUrl,
            bestScore: 0,
            matches: [],
          };
          bySet.set(line.setNum, entry);
        }
        entry.bestScore = Math.max(entry.bestScore, candidate.score);
        entry.matches.push({
          candidateId: candidate.id,
          candidateName: candidate.name,
          partNum: line.partNum,
          colorName: line.colorName,
          colorHex: line.colorHex,
          quantity: line.quantity,
          isSpare: line.isSpare,
          score: candidate.score,
        });
      }
    }

    return [...bySet.values()].sort(
      (a, b) => b.bestScore - a.bestScore || b.matches.length - a.matches.length,
    );
  }
}
