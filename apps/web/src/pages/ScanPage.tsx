import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CameraCapture } from '../components/CameraCapture';
import { SetArt } from '../components/SetArt';
import { useScanSession } from '../hooks/useScanSession';
import type { SetMatch } from '../lib/types';

export function ScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    captureRef,
    result,
    busy,
    error,
    live,
    setLive,
    intervalMs,
    setIntervalMs,
    observationList,
    ranking,
    identify,
    scanOnce,
    clear,
  } = useScanSession();

  /** The right-hand panel shows either the current brick's sets or the running session tally. */
  const [view, setView] = useState<'brick' | 'session'>('brick');

  const box = result?.boundingBox;
  const overlay = box
    ? {
        left: box.left,
        upper: box.upper,
        right: box.right,
        lower: box.lower,
        width: box.image_width,
        height: box.image_height,
      }
    : null;

  return (
    <div className="page scan-layout">
      <section className="card">
        <CameraCapture captureRef={captureRef} overlay={overlay} />

        <div className="row">
          <button className="primary" onClick={() => void scanOnce()} disabled={busy}>
            {busy ? 'Identifying…' : 'Identify brick'}
          </button>
          <label className="toggle">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Live scan
          </label>
          <label className="slider">
            every {(intervalMs / 1000).toFixed(1)}s
            <input
              type="range"
              min={1000}
              max={6000}
              step={500}
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
            />
          </label>
          <button onClick={() => fileRef.current?.click()} disabled={busy}>
            Upload photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void identify(file);
              e.target.value = '';
            }}
          />
        </div>

        {error && <p className="error">{error}</p>}

        {result && (
          <div className="candidates">
            <h3>This brick looks like</h3>
            {result.candidates.length === 0 ? (
              <p className="muted">No confident match. Try better light or a plainer background.</p>
            ) : (
              <ul className="candidate-list">
                {result.candidates.map((c) => (
                  <li key={c.id} className={c.inCollection ? 'owned' : ''}>
                    <img src={c.imgUrl} alt="" loading="lazy" />
                    <div className="candidate-info">
                      <div className="candidate-title">
                        <strong>{c.name}</strong>
                        <span className="muted">#{c.id}</span>
                      </div>
                      <ScoreBar score={c.score} />
                      {c.inCollection ? (
                        <div className="owned-in">
                          In {new Set(c.ownedIn.map((o) => o.setNum)).size} of your sets
                        </div>
                      ) : (
                        <div className="muted small">Not in your collection</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <h2>Scan</h2>
        <ol className="how-to">
          <li>
            <strong>One brick per shot.</strong> Each scan identifies a single piece — the
            yellow box shows what was read. Keep other bricks out of frame, or you will get a
            guess for whichever one the camera picked.
          </li>
          <li>
            <strong>Plain background, decent light.</strong> Hold the brick so it fills a good
            part of the frame, ideally against a flat surface that is not the same colour.
          </li>
          <li>
            <strong>Work through the pile.</strong> Turn on <em>Live scan</em> and swap bricks
            in front of the lens, or press <em>Identify brick</em> once per piece. Every brick
            lands in <em>Session</em>, and the more you scan the better your sets are ranked.
          </li>
        </ol>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Matching sets</h2>
          {observationList.length > 0 && <button onClick={clear}>Clear</button>}
        </div>

        <div className="seg">
          <button
            className={view === 'brick' ? 'active' : ''}
            aria-pressed={view === 'brick'}
            onClick={() => setView('brick')}
          >
            This brick
          </button>
          <button
            className={view === 'session' ? 'active' : ''}
            aria-pressed={view === 'session'}
            onClick={() => setView('session')}
          >
            Session
            {observationList.length > 0 ? ` (${observationList.length})` : ''}
          </button>
        </div>

        {view === 'brick' ? (
          !result ? (
            <p className="muted">
              Scan a brick and the sets it belongs to land here — just this one brick, not the
              whole session.
            </p>
          ) : result.setMatches.length === 0 ? (
            <p className="muted">This brick is not in any of your synced sets.</p>
          ) : (
            <ul className="ranked-list">
              {result.setMatches.map((m) => (
                <RankedSetRow
                  key={m.setNum}
                  setNum={m.setNum}
                  name={m.name}
                  imgUrl={m.imgUrl}
                  score={m.bestScore}
                >
                  <MatchColors matches={m.matches} />
                </RankedSetRow>
              ))}
            </ul>
          )
        ) : observationList.length === 0 ? (
          <p className="muted">
            Identified bricks collect here. The more bricks you scan, the more confidently a set
            can be picked out.
          </p>
        ) : ranking && ranking.sets.length > 0 ? (
          <ul className="ranked-list">
            {ranking.sets.slice(0, 10).map((s) => (
              <RankedSetRow
                key={s.setNum}
                setNum={s.setNum}
                name={s.name}
                imgUrl={s.imgUrl}
                score={s.coverage}
                scoreLabel={`${Math.round(s.coverage * 100)}%`}
              >
                <div className="muted small">
                  {s.distinctPartsMatched} of {ranking.observedParts} scanned parts
                </div>
              </RankedSetRow>
            ))}
          </ul>
        ) : (
          <p className="muted">None of the scanned bricks appear in your synced sets yet.</p>
        )}

        {observationList.length > 0 && (
          <>
            <h3>Bricks seen ({observationList.length})</h3>
            <ul className="observation-list">
              {observationList.map((o) => (
                <li key={o.partNum}>
                  <img src={o.imgUrl} alt="" loading="lazy" />
                  <div>
                    <div>{o.name}</div>
                    <div className="muted small">
                      #{o.partNum} · seen {o.hits}× · best {Math.round(o.bestScore * 100)}%
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * One set in a ranked list. Both panels use the same row — they differ only in
 * what the score means and what is written under it.
 *
 * A matched set opens in a new tab, so a scanning session is never interrupted:
 * the camera keeps its stream and the session tally survives.
 */
function RankedSetRow({
  setNum,
  name,
  imgUrl,
  score,
  scoreLabel,
  children,
}: {
  setNum: string;
  name: string | null;
  imgUrl: string | null;
  score: number;
  scoreLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        className="ranked-row"
        to={`/sets/${encodeURIComponent(setNum)}`}
        target="_blank"
        rel="noreferrer"
        title={`Open ${setNum} in a new tab`}
      >
        <SetArt url={imgUrl} variant="ranked" />
        <div className="ranked-info">
          <div className="candidate-title">
            <strong>{setNum}</strong>
            <span>{name ?? ''}</span>
          </div>
          <ScoreBar score={score} label={scoreLabel} />
          {children}
        </div>
      </Link>
    </li>
  );
}

/** The colours and piece counts this brick appears as inside one set. */
function MatchColors({ matches }: { matches: SetMatch['matches'] }) {
  const byColor = new Map<string, { name: string | null; hex: string | null; quantity: number }>();
  for (const m of matches) {
    const key = m.colorName ?? m.partNum;
    const entry = byColor.get(key);
    if (entry) entry.quantity += m.quantity;
    else byColor.set(key, { name: m.colorName, hex: m.colorHex, quantity: m.quantity });
  }
  return (
    <div className="inv-meta">
      {[...byColor.entries()].map(([key, c]) => (
        <span key={key} className="inv-color">
          <span className="swatch" style={{ background: c.hex ? `#${c.hex}` : 'transparent' }} />
          {c.name ?? 'Unknown colour'} ×{c.quantity}
        </span>
      ))}
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label?: string }) {
  const percent = Math.round(score * 100);
  return (
    <div className="score">
      <div className="score-track">
        <div className="score-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="score-label">{label ?? `${percent}%`}</span>
    </div>
  );
}
