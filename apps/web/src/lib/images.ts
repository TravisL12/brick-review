/**
 * Rebrickable serves resized copies of every /media/ image under /media/thumbs/,
 * but only at a fixed set of preset sizes — anything else 404s. These are the
 * presets that exist, verified against the CDN.
 */
const REBRICKABLE_PRESETS = [
  '150x150p',
  '200x150p',
  '250x250p',
  '320x180p',
  '500x400p',
  '640x480p',
  '800x600p',
  '1000x800p',
] as const;

export type RebrickableThumbSize = (typeof REBRICKABLE_PRESETS)[number];

/** Rendered pixel width of each preset, for srcSet `w` descriptors. */
const PRESET_WIDTH: Record<RebrickableThumbSize, number> = {
  '150x150p': 150,
  '200x150p': 200,
  '250x250p': 250,
  '320x180p': 320,
  '500x400p': 500,
  '640x480p': 640,
  '800x600p': 800,
  '1000x800p': 1000,
};

/**
 * Originals run about 2400px wide but vary per set, so the `w` descriptor is an
 * estimate. It only biases selection — the browser still fetches the real file.
 */
const ORIGINAL_WIDTH_HINT = 2000;

const REBRICKABLE_MEDIA = 'https://cdn.rebrickable.com/media/';

function isRebrickableMedia(url: string): boolean {
  return url.startsWith(REBRICKABLE_MEDIA) && !url.startsWith(`${REBRICKABLE_MEDIA}thumbs/`);
}

/** `…/media/sets/31139-1/131915.jpg` → `…/media/thumbs/sets/31139-1/131915.jpg/500x400p.jpg` */
export function rebrickableThumb(url: string, size: RebrickableThumbSize): string {
  if (!isRebrickableMedia(url)) return url;
  const path = url.slice(REBRICKABLE_MEDIA.length);
  return `${REBRICKABLE_MEDIA}thumbs/${path}/${size}.jpg`;
}

export interface ImageSources {
  src: string;
  srcSet?: string;
}

/**
 * Builds a responsive source set for a set picture. Rebrickable images get the
 * CDN's preset ladder; anything else (Brickset) is served as-is, since those
 * URLs have no resize transform.
 */
export function setImageSources(
  url: string,
  presets: RebrickableThumbSize[],
  opts: { includeOriginal?: boolean } = {},
): ImageSources {
  if (!isRebrickableMedia(url)) return { src: url };

  const entries = presets.map((size) => `${rebrickableThumb(url, size)} ${PRESET_WIDTH[size]}w`);
  if (opts.includeOriginal) entries.push(`${url} ${ORIGINAL_WIDTH_HINT}w`);

  const fallback = presets.length > 0 ? rebrickableThumb(url, presets[presets.length - 1]) : url;
  return { src: fallback, srcSet: entries.join(', ') };
}

/** Small square thumbnail — list rows, carousel filmstrip. */
export function thumbSources(url: string): ImageSources {
  return setImageSources(url, ['150x150p', '250x250p']);
}

/** Gallery tile art, roughly 230–350 CSS px wide. */
export function tileSources(url: string): ImageSources {
  return setImageSources(url, ['500x400p', '800x600p', '1000x800p']);
}

/** Detail hero: full resolution on large or high-DPI displays. */
export function heroSources(url: string): ImageSources {
  return setImageSources(url, ['500x400p', '800x600p', '1000x800p'], { includeOriginal: true });
}
