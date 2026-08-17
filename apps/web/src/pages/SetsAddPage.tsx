import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SetArt } from '../components/SetArt';
import { api, errorMessage } from '../lib/api';
import type { ImportResult, LegoSet, SetsStats } from '../lib/types';

const PLACEHOLDER = `Paste set numbers any way you like:

10276, 75192
21318
42115

The "-1" variant suffix is added automatically.`;

export function SetsAddPage() {
  const [sets, setSets] = useState<LegoSet[]>([]);
  const [stats, setStats] = useState<SetsStats | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);
  const [pendingRemove, setPendingRemove] = useState<LegoSet | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextSets, nextStats] = await Promise.all([api.listSets(), api.setsStats()]);
      setSets(nextSets);
      setStats(nextStats);
      return nextSets;
    } catch (err) {
      setError(errorMessage(err));
      return [];
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While anything is syncing, poll so progress shows up without a manual reload.
  useEffect(() => {
    const syncing = sets.some((s) => s.syncStatus === 'pending' || s.syncStatus === 'syncing');
    if (!syncing) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [sets, refresh]);

  async function handleImport() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.importSets(text);
      setLastImport(result);
      setText('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    // CSV or plain text: the backend parser handles any separator, so send it whole.
    const content = await file.text();
    setText((prev) => (prev ? `${prev}\n${content}` : content));
  }

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      {stats && !stats.rebrickableKeyConfigured && (
        <div className="banner banner-warn">
          <strong>No Rebrickable API key configured.</strong> Set inventories cannot be
          downloaded, so brick matching will find nothing. Get a free key at{' '}
          <a href="https://rebrickable.com/api/" target="_blank" rel="noreferrer">
            rebrickable.com/api
          </a>{' '}
          and put it in <code>.env</code> as <code>REBRICKABLE_API_KEY</code>, then restart the
          API.
        </div>
      )}

      <section className="card">
        <h2>Add sets</h2>
        <p className="muted">
          Enter the sets you own. Their full parts inventories get downloaded once and stored
          locally, which is what the scanner matches bricks against.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          spellCheck={false}
        />
        <div className="row">
          <button className="primary" onClick={handleImport} disabled={busy || !text.trim()}>
            {busy ? 'Working…' : 'Import sets'}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy}>
            Load from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          {stats && stats.errored > 0 && (
            <button onClick={() => void act(() => api.retryFailed())} disabled={busy}>
              Retry {stats.errored} failed
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        {lastImport && (
          <div className="import-summary">
            Added <strong>{lastImport.added}</strong> of {lastImport.requested} set
            {lastImport.requested === 1 ? '' : 's'}.
            {lastImport.duplicates.length > 0 && (
              <> Already present: {lastImport.duplicates.join(', ')}.</>
            )}
            {lastImport.invalid.length > 0 && (
              <span className="error"> Unparseable: {lastImport.invalid.join(', ')}.</span>
            )}
          </div>
        )}
      </section>

      {stats && (
        <section className="stats">
          <Stat label="Sets" value={stats.sets} />
          <Stat label="Synced" value={stats.ready} />
          <Stat label="Queued" value={stats.pending} />
          <Stat label="Failed" value={stats.errored} />
          <Stat label="Distinct parts" value={stats.distinctParts} />
        </section>
      )}

      <section className="card">
        <h2>Recently added ({sets.length})</h2>
        {sets.length === 0 ? (
          <p className="muted">Nothing yet — add a few set numbers above.</p>
        ) : (
          <ul className="set-list">
            {sets.map((set) => (
              <li key={set.id} className="set-row">
                <SetArt url={set.imgUrl} variant="row" />
                <div className="set-info">
                  <div className="set-title">
                    <Link to={`/sets/${encodeURIComponent(set.setNum)}`}>
                      <strong>{set.setNum}</strong>
                    </Link>
                    <span>{set.name ?? '—'}</span>
                  </div>
                  <div className="set-meta">
                    <StatusPill status={set.syncStatus} />
                    {set.year && <span>{set.year}</span>}
                    {set.numParts != null && <span>{set.numParts} parts</span>}
                    {set.inventoryLines > 0 && (
                      <span>{set.inventoryLines} inventory lines</span>
                    )}
                  </div>
                  {set.syncError && <div className="error small">{set.syncError}</div>}
                </div>
                <div className="set-actions">
                  <button onClick={() => void act(() => api.resyncSet(set.setNum))} disabled={busy}>
                    Resync
                  </button>
                  <button className="danger" onClick={() => setPendingRemove(set)} disabled={busy}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingRemove && (
        <ConfirmDialog
          title={`Remove ${pendingRemove.name ?? pendingRemove.setNum}?`}
          message={`${pendingRemove.setNum} and its ${pendingRemove.inventoryLines.toLocaleString()} inventory lines will be deleted from your collection. Scans will no longer match against it. You can add it again later, which re-downloads the inventory.`}
          busy={busy}
          onConfirm={() => {
            const setNum = pendingRemove.setNum;
            void act(() => api.removeSet(setNum)).finally(() => setPendingRemove(null));
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function StatusPill({ status }: { status: LegoSet['syncStatus'] }) {
  const labels: Record<LegoSet['syncStatus'], string> = {
    pending: 'Queued',
    syncing: 'Syncing…',
    ready: 'Ready',
    error: 'Failed',
  };
  return <span className={`pill pill-${status}`}>{labels[status]}</span>;
}
