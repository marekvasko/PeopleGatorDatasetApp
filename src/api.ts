import { useEffect, useState } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Request failed");
        }
        return response.json() as Promise<T>;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Something went wrong",
        });
      });

    return () => controller.abort();
  }, [url]);

  return state;
}

export function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? "?" + query : "";
}

export function pageImage(path: string, width = 720): string {
  return "/media/page" + queryString({ path, w: width });
}

export function faceImage(path: string): string {
  return "/media/face" + queryString({ path });
}

export function scanHref(
  library: string,
  document: string,
  page: string,
  face?: string,
): string {
  const base =
    "/scans/" +
    encodeURIComponent(library) +
    "/" +
    encodeURIComponent(document) +
    "/" +
    encodeURIComponent(page);
  return face ? base + queryString({ face }) : base;
}
