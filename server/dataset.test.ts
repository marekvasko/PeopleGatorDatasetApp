import { describe, expect, it } from "vitest";
import { normalizeSearch, summarizeVotes } from "./dataset";

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
