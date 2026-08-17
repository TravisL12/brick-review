import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PartRow } from '../components/PartRow';
import { SetArt } from '../components/SetArt';
import { SetImageCarousel } from '../components/SetImageCarousel';
import { useAsyncData } from '../hooks/useAsyncData';
import { api, errorMessage } from '../lib/api';
import type { InventoryPart, SetMinifig } from '../lib/types';

type PartSort = 'quantity' | 'name' | 'partNum' | 'color';

/** Stable identity so the filter memos below do not rerun while loading. */
const NO_PARTS: InventoryPart[] = [];

export function SetDetailPage() {
  const { setNum = '' } = useParams();
  const navigate = useNavigate();

  // The header and the inventory arrive together: either both render or the page is an error.
  const { data, setData, loading, error, setError } = useAsyncData(
    () => Promise.all([api.getSet(setNum), api.getSetParts(setNum)]),
    [setNum],
  );
  const set = data?.[0] ?? null;
  const parts = data?.[1] ?? NO_PARTS;

  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [query, setQuery] = useState('');
  const [color, setColor] = useState('');
  const [showSpares, setShowSpares] = useState(true);
  const [sort, setSort] = useState<PartSort>('quantity');

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

  // Counts duplicates: a set with two identical stormtroopers holds two figs, one line.
  const figCount = useMemo(
    () => (set?.minifigs ?? []).reduce((sum, f) => sum + f.quantity, 0),
    [set],
  );

  async function handleResync() {
    setBusy(true);
    try {
      await api.resyncSet(setNum);
      const detail = await api.getSet(setNum);
      // Only the header is refetched; the inventory it already showed still stands.
      setData((prev) => (prev ? [detail, prev[1]] : prev));
    } catch (err) {
      setError(errorMessage(err));
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
      setError(errorMessage(err));
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
        <SetImageCarousel images={set.images} alt={set.name ?? set.setNum} />

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
            {figCount > 0 && <Fact label="Minifigs" value={figCount} />}
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

      {set.minifigs.length > 0 && (
        <section className="card">
          <div className="section-head">
            <h2>Minifigures</h2>
            <span className="muted small">
              {figCount.toLocaleString()} in this set · {set.minifigs.length} unique
            </span>
          </div>
          <ul className="fig-strip">
            {set.minifigs.map((fig) => (
              <FigCard key={fig.id} fig={fig} />
            ))}
          </ul>
        </section>
      )}

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
              <PartRow key={part.id} part={part} />
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

/** One fig in the set's minifig strip, linking through to the fig's own page. */
function FigCard({ fig }: { fig: SetMinifig }) {
  return (
    <li>
      <Link
        className="fig-card"
        to={`/minifigs/${encodeURIComponent(fig.figNum)}`}
        title={fig.name ?? fig.figNum}
      >
        <div className="fig-art">
          <SetArt url={fig.imgUrl} variant="figRow" alt={fig.name ?? fig.figNum} />
          {fig.quantity > 1 && <span className="inv-qty">×{fig.quantity}</span>}
        </div>
        <span className="fig-name">{fig.name ?? fig.figNum}</span>
        <span className="fig-num">{fig.figNum}</span>
      </Link>
    </li>
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
