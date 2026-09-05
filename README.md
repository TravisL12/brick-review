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
yarn db:migrate               # creates apps/api/prisma/dev.db from prisma/migrations/
yarn dev                      # API on :3001, web on :5173
```

Open <http://localhost:5173> and create an account. The app is multi-user: every set,
inventory, minifig and scan belongs to the account that added it, and the first account
to register becomes the instance admin.

Set `AUTH_JWT_SECRET` in `.env` to a long random string — it signs the session cookie:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Without it the API picks a fresh random secret each boot, which works for local
poking but signs everyone out on every restart.

Get a free Rebrickable key at <https://rebrickable.com/api/> (Account → Settings → API) and set
`REBRICKABLE_API_KEY` in `.env`. Without it the app runs, but set inventories cannot be
downloaded, so nothing will match — the UI shows a banner saying so.

Want to try it before getting a key — register an account first, then:

```bash
yarn workspace @brick-review/api seed:demo            # two fake sets of common bricks
yarn workspace @brick-review/api seed:demo --clear    # remove them
```

The sets land in the oldest account unless you name one with `--email=you@example.com`.

## Accounts

Registration is open: anyone who can reach the app can create an account, and the first
one to do so is the admin. A session is a signed JWT in an httpOnly, SameSite=Lax cookie
that lasts 30 days; passwords are bcrypt hashes (cost 12).

Every API route requires a session except `/api/health` and `/api/auth/*` — the guard is
applied globally and routes opt out with `@Public()`, so a new controller is private by
default rather than by remembering to protect it.

What is per-user and what is shared is a deliberate split:

| Per user | Shared |
| --- | --- |
| `LegoSet` and everything under it — `SetPart`, `SetImage`, `SetMinifig` — plus `ScanEvent` | `Minifig`, `MinifigPart`, `PartAlias`, `ColorAlias` |

The shared tables are a local mirror of Rebrickable's catalogue, not anyone's property, and
they cost rate-limited requests to rebuild — so two accounts owning the same set each get
their own inventory rows, but share the part-alias and colour maps. A set number is unique
*per user*, not globally (`@@unique([userId, setNum])`), so the compound `userId_setNum` key
is what identifies a row. Deleting a user cascades to their sets, inventories, images, figs
and scans, and leaves the catalogue caches alone.

The sync queue is deliberately **not** per user: Rebrickable's ~1 req/s limit belongs to the
upstream API rather than to an account, so one global drain is what keeps the app inside it.

## Using it

| Route | What it is |
| --- | --- |
| `/sets` | Gallery — tiled view of the whole collection, with search, theme filter and sorting |
| `/sets/add` | Import and manage: bulk entry, sync status, resync, remove |
| `/sets/:setNum` | One set: large image, metadata and full piece inventory |
| `/scan` | Camera scanning and session ranking |

**Add sets** (`/sets/add`) — paste set numbers however you have them: commas, newlines, spaces,
`#` prefixes, a copied spreadsheet column, or load a `.txt`/`.csv`. The `-1` variant suffix is
added automatically (`10276` → `10276-1`), duplicates are dropped, and stray words like `LEGO`
are ignored. Each set's full inventory downloads in the background — status shows per set, and
failures can be retried.

**My sets** (`/sets`) — the gallery. Search by name, number, theme or year, filter to a
top-level theme, and sort by name, number, year or piece count. Every tile links to its set.

**Set detail** (`/sets/:setNum`) — large box art, theme path, year, piece and colour counts, and
the complete inventory with part images, quantities, colour swatches and element ids. The
inventory can be searched, filtered by colour, sorted, and spares can be hidden. Every piece
links out to its Rebrickable and BrickLink catalogue page. Rebrickable publishes no prose
description for sets, so the info panel is built from real metadata rather than invented copy,
with links out to Rebrickable and BrickLink for the rest.

Removing a set asks for confirmation first, naming the set and how many inventory lines go with
it. Escape or a backdrop click cancels.

**Scan bricks** — start the camera and either hit *Identify brick* per brick or turn on
*Live scan* to sample every 1–6s. Each result shows the candidate parts, whether you own them,
and which sets contain them. The **Session** panel accumulates everything seen and ranks your
sets by coverage — one brick is weak evidence, ten is strong. Desktop without a camera can use
*Upload photo*.

Camera access needs a secure context: `localhost` works as-is, any other host needs HTTPS.

## Layout

```
apps/api    NestJS + Prisma + SQLite
  auth/          accounts, session cookie, globally applied guard
  sets/          bulk import, background inventory sync worker
  rebrickable/   API client, serialised at ~1 req/s (they ban for abuse)
  brickognize/   API client, serialised and throttled so live scan can't firehose
  recognition/   part -> owned-set matching and session ranking
apps/web    Vite + React + TypeScript
  auth/AuthContext.tsx      session state; the app renders behind it
  pages/SignInPage.tsx      sign in / create account
  pages/SetsGalleryPage.tsx  tiled collection gallery
  pages/SetsAddPage.tsx     bulk import + sync management
  pages/SetDetailPage.tsx   one set, with searchable piece inventory
  pages/ScanPage.tsx        camera, live scan, session ranking
```

## API

Every path below except `/api/health` and `/api/auth/*` needs a session cookie and is
scoped to the signed-in account.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | DB + config status (public) |
| `POST` | `/api/auth/register` | `{ email, password, displayName? }` — creates an account and signs in |
| `POST` | `/api/auth/login` | `{ email, password }` — sets the session cookie |
| `POST` | `/api/auth/logout` | clears the session cookie |
| `GET` | `/api/auth/me` | the signed-in account |
| `GET` | `/api/sets` | collection with sync status |
| `GET` | `/api/sets/stats` | counts, incl. whether the Rebrickable key is set |
| `GET` | `/api/sets/:setNum` | one set plus aggregate inventory summary |
| `GET` | `/api/sets/:setNum/parts` | full piece inventory for a set |
| `POST` | `/api/sets/import` | `{ text }` or `{ setNums[] }` — bulk add |
| `POST` | `/api/sets/:setNum/resync` | re-download one inventory |
| `POST` | `/api/sets/retry-failed` | requeue everything that errored |
| `DELETE` | `/api/sets/:setNum` | remove a set |
| `POST` | `/api/recognition/identify` | multipart `image`; `?searchType=parts&minScore=0.3` |
| `POST` | `/api/recognition/rank` | `{ observations: [{ partNum, weight }] }` — session ranking |

## Schema changes

The schema is versioned in `apps/api/prisma/migrations/`. Change `schema.prisma`, then:

```bash
yarn db:migrate               # dev: generates a migration, applies it, regenerates the client
yarn db:deploy                # deployed: applies pending migrations, generates nothing
```

**Do not use `yarn db:push` on a database with real collections in it.** It diffs the
schema straight onto the database with no migration file and no review step, and when a
change cannot be applied in place — adding a required column such as `userId`, say — it
resolves that by dropping and recreating the table. It is fine for throwaway experiments
on an empty database and dangerous everywhere else. The script is kept for that narrow
case only.

## Notes and limits

- **Colour is stored but not yet used for matching.** Rebrickable inventories carry colour per
  line and the UI displays it, but ranking matches on part shape only. Brickognize has a colour
  endpoint that could tighten this considerably.
- **Ranking is coverage-based**, weighted by recognition confidence. It does not yet account for
  how *rare* a part is — a 1x2 plate appearing in a set is much weaker evidence than an unusual
  printed piece. Inverse-frequency weighting is the obvious next improvement.
- Theme names come from Rebrickable's theme table, fetched once per process and cached. Sets
  synced before that existed are backfilled on the next API start.
- Part links are built from catalogue ids, not guessed. BrickLink part ids come from the
  `PartAlias` table (13% of them differ from the Rebrickable number), and BrickLink colour ids
  from `ColorAlias`, populated once from Rebrickable's colour table on first inventory view.
  Rebrickable redirects `/parts/{id}/` to its own canonical slug and ignores a colour segment,
  so those links are part-level; BrickLink links deep-link to the exact colour via `idColor`.
- Scans are recorded in the `ScanEvent` table; nothing reads it yet, but it is there for
  tuning matching or submitting feedback to Brickognize.
- Rebrickable rate-limits to about 1 request/second and bans repeat offenders. Both clients
  serialise their requests; do not remove the throttles.
- **The sync queue assumes a single API process.** The mutex that stops overlapping drains
  is an in-memory flag, so two processes (a cluster, or a rolling deploy running old and new
  together) would each claim the same pending rows and double the request rate at
  Rebrickable — the exact behaviour that gets an API key banned. Run one instance, or move
  the claim into the database first.
- SQLite runs in WAL mode with a 5s busy timeout, set on connect in `PrismaService`. WAL is
  what lets the app be read while the sync queue writes; without it a writer's lock blocks
  readers too, and a page load landing mid-sync can fail outright.
- A set left at `syncStatus: 'syncing'` when the process stops is requeued on the next boot,
  and any `pending` work resumes then too. The in-memory drain mutex is what makes this
  safe: if the process is starting, nothing can actually be in flight.
