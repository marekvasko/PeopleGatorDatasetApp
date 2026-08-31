import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  FaceOccurrence,
  FeedbackIssueType,
  FeedbackResult,
  ScanDetail,
} from "./types";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  fetching: boolean;
  error: string | null;
}

interface ApiOptions {
  keepPreviousData?: boolean;
}

export interface FeedbackMutationVariables {
  face: FaceOccurrence;
  issueType: FeedbackIssueType;
  options?: { suggestedPersonName?: string; note?: string };
}

interface FeedbackMutationContext {
  queryKey: QueryKey;
  previousScan?: ScanDetail;
}

export const apiQueryKeys = {
  all: ["api"] as const,
  url: (url: string) => ["api", url] as const,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "error" in body
        ? body.error || "Request failed"
        : "Request failed",
    );
  }
  return body as T;
}

export function useApi<T>(url: string | null, options: ApiOptions = {}): FetchState<T> {
  const query = useQuery({
    queryKey: apiQueryKeys.url(url ?? "disabled"),
    queryFn: ({ signal }) => fetchJson<T>(url!, { signal }),
    enabled: Boolean(url),
    placeholderData: options.keepPreviousData ? keepPreviousData : undefined,
  });

  return {
    data: query.data ?? null,
    loading: Boolean(url) && query.isPending && query.data === undefined,
    fetching: query.isFetching,
    // A failed background refresh must not replace already-rendered cached content.
    error:
      query.data === undefined && query.error instanceof Error
        ? query.error.message
        : null,
  };
}

function scanDetailUrl(face: FaceOccurrence): string {
  return (
    "/api/scans/" +
    encodeURIComponent(face.library) +
    "/" +
    encodeURIComponent(face.document) +
    "/" +
    encodeURIComponent(face.page)
  );
}

function updateFaceCounts(
  scan: ScanDetail | undefined,
  target: FaceOccurrence,
  feedbackCount: number,
  okCount: number,
): ScanDetail | undefined {
  if (!scan) return scan;
  const current = scan.faces.find((face) => face.id === target.id);
  if (!current) return scan;

  return {
    ...scan,
    feedbackCount: Math.max(0, scan.feedbackCount + feedbackCount - current.feedbackCount),
    okCount: Math.max(0, scan.okCount + okCount - current.okCount),
    faces: scan.faces.map((face) =>
      face.id === target.id ? { ...face, feedbackCount, okCount } : face,
    ),
  };
}

async function recordFaceFeedback({
  face,
  issueType,
  options = {},
}: FeedbackMutationVariables): Promise<FeedbackResult> {
  return fetchJson<FeedbackResult>("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issueType,
      library: face.library,
      document: face.document,
      page: face.page,
      cropName: face.cropName,
      ...options,
    }),
  });
}

export function useRecordFeedbackMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    FeedbackResult,
    Error,
    FeedbackMutationVariables,
    FeedbackMutationContext
  >({
    mutationFn: recordFaceFeedback,
    onMutate: async (variables) => {
      const queryKey = apiQueryKeys.url(scanDetailUrl(variables.face));
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previousScan = queryClient.getQueryData<ScanDetail>(queryKey);
      const feedbackIncrement = variables.issueType === "ok" ? 0 : 1;
      const okIncrement = variables.issueType === "ok" ? 1 : 0;

      queryClient.setQueryData<ScanDetail>(queryKey, (scan) =>
        updateFaceCounts(
          scan,
          variables.face,
          variables.face.feedbackCount + feedbackIncrement,
          variables.face.okCount + okIncrement,
        ),
      );

      return { queryKey, previousScan };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousScan) {
        queryClient.setQueryData(context.queryKey, context.previousScan);
      }
    },
    onSuccess: (result, variables, context) => {
      queryClient.setQueryData<ScanDetail>(context.queryKey, (scan) =>
        updateFaceCounts(scan, variables.face, result.feedbackCount, result.okCount),
      );
    },
    onSettled: () => {
      // Keep rendered data in place while affected aggregates refresh in the background.
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.all });
    },
  });
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
