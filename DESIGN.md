# People Gator Archive — Product and Technical Design

## 1. Purpose

People Gator Archive is a mobile-first browser for a filesystem dataset of historical
document scans, detected faces, and independently supplied person-name annotations.
It lets visitors:

- browse and filter scanned pages;
- search a diacritic-insensitive index of annotated people;
- inspect every recorded appearance of a person;
- zoom and pan a scan while selecting detected face regions;
- inspect name variants and annotator agreement for a detection;
- report a wrong person, report an invalid detection, or confirm a detection as OK.

The source dataset is immutable. User feedback is stored separately as append-only
JSON Lines and is reflected in aggregate counters without modifying original names.

This document first defines the externally observable application contract. It then
defines the Vue/Fastify implementation that reproduces that contract in the
standalone `vue-fronted/` Node project.

## 2. Product principles

1. **The source archive is authoritative and read-only.** Feedback supplements source
   annotations; it never silently changes them.
2. **Annotation disagreement is visible.** All distinct historical name variants and
   their vote totals are exposed.
3. **URLs preserve browsing state.** Search, filters, pagination, and selected faces
   can be bookmarked and shared.
4. **The interface works from phones upward.** Scan inspection remains usable with
   touch zoom/pan and a compact bottom navigation.
5. **Large source images are not copied.** The server creates bounded, cached page
   derivatives and streams aligned face crops.
6. **The API contract is executable.** Fastify publishes OpenAPI, Valibot validates
   input at runtime, and the frontend client is generated from that OpenAPI document.

## 3. Dataset contract

The selected dataset directory contains:

```text
<dataset>/
├── people_gator__corresponding_faces*.jsonl
└── people_gator__data/
    └── <library>/
        ├── <document>.images/
        │   └── <page>.(jpg|jpeg|png|webp|tif|tiff)
        ├── <document>.peoplegator_aligned_crops/
        │   └── <crop-name>
        └── <document>.people_gator.jsonl
```

Detection and annotation rows identify a face by the tuple `library`, `document`,
`page`, and `crop_name`. Optional geometry fields are `page_width`, `page_height`,
`page_left`, `page_top`, `width`, `height`, and `confidence`. Annotation rows add
`annotator` and `person_name`. A row may also contain a direct relative `face` path.

At startup the backend:

1. indexes libraries and page image paths;
2. reads detection files concurrently with a bounded worker pool;
3. selects the lexicographically newest matching annotation file;
4. deduplicates votes by face, exact name variant, and annotator;
5. builds sorted scan and person indexes;
6. replays the append-only feedback file into issue/OK counters.

Search normalizes strings with Unicode NFD, strips combining marks, and lowercases
with the Czech locale. It therefore matches names with or without Czech diacritics.

## 4. Domain model

### VoteSummary

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Exact person-name variant from source annotations. |
| `count` | integer | Unique annotators who selected this exact variant. |
| `total` | integer | Unique annotators who reviewed the face. |
| `percentage` | integer | Rounded `count / total * 100`. |

One annotator may support more than one exact variant. Consequently, multiple variants
may each have 100% agreement. This is intentional.

### FaceOccurrence

Contains its stable tuple-derived `id`; library, document, page, crop name and crop
path; source-page dimensions; bounding-box coordinates and dimensions; nullable
detection confidence; the highest-ranked `displayName`; all sorted `votes`; and
feedback/OK counts.

### ScanSummary and ScanDetail

A scan summary contains identity, source page path, total/named face counts, aggregate
feedback/OK counts, and unique sorted people. A detail adds source dimensions, full
face occurrences, an optional Digitalniknihovna source URL, and `previous`, `random`,
and `next` navigation targets.

### PersonSummary and PersonDetail

A person summary contains an exact name, unique face count, mean agreement percentage,
optional preview crop, and aggregate feedback/OK counts. A detail adds a paginated list
of face occurrences ranked by agreement, then library and page.

### Feedback

`issueType` is one of:

- `wrong_person`: requires a different suggested name;
- `invalid_detection`: identifies a false-positive face box;
- `ok`: records positive confirmation.

The API returns the generated feedback ID and authoritative updated counters.

## 5. HTTP API

All JSON errors have the shape `{ "error": string }`. List endpoints cap `pageSize`
at 60, clamp pages into range, and return `{ items, page, pageSize, total,
totalPages }`. Unless stated otherwise, successful reads return HTTP 200.

