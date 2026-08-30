import compression from "compression";
import express from "express";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DatasetIndex, FeedbackValidationError } from "./dataset";
import type { FeedbackIssueType, FeedbackSubmission } from "../src/types";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function queryText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function queryNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveMedia(root: string, relative: string): string | null {
  if (!relative || path.isAbsolute(relative)) return null;
  const resolved = path.resolve(root, relative);
  const safePrefix = root.endsWith(path.sep) ? root : root + path.sep;
  return resolved.startsWith(safePrefix) ? resolved : null;
}

const datasetDirectory = path.resolve(
  argument("--dataset") || process.env.DATASET_DIR || path.join(process.cwd(), "dataset"),
);
const feedbackFile = path.resolve(
  argument("--feedback") ||
    process.env.FEEDBACK_FILE ||
    path.join(process.cwd(), "feedback", "people_gator__feedback.jsonl"),
);
const port = queryNumber(process.env.PORT, 8787);
const host = process.env.HOST || "0.0.0.0";

console.log("Indexing dataset at " + datasetDirectory + " …");
const archive = new DatasetIndex(datasetDirectory, feedbackFile);
const startedAt = Date.now();
await archive.build();
console.log(
  "Indexed " +
    archive.getStats().scans.toLocaleString() +
    " scans and " +
    archive.getStats().detections.toLocaleString() +
    " faces in " +
    ((Date.now() - startedAt) / 1000).toFixed(1) +
    "s.",
);

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "16kb" }));

const thumbnailCache = new Map<string, Promise<Buffer>>();
const MAX_THUMBNAILS = 128;

async function thumbnail(mediaPath: string, width: number): Promise<Buffer> {
  const key = mediaPath + "\u0000" + width;
  const cached = thumbnailCache.get(key);
  if (cached) {
    thumbnailCache.delete(key);
    thumbnailCache.set(key, cached);
    return cached;
  }

  const rendered = sharp(mediaPath)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({
      quality: width > 1200 ? 86 : width > 500 ? 76 : 70,
      progressive: true,
      mozjpeg: true,
    })
    .toBuffer();
  thumbnailCache.set(key, rendered);
  if (thumbnailCache.size > MAX_THUMBNAILS) {
    const oldest = thumbnailCache.keys().next().value;
    if (oldest !== undefined) thumbnailCache.delete(oldest);
  }
  rendered.catch(() => thumbnailCache.delete(key));
  return rendered;
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, dataset: datasetDirectory });
});

app.get("/api/stats", (_request, response) => {
  response.json(archive.getStats());
});

app.get("/api/libraries", (_request, response) => {
  response.json(archive.getLibraries());
});

app.get("/api/scans", (request, response) => {
  response.json(
    archive.getScans({
      q: queryText(request.query.q),
      library: queryText(request.query.library),
      faces: queryText(request.query.faces),
      page: queryNumber(request.query.page, 1),
      pageSize: queryNumber(request.query.pageSize, 24),
    }),
  );
});

app.get("/api/scans/:library/:document/:page", (request, response) => {
  const scan = archive.getScan(
    request.params.library,
    request.params.document,
    request.params.page,
  );
  if (!scan) {
    response.status(404).json({ error: "Scan not found" });
    return;
  }
  response.json(scan);
});

app.get("/api/people", (request, response) => {
  response.json(
    archive.getPeople({
      q: queryText(request.query.q),
      page: queryNumber(request.query.page, 1),
      pageSize: queryNumber(request.query.pageSize, 30),
    }),
  );
});

app.get("/api/person", (request, response) => {
  const name = queryText(request.query.name);
  const person = archive.getPerson(name, {
    page: queryNumber(request.query.page, 1),
    pageSize: queryNumber(request.query.pageSize, 36),
  });
  if (!person) {
    response.status(404).json({ error: "Person not found" });
    return;
  }
  response.json(person);
});

app.post("/api/feedback", async (request, response) => {
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const submission: FeedbackSubmission = {
    issueType: queryText(body.issueType) as FeedbackIssueType,
    library: queryText(body.library),
    document: queryText(body.document),
    page: queryText(body.page),
    cropName: queryText(body.cropName),
    suggestedPersonName: queryText(body.suggestedPersonName),
    note: queryText(body.note),
  };
  const result = await archive.recordFeedback(submission);
  response.status(201).json(result);
});

app.get("/media/page", async (request, response, next) => {
  try {
    const mediaPath = resolveMedia(archive.dataDir, queryText(request.query.path));
    if (!mediaPath) {
      response.status(400).json({ error: "Invalid media path" });
      return;
    }
    await access(mediaPath);
    const width = Math.min(2200, Math.max(160, queryNumber(request.query.w, 960)));
    response.set({
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/jpeg",
    });
    response.send(await thumbnail(mediaPath, width));
  } catch (error) {
    next(error);
  }
});

app.get("/media/face", async (request, response) => {
  const mediaPath = resolveMedia(archive.dataDir, queryText(request.query.path));
  if (!mediaPath) {
    response.status(400).json({ error: "Invalid media path" });
    return;
  }
  try {
    await access(mediaPath);
    response.set("Cache-Control", "public, max-age=86400");
    response.sendFile(mediaPath);
  } catch {
    response.status(404).json({ error: "Face image not found" });
  }
});

const distribution = path.join(process.cwd(), "dist");
try {
  await access(path.join(distribution, "index.html"));
  app.use(express.static(distribution, { maxAge: "1h", index: false }));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html")) {
      response.sendFile(path.join(distribution, "index.html"));
      return;
    }
    next();
  });
} catch {
  if (process.env.NODE_ENV === "production") {
    console.warn("No dist/ directory found. Run npm run build before npm start.");
  }
}

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (!response.headersSent) {
      if (error instanceof FeedbackValidationError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      console.error(error);
      response.status(500).json({ error: "Unable to process request" });
    }
  },
);

app.listen(port, host, () => {
  console.log("People Gator Archive: http://localhost:" + port);
  const networks = os.networkInterfaces();
  for (const addresses of Object.values(networks)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        console.log("On your network: http://" + address.address + ":" + port);
      }
    }
  }
});
