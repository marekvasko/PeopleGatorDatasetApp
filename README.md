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

The Compose setup mounts the dataset read-only at `/data` and stores reports in the
dedicated `people-gator-dataset-feedback` Docker volume at `/feedback`. The dataset
is excluded from the image build context. Compose does not publish a host port;
instead, Traefik routes `https://${SUBDOMAIN}.${BASE_DOMAIN}` to the container on
the external `web` network. The defaults remain
`https://peoplegator-dataset.capturemyhand.com`.

The router uses the `websecure` entrypoint and the `tlschallenge` certificate
resolver. The external `web` Docker network and Traefik must already exist.

Create the deployment environment first, then use the wrapper to run Compose:

```bash
cp .env.example .env
./compose.sh up --build -d
```

Set `BASE_DOMAIN`, `SUBDOMAIN`, and `DATASET_PATH` in `.env`. For example:

```dotenv
BASE_DOMAIN=capturemyhand.com
SUBDOMAIN=peoplegator-dataset
DATASET_PATH=/absolute/path/to/dataset
```

`compose.sh` exports every value from the env file and passes the same file to
Docker Compose. Set `COMPOSE_ENV_FILE=/absolute/path/to/another.env` to use a file
other than the repository's `.env`. Once Traefik has discovered the service, open
the configured HTTPS domain. The named feedback volume survives normal container
recreation and Compose shutdown.

```bash
./compose.sh ps
./compose.sh logs -f archive
./compose.sh down
```

To export the append-only feedback file to the current host directory:

```bash
./compose.sh exec -T archive cat /feedback/people_gator__feedback.jsonl \
  > people_gator__feedback.jsonl
```

Use `./compose.sh down -v` only when you intentionally want to delete the stored
feedback as well.

The runtime container is read-only apart from `/feedback`, runs as the unprivileged
`node` user, and includes an HTTP health check at `/api/health`.

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

## Feedback data

Feedback never modifies the source annotations. The server appends every report to
one file, `/feedback/people_gator__feedback.jsonl`, in Docker. Set `FEEDBACK_FILE`
when running without Docker to override the default
`./feedback/people_gator__feedback.jsonl` location.

Each line includes a generated ID and timestamp, the issue type, library, document,
page, crop name, aligned-face path, and the names assigned when the feedback was
submitted. A wrong-person report also includes `suggested_person_name`; an optional
`note` can accompany either report type. Example:

```json
{"feedback_id":"…","created_at":"2026-08-30T08:00:00.000Z","issue_type":"wrong_person","library":"cuni","document":"…","page":"….jpg","crop_name":"…__face_0.jpg","face":"cuni/….peoplegator_aligned_crops/…__face_0.jpg","current_names":["Current name"],"suggested_person_name":"Suggested name"}
```

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
