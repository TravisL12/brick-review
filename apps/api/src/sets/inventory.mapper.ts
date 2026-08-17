import type { RebrickableInventoryPart } from '../rebrickable/rebrickable.types';

/** One inventory row, ready for createMany once the owner id is attached. */
export interface InventoryLine {
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

/**
 * Turns a Rebrickable inventory into the rows a sync needs to store. The owner —
 * a set or a minifig — is attached by the caller, since both store the same
 * shape against different tables.
 */
export function mapInventory(inventory: RebrickableInventoryPart[]): MappedInventory {
  // Collapse duplicate inventory lines — the unique key is (owner, part, color, spare).
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
