import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PartRow } from '../components/PartRow';
import { SetArt } from '../components/SetArt';
import { useAsyncData } from '../hooks/useAsyncData';
import { api, errorMessage } from '../lib/api';
import { rebrickableFigUrl } from '../lib/images';

export function MinifigDetailPage() {
  const { figNum = '' } = useParams();
  const { data: fig, setData, loading, error, setError } = useAsyncData(
    () => api.getMinifig(figNum),
    [figNum],
  );

  const [busy, setBusy] = useState(false);

  async function handleResync() {
    setBusy(true);
    try {
      setData(await api.resyncMinifig(figNum));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // The first view of a fig fetches its inventory from Rebrickable, so say so.
  if (loading) return <p className="muted">Loading {figNum}…</p>;
  if (error && !fig) {
    return (
      <div className="card empty-state">
        <h2>{error}</h2>
        <Link className="button-link" to="/minifigs">
          Back to my minifigs
        </Link>
      </div>
    );
  }
  if (!fig) return null;

  const pieces = fig.parts.reduce((sum, p) => sum + p.quantity, 0);

  return (
    <div className="page">
      <Link className="back-link" to="/minifigs">
        ← My minifigs
      </Link>

      <section className="detail-hero card fig-hero">
        <div className="fig-hero-art">
          <SetArt url={fig.imgUrl} variant="hero" alt={fig.name ?? fig.figNum} />
        </div>

        <div className="detail-info">
          <div className="detail-title">
            <h2>{fig.name ?? fig.figNum}</h2>
            <span className="detail-num">{fig.figNum}</span>
          </div>

          <dl className="detail-facts">
            <Fact label="Copies owned" value={fig.totalQuantity} />
            <Fact label="In sets" value={fig.sets.length} />
            <Fact label="Pieces" value={fig.numParts ?? pieces} />
            <Fact label="Part lines" value={fig.parts.length} />
          </dl>

          {fig.syncError && <p className="error small">{fig.syncError}</p>}
          {error && <p className="error small">{error}</p>}

          <div className="row">
            <a
              className="button-link"
              href={rebrickableFigUrl(fig.figNum)}
              target="_blank"
              rel="noreferrer"
            >
              Rebrickable
            </a>
            <button onClick={() => void handleResync()} disabled={busy}>
              Resync
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Comes in</h2>
          <span className="muted small">
            {fig.sets.length} {fig.sets.length === 1 ? 'set' : 'sets'}
          </span>
        </div>
        <ul className="fig-owner-list">
          {fig.sets.map((owner) => (
            <li key={owner.setNum}>
              <Link className="fig-owner" to={`/sets/${encodeURIComponent(owner.setNum)}`}>
                <SetArt url={owner.setImgUrl} variant="row" alt="" />
                <div className="inv-body">
                  <div className="inv-name">{owner.setName ?? owner.setNum}</div>
                  <div className="inv-meta">
                    <span className="tile-num">{owner.setNum}</span>
                    {owner.year && <span className="muted">{owner.year}</span>}
                    {owner.themeName && <span className="muted">{owner.themeName}</span>}
                    {owner.quantity > 1 && (
                      <span className="pill pill-syncing">×{owner.quantity}</span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Piece inventory</h2>
          <span className="muted small">
            {fig.parts.length} lines · {pieces} pieces
          </span>
        </div>
        {fig.parts.length === 0 ? (
          <p className="muted">
            No piece list cached for this fig yet. Resync to pull it from Rebrickable.
          </p>
        ) : (
          <ul className="inventory">
            {fig.parts.map((part) => (
              <PartRow key={part.id} part={part} />
            ))}
          </ul>
        )}
      </section>
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
