/** A curated catalogue set shown on the signed-out splash. Never a user's own set. */
export interface ShowcaseSet {
  setNum: string;
  name: string | null;
  year: number | null;
  themeName: string | null;
  imgUrl: string | null;
}

/** The signed-in account, as returned by /api/auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  /** "user" | "admin" — the first account to register is the admin. */
  role: string;
}

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

/** One minifigure that ships with a set. */
export interface SetMinifig {
  id: string;
  /** Rebrickable fig number, e.g. "fig-002544". */
  figNum: string;
  name: string | null;
  imgUrl: string | null;
  quantity: number;
}

export interface SetDetail extends Omit<LegoSet, 'inventoryLines'> {
  images: SetImage[];
  minifigs: SetMinifig[];
  summary: SetSummary;
}

/** A set one gallery minifig came out of. */
export interface MinifigOwner {
  setNum: string;
  setName: string | null;
  themeName: string | null;
  quantity: number;
}

/** One fig on its own page: what it is, where you got it, what it is made of. */
export interface MinifigDetail {
  figNum: string;
  name: string | null;
  imgUrl: string | null;
  /** Rebrickable's own piece count, which can differ from the cached lines. */
  numParts: number | null;
  partsSyncedAt: string | null;
  /** Set when the fig's catalogue entry could not be reached. */
  syncError: string | null;
  totalQuantity: number;
  sets: (MinifigOwner & { setImgUrl: string | null; year: number | null })[];
  parts: InventoryPart[];
}

/** The same fig folded across every set that ships it. */
export interface MinifigSummary {
  figNum: string;
  name: string | null;
  imgUrl: string | null;
  totalQuantity: number;
  sets: MinifigOwner[];
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
