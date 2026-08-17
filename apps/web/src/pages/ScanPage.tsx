import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CameraCapture } from "../components/CameraCapture";
import { api } from "../lib/api";
import { thumbSources } from "../lib/images";
import type {
  Candidate,
  IdentifyResponse,
  RankResponse,
  SetMatch,
} from "../lib/types";

interface Observation {
  partNum: string;
  name: string;
  imgUrl: string;
  hits: number;
  bestScore: number;
}

const MIN_SCORE = 0.3;

export function ScanPage() {
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<IdentifyResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [intervalMs, setIntervalMs] = useState(2500);
  const [observations, setObservations] = useState<Record<string, Observation>>(
    {},
  );
  const [ranking, setRanking] = useState<RankResponse | null>(null);
  /** The right-hand panel shows either the current brick's sets or the running session tally. */
  const [view, setView] = useState<"brick" | "session">("brick");

  // `busy` is read inside the live-scan timer; a ref keeps the timer effect stable.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const recordObservation = useCallback((candidate: Candidate) => {
    setObservations((prev) => {
      const existing = prev[candidate.partNum];
      return {
        ...prev,
        [candidate.partNum]: {
          partNum: candidate.partNum,
          name: candidate.name,
          imgUrl: candidate.imgUrl,
          hits: (existing?.hits ?? 0) + 1,
          bestScore: Math.max(existing?.bestScore ?? 0, candidate.score),
        },
      };
    });
  }, []);

  const identify = useCallback(
    async (blob: Blob, { auto = false }: { auto?: boolean } = {}) => {
      setBusy(true);
      if (!auto) setError(null);
      try {
        const res = await api.identify(blob, {
          searchType: "parts",
          minScore: MIN_SCORE,
        });
        setResult(res);
        setError(null);
        const top = res.candidates[0];
        if (top) recordObservation(top);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [recordObservation],
  );

  const scanOnce = useCallback(
    async (opts?: { auto?: boolean }) => {
      const blob = await captureRef.current?.();
      if (!blob) {
        setError("No camera frame available — start the camera first.");
        return;
      }
      await identify(blob, opts);
    },
    [identify],
  );

  // Live mode: one in-flight request at a time, spaced by the chosen interval.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled || busyRef.current) return;
      void scanOnce({ auto: true });
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, intervalMs, scanOnce]);

  // Re-rank whenever the session tally changes.
  useEffect(() => {
    const list = Object.values(observations);
    if (list.length === 0) {
      setRanking(null);
      return;
    }
    let cancelled = false;
    void api
      .rank(list.map((o) => ({ partNum: o.partNum, weight: o.bestScore })))
      .then((res) => {
        if (!cancelled) setRanking(res);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [observations]);

  const observationList = Object.values(observations).sort(
    (a, b) => b.hits - a.hits,
  );
  const overlay =
    result && result.boundingBox
      ? {
          left: result.boundingBox.left,
          upper: result.boundingBox.upper,
          right: result.boundingBox.right,
          lower: result.boundingBox.lower,
          width: result.boundingBox.image_width,
          height: result.boundingBox.image_height,
        }
      : null;

  return (
    <div className="page scan-layout">
      <section className="card">
        <CameraCapture captureRef={captureRef} overlay={overlay} />

        <div className="row">
          <button
            className="primary"
            onClick={() => void scanOnce()}
            disabled={busy}
          >
            {busy ? "Identifying…" : "Identify brick"}
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
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
              e.target.value = "";
            }}
          />
        </div>

        {error && <p className="error">{error}</p>}

        {result && (
          <div className="candidates">
            <h3>This brick looks like</h3>
            {result.candidates.length === 0 ? (
              <p className="muted">
                No confident match. Try better light or a plainer background.
              </p>
            ) : (
              <ul className="candidate-list">
                {result.candidates.map((c) => (
                  <li key={c.id} className={c.inCollection ? "owned" : ""}>
                    <img src={c.imgUrl} alt="" loading="lazy" />
                    <div className="candidate-info">
                      <div className="candidate-title">
                        <strong>{c.name}</strong>
                        <span className="muted">#{c.id}</span>
                      </div>
                      <ScoreBar score={c.score} />
                      {c.inCollection ? (
                        <div className="owned-in">
                          In {new Set(c.ownedIn.map((o) => o.setNum)).size} of
                          your sets
                        </div>
                      ) : (
                        <div className="muted small">
                          Not in your collection
                        </div>
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
            <strong>One brick per shot.</strong> Each scan identifies a single
            piece — the yellow box shows what was read. Keep other bricks out of
            frame, or you will get a guess for whichever one the camera picked.
          </li>
          <li>
            <strong>Plain background, decent light.</strong> Hold the brick so
            it fills a good part of the frame, ideally against a flat surface
            that is not the same colour.
          </li>
          <li>
            <strong>Work through the pile.</strong> Turn on <em>Live scan</em>{" "}
            and swap bricks in front of the lens, or press{" "}
            <em>Identify brick</em> once per piece. Every brick lands in{" "}
            <em>Session</em>, and the more you scan the better your sets are
            ranked.
          </li>
        </ol>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Matching sets</h2>
          {observationList.length > 0 && (
            <button
              onClick={() => {
                setObservations({});
                setRanking(null);
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="seg">
          <button
            className={view === "brick" ? "active" : ""}
            aria-pressed={view === "brick"}
            onClick={() => setView("brick")}
          >
            This brick
          </button>
          <button
            className={view === "session" ? "active" : ""}
            aria-pressed={view === "session"}
            onClick={() => setView("session")}
          >
            Session
            {observationList.length > 0 ? ` (${observationList.length})` : ""}
          </button>
        </div>

        {view === "brick" ? (
          !result ? (
            <p className="muted">
              Scan a brick and the sets it belongs to land here — just this one
              brick, not the whole session.
            </p>
          ) : result.setMatches.length === 0 ? (
            <p className="muted">
              This brick is not in any of your synced sets.
            </p>
          ) : (
            <ul className="ranked-list">
              {result.setMatches.map((m) => (
                <li key={m.setNum}>
                  <SetLink setNum={m.setNum}>
                    {m.imgUrl ? (
                      <img
                        {...thumbSources(m.imgUrl)}
                        sizes="80px"
                        alt=""
                        className="set-thumb"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="set-thumb placeholder"
                        aria-hidden="true"
                      />
                    )}
                    <div className="ranked-info">
                      <div className="candidate-title">
                        <strong>{m.setNum}</strong>
                        <span>{m.name ?? ""}</span>
                      </div>
                      <ScoreBar score={m.bestScore} />
                      <MatchColors matches={m.matches} />
                    </div>
                  </SetLink>
                </li>
              ))}
            </ul>
          )
        ) : observationList.length === 0 ? (
          <p className="muted">
            Identified bricks collect here. The more bricks you scan, the more
            confidently a set can be picked out.
          </p>
        ) : ranking && ranking.sets.length > 0 ? (
          <ul className="ranked-list">
            {ranking.sets.slice(0, 10).map((s) => (
              <li key={s.setNum}>
                <SetLink setNum={s.setNum}>
                  {s.imgUrl ? (
                    <img
                      {...thumbSources(s.imgUrl)}
                      sizes="80px"
                      alt=""
                      className="set-thumb"
                      loading="lazy"
                    />
                  ) : (
                    <div className="set-thumb placeholder" aria-hidden="true" />
                  )}
                  <div className="ranked-info">
                    <div className="candidate-title">
                      <strong>{s.setNum}</strong>
                      <span>{s.name ?? ""}</span>
                    </div>
                    <ScoreBar
                      score={s.coverage}
                      label={`${Math.round(s.coverage * 100)}%`}
                    />
                    <div className="muted small">
                      {s.distinctPartsMatched} of {ranking.observedParts} scanned
                      parts
                    </div>
                  </div>
                </SetLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            None of the scanned bricks appear in your synced sets yet.
          </p>
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
                      #{o.partNum} · seen {o.hits}× · best{" "}
                      {Math.round(o.bestScore * 100)}%
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
 * A matched set opens in a new tab, so a scanning session is never interrupted —
 * the camera keeps its stream and the session tally survives.
 */
function SetLink({
  setNum,
  children,
}: {
  setNum: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="ranked-row"
      to={`/sets/${encodeURIComponent(setNum)}`}
      target="_blank"
      rel="noreferrer"
      title={`Open ${setNum} in a new tab`}
    >
      {children}
    </Link>
  );
}

/** The colours and piece counts this brick appears as inside one set. */
function MatchColors({ matches }: { matches: SetMatch["matches"] }) {
  const byColor = new Map<
    string,
    { name: string | null; hex: string | null; quantity: number }
  >();
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
          <span
            className="swatch"
            style={{ background: c.hex ? `#${c.hex}` : "transparent" }}
          />
          {c.name ?? "Unknown colour"} ×{c.quantity}
        </span>
      ))}
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label?: string }) {
  return (
    <div className="score">
      <div className="score-track">
        <div
          className="score-fill"
          style={{ width: `${Math.round(score * 100)}%` }}
        />
      </div>
      <span className="score-label">
        {label ?? `${Math.round(score * 100)}%`}
      </span>
    </div>
  );
}
