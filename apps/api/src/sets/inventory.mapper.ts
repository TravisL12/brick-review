import type { RebrickableInventoryPart } from '../rebrickable/rebrickable.types';

/** A SetPart row, ready for createMany. */
export interface InventoryLine {
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
}

/** A PartAlias row: one external catalogue id for one Rebrickable part number. */
export interface PartAliasRow {
  source: string;
  externalId: string;
  partNum: string;
}

export interface MappedInventory {
  lines: InventoryLine[];
  aliases: PartAliasRow[];
}

/** Turns a Rebrickable inventory into the rows a sync needs to store. */
export function mapInventory(
  setId: string,
  inventory: RebrickableInventoryPart[],
): MappedInventory {
  // Collapse duplicate inventory lines — the unique key is (set, part, color, spare).
  const lines = new Map<string, InventoryLine>();
  const aliases = new Map<string, PartAliasRow>();

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

  return { lines: [...lines.values()], aliases: [...aliases.values()] };
}
