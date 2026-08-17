export interface LegoSet {
  id: string;
  setNum: string;
  name: string | null;
  year: number | null;
  themeId: number | null;
  themeName: string | null;
  numParts: number | null;
  imgUrl: string | null;
  syncStatus: 'pending' | 'syncing' | 'ready' | 'error';
  syncError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  inventoryLines: number;
}

export interface SetImage {
  id: string;
  url: string;
  /** Source-provided thumbnail; Rebrickable images derive theirs from the URL. */
  thumbUrl: string | null;
  source: 'rebrickable' | 'brickset' | string;
}

export interface SetSummary {
  inventoryLines: number;
  totalPieces: number;
  distinctParts: number;
  distinctColors: number;
  spareLines: number;
  sparePieces: number;
}

export interface SetDetail extends Omit<LegoSet, 'inventoryLines'> {
  images: SetImage[];
  summary: SetSummary;
}

export interface InventoryPart {
  id: string;
  partNum: string;
  name: string | null;
  imgUrl: string | null;
  colorId: number | null;
  colorName: string | null;
  colorHex: string | null;
  quantity: number;
  isSpare: boolean;
  elementId: string | null;
  bricklinkId: string | null;
  links: {
    rebrickable: string;
    bricklink: string | null;
  };
}

export interface SetsStats {
  sets: number;
  ready: number;
  pending: number;
  errored: number;
  inventoryLines: number;
  distinctParts: number;
  rebrickableKeyConfigured: boolean;
  bricksetKeyConfigured: boolean;
}

export interface ImportResult {
  requested: number;
  added: number;
  duplicates: string[];
  invalid: string[];
  setNums: string[];
}

export interface OwnedLine {
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

export interface Candidate {
  id: string;
  name: string;
  imgUrl: string;
  category: string | null;
  type: 'part' | 'set' | 'fig' | 'sticker';
  score: number;
  externalSites: { name: string; url: string }[];
  partNums: string[];
  partNum: string;
  inCollection: boolean;
  ownedIn: OwnedLine[];
}

export interface SetMatch {
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

export interface IdentifyResponse {
  listingId: string;
  boundingBox: {
    left: number;
    upper: number;
    right: number;
    lower: number;
    image_width: number;
    image_height: number;
    score: number;
  };
  candidates: Candidate[];
  setMatches: SetMatch[];
}

export interface RankedSet {
  setNum: string;
  name: string | null;
  imgUrl: string | null;
  matchedWeight: number;
  matchedParts: { partNum: string; colorName: string | null; quantity: number }[];
  distinctPartsMatched: number;
  coverage: number;
}

export interface RankResponse {
  observedParts: number;
  matchedParts: number;
  unmatchedParts: string[];
  sets: RankedSet[];
}
