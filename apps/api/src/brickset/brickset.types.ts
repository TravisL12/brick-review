/** Every v3 endpoint answers with this envelope; `status` is "success" or "error". */
export interface BricksetResponse {
  status: string;
  message?: string;
  matches?: number;
}

export interface BricksetImage {
  thumbnailURL: string | null;
  imageURL: string | null;
}

export interface BricksetSet {
  setID: number;
  number: string;
  numberVariant: number;
  name: string;
  year: number;
  image?: BricksetImage;
}

export interface BricksetGetSetsResponse extends BricksetResponse {
  sets?: BricksetSet[];
}

export interface BricksetAdditionalImagesResponse extends BricksetResponse {
  additionalImages?: BricksetImage[];
}
