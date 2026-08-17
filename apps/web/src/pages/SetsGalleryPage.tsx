import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SetArt } from '../components/SetArt';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import { downloadCsv, toCsv } from '../lib/csv';
import type { LegoSet } from '../lib/types';

type SortKey = 'recent' | 'name' | 'setNum' | 'year' | 'parts';

/** Stable identity so the filter memos below do not rerun while loading. */
const NO_SETS: LegoSet[] = [];

const DEFAULT_SORT: SortKey = 'recent';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'name', label: 'Name' },
  { key: 'setNum', label: 'Set number' },
  { key: 'year', label: 'Year' },
  { key: 'parts', label: 'Piece count' },
];

export function SetsGalleryPage() {
  const { data, loading, error } = useAsyncData(() => api.listSets(), []);
  const sets = data ?? NO_SETS;

  // Filters live in the query string so a filtered view can be linked, bookmarked and
  // restored by the back button.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const theme = searchParams.get('theme') ?? '';
  const sortParam = searchParams.get('sort');
  const sort: SortKey = SORTS.some((s) => s.key === sortParam)
    ? (sortParam as SortKey)
    : DEFAULT_SORT;

  // Defaults are dropped rather than written out, so the tidy /sets URL stays tidy. Replacing
  // instead of pushing keeps every keystroke out of the history stack.
  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Top-level theme only ("Ninjago" out of "Ninjago > Dragons Rising") to keep the filter short.
  const themes = useMemo(() => {
    const found = new Set<string>();
    for (const set of sets) {
      const root = set.themeName?.split(' > ')[0];
      if (root) found.add(root);
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [sets]);

  // A theme from the URL that no longer matches any set still gets an option, so the select
  // reflects the filter actually being applied instead of silently showing "All themes".
  const themeOptions = useMemo(
    () => (theme && !themes.includes(theme) ? [theme, ...themes] : themes),
    [themes, theme],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = sets.filter((set) => {
      if (theme && set.themeName?.split(' > ')[0] !== theme) return false;
      if (!needle) return true;
      return (
        set.setNum.toLowerCase().includes(needle) ||
        (set.name ?? '').toLowerCase().includes(needle) ||
        (set.themeName ?? '').toLowerCase().includes(needle) ||
        String(set.year ?? '').includes(needle)
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name':
          return (a.name ?? a.setNum).localeCompare(b.name ?? b.setNum);
        case 'setNum':
          return a.setNum.localeCompare(b.setNum, undefined, { numeric: true });
        case 'year':
          return (b.year ?? 0) - (a.year ?? 0);
        case 'parts':
          return (b.numParts ?? 0) - (a.numParts ?? 0);
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return sorted;
  }, [sets, query, sort, theme]);

  // Exports what is on screen, so the filters double as the way to choose what goes in the file.
  function handleExport() {
    const rows: (string | number | null)[][] = [
      ['Set number', 'Name', 'Year', 'Theme', 'Pieces', 'Inventory lines', 'Status', 'Added'],
      ...visible.map((set) => [
        set.setNum,
        set.name,
        set.year,
        set.themeName,
        set.numParts,
        set.inventoryLines,
        set.syncStatus,
        set.createdAt.slice(0, 10),
      ]),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`my-sets-${stamp}.csv`, toCsv(rows));
  }

  const totalPieces = useMemo(
    () => sets.reduce((sum, s) => sum + (s.numParts ?? 0), 0),
    [sets],
  );

  if (loading) return <p className="muted">Loading your collection…</p>;
  if (error) return <p className="error">{error}</p>;

  if (sets.length === 0) {
    return (
      <div className="card empty-state">
        <h2>No sets yet</h2>
        <p className="muted">
          Add the sets you own and their inventories download automatically. That is what the
          scanner matches bricks against.
        </p>
        <Link className="button-link" to="/sets/add">
          Add sets
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="gallery-head">
        <div>
          <h2>My sets</h2>
          <p className="muted small">
            {sets.length} sets · {totalPieces.toLocaleString()} pieces
          </p>
        </div>
        <div className="row">
          <input
            className="search"
            type="search"
            placeholder="Search name, number, theme…"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
          />
          {themeOptions.length > 1 && (
            <select value={theme} onChange={(e) => setParam('theme', e.target.value)}>
              <option value="">All themes</option>
              {themeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <select
            value={sort}
            onChange={(e) =>
              setParam('sort', e.target.value === DEFAULT_SORT ? '' : e.target.value)
            }
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleExport} disabled={visible.length === 0}>
            Export CSV
          </button>
          <Link className="button-link" to="/sets/add">
            Add sets
          </Link>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted">No sets match that filter.</p>
      ) : (
        <ul className="gallery">
          {visible.map((set) => (
            <li key={set.id}>
              <Link className="tile" to={`/sets/${encodeURIComponent(set.setNum)}`}>
                <div className="tile-art">
                  <SetArt url={set.imgUrl} variant="tile" alt={set.name ?? set.setNum} />
                  {set.syncStatus !== 'ready' && (
                    <span className={`pill pill-${set.syncStatus} tile-badge`}>
                      {set.syncStatus === 'error' ? 'Failed' : 'Syncing'}
                    </span>
                  )}
                </div>
                <div className="tile-body">
                  <div className="tile-name">{set.name ?? set.setNum}</div>
                  <div className="tile-meta">
                    <span className="tile-num">{set.setNum}</span>
                    {set.year && <span>{set.year}</span>}
                    {set.numParts != null && <span>{set.numParts.toLocaleString()} pcs</span>}
                  </div>
                  {set.themeName && <div className="tile-theme">{set.themeName}</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
