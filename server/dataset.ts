import { createReadStream } from "node:fs";
import { appendFile, access, mkdir, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import type {
  ArchiveStats,
  FaceOccurrence,
  FeedbackPersonSuggestion,
  FeedbackResult,
  FeedbackSubmission,
  LibrarySummary,
  Paginated,
  PersonDetail,
  PersonSummary,
  ScanDetail,
  ScanSummary,
  VoteSummary,
} from "../src/types";

type JsonRecord = Record<string, unknown>;

interface MutableFace {
  id: string;
  library: string;
  document: string;
  page: string;
  cropName: string;
  facePath: string;
  pageWidth: number;
  pageHeight: number;
  pageLeft: number;
  pageTop: number;
  width: number;
  height: number;
  confidence: number | null;
  annotators: Set<string>;
  votesByName: Map<string, Set<string>>;
  feedbackCount: number;
  okCount: number;
}

interface MutableScan {
  id: string;
  library: string;
  document: string;
  page: string;
  imagePath: string;
  hasImage: boolean;
  pageWidth: number;
  pageHeight: number;
  sourceUrl: string | null;
  faceIds: Set<string>;
}

interface MutablePerson {
  name: string;
  faceIds: Set<string>;
}

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|tiff?)$/i;
const collator = new Intl.Collator("cs", { numeric: true, sensitivity: "base" });

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function scanId(library: string, document: string, page: string): string {
  return [library, document, page].join("\u0000");
}

function faceId(library: string, document: string, page: string, crop: string): string {
  return [library, document, page, crop].join("\u0000");
}

export function buildSourceUrl(library: string, document: string, page: string): string {
  const librarySlug = encodeURIComponent(library.trim().toLowerCase());
  const documentUuid = document.trim().replace(/^uuid:/i, "");
  const pageUuid = path.parse(page.trim()).name.replace(/^uuid:/i, "");
  return (
    "https://www.digitalniknihovna.cz/" +
    librarySlug +
    "/view/uuid:" +
    encodeURIComponent(documentUuid) +
    "?page=uuid:" +
    encodeURIComponent(pageUuid)
  );
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs");
}

export function summarizeVotes(
  annotators: Set<string>,
  votesByName: Map<string, Set<string>>,
): VoteSummary[] {
  const total = annotators.size;
  return [...votesByName.entries()]
    .map(([name, voters]) => ({
      name,
      count: voters.size,
      total,
      percentage: total === 0 ? 0 : Math.round((voters.size / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));
}

function pagination(pageValue: number, pageSizeValue: number, total: number) {
  const pageSize = Math.min(60, Math.max(1, Math.trunc(pageSizeValue) || 24));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(pageValue) || 1));
  return { page, pageSize, totalPages, start: (page - 1) * pageSize };
}

async function mapLimit<T>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const value = values[cursor];
      cursor += 1;
      await worker(value);
    }
  });
  await Promise.all(runners);
}

async function readJsonLines(
  filePath: string,
  onRecord: (record: JsonRecord) => void,
): Promise<number> {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let rowCount = 0;
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      onRecord(JSON.parse(line) as JsonRecord);
      rowCount += 1;
    } catch (error) {
      console.warn("Skipping malformed JSON in " + filePath + ":" + lineNumber, error);
    }
  }
  return rowCount;
}

export class FeedbackValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FeedbackValidationError";
    this.status = status;
  }
}

export class DatasetIndex {
  readonly datasetDir: string;
  readonly dataDir: string;
  readonly feedbackFile: string;
  private scans = new Map<string, MutableScan>();
  private faces = new Map<string, MutableFace>();
  private people = new Map<string, MutablePerson>();
  private browsableScans: MutableScan[] = [];
  private sortedPeople: MutablePerson[] = [];
  private annotationRows = 0;
  private uniqueVotes = 0;
  private feedbackReports = 0;
  private okReports = 0;
  private feedbackPeople = new Set<string>();
  private feedbackWriteQueue: Promise<void> = Promise.resolve();

  constructor(datasetDir: string, feedbackFile: string) {
    this.datasetDir = path.resolve(datasetDir);
    this.dataDir = path.join(this.datasetDir, "people_gator__data");
    this.feedbackFile = path.resolve(feedbackFile);
  }

