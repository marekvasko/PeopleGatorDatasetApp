import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "./useDebouncedValue";

export function searchParamsForQuery(
  params: URLSearchParams,
  query: string,
): URLSearchParams | null {
  if (query === (params.get("q") ?? "")) return null;

  const next = new URLSearchParams(params);
  if (query) next.set("q", query);
  else next.delete("q");
  next.delete("page");
  return next;
}

export function useSyncedSearchQuery(delay = 250) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const debouncedQuery = useDebouncedValue(query, delay);

  useEffect(() => {
    const next = searchParamsForQuery(params, debouncedQuery);
    if (next) setParams(next, { replace: true });
  }, [debouncedQuery, params, setParams]);

  return { params, setParams, query, setQuery };
}
