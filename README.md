# People Gator Archive

A mobile-first browser for scanned document pages, detected faces, and human name
annotations. The application indexes a dataset directory at startup and serves both
the web interface and image derivatives from one Node.js process.

## Run it

Requirements: Node.js 20 or newer.

```bash
npm install
npm run build
npm start -- --dataset /absolute/path/to/dataset
```

For the dataset included in this repository:

```bash
npm run build
npm start -- --dataset ./dataset
```

Open `http://localhost:8787`. The server also prints its LAN addresses; use one of
those addresses in the event QR code so phones on the same network can open the app.

For live frontend and server development:

```bash
DATASET_DIR=./dataset npm run dev
```

The Vite interface is then available at `http://localhost:5173`. Set `PORT` or
`HOST` to override the production server defaults (`8787` and `0.0.0.0`).

## Docker

The Compose setup mounts the dataset as a read-only volume at `/data`; it is excluded
from the image build context. It does not publish a host port. Instead, Traefik routes
`https://peoplegator-dataset.capturemyhand.com` to the container on the external
`web` network.

The router uses the `websecure` entrypoint and the `tslchallage` certificate
resolver. The external `web` Docker network and Traefik must already exist.

With the repository's `dataset/` directory:

```bash
docker compose up --build -d
```

With a dataset elsewhere on the host:

```bash
DATASET_PATH=/absolute/path/to/dataset docker compose up --build -d
```

You can instead copy `.env.example` to `.env` and set `DATASET_PATH`. Once
Traefik has discovered the service, open the HTTPS domain above.

```bash
docker compose ps
docker compose logs -f archive
docker compose down
```

The runtime container is read-only, runs as the unprivileged `node` user, and
includes an HTTP health check at `/api/health`.

## Dataset contract

The selected directory must contain:

- one `people_gator__corresponding_faces*.jsonl` annotation file;
- a `people_gator__data/` directory;
- library folders containing `<document>.images/`,
  `<document>.peoplegator_aligned_crops/`, and
  `<document>.people_gator.jsonl`.

Other metadata such as layouts and named entities is deliberately ignored.

The index stays in memory; original multi-gigabyte scans are not copied. Page images
are resized on demand by the server, with 360-pixel card previews kept in a bounded
memory cache, while aligned crops are streamed directly.
Search and list endpoints are paginated.

## Agreement semantics

Repeated rows are deduplicated. For a face and exact person-name variant, agreement is:

```text
unique annotators who selected that name / unique annotators who reviewed the face
```

One annotator may support more than one historical name variant, so two aliases can
both have 100% agreement. This is intentional: the app preserves the source
annotations instead of silently merging names.

## Checks

```bash
npm test
npm run build
```
