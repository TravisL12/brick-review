import { heroSources, thumbSources, tileSources, type ImageSources } from '../lib/images';

/**
 * Where the picture is being shown. The preset ladder, the layout width given
 * to `sizes` and the class the stylesheet sizes the box with always travel
 * together, so a variant fixes all three instead of exposing them as props.
 */
export type SetArtVariant = 'tile' | 'hero' | 'row' | 'ranked' | 'strip';

interface VariantSpec {
  sources: (url: string) => ImageSources;
  sizes: string;
  className?: string;
  placeholderClassName: string;
  loading?: 'lazy';
}

const VARIANTS: Record<SetArtVariant, VariantSpec> = {
  /** Gallery tile art. */
  tile: {
    sources: tileSources,
    sizes: '(max-width: 640px) 45vw, 300px',
    placeholderClassName: 'tile-placeholder',
    loading: 'lazy',
  },
  /** Detail carousel's main image — above the fold, so never deferred. */
  hero: {
    sources: heroSources,
    sizes: '(max-width: 780px) 92vw, 460px',
    placeholderClassName: 'tile-placeholder',
  },
  /** "Recently added" list row. */
  row: {
    sources: thumbSources,
    sizes: '64px',
    className: 'set-thumb',
    placeholderClassName: 'set-thumb placeholder',
    loading: 'lazy',
  },
  /** Scan page match row — `.ranked-list .set-thumb` renders wider than `row`. */
  ranked: {
    sources: thumbSources,
    sizes: '80px',
    className: 'set-thumb',
    placeholderClassName: 'set-thumb placeholder',
    loading: 'lazy',
  },
  /** Detail carousel filmstrip. */
  strip: {
    sources: thumbSources,
    sizes: '60px',
    placeholderClassName: 'tile-placeholder',
    loading: 'lazy',
  },
};

export interface SetArtProps {
  /** A set can exist before its image does, so the URL is allowed to be missing. */
  url: string | null | undefined;
  variant: SetArtVariant;
  /** Decorative by default: most call sites print the set name right beside it. */
  alt?: string;
}

/** A set picture at one of the app's fixed sizes, or a placeholder when there is none. */
export function SetArt({ url, variant, alt = '' }: SetArtProps) {
  const spec = VARIANTS[variant];
  if (!url) return <div className={spec.placeholderClassName} aria-hidden="true" />;

  return (
    <img
      {...spec.sources(url)}
      sizes={spec.sizes}
      alt={alt}
      className={spec.className}
      loading={spec.loading}
    />
  );
}
