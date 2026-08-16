# Brick Review

Point a camera at a pile of LEGO bricks and find out which of *your* sets they belong to.

Recognition comes from [Brickognize](https://brickognize.com/) (free, no auth). Set inventories
come from [Rebrickable](https://rebrickable.com/api/) (free, needs an API key). Brickognize tells
you *what a brick is*; Rebrickable tells you *which sets contain it*. This app joins the two.

## How it works

```
  set numbers  ──►  Rebrickable  ──►  local SQLite inventory
   (bulk paste)      (one sync)        parts + colour + qty + id aliases
                                                │
  camera frame ──►  Brickognize  ──►  part id   ┘
   (photo or live)   (BrickLink id)      │
                                         ▼
                          ranked list of your sets, by how much
                          of the scanned evidence each explains
```

Brickognize returns **BrickLink** part ids; Rebrickable inventories are keyed by **Rebrickable**
part numbers. The `PartAlias` table is built during set sync from Rebrickable's `external_ids`,
so the two catalogues join correctly instead of relying on the ids happening to match.

## Setup

```bash
yarn install                  # installs both workspaces + generates the Prisma client
cp .env.example .env          # then add your Rebrickable key
yarn db:push                  # creates apps/api/prisma/dev.db
yarn dev                      # API on :3001, web on :5173
```

Get a free Rebrickable key at <https://rebrickable.com/api/> (Account → Settings → API) and set
`REBRICKABLE_API_KEY` in `.env`. Without it the app runs, but set inventories cannot be
downloaded, so nothing will match — the UI shows a banner saying so.

Want to try it before getting a key:

```bash
yarn workspace @brick-review/api seed:demo            # two fake sets of common bricks
yarn workspace @brick-review/api seed:demo --clear    # remove them
```

## Using it

**My sets** — paste set numbers however you have them: commas, newlines, spaces, `#` prefixes,
a copied spreadsheet column, or load a `.txt`/`.csv`. The `-1` variant suffix is added
automatically (`10276` → `10276-1`), duplicates are dropped, and stray words like `LEGO` are
ignored. Each set's full inventory downloads in the background — status shows per set, and
failures can be retried.

**Scan bricks** — start the camera and either hit *Identify brick* per brick or turn on
*Live scan* to sample every 1–6s. Each result shows the candidate parts, whether you own them,
and which sets contain them. The **Session** panel accumulates everything seen and ranks your
sets by coverage — one brick is weak evidence, ten is strong. Desktop without a camera can use
*Upload photo*.

Camera access needs a secure context: `localhost` works as-is, any other host needs HTTPS.

## Layout

```
apps/api    NestJS + Prisma + SQLite
  sets/          bulk import, background inventory sync worker
  rebrickable/   API client, serialised at ~1 req/s (they ban for abuse)
  brickognize/   API client, serialised and throttled so live scan can't firehose
  recognition/   part -> owned-set matching and session ranking
apps/web    Vite + React + TypeScript
  pages/SetsPage.tsx   collection management
  pages/ScanPage.tsx   camera, live scan, session ranking
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | DB + config status |
| `GET` | `/api/sets` | collection with sync status |
| `GET` | `/api/sets/stats` | counts, incl. whether the Rebrickable key is set |
| `POST` | `/api/sets/import` | `{ text }` or `{ setNums[] }` — bulk add |
| `POST` | `/api/sets/:setNum/resync` | re-download one inventory |
| `POST` | `/api/sets/retry-failed` | requeue everything that errored |
| `DELETE` | `/api/sets/:setNum` | remove a set |
| `POST` | `/api/recognition/identify` | multipart `image`; `?searchType=parts&minScore=0.3` |
| `POST` | `/api/recognition/rank` | `{ observations: [{ partNum, weight }] }` — session ranking |

## Notes and limits

- **Colour is stored but not yet used for matching.** Rebrickable inventories carry colour per
  line and the UI displays it, but ranking matches on part shape only. Brickognize has a colour
  endpoint that could tighten this considerably.
- **Ranking is coverage-based**, weighted by recognition confidence. It does not yet account for
  how *rare* a part is — a 1x2 plate appearing in a set is much weaker evidence than an unusual
  printed piece. Inverse-frequency weighting is the obvious next improvement.
- Scans are recorded in the `ScanEvent` table; nothing reads it yet, but it is there for
  tuning matching or submitting feedback to Brickognize.
- Rebrickable rate-limits to about 1 request/second and bans repeat offenders. Both clients
  serialise their requests; do not remove the throttles.
