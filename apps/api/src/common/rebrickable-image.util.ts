const REBRICKABLE_MEDIA = 'https://cdn.rebrickable.com/media/';

/**
 * Every preset the web app can request for a set's primary image — the union of
 * `thumbSources` (150/250), `tileSources` (500/800/1000) and `heroSources` in
 * apps/web/src/lib/images.ts. It has to be the whole union, not the sizes that
 * look most likely: which candidate a browser picks depends on window width and
 * DPR, and a preset left out of this list is the one that loads cold. Keep the
 * two lists in step.
 */
export const WARM_PRESETS = [
  '150x150p',
  '250x250p',
  '500x400p',
  '800x600p',
  '1000x800p',
] as const;

/** Originals live under /media/; anything already under /media/thumbs/ is a resize. */
export function isRebrickableMedia(url: string): boolean {
  return url.startsWith(REBRICKABLE_MEDIA) && !url.startsWith(`${REBRICKABLE_MEDIA}thumbs/`);
}

/** `…/media/sets/31139-1/131915.jpg` → `…/media/thumbs/sets/31139-1/131915.jpg/500x400p.jpg` */
export function rebrickableThumb(url: string, size: string): string {
  if (!isRebrickableMedia(url)) return url;
  return `${REBRICKABLE_MEDIA}thumbs/${url.slice(REBRICKABLE_MEDIA.length)}/${size}.jpg`;
}