### Health and aggregates

| Method and path | Input | Response |
| --- | --- | --- |
| `GET /api/health` | none | `{ ok: true, dataset: string }` |
| `GET /api/stats` | none | `ArchiveStats` |
| `GET /api/libraries` | none | `LibrarySummary[]`, Czech-locale sorted |

`ArchiveStats` exposes `scans`, `detections`, `annotatedFaces`, `people`, `libraries`,
`annotationRows`, `uniqueVotes`, `feedbackReports`, and `okReports`.

### Scans

#### `GET /api/scans`

Query parameters:

| Name | Default | Contract |
| --- | --- | --- |
| `q` | empty | Matches library, document, page, or annotated names. |
| `library` | empty | Exact library filter. |
| `faces` | empty | `named`, `detected`, or empty for all pages. |
| `page` | `1` | Positive integer, clamped. |
| `pageSize` | `24` | Integer from 1 through 60. |

Returns `Paginated<ScanSummary>`.

#### `GET /api/scans/{library}/{document}/{page}`

All path components are URL encoded. Returns `ScanDetail`; returns 404 when the page
is absent or has no source image. `random` is null only when there is no other indexed
scan; previous/next are null at the ends of the sorted archive.

### People

#### `GET /api/people`

Accepts `q`, `page` (default 1), and `pageSize` (default 30). Returns
`Paginated<PersonSummary>`.

#### `GET /api/person`

Accepts exact `name`, `page` (default 1), and `pageSize` (default 36). Returns a
`PersonDetail` plus pagination metadata, or 404 when the exact source name is absent.

### Feedback person search

#### `GET /api/feedback/people`

Accepts `q`, `page` (default 1), and `pageSize` (default 12). Results combine source
people with names previously introduced by feedback and declare `source` as `dataset`
or `feedback`. Equivalent normalized names are deduplicated; exact and prefix matches
rank ahead of substring matches.

### Feedback submission

#### `POST /api/feedback`

Request body:

```json
{
  "issueType": "wrong_person | invalid_detection | ok",
  "library": "string",
  "document": "string",
  "page": "string",
  "cropName": "string",
  "suggestedPersonName": "optional string",
  "note": "optional string"
}
```

Validation rules:

- the face tuple must identify an indexed detection;
- `wrong_person` requires a trimmed name of 1–200 characters;
- a suggested name must not normalize to a name already assigned to the face;
- `note`, when supplied, is at most 1,000 characters;
- equivalent known feedback/source spelling is canonicalized before storage.

Success returns HTTP 201 and `{ feedbackId, feedbackCount, okCount }`. Writes are
serialized through an in-process promise queue. Each JSONL record contains a UUID,
ISO timestamp, issue type, face identity, crop path, current names, optional suggested
name, and optional note.

### Media

| Method and path | Input | Behavior |
| --- | --- | --- |
| `GET /media/page` | `path`, optional `w` | Safe relative dataset path; width clamped to 160–2200; auto-rotated progressive JPEG derivative. |
| `GET /media/face` | `path` | Safely streams the original aligned crop. |

Absolute paths and traversal outside `people_gator__data` are rejected. Page
derivatives use a 128-entry in-memory LRU-like promise cache. Media responses are
publicly cacheable for one day.

### OpenAPI and generated client

Fastify publishes the machine-readable contract at `GET /api/openapi.json` and an
interactive reference at `GET /api/docs`. Every operation has a stable `operationId`.
`npm run generate:client` obtains the OpenAPI document from a generation-mode server
and writes typed request functions and models into `src/generated/`. Generated files
are committed/generated artifacts and must not be hand edited.

## 6. Functional interface

### Global shell

The sticky desktop header shows the PG archive mark and links to Scans and People.
The active destination is visibly underlined. Below 760 px, these destinations move
to a fixed bottom navigation. The footer states that names reflect independent human
annotations. The base visual language is warm archival paper, dark ink, muted gray,
oxide red, sage, hairline borders, serif display headings, and restrained shadows.

### `/` and unknown routes

`/` redirects to `/scans`. Unknown paths show a full-page 404 with a button back to
scan browsing.

### `/scans` — scan browser

The hero describes the archive and shows scan, detection, person, and library totals.
The content area provides:

