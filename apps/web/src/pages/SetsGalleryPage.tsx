import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { LegoSet } from '../lib/types';

type SortKey = 'recent' | 'name' | 'setNum' | 'year' | 'parts';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'name', label: 'Name' },
  { key: 'setNum', label: 'Set number' },
  { key: 'year', label: 'Year' },
  { key: 'parts', label: 'Piece count' },
];

export function SetsGalleryPage() {
  const [sets, setSets] = useState<LegoSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [theme, setTheme] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .listSets()
      .then((data) => {
        if (!cancelled) setSets(data);
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
  }, []);

  // Top-level theme only ("Ninjago" out of "Ninjago > Dragons Rising") to keep the filter short.
  const themes = useMemo(() => {
    const found = new Set<string>();
    for (const set of sets) {
      const root = set.themeName?.split(' > ')[0];
      if (root) found.add(root);
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [sets]);

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
            onChange={(e) => setQuery(e.target.value)}
          />
          {themes.length > 1 && (
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">All themes</option>
              {themes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
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
                  {set.imgUrl ? (
                    <img src={set.imgUrl} alt={set.name ?? set.setNum} loading="lazy" />
                  ) : (
                    <div className="tile-placeholder" aria-hidden="true" />
                  )}
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
