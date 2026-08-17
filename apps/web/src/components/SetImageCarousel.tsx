import { useCallback, useEffect, useState } from 'react';
import { SetArt } from './SetArt';
import type { SetImage } from '../lib/types';

export interface SetImageCarouselProps {
  images: SetImage[];
  alt: string;
}

/**
 * Filmstrip source: Brickset ships its own thumb, Rebrickable derives one from
 * the full-size URL. Either way `SetArt` does the right thing — the preset
 * ladder only applies to Rebrickable URLs and passes everything else through.
 */
function stripUrl(image: SetImage): string {
  return image.thumbUrl ?? image.url;
}

export function SetImageCarousel({ images, alt }: SetImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const count = images.length;
  // A shorter list after a resync must not leave the index out of bounds.
  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0;
  const current = images[safeIndex];

  const step = useCallback(
    (delta: number) => setIndex((i) => (count === 0 ? 0 : (i + delta + count) % count)),
    [count],
  );

  useEffect(() => {
    setIndex(0);
  }, [images]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys belong to whatever the user is typing in — the inventory
      // search and filters sit on the same page.
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (e.key === 'Escape') setZoomed(false);
      else if (typing) return;
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step]);

  if (!current) {
    return (
      <div className="detail-art">
        <div className="tile-placeholder" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="set-carousel">
      <div className="detail-art">
        <button
          type="button"
          className="art-zoom"
          onClick={() => setZoomed(true)}
          aria-label="View full size"
        >
          <SetArt
            url={current.url}
            variant="hero"
            alt={count > 1 ? `${alt} (${safeIndex + 1} of ${count})` : alt}
          />
        </button>

        {count > 1 && (
          <>
            <button
              type="button"
              className="art-nav prev"
              onClick={() => step(-1)}
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              className="art-nav next"
              onClick={() => step(1)}
              aria-label="Next image"
            >
              ›
            </button>
            <span className="art-count">
              {safeIndex + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="art-strip">
          {images.map((image, i) => (
            <li key={image.id}>
              <button
                type="button"
                className={i === safeIndex ? 'active' : ''}
                onClick={() => setIndex(i)}
                aria-label={`Image ${i + 1}`}
                aria-current={i === safeIndex}
              >
                <SetArt url={stripUrl(image)} variant="strip" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {zoomed && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt}, full size`}
          onClick={() => setZoomed(false)}
        >
          {/* Always the untransformed original — this view exists for the pixels. */}
          <img src={current.url} alt={alt} />
          <button
            type="button"
            className="lightbox-close"
            onClick={() => setZoomed(false)}
            aria-label="Close"
          >
            ×
          </button>
          {count > 1 && (
            <>
              <button
                type="button"
                className="art-nav prev"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                className="art-nav next"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Next image"
              >
                ›
              </button>
              <span className="art-count">
                {safeIndex + 1} / {count}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
