import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSourceUrl, DatasetIndex, normalizeSearch, summarizeVotes } from "./dataset";

describe("source links", () => {
  it("builds Digitalniknihovna links from library, document, and page metadata", () => {
    expect(
      buildSourceUrl(
        "mzk",
        "c83ccd83-c8c2-4f86-af83-44e509025f50",
        "84b4ddac-0ce1-4b3a-bd7d-dee3c3869a50.jpg",
      ),
    ).toBe(
      "https://www.digitalniknihovna.cz/mzk/view/uuid:c83ccd83-c8c2-4f86-af83-44e509025f50?page=uuid:84b4ddac-0ce1-4b3a-bd7d-dee3c3869a50",
    );
  });
});

describe("annotation consensus", () => {
  it("deduplicates repeated rows from the same annotator", () => {
    const annotators = new Set(["a", "b", "c", "d"]);
    const votes = new Map([
      ["Ada Lovelace", new Set(["a", "b", "c"])],
      ["Grace Hopper", new Set(["d"])],
    ]);

    expect(summarizeVotes(annotators, votes)).toEqual([
      { name: "Ada Lovelace", count: 3, total: 4, percentage: 75 },
      { name: "Grace Hopper", count: 1, total: 4, percentage: 25 },
    ]);
  });

  it("allows one annotator to support historical name variants", () => {
    const annotators = new Set(["a", "b"]);
    const votes = new Map([
      ["Fr. Cyril Kampelík", new Set(["a", "b"])],
      ["František Cyrill Kampelík", new Set(["a", "b"])],
    ]);

    expect(summarizeVotes(annotators, votes).map((vote) => vote.percentage)).toEqual([
      100,
      100,
    ]);
  });

  it("searches without requiring Czech diacritics", () => {
    expect(normalizeSearch("František Šťastný")).toBe("frantisek stastny");
  });
});

describe("feedback persistence", () => {
  it("appends feedback and reloads counts without changing the assigned name", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "people-gator-test-"));
    try {
      const dataset = path.join(temporaryRoot, "dataset");
      const library = path.join(dataset, "people_gator__data", "demo");
      const images = path.join(library, "document.images");
      await mkdir(images, { recursive: true });
      await writeFile(path.join(images, "page.jpg"), "");
      const detections = [
        { library: "demo", document: "document", page: "page.jpg", crop_name: "face-0.jpg" },
        { library: "demo", document: "document", page: "page.jpg", crop_name: "face-1.jpg" },
      ];
      await writeFile(
        path.join(library, "document.people_gator.jsonl"),
        detections.map((record) => JSON.stringify(record)).join("\n") + "\n",
      );
      const annotations = [
        { ...detections[0], person_name: "Current Person", annotator: "a" },
        { ...detections[1], person_name: "Other Person", annotator: "a" },
      ];
      await writeFile(
        path.join(dataset, "people_gator__corresponding_faces__test.jsonl"),
        annotations.map((record) => JSON.stringify(record)).join("\n") + "\n",
      );

      const feedbackFile = path.join(temporaryRoot, "feedback", "feedback.jsonl");
      const archive = new DatasetIndex(dataset, feedbackFile);
      await archive.build();
      const result = await archive.recordFeedback({
        issueType: "wrong_person",
        library: "demo",
        document: "document",
        page: "page.jpg",
        cropName: "face-0.jpg",
        suggestedPersonName: "Other Person",
      });
      expect(result.feedbackCount).toBe(1);

      const reloaded = new DatasetIndex(dataset, feedbackFile);
      await reloaded.build();
      const face = reloaded.getScan("demo", "document", "page.jpg")?.faces[0];
      expect(face?.displayName).toBe("Current Person");
      expect(face?.feedbackCount).toBe(1);
      const record = JSON.parse((await readFile(feedbackFile, "utf8")).trim());
      expect(record).toMatchObject({
        issue_type: "wrong_person",
        library: "demo",
        document: "document",
        page: "page.jpg",
        crop_name: "face-0.jpg",
        current_names: ["Current Person"],
        suggested_person_name: "Other Person",
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