- a debounced text search;
- a PrimeVue library Select;
- a PrimeVue face-content Select (named, any detected, or all);
- a responsive grid of scan cards;
- PrimeVue pagination.

Each card uses a 360 px page derivative, an ordinal page index, named/total face
count, report/OK counts, library and shortened document ID, and the first named
person. Search/filter/page values live in the URL. Changing search or filters resets
page to one. Old query data remains visible during background page transitions.

### `/scans/:library/:document/:page` — scan workspace

The workspace contains a large document stage and an annotation drawer.

The stage supports mouse-wheel and pinch zoom from 100% to 600%, pointer/touch pan,
reset, double-click zoom toggle, and a live scale readout. Face bounding boxes are
positioned as percentages of source dimensions. Named boxes use sage; unnamed boxes
use red. Box strokes and labels remain visually stable as the page scales. Clicking a
box selects it; clicking the canvas or pressing Escape clears it. The selected crop
name is stored in `?face=`.

The drawer provides previous/random/next navigation; selected-face crop, name,
agreement and counters; report/wrong-detection/OK actions; annotator consensus;
and a roster of every face on the page. A source link opens in a new tab.

Feedback mutations optimistically update the selected face and scan aggregates,
roll back on failure, replace optimistic values with server values on success, and
invalidate all API aggregates in the background when settled.

### Wrong-person feedback panel

The panel searches after two characters with a 220 ms debounce. Current name variants
are omitted. Existing dataset or feedback names can be selected; a new 2–200 character
name may be added when there is no normalized exact match. Submit is disabled until a
name is selected. Success closes the panel and shows confirmation; errors remain
inline and accessible.

### `/people` — people browser

A people-specific hero contains debounced diacritic-insensitive search. Cards show a
circular crop, exact name, appearance count, average-agreement bar, and report/OK
counts. Search and pagination are URL synchronized.

### `/people/view?name=…` — person detail

The title shows exact name, total appearances, and mean agreement. A responsive grid
shows face crops, per-appearance agreement, feedback counts, source library/page, and
a link back into the scan with that face preselected. Results are paginated.

### Shared UX states

Every asynchronous region has a layout-preserving skeleton, an inline recoverable
error state, and a useful empty state. Broken images become a neutral person-icon
fallback. Interactive controls have accessible names, keyboard focus, and disabled or
loading states. Reduced-motion preference removes nonessential transitions.

## 7. Vue component design

### Application and layout

- `App.vue`: router outlet inside the archive shell.
- `components/AppHeader.vue`: brand and desktop PrimeVue navigation controls.
- `components/AppFooter.vue`: archive attribution.
- `components/MobileNav.vue`: compact fixed navigation.
- `layouts` are expressed by Tailwind utilities in these components; there is no
  copied component stylesheet from the React application.

### Shared archive UI

- `ArchiveIcon.vue`: small archive-specific SVGs where PrimeIcons have no equivalent.
- `SearchBox.vue`: PrimeVue `IconField`, `InputIcon`, `InputText`, and clear Button.
- `ArchiveImage.vue`: lazy image with an accessible fallback.
- `StatsStrip.vue`: four responsive statistics cells.
- `ArchivePaginator.vue`: PrimeVue `Paginator` adapter for 1-based API pages.
- `LoadingGrid.vue`, `ErrorState.vue`, `EmptyState.vue`: reusable query states using
  PrimeVue Skeleton, Message, Button, and Card primitives.
- `AgreementBadge.vue`, `IssueCount.vue`, `OkCount.vue`: annotation and feedback
  metrics using PrimeVue Badge/Tag where appropriate.

### Scan feature

- `views/ScanBrowseView.vue`: query/filter orchestration and scan grid.
- `components/scans/ScanCard.vue`: PrimeVue Card-based summary.
- `views/ScanDetailView.vue`: detail-query and feedback orchestration.
- `components/scans/ZoomableScan.vue`: pointer/wheel transform surface and face boxes.
- `components/scans/ScanNavigation.vue`: previous/random/next Button links.
- `components/scans/SelectedFace.vue`: selected crop, actions, and status.
- `components/scans/VotePanel.vue`: all exact variants and agreement bars.
- `components/scans/FaceRoster.vue`: page detection picker.
- `components/feedback/FeedbackPanel.vue`: suggestion search and submit workflow.

### People feature

