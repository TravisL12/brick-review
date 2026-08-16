export interface RebrickableSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
  last_modified_dt: string;
}

export interface RebrickablePart {
  part_num: string;
  name: string;
  part_cat_id: number;
  part_url: string;
  part_img_url: string | null;
  /** e.g. { BrickLink: ["3001"], LEGO: ["3001", "300123"] } */
  external_ids?: Record<string, string[]>;
}

export interface RebrickableColor {
  id: number;
  name: string;
  rgb: string;
  is_trans: boolean;
}

export interface RebrickableInventoryPart {
  id: number;
  inv_part_id: number;
  part: RebrickablePart;
  color: RebrickableColor;
  set_num?: string;
  quantity: number;
  is_spare: boolean;
  element_id: string | null;
  num_sets?: number;
}

export interface RebrickablePage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RebrickableTheme {
  id: number;
  parent_id: number | null;
  name: string;
}
