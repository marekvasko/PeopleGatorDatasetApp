import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "./useDebouncedValue";

export function useSyncedSearchQuery(delay = 250) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const debouncedQuery = useDebouncedValue(query, delay);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debouncedQuery) next.set("q", debouncedQuery);
    else next.delete("q");
    next.delete("page");

    if (next.toString() !== params.toString()) {
      setParams(next, { replace: true });
    }
  }, [debouncedQuery, params, setParams]);

  return { params, setParams, query, setQuery };
}

