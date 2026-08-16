import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { api } from '../lib/api';
import type { InventoryPart, SetDetail } from '../lib/types';

type PartSort = 'quantity' | 'name' | 'partNum' | 'color';

export function SetDetailPage() {
  const { setNum = '' } = useParams();
  const navigate = useNavigate();

  const [set, setSet] = useState<SetDetail | null>(null);
  const [parts, setParts] = useState<InventoryPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [query, setQuery] = useState('');
  const [color, setColor] = useState('');
  const [showSpares, setShowSpares] = useState(true);
  const [sort, setSort] = useState<PartSort>('quantity');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getSet(setNum), api.getSetParts(setNum)])
      .then(([detail, inventory]) => {
        if (cancelled) return;
        setSet(detail);
        setParts(inventory);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setNum]);

  const colors = useMemo(() => {
    const found = new Map<string, string | null>();
    for (const part of parts) {
      if (part.colorName) found.set(part.colorName, part.colorHex);
    }
    return [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [parts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = parts.filter((part) => {
      if (!showSpares && part.isSpare) return false;
      if (color && part.colorName !== color) return false;
      if (!needle) return true;
      return (
        part.partNum.toLowerCase().includes(needle) ||
        (part.name ?? '').toLowerCase().includes(needle) ||
        (part.colorName ?? '').toLowerCase().includes(needle) ||
        (part.elementId ?? '').toLowerCase().includes(needle)
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name':
          return (a.name ?? '').localeCompare(b.name ?? '');
        case 'partNum':
          return a.partNum.localeCompare(b.partNum, undefined, { numeric: true });
        case 'color':
          return (a.colorName ?? '').localeCompare(b.colorName ?? '');
        default:
          return b.quantity - a.quantity;
      }
    });
    return sorted;
  }, [parts, query, color, showSpares, sort]);

  const visiblePieces = useMemo(
    () => visible.reduce((sum, p) => sum + p.quantity, 0),
    [visible],
  );

  async function handleResync() {
    setBusy(true);
    try {
      await api.resyncSet(setNum);
      const detail = await api.getSet(setNum);
      setSet(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await api.removeSet(setNum);
      void navigate('/sets');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setConfirmRemove(false);
    }
  }

  if (loading) return <p className="muted">Loading {setNum}…</p>;
  if (error && !set) {
    return (
      <div className="card empty-state">
        <h2>{error}</h2>
        <Link className="button-link" to="/sets">
          Back to my sets
        </Link>
      </div>
    );
  }
  if (!set) return null;

  const { summary } = set;

  return (
    <div className="page">
      <Link className="back-link" to="/sets">
        ← My sets
      </Link>

      <section className="detail-hero card">
        <div className="detail-art">
          {set.imgUrl ? (
            <img src={set.imgUrl} alt={set.name ?? set.setNum} />
          ) : (
            <div className="tile-placeholder" aria-hidden="true" />
          )}
        </div>

        <div className="detail-info">
          <div className="detail-title">
            <h2>{set.name ?? set.setNum}</h2>
            <span className="detail-num">{set.setNum}</span>
          </div>
          {set.themeName && <div className="detail-theme">{set.themeName}</div>}

          <dl className="detail-facts">
            <Fact label="Year" value={set.year ?? '—'} />
            <Fact label="Pieces" value={summary.totalPieces.toLocaleString()} />
            <Fact label="Distinct parts" value={summary.distinctParts.toLocaleString()} />
            <Fact label="Colours" value={summary.distinctColors} />
            <Fact label="Inventory lines" value={summary.inventoryLines} />
            <Fact
              label="Spares"
              value={summary.sparePieces > 0 ? `${summary.sparePieces} pcs` : 'none'}
            />
          </dl>

          <div className="detail-status">
            <span className={`pill pill-${set.syncStatus}`}>
              {set.syncStatus === 'ready' ? 'Synced' : set.syncStatus}
            </span>
            {set.lastSyncedAt && (
              <span className="muted small">
                {new Date(set.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
          {set.syncError && <p className="error small">{set.syncError}</p>}
          {error && <p className="error small">{error}</p>}

          <div className="row">
            <a
              className="button-link"
              href={`https://rebrickable.com/sets/${encodeURIComponent(set.setNum)}/`}
              target="_blank"
              rel="noreferrer"
            >
              Rebrickable
            </a>
            <a
              className="button-link"
              href={`https://www.bricklink.com/v2/catalog/catalogitem.page?S=${encodeURIComponent(
                set.setNum,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              BrickLink
            </a>
            <button onClick={() => void handleResync()} disabled={busy}>
              Resync
            </button>
            <button className="danger" onClick={() => setConfirmRemove(true)} disabled={busy}>
              Remove
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Piece inventory</h2>
          <span className="muted small">
            {visible.length.toLocaleString()} lines · {visiblePieces.toLocaleString()} pieces
          </span>
        </div>

        <div className="row inventory-controls">
          <input
            className="search"
            type="search"
            placeholder="Search part, colour, element id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">All colours ({colors.length})</option>
            {colors.map(([name]) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as PartSort)}>
            <option value="quantity">Most pieces</option>
            <option value="name">Part name</option>
            <option value="partNum">Part number</option>
            <option value="color">Colour</option>
          </select>
          {summary.spareLines > 0 && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={showSpares}
                onChange={(e) => setShowSpares(e.target.checked)}
              />
              Show spares
            </label>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="muted">No pieces match that filter.</p>
        ) : (
          <ul className="inventory">
            {visible.map((part) => (
              <li key={part.id} className={part.isSpare ? 'spare' : ''}>
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
            ))}
          </ul>
        )}
      </section>

      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${set.name ?? set.setNum}?`}
          message={`${set.setNum} and its ${summary.inventoryLines.toLocaleString()} inventory lines will be deleted from your collection. Scans will no longer match against it. You can add it again later, which re-downloads the inventory.`}
          busy={busy}
          onConfirm={() => void handleRemove()}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