  async build(): Promise<void> {
    await access(this.dataDir);
    const libraries = (await readdir(this.dataDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => collator.compare(a.name, b.name));
    const detectionFiles: string[] = [];

    for (const libraryEntry of libraries) {
      const library = libraryEntry.name;
      const libraryPath = path.join(this.dataDir, library);
      const entries = await readdir(libraryPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".people_gator.jsonl")) {
          detectionFiles.push(path.join(libraryPath, entry.name));
          continue;
        }
        if (!entry.isDirectory() || !entry.name.endsWith(".images")) continue;

        const document = entry.name.slice(0, -".images".length);
        const imageDirectory = path.join(libraryPath, entry.name);
        const images = (await readdir(imageDirectory, { withFileTypes: true }))
          .filter((image) => image.isFile() && IMAGE_EXTENSION.test(image.name));

        for (const image of images) {
          const id = scanId(library, document, image.name);
          this.scans.set(id, {
            id,
            library,
            document,
            page: image.name,
            imagePath: [library, entry.name, image.name].join("/"),
            hasImage: true,
            pageWidth: 0,
            pageHeight: 0,
            sourceUrl: buildSourceUrl(library, document, image.name),
            faceIds: new Set(),
          });
        }
      }
    }

    await mapLimit(detectionFiles, 32, async (file) => {
      await readJsonLines(file, (record) => this.addDetection(record));
    });