- `views/PeopleBrowseView.vue`: search, people query, grid and pagination.
- `components/people/PersonCard.vue`: PrimeVue Card with portrait and metrics.
- `views/PersonDetailView.vue`: exact-name lookup and appearance pagination.
- `components/people/AppearanceCard.vue`: crop and link to selected scan face.

PrimeVue is used for standard controls and containers: Button, Card, Select,
InputText/IconField, Paginator, Skeleton, Message, Tag, Badge, ProgressBar, and Dialog
or panel-like surfaces. Archive-specific visualizations (document canvas and bounding
boxes) remain custom semantic HTML because they are not generic form/layout widgets.

## 8. Vue composables and state

- `useApiQuery`: common query defaults and normalized API errors around generated
  client calls.
- `useDebouncedRef`: returns a delayed readonly ref and clears timers on unmount.
- `useSyncedSearchQuery`: maintains immediate input state, writes its debounced value
  into the router query, and resets pagination.
- `useFaceSelection`: derives the selected face from `route.query.face`, writes
  selections with router replacement, and clears on Escape.
- `useFeedbackMutation`: wraps the generated feedback operation with optimistic scan
  cache updates, rollback, authoritative reconciliation, and aggregate invalidation.
- `useZoomPan`: owns scale/translation, wheel and pointer gesture state, bounds,
  click-suppression after panning, reset, and scale-stable annotation variables.
- `useMediaUrls`: constructs same-origin media URLs with encoded query parameters.

TanStack Query is the sole remote-server-state cache. Router query parameters are the
source of truth for shareable navigation state. Short-lived presentational state
(open panel, notices, zoom transform, image failures) remains local to components.

Default query policy: 30-second stale time, 10-minute garbage collection, no window
focus refetch, and one retry.

## 9. Target project architecture

```text
vue-fronted/
├── openapi/
│   └── openapi.json
├── scripts/
│   └── generate-openapi.ts
├── server/
│   ├── app.ts
│   ├── dataset.ts
│   ├── index.ts
│   ├── openapi.ts
│   └── schemas.ts
├── src/
│   ├── components/{feedback,people,scans}/
│   ├── composables/
│   ├── generated/
│   ├── lib/
│   ├── router/
│   ├── views/
│   ├── App.vue
│   ├── main.ts
│   └── style.css
├── tests/
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

The Vite dev server proxies `/api` and `/media` to Fastify on port 8787. Production
Fastify serves the built `dist/` directory with an HTML fallback for Vue Router.
Runtime configuration uses `DATASET_DIR`, `FEEDBACK_FILE`, `HOST`, and `PORT`, with
`--dataset` and `--feedback` CLI overrides.

## 10. Styling and responsiveness

Tailwind CSS owns spacing, typography, responsive layout, state variants, color and
shadow tokens. `src/style.css` contains Tailwind import/theme definitions, the page
background texture, minimal PrimeVue token overrides, and only those low-level rules
that require selectors or dynamic CSS variables. Vue templates carry utility classes;
the previous React class stylesheet is not copied.

Primary breakpoints:

- desktop (>1100 px): two-column scan workspace and wide hero;
- tablet (761–1100 px): stacked workspace and reduced hero columns;
- mobile (≤760 px): one-column grids, fixed bottom nav, compact controls;
- narrow mobile (≤420 px): condensed labels and action layouts.

## 11. Security, performance, and failure handling

- media paths are resolved under the dataset data directory and checked by prefix;
- JSON bodies are limited to 16 KiB;
- Valibot rejects malformed path/query/body data before domain operations;
- error responses do not disclose internal stack traces;
- Fastify disables identifying headers and compresses eligible responses;
- image derivative width is bounded and thumbnail cache size is fixed;
- feedback writes are append-only and serialized;
- image loading is lazy outside the active scan;
- query pagination retains previous data to prevent visual reflow;
- malformed dataset JSONL rows are logged with file/line and skipped.

## 12. Verification requirements

The standalone project is complete when:

1. OpenAPI generation and client generation are reproducible from npm scripts;
2. generated calls type-check without hand-written endpoint response casts;
3. dataset tests cover source links, vote deduplication, diacritic search, navigation,
   feedback persistence, and feedback validation;
4. Fastify injection tests cover health, validation, 404, and submission responses;
5. Vue/TypeScript type checking passes;
6. the Vite production build passes;
7. the server can serve the SPA, API, docs, and media from one process.
