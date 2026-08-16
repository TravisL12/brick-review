export type BrickognizeItemType = 'part' | 'set' | 'fig' | 'sticker';
export type BrickognizeSearchType = 'all' | 'parts' | 'sets' | 'figs';

export interface BrickognizeExternalSite {
  name: string;
  url: string;
}

export interface BrickognizeItem {
  /** Catalog id as used by BrickLink, e.g. "3001". */
  id: string;
  name: string;
  img_url: string;
  external_sites: BrickognizeExternalSite[];
  category: string | null;
  type: BrickognizeItemType;
  /** 0..1 */
  score: number;
}

export interface BrickognizeBoundingBox {
  left: number;
  upper: number;
  right: number;
  lower: number;
  image_width: number;
  image_height: number;
  score: number;
}

export interface BrickognizeResult {
  listing_id: string;
  bounding_box: BrickognizeBoundingBox;
  items: BrickognizeItem[];
}