    const rootEntries = await readdir(this.datasetDir, { withFileTypes: true });
    const annotation = rootEntries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith("people_gator__corresponding_faces") &&
          entry.name.endsWith(".jsonl"),
      )
      .sort((a, b) => collator.compare(b.name, a.name))[0];

    if (!annotation) {
      throw new Error(
        "No people_gator__corresponding_faces*.jsonl file found in " + this.datasetDir,
      );
    }

    this.annotationRows = await readJsonLines(
      path.join(this.datasetDir, annotation.name),
      (record) => this.addAnnotation(record),
    );

    this.buildPeople();
    await this.loadFeedback();
    this.browsableScans = [...this.scans.values()]
      .filter((scan) => scan.hasImage)
      .sort(
        (a, b) =>
          collator.compare(a.library, b.library) ||
          collator.compare(a.document, b.document) ||
          collator.compare(a.page, b.page),
      );
    this.sortedPeople = [...this.people.values()].sort((a, b) =>
      collator.compare(a.name, b.name),
    );
  }

  private getOrCreateScan(library: string, document: string, page: string): MutableScan {
    const id = scanId(library, document, page);
    const current = this.scans.get(id);
    if (current) return current;

    const created: MutableScan = {
      id,
      library,
      document,
      page,
      imagePath: [library, document + ".images", page].join("/"),
      hasImage: false,
      pageWidth: 0,
      pageHeight: 0,
      sourceUrl: buildSourceUrl(library, document, page),
      faceIds: new Set(),
    };
    this.scans.set(id, created);
    return created;
  }

  private getOrCreateFace(record: JsonRecord): MutableFace | null {
    const library = text(record.library);
    const document = text(record.document);
    const page = text(record.page);
    const cropName = text(record.crop_name);
    if (!library || !document || !page || !cropName) return null;

    const id = faceId(library, document, page, cropName);
    const existing = this.faces.get(id);
    if (existing) {
      existing.pageWidth ||= number(record.page_width);
      existing.pageHeight ||= number(record.page_height);
      existing.pageLeft ||= number(record.page_left);
      existing.pageTop ||= number(record.page_top);
      existing.width ||= number(record.width);
      existing.height ||= number(record.height);
      return existing;
    }

    const created: MutableFace = {
      id,
      library,
      document,
      page,
      cropName,
      facePath:
        text(record.face) ||
        [library, document + ".peoplegator_aligned_crops", cropName].join("/"),
      pageWidth: number(record.page_width),
      pageHeight: number(record.page_height),
      pageLeft: number(record.page_left),
      pageTop: number(record.page_top),
      width: number(record.width),
      height: number(record.height),
      confidence:
        typeof record.confidence === "number" && Number.isFinite(record.confidence)
          ? record.confidence
          : null,
      annotators: new Set(),
      votesByName: new Map(),
      feedbackCount: 0,
      okCount: 0,
    };
    this.faces.set(id, created);
    return created;
  }

  private addDetection(record: JsonRecord): void {
    const face = this.getOrCreateFace(record);
    if (!face) return;
    const scan = this.getOrCreateScan(face.library, face.document, face.page);
    scan.faceIds.add(face.id);
    scan.pageWidth ||= face.pageWidth;
    scan.pageHeight ||= face.pageHeight;
  }

  private addAnnotation(record: JsonRecord): void {
    const face = this.getOrCreateFace(record);
    if (!face) return;

    const scan = this.getOrCreateScan(face.library, face.document, face.page);
    scan.faceIds.add(face.id);
    scan.pageWidth ||= face.pageWidth;
    scan.pageHeight ||= face.pageHeight;

    const annotator = text(record.annotator).trim();
    const name = text(record.person_name).trim();
    if (!annotator || !name) return;

    face.annotators.add(annotator);
    let voters = face.votesByName.get(name);
    if (!voters) {
      voters = new Set();
      face.votesByName.set(name, voters);
    }
    const before = voters.size;
    voters.add(annotator);
    if (voters.size > before) this.uniqueVotes += 1;
  }

  private buildPeople(): void {
    for (const face of this.faces.values()) {
      for (const name of face.votesByName.keys()) {
        let person = this.people.get(name);
        if (!person) {
          person = { name, faceIds: new Set() };
          this.people.set(name, person);
        }
        person.faceIds.add(face.id);
      }
    }
  }

  private publicFace(face: MutableFace): FaceOccurrence {
    const votes = summarizeVotes(face.annotators, face.votesByName);
    return {
      id: face.id,
      library: face.library,
      document: face.document,
      page: face.page,
      cropName: face.cropName,
      facePath: face.facePath,
      pageWidth: face.pageWidth,
      pageHeight: face.pageHeight,
      pageLeft: face.pageLeft,
      pageTop: face.pageTop,
      width: face.width,
      height: face.height,
      confidence: face.confidence,
      displayName: votes[0]?.name ?? null,
      votes,
      feedbackCount: face.feedbackCount,
      okCount: face.okCount,
    };
  }

  private scanSummary(scan: MutableScan): ScanSummary {
    const faces = [...scan.faceIds]
      .map((id) => this.faces.get(id))
      .filter((face): face is MutableFace => Boolean(face));
    const people = [
      ...new Set(faces.flatMap((face) => [...face.votesByName.keys()])),
    ].sort(collator.compare);
    return {
      id: scan.id,
      library: scan.library,
      document: scan.document,
      page: scan.page,
      imagePath: scan.imagePath,
      faceCount: faces.length,
      namedFaceCount: faces.filter((face) => face.votesByName.size > 0).length,
      feedbackCount: faces.reduce((total, face) => total + face.feedbackCount, 0),
      okCount: faces.reduce((total, face) => total + face.okCount, 0),
      people,
    };
  }

  private personSummary(person: MutablePerson): PersonSummary {
    const faces = [...person.faceIds]
      .map((id) => this.faces.get(id))
      .filter((face): face is MutableFace => Boolean(face));
    const percentages = faces.map((face) => {
      const vote = summarizeVotes(face.annotators, face.votesByName).find(
        (item) => item.name === person.name,
      );
      return vote?.percentage ?? 0;
    });
    return {
      name: person.name,
      faceCount: faces.length,
      averageAgreement:
        percentages.length === 0
          ? 0
          : Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
      previewFacePath: faces.find((face) => face.facePath)?.facePath ?? null,
      feedbackCount: faces.reduce((total, face) => total + face.feedbackCount, 0),
      okCount: faces.reduce((total, face) => total + face.okCount, 0),
    };
  }

  getStats(): ArchiveStats {
    return {
      scans: this.browsableScans.length,
      detections: this.faces.size,
      annotatedFaces: [...this.faces.values()].filter((face) => face.annotators.size > 0).length,
      people: this.people.size,
      libraries: new Set(this.browsableScans.map((scan) => scan.library)).size,
      annotationRows: this.annotationRows,
      uniqueVotes: this.uniqueVotes,
      feedbackReports: this.feedbackReports,
      okReports: this.okReports,
    };
  }

  private async loadFeedback(): Promise<void> {
    await mkdir(path.dirname(this.feedbackFile), { recursive: true });
    await appendFile(this.feedbackFile, "", { encoding: "utf8" });
    await readJsonLines(this.feedbackFile, (record) => {
      const id = faceId(
        text(record.library),
        text(record.document),
        text(record.page),
        text(record.crop_name),
      );
      const face = this.faces.get(id);
      const issueType = text(record.issue_type);
      if (issueType === "wrong_person") {
        const suggestedPersonName = text(record.suggested_person_name).trim();
        if (suggestedPersonName && suggestedPersonName.length <= 200) {
          this.feedbackPeople.add(suggestedPersonName);
        }
      }
      if (!face) return;
      if (issueType === "ok") {
        face.okCount += 1;
        this.okReports += 1;
      } else if (issueType === "wrong_person" || issueType === "invalid_detection") {
        face.feedbackCount += 1;
        this.feedbackReports += 1;
      }
    });
  }

  async recordFeedback(submission: FeedbackSubmission): Promise<FeedbackResult> {
    const library = submission.library.trim();
    const document = submission.document.trim();
    const page = submission.page.trim();
    const cropName = submission.cropName.trim();
    const face = this.faces.get(faceId(library, document, page, cropName));
    if (!face) throw new FeedbackValidationError("Detection not found", 404);

    if (
      submission.issueType !== "wrong_person" &&
      submission.issueType !== "invalid_detection" &&
      submission.issueType !== "ok"
    ) {
      throw new FeedbackValidationError("Choose a valid feedback type");
    }

    let suggestedPersonName = submission.suggestedPersonName?.trim() ?? "";
    if (submission.issueType === "wrong_person") {
      if (!suggestedPersonName) {
        throw new FeedbackValidationError("Enter or choose a person name");
      }
      if (suggestedPersonName.length > 200) {
        throw new FeedbackValidationError("Person name must be at most 200 characters");
      }
      const normalizedSuggestion = normalizeSearch(suggestedPersonName);
      if ([...face.votesByName.keys()].some((name) => normalizeSearch(name) === normalizedSuggestion)) {
        throw new FeedbackValidationError("Choose a different person name");
      }
      const knownName = [...this.people.keys(), ...this.feedbackPeople].find(
        (name) => normalizeSearch(name) === normalizedSuggestion,
      );
      suggestedPersonName = knownName ?? suggestedPersonName;
    }

    const note = submission.note?.trim() ?? "";
    if (note.length > 1000) {
      throw new FeedbackValidationError("Feedback note must be at most 1,000 characters");
    }

    const feedbackId = randomUUID();
    const record = {
      feedback_id: feedbackId,
      created_at: new Date().toISOString(),
      issue_type: submission.issueType,
      library,
      document,
      page,
      crop_name: cropName,
      face: face.facePath,
      current_names: [...face.votesByName.keys()].sort(collator.compare),
      ...(submission.issueType === "wrong_person"
        ? { suggested_person_name: suggestedPersonName }
        : {}),
      ...(note ? { note } : {}),
    };

    const write = this.feedbackWriteQueue
      .catch(() => undefined)
      .then(() => appendFile(this.feedbackFile, JSON.stringify(record) + "\n", "utf8"));
    this.feedbackWriteQueue = write;
    await write;
    if (submission.issueType === "ok") {
      face.okCount += 1;
      this.okReports += 1;
    } else {
      face.feedbackCount += 1;
      this.feedbackReports += 1;
      if (submission.issueType === "wrong_person") {
        this.feedbackPeople.add(suggestedPersonName);
      }
    }
    return {
      feedbackId,
      feedbackCount: face.feedbackCount,
      okCount: face.okCount,
    };
  }

  getFeedbackPeople(options: {
    q?: string;
    page?: number;
    pageSize?: number;
  }): Paginated<FeedbackPersonSuggestion> {
    const query = normalizeSearch(options.q ?? "");
    const peopleByNormalizedName = new Map<
      string,
      { name: string; source: "dataset" | "feedback" }
    >();
    for (const name of this.people.keys()) {
      peopleByNormalizedName.set(normalizeSearch(name), { name, source: "dataset" });
    }
    for (const name of this.feedbackPeople) {
      const normalizedName = normalizeSearch(name);
      if (!peopleByNormalizedName.has(normalizedName)) {
        peopleByNormalizedName.set(normalizedName, { name, source: "feedback" });
      }
    }
    const filtered = [...peopleByNormalizedName.values()]
      .filter((person) => !query || normalizeSearch(person.name).includes(query))
      .sort((a, b) => {
        const aName = normalizeSearch(a.name);
        const bName = normalizeSearch(b.name);
        const aRank = aName === query ? 0 : aName.startsWith(query) ? 1 : 2;
        const bRank = bName === query ? 0 : bName.startsWith(query) ? 1 : 2;
        return aRank - bRank || collator.compare(a.name, b.name);
      });
    const paging = pagination(options.page ?? 1, options.pageSize ?? 12, filtered.length);
    return {
      items: filtered.slice(paging.start, paging.start + paging.pageSize).map((item) => {
        const person = this.people.get(item.name);
        const summary = person ? this.personSummary(person) : null;
        return {
          name: item.name,
          faceCount: summary?.faceCount ?? 0,
          previewFacePath: summary?.previewFacePath ?? null,
          source: item.source,
        };
      }),
      page: paging.page,
      pageSize: paging.pageSize,
      total: filtered.length,
      totalPages: paging.totalPages,
    };
  }

  getLibraries(): LibrarySummary[] {
    const groups = new Map<string, { scans: number; faces: number }>();
    for (const scan of this.browsableScans) {
      const group = groups.get(scan.library) ?? { scans: 0, faces: 0 };
      group.scans += 1;
      group.faces += scan.faceIds.size;
      groups.set(scan.library, group);
    }
    return [...groups.entries()]
      .map(([name, counts]) => ({
        name,
        scanCount: counts.scans,
        faceCount: counts.faces,
      }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }

  getScans(options: {
    q?: string;
    library?: string;
    faces?: string;
    page?: number;
    pageSize?: number;
  }): Paginated<ScanSummary> {
    const query = normalizeSearch(options.q ?? "");
    const library = options.library ?? "";
    const filtered = this.browsableScans.filter((scan) => {
      if (library && scan.library !== library) return false;
      if (options.faces === "named" && ![...scan.faceIds].some((id) => {
        return (this.faces.get(id)?.votesByName.size ?? 0) > 0;
      })) return false;
      if (options.faces === "detected" && scan.faceIds.size === 0) return false;
      if (!query) return true;
      const names = [...scan.faceIds].flatMap((id) => [
        ...(this.faces.get(id)?.votesByName.keys() ?? []),
      ]);
      return normalizeSearch(
        [scan.library, scan.document, scan.page, ...names].join(" "),
      ).includes(query);
    });
    const paging = pagination(options.page ?? 1, options.pageSize ?? 24, filtered.length);
    return {
      items: filtered
        .slice(paging.start, paging.start + paging.pageSize)
        .map((scan) => this.scanSummary(scan)),
      page: paging.page,
      pageSize: paging.pageSize,
      total: filtered.length,
      totalPages: paging.totalPages,
    };
  }

  getScan(library: string, document: string, page: string): ScanDetail | null {
    const scan = this.scans.get(scanId(library, document, page));
    if (!scan || !scan.hasImage) return null;
    const summary = this.scanSummary(scan);
    return {
      ...summary,
      pageWidth: scan.pageWidth,
      pageHeight: scan.pageHeight,
      faces: [...scan.faceIds]
        .map((id) => this.faces.get(id))
        .filter((face): face is MutableFace => Boolean(face))
        .map((face) => this.publicFace(face))
        .sort((a, b) => a.pageTop - b.pageTop || a.pageLeft - b.pageLeft),
      sourceUrl: scan.sourceUrl,
    };
  }

  getPeople(options: {
    q?: string;
    page?: number;
    pageSize?: number;
  }): Paginated<PersonSummary> {
    const query = normalizeSearch(options.q ?? "");
    const filtered = query
      ? this.sortedPeople.filter((person) => normalizeSearch(person.name).includes(query))
      : this.sortedPeople;
    const paging = pagination(options.page ?? 1, options.pageSize ?? 30, filtered.length);
    return {
      items: filtered
        .slice(paging.start, paging.start + paging.pageSize)
        .map((person) => this.personSummary(person)),
      page: paging.page,
      pageSize: paging.pageSize,
      total: filtered.length,
      totalPages: paging.totalPages,
    };
  }

  getPerson(
    name: string,
    options: { page?: number; pageSize?: number },
  ): (PersonDetail & Omit<Paginated<never>, "items">) | null {
    const person = this.people.get(name);
    if (!person) return null;
    const faces = [...person.faceIds]
      .map((id) => this.faces.get(id))
      .filter((face): face is MutableFace => Boolean(face))
      .map((face) => this.publicFace(face))
      .sort((a, b) => {
        const aVote = a.votes.find((vote) => vote.name === name)?.percentage ?? 0;
        const bVote = b.votes.find((vote) => vote.name === name)?.percentage ?? 0;
        return (
          bVote - aVote ||
          collator.compare(a.library, b.library) ||
          collator.compare(a.page, b.page)
        );
      });
    const paging = pagination(options.page ?? 1, options.pageSize ?? 36, faces.length);
    return {
      ...this.personSummary(person),
      faces: faces.slice(paging.start, paging.start + paging.pageSize),
      page: paging.page,
      pageSize: paging.pageSize,
      total: faces.length,
      totalPages: paging.totalPages,
    };
  }
}
