import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SetArt } from '../components/SetArt';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import { downloadCsv, toCsv } from '../lib/csv';
import type { MinifigSummary } from '../lib/types';

type FigSort = 'name' | 'quantity' | 'sets' | 'figNum';

const DEFAULT_SORT: FigSort = 'name';

/** Stable identity so the filter memos below do not rerun while loading. */
const NO_FIGS: MinifigSummary[] = [];

const SORTS: { key: FigSort; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'quantity', label: 'Most copies' },
  { key: 'sets', label: 'Most sets' },
  { key: 'figNum', label: 'Fig number' },
];

/** Top-level theme only ("Ninjago" out of "Ninjago > Dragons Rising"). */
function rootTheme(themeName: string | null): string | null {
  return themeName?.split(' > ')[0] ?? null;
}

export function MinifigsGalleryPage() {
  const { data, loading, error } = useAsyncData(() => api.listMinifigs(), []);
  const figs = data ?? NO_FIGS;

  // Filters live in the query string, same as the set gallery, so a filtered view links.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const theme = searchParams.get('theme') ?? '';
  const sortParam = searchParams.get('sort');
  const sort: FigSort = SORTS.some((s) => s.key === sortParam)
    ? (sortParam as FigSort)
    : DEFAULT_SORT;

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

  const themes = useMemo(() => {
    const found = new Set<string>();
    for (const fig of figs) {
      for (const set of fig.sets) {
        const root = rootTheme(set.themeName);
        if (root) found.add(root);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [figs]);

  const themeOptions = useMemo(
    () => (theme && !themes.includes(theme) ? [theme, ...themes] : themes),
    [themes, theme],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = figs.filter((fig) => {
      // A fig counts as in-theme when any set it came out of is.
      if (theme && !fig.sets.some((s) => rootTheme(s.themeName) === theme)) return false;
      if (!needle) return true;
      return (
        fig.figNum.toLowerCase().includes(needle) ||
        (fig.name ?? '').toLowerCase().includes(needle) ||
        fig.sets.some(
          (s) =>
            s.setNum.toLowerCase().includes(needle) ||
            (s.setName ?? '').toLowerCase().includes(needle),
        )
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'quantity':
          return b.totalQuantity - a.totalQuantity;
        case 'sets':
          return b.sets.length - a.sets.length;
        case 'figNum':
          return a.figNum.localeCompare(b.figNum, undefined, { numeric: true });
        default:
          return (a.name ?? a.figNum).localeCompare(b.name ?? b.figNum);
      }
    });
    return sorted;
  }, [figs, query, theme, sort]);

  const totalFigs = useMemo(
    () => figs.reduce((sum, f) => sum + f.totalQuantity, 0),
    [figs],
  );

  function handleExport() {
    const rows: (string | number | null)[][] = [
      ['Fig number', 'Name', 'Copies', 'Sets', 'Set numbers'],
      ...visible.map((fig) => [
        fig.figNum,
        fig.name,
        fig.totalQuantity,
        fig.sets.length,
        fig.sets.map((s) => s.setNum).join(' '),
      ]),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`my-minifigs-${stamp}.csv`, toCsv(rows));
  }

  if (loading) return <p className="muted">Loading your minifigs…</p>;
  if (error) return <p className="error">{error}</p>;

  if (figs.length === 0) {
    return (
      <div className="card empty-state">
        <h2>No minifigs yet</h2>
        <p className="muted">
          Minifigs arrive with a set's inventory. Add a set that ships some, or resync one added
          before minifig support to pull its figures.
        </p>
        <Link className="button-link" to="/sets">
          My sets
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="gallery-head">
        <div>
          <h2>My minifigs</h2>
          <p className="muted small">
            {figs.length.toLocaleString()} unique · {totalFigs.toLocaleString()} total
          </p>
        </div>
        <div className="row">
          <input
            className="search"
            type="search"
            placeholder="Search fig, set name, number…"
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
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted">No minifigs match that filter.</p>
      ) : (
        <ul className="fig-gallery">
          {visible.map((fig) => (
            <li key={fig.figNum}>
              <div className="fig-tile">
                <Link
                  className="fig-tile-art"
                  to={`/minifigs/${encodeURIComponent(fig.figNum)}`}
                  title={fig.name ?? fig.figNum}
                >
                  <SetArt url={fig.imgUrl} variant="fig" alt={fig.name ?? fig.figNum} />
                  {fig.totalQuantity > 1 && (
                    <span className="pill tile-badge fig-count">×{fig.totalQuantity}</span>
                  )}
                </Link>
                <div className="fig-tile-body">
                  <Link
                    className="fig-tile-name"
                    to={`/minifigs/${encodeURIComponent(fig.figNum)}`}
                  >
                    {fig.name ?? fig.figNum}
                  </Link>
                  <div className="tile-meta">
                    <span className="tile-num">{fig.figNum}</span>
                  </div>
                  {/* Where it came from — the fig's own page has no notion of your collection. */}
                  <ul className="fig-sets">
                    {fig.sets.map((owner) => (
                      <li key={owner.setNum}>
                        <Link to={`/sets/${encodeURIComponent(owner.setNum)}`}>
                          {owner.setName ?? owner.setNum}
                        </Link>
                        {owner.quantity > 1 && (
                          <span className="muted"> ×{owner.quantity}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
