import { describe, expect, it } from "vitest";
import { searchParamsForQuery } from "./useSyncedSearchQuery";

describe("search query URL synchronization", () => {
  it("preserves the selected page when the search query has not changed", () => {
    const params = new URLSearchParams({ q: "Masaryk", page: "2" });

    expect(searchParamsForQuery(params, "Masaryk")).toBeNull();
    expect(params.get("page")).toBe("2");
  });

  it("resets pagination when the search query changes", () => {
    const params = new URLSearchParams({ q: "Masaryk", page: "2" });
    const next = searchParamsForQuery(params, "Gottwald");

    expect(next?.get("q")).toBe("Gottwald");
    expect(next?.has("page")).toBe(false);
  });
});
