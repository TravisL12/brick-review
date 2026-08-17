import type { InventoryPart } from '../lib/types';

/**
 * One inventory line, shared by a set's piece list and a minifig's. Both show the
 * same thing — a part, its colour and where to look it up — so they render it the
 * same way.
 */
export function PartRow({ part }: { part: InventoryPart }) {
  return (
    <li className={part.isSpare ? 'spare' : ''}>
      <div className="inv-art">
        {part.imgUrl ? (
          <img src={part.imgUrl} alt="" loading="lazy" />
        ) : (
          <div className="tile-placeholder" aria-hidden="true" />
        )}
        <span className="inv-qty">×{part.quantity}</span>
      </div>
      <div className="inv-body">
        <div className="inv-name">{part.name ?? part.partNum}</div>
        <div className="inv-meta">
          <span className="muted">#{part.partNum}</span>
          {part.colorName && (
            <span className="inv-color">
              <span
                className="swatch"
                style={{ background: part.colorHex ? `#${part.colorHex}` : '#888' }}
              />
              {part.colorName}
            </span>
          )}
          {part.isSpare && <span className="pill pill-pending">spare</span>}
        </div>
        <div className="inv-links">
          <a href={part.links.rebrickable} target="_blank" rel="noreferrer">
            Rebrickable
          </a>
          {part.links.bricklink && (
            <a href={part.links.bricklink} target="_blank" rel="noreferrer">
              BrickLink
            </a>
          )}
          {part.elementId && (
            <span className="muted" title="LEGO element id">
              el {part.elementId}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
