import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  faceImage,
  pageImage,
  queryString,
  scanHref,
  useApi,
  useRecordFeedbackMutation,
} from "./api";
import type {
  ArchiveStats,
  FaceOccurrence,
  FeedbackIssueType,
  FeedbackPersonSuggestion,
  FeedbackResult,
  LibrarySummary,
  Paginated,
  PersonDetail,
  PersonSummary,
  ScanDetail,
  ScanSummary,
  VoteSummary,
} from "./types";

const formatNumber = new Intl.NumberFormat("en");

function normalizePersonName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs");
}

function ArchiveIcon({
  type,
}: {
  type: "scans" | "people" | "search" | "arrow" | "flag" | "thumb";
}) {
  const paths = {
    scans: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    ),
    people: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 21v-2.5a6.5 6.5 0 0 1 13 0V21" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    flag: (
      <>
        <path d="M6 21V4" />
        <path d="M6 5h10l-2 3 2 3H6" />
      </>
    ),
    thumb: (
      <>
        <path d="M8 10v11H4V10h4Z" />
        <path d="M8 19h8.2a2 2 0 0 0 1.9-1.4l1.6-5A2 2 0 0 0 17.8 10H14l.7-3.1A3.2 3.2 0 0 0 12 3l-1 4.1L8 11" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      {paths[type]}
    </svg>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/scans" aria-label="People Gator Archive home">
          <span className="brand-mark" aria-hidden="true">
            PG
          </span>
          <span>
            <strong>People Gator</strong>
            <small>Face archive</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavLink to="/scans">
            <ArchiveIcon type="scans" />
            Scans
          </NavLink>
          <NavLink to="/people">
            <ArchiveIcon type="people" />
            People
          </NavLink>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <span>People Gator Archive</span>
        <span>Names reflect independent human annotations.</span>
      </footer>
      <nav className="mobile-nav" aria-label="Main navigation">
        <NavLink to="/scans">
          <ArchiveIcon type="scans" />
          <span>Scans</span>
        </NavLink>
        <NavLink to="/people">
          <ArchiveIcon type="people" />
          <span>People</span>
        </NavLink>
      </nav>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="search-box">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search">
          ×
        </button>
      )}
      <ArchiveIcon type="search" />
    </label>
  );
}

function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function ImageWithFallback({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={"image-fallback " + (className ?? "")} role="img" aria-label={alt}>
        <ArchiveIcon type="people" />
      </span>
    );
  }
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function StatsStrip({ stats }: { stats: ArchiveStats | null }) {
  const values = [
    ["Scans", stats?.scans],
    ["Detected faces", stats?.detections],
    ["Named people", stats?.people],
    ["Libraries", stats?.libraries],
  ] as const;
  return (
    <div className="stats-strip" aria-label="Archive statistics">
      {values.map(([label, value]) => (
        <div key={label}>
          <strong>{value === undefined ? "—" : formatNumber.format(value)}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Pagination({
  current,
  total,
  onPage,
}: {
  current: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button disabled={current <= 1} onClick={() => onPage(current - 1)}>
        <span aria-hidden="true">←</span> Previous
      </button>
      <span>
        Page <strong>{current}</strong> of {total}
      </span>
      <button disabled={current >= total} onClick={() => onPage(current + 1)}>
        Next <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}

function LoadingGrid({ circles = false }: { circles?: boolean }) {
  return (
    <div className={circles ? "people-grid" : "scan-grid"} aria-label="Loading">
      {Array.from({ length: circles ? 10 : 8 }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <span className={circles ? "skeleton skeleton-circle" : "skeleton skeleton-page"} />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">!</span>
      <h2>We could not open this part of the archive</h2>
      <p>{message}</p>
    </div>
  );
}

function ScanBrowse() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounced(query);
  const page = Number(params.get("page") ?? 1);
  const library = params.get("library") ?? "";
  const faces = params.get("faces") ?? "named";

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debouncedQuery) next.set("q", debouncedQuery);
    else next.delete("q");
    next.delete("page");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [debouncedQuery]);

  const scansUrl =
    "/api/scans" +
    queryString({ q: params.get("q") ?? "", library, faces, page, pageSize: 24 });
  const scans = useApi<Paginated<ScanSummary>>(scansUrl, { keepPreviousData: true });
  const stats = useApi<ArchiveStats>("/api/stats");
  const libraries = useApi<LibrarySummary[]>("/api/libraries");

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }
  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
    window.requestAnimationFrame(() => {
      document.querySelector(".content-section")?.scrollIntoView({
        behavior: "smooth",
      });
    });
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Digitised history, face by face</span>
          <h1>Explore the pages.<br />Meet the people.</h1>
          <p>
            Browse historical scans and discover the people identified in them by
            independent annotators.
          </p>
        </div>
        <StatsStrip stats={stats.data} />
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="section-number">01</span>
            <h2>Browse scans</h2>
          </div>
          <p>
            {scans.data
              ? formatNumber.format(scans.data.total) + " matching pages"
              : "Finding pages…"}
          </p>
        </div>

        <div className="filter-bar">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search scans"
            placeholder="Search a person, page or document…"
          />
          <label className="select-control">
            <span>Library</span>
            <select value={library} onChange={(event) => updateParam("library", event.target.value)}>
              <option value="">All libraries</option>
              {libraries.data?.map((item) => (
                <option value={item.name} key={item.name}>
                  {item.name.toUpperCase()} · {item.scanCount}
                </option>
              ))}
            </select>
          </label>
          <label className="select-control">
            <span>Show</span>
            <select value={faces} onChange={(event) => updateParam("faces", event.target.value)}>
              <option value="named">Named faces</option>
              <option value="detected">Any detected face</option>
              <option value="">All scans</option>
            </select>
          </label>
        </div>

        {scans.loading && <LoadingGrid />}
        {scans.error && <ErrorState message={scans.error} />}
        {scans.data && scans.data.items.length === 0 && (
          <div className="empty-state">
            <span className="empty-symbol">0</span>
            <h2>No scans match these filters</h2>
            <p>Try a different spelling, library, or face filter.</p>
          </div>
        )}
        {scans.data && scans.data.items.length > 0 && (
          <>
            <div className="scan-grid">
              {scans.data.items.map((scan, index) => (
                <Link
                  className="scan-card"
                  to={scanHref(scan.library, scan.document, scan.page)}
                  key={scan.id}
                >
                  <div className="scan-image-wrap">
                    <ImageWithFallback
                      src={pageImage(scan.imagePath, 360)}
                      alt={"Scanned page " + scan.page}
                    />
                    <span className="page-index">
                      {String((scans.data!.page - 1) * scans.data!.pageSize + index + 1).padStart(3, "0")}
                    </span>
                    {scan.faceCount > 0 && (
                      <span className="face-count">
                        <ArchiveIcon type="people" />
                        {scan.namedFaceCount}/{scan.faceCount}
                      </span>
                    )}
                    {(scan.feedbackCount > 0 || scan.okCount > 0) && (
                      <span className="scan-card-feedback">
                        <IssueCount count={scan.feedbackCount} compact />
                        <OkCount count={scan.okCount} compact />
                      </span>
                    )}
                  </div>
                  <div className="scan-card-body">
                    <div className="scan-meta-line">
                      <span className="library-tag">{scan.library}</span>
                      <span aria-hidden="true">·</span>
                      <span className="document-id" title={scan.document}>
                        {scan.document.slice(0, 8)}
                      </span>
                    </div>
                    <div className="scan-people-line">
                      <span className="scan-primary-person" title={scan.people[0]}>
                        {scan.people[0] || "No identified person"}
                      </span>
                      {scan.people.length > 1 && (
                        <span className="scan-more-people">
                          +{scan.people.length - 1} more
                        </span>
                      )}
                      <ArchiveIcon type="arrow" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination
              current={scans.data.page}
              total={scans.data.totalPages}
              onPage={goToPage}
            />
          </>
        )}
      </section>
    </>
  );
}

function AgreementBadge({ vote, compact = false }: { vote?: VoteSummary; compact?: boolean }) {
  if (!vote) return <span className="agreement unknown">Unreviewed</span>;
  return (
    <span
      className={"agreement " + (vote.percentage >= 75 ? "strong" : vote.percentage >= 50 ? "mixed" : "low")}
      title={vote.count + " of " + vote.total + " annotators"}
    >
      <strong>{vote.percentage}%</strong>
      {!compact && <span> agree · {vote.count}/{vote.total}</span>}
    </span>
  );
}

function IssueCount({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={"reported-issues " + (compact ? "compact" : "")}
      title={count + (count === 1 ? " issue reported" : " issues reported")}
    >
      <ArchiveIcon type="flag" />
      <strong>{count}</strong>
      {!compact && <span>{count === 1 ? "report" : "reports"}</span>}
    </span>
  );
}

function OkCount({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={"reported-ok " + (compact ? "compact" : "")}
      title={count + (count === 1 ? " person marked this OK" : " people marked this OK")}
    >
      <ArchiveIcon type="thumb" />
      <strong>{count}</strong>
      {!compact && <span>OK</span>}
    </span>
  );
}

function PeopleBrowse() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const debouncedQuery = useDebounced(query);
  const page = Number(params.get("page") ?? 1);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debouncedQuery) next.set("q", debouncedQuery);
    else next.delete("q");
    next.delete("page");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [debouncedQuery]);

  const people = useApi<Paginated<PersonSummary>>(
    "/api/people" + queryString({ q: params.get("q") ?? "", page, pageSize: 30 }),
    { keepPreviousData: true },
  );

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  return (
    <>
      <section className="people-hero">
        <span className="eyebrow">Index of identified people</span>
        <h1>Who will you find?</h1>
        <p>Search names without worrying about accents or diacritics.</p>
        <SearchBox
          value={query}
          onChange={setQuery}
          label="Search people"
          placeholder="Try “Masaryk” or “Gottwald”…"
        />
      </section>

      <section className="content-section people-section">
        <div className="section-heading">
          <div>
            <span className="section-number">02</span>
            <h2>People</h2>
          </div>
          <p>
            {people.data
              ? formatNumber.format(people.data.total) + " matching names"
              : "Looking through the index…"}
          </p>
        </div>

        {people.loading && <LoadingGrid circles />}
        {people.error && <ErrorState message={people.error} />}
        {people.data && people.data.items.length === 0 && (
          <div className="empty-state">
            <span className="empty-symbol">?</span>
            <h2>No matching name</h2>
            <p>Try a shorter spelling or omit diacritics.</p>
          </div>
        )}
        {people.data && people.data.items.length > 0 && (
          <>
            <div className="people-grid">
              {people.data.items.map((person) => (
                <Link
                  className="person-card"
                  to={"/people/view" + queryString({ name: person.name })}
                  key={person.name}
                >
                  <div className="portrait-frame">
                    {person.previewFacePath ? (
                      <ImageWithFallback
                        src={faceImage(person.previewFacePath)}
                        alt={"Detected face annotated as " + person.name}
                      />
                    ) : (
                      <span className="image-fallback">
                        <ArchiveIcon type="people" />
                      </span>
                    )}
                  </div>
                  <div>
                    <h3>{person.name}</h3>
                    <p>
                      {person.faceCount} {person.faceCount === 1 ? "appearance" : "appearances"}
                    </p>
                    <span className="average-agreement">
                      <i style={{ "--agreement": person.averageAgreement + "%" } as React.CSSProperties} />
                      {person.averageAgreement}% avg. agreement
                    </span>
                    <IssueCount count={person.feedbackCount} />
                    <OkCount count={person.okCount} />
                  </div>
                  <ArchiveIcon type="arrow" />
                </Link>
              ))}
            </div>
            <Pagination current={people.data.page} total={people.data.totalPages} onPage={goToPage} />
          </>
        )}
      </section>
    </>
  );
}

function VotePanel({ face }: { face: FaceOccurrence }) {
  return (
    <div className="vote-panel">
      <div className="vote-heading">
        <span>Annotator consensus</span>
        <small>
          {face.votes[0]?.total
            ? face.votes[0].total + " independent " +
              (face.votes[0].total === 1 ? "review" : "reviews")
            : "No name annotations"}
        </small>
      </div>
      {face.votes.length === 0 ? (
        <p className="muted">A face was detected here, but no person name was assigned.</p>
      ) : (
        <div className="vote-list">
          {face.votes.map((vote) => (
            <Link
              className="vote-row"
              to={"/people/view" + queryString({ name: vote.name })}
              key={vote.name}
            >
              <div>
                <strong>{vote.name}</strong>
                <AgreementBadge vote={vote} />
              </div>
              <span className="vote-bar" aria-hidden="true">
                <i style={{ width: vote.percentage + "%" }} />
              </span>
              <ArchiveIcon type="arrow" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackPanel({
  face,
  onClose,
  onSubmitted,
}: {
  face: FaceOccurrence;
  onClose: () => void;
  onSubmitted: (result: FeedbackResult) => void;
}) {
  const [issueType, setIssueType] = useState<FeedbackIssueType>("wrong_person");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [selectedNameSource, setSelectedNameSource] = useState<
    "dataset" | "feedback" | "new" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const feedbackMutation = useRecordFeedbackMutation();
  const submitting = feedbackMutation.isPending;
  const debouncedQuery = useDebounced(query.trim(), 220);
  const currentNames = useMemo(
    () => new Set(face.votes.map((vote) => normalizePersonName(vote.name))),
    [face],
  );
  const people = useApi<Paginated<FeedbackPersonSuggestion>>(
    issueType === "wrong_person" && debouncedQuery.length >= 2
      ? "/api/feedback/people" + queryString({ q: debouncedQuery, pageSize: 10 })
      : null,
  );
  const suggestions =
    people.data?.items.filter((person) => !currentNames.has(normalizePersonName(person.name))) ?? [];
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizePersonName(trimmedQuery);
  const queryMatchesCurrentName = currentNames.has(normalizedQuery);
  const hasExactSuggestion = suggestions.some(
    (person) => normalizePersonName(person.name) === normalizedQuery,
  );
  const canAddNewName =
    trimmedQuery.length >= 2 &&
    trimmedQuery.length <= 200 &&
    debouncedQuery === trimmedQuery &&
    !people.loading &&
    !people.error &&
    !queryMatchesCurrentName &&
    !hasExactSuggestion;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (issueType === "wrong_person" && !selectedName) {
      setError("Search for and select the person who should be shown here.");
      return;
    }
    feedbackMutation.mutate(
      {
        face,
        issueType,
        options: {
          suggestedPersonName: issueType === "wrong_person" ? selectedName : undefined,
        },
      },
      {
        onSuccess: onSubmitted,
        onError: (caught) => setError(caught.message || "Could not save feedback"),
      },
    );
  }

  return (
    <section className="feedback-panel" aria-labelledby="feedback-title">
      <header className="feedback-panel-header">
        <div>
          <span className="eyebrow">Help improve this archive</span>
          <h3 id="feedback-title">Report an issue</h3>
        </div>
        <button type="button" onClick={onClose} disabled={submitting} aria-label="Close feedback form">
          ×
        </button>
      </header>
        <form onSubmit={submit}>
          <fieldset className="feedback-type-options">
            <legend>What is wrong?</legend>
            <label className={issueType === "wrong_person" ? "selected" : ""}>
              <input
                type="radio"
                name="issueType"
                checked={issueType === "wrong_person"}
                onChange={() => setIssueType("wrong_person")}
              />
              <span>
                <strong>Wrong person</strong>
                <small>Suggest another person from the archive.</small>
              </span>
            </label>
            <label className={issueType === "invalid_detection" ? "selected" : ""}>
              <input
                type="radio"
                name="issueType"
                checked={issueType === "invalid_detection"}
                onChange={() => setIssueType("invalid_detection")}
              />
              <span>
                <strong>Detection is wrong</strong>
                <small>This box is not a valid face detection.</small>
              </span>
            </label>
          </fieldset>

          {issueType === "wrong_person" && (
            <div className="feedback-person-picker">
              <span className="feedback-person-label">Who should this be?</span>
              <SearchBox
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  if (value !== selectedName) {
                    setSelectedName("");
                    setSelectedNameSource(null);
                  }
                }}
                label="Search for a different person"
                placeholder="Start typing a name…"
              />
              {selectedName ? (
                <div className="selected-suggestion">
                  <span>
                    {selectedNameSource === "new"
                      ? "New name"
                      : selectedNameSource === "feedback"
                        ? "From feedback"
                        : "Selected"}
                  </span>
                  <strong>{selectedName}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedName("");
                      setSelectedNameSource(null);
                      setQuery("");
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : query.trim() ? (
                <div className="person-suggestions" role="listbox" aria-label="Matching people">
                  {debouncedQuery.length < 2 && <p>Type at least two characters.</p>}
                  {people.loading && <p>Searching people…</p>}
                  {people.error && <p>{people.error}</p>}
                  {!people.loading &&
                    debouncedQuery.length >= 2 &&
                    suggestions.length === 0 && (
                      <p>
                        {queryMatchesCurrentName
                          ? "This name is already assigned to the detection."
                          : "No existing matching person found."}
                      </p>
                    )}
                  {trimmedQuery.length > 200 && (
                    <p>Person names can contain at most 200 characters.</p>
                  )}
                  {suggestions.map((person) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      key={person.name}
                      onClick={() => {
                        setSelectedName(person.name);
                        setSelectedNameSource(person.source);
                        setQuery(person.name);
                      }}
                    >
                      {person.previewFacePath ? (
                        <ImageWithFallback src={faceImage(person.previewFacePath)} alt="" />
                      ) : (
                        <span className="image-fallback"><ArchiveIcon type="people" /></span>
                      )}
                      <span>
                        <strong>{person.name}</strong>
                        <small>
                          {person.source === "feedback"
                            ? "Previously suggested in feedback"
                            : person.faceCount +
                              " " +
                              (person.faceCount === 1 ? "appearance" : "appearances")}
                        </small>
                      </span>
                    </button>
                  ))}
                  {canAddNewName && (
                    <button
                      type="button"
                      className="add-person-suggestion"
                      onClick={() => {
                        setSelectedName(trimmedQuery);
                        setSelectedNameSource("new");
                      }}
                    >
                      <span className="new-person-mark">+</span>
                      <span>
                        <strong>Add “{trimmedQuery}”</strong>
                        <small>Create a new feedback person name</small>
                      </span>
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {error && <p className="feedback-error" role="alert">{error}</p>}
          <div className="feedback-actions">
            <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
            <button
              type="submit"
              disabled={submitting || (issueType === "wrong_person" && !selectedName)}
            >
              {submitting ? "Saving…" : "Submit feedback"}
            </button>
          </div>
        </form>
    </section>
  );
}

function ScanDetailPage() {
  const route = useParams();
  const [params, setParams] = useSearchParams();
  const [pageScale, setPageScale] = useState(1);
  const [feedbackFace, setFeedbackFace] = useState<FaceOccurrence | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [feedbackNoticeIsError, setFeedbackNoticeIsError] = useState(false);
  const okMutation = useRecordFeedbackMutation();
  const didPanPage = useRef(false);
  const suppressCanvasClickUntil = useRef(0);
  const url =
    "/api/scans/" +
    encodeURIComponent(route.library ?? "") +
    "/" +
    encodeURIComponent(route.document ?? "") +
    "/" +
    encodeURIComponent(route.page ?? "");
  const scan = useApi<ScanDetail>(url);
  const selectedCrop = params.get("face");
  const selectedFace = scan.data?.faces.find((face) => face.cropName === selectedCrop) ?? null;

  const clearSelectedFace = useCallback(() => {
    if (!params.has("face")) return;
    const next = new URLSearchParams(params);
    next.delete("face");
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => setPageScale(1), [scan.data?.id]);

  useEffect(() => {
    if (!selectedCrop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clearSelectedFace();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelectedFace, selectedCrop]);

  function selectFace(face: FaceOccurrence) {
    const next = new URLSearchParams(params);
    next.set("face", face.cropName);
    setParams(next, { replace: true });
    setFeedbackFace(null);
    setFeedbackNotice("");
    setFeedbackNoticeIsError(false);
  }

  function markSelectedFaceOk() {
    if (!selectedFace || okMutation.isPending) return;
    setFeedbackNotice("");
    okMutation.mutate(
      { face: selectedFace, issueType: "ok" },
      {
        onSuccess: () => {
          setFeedbackNotice("Thank you — this detection was marked as OK.");
          setFeedbackNoticeIsError(false);
        },
        onError: (caught) => {
          setFeedbackNotice(caught.message || "Could not record the OK response.");
          setFeedbackNoticeIsError(true);
        },
      },
    );
  }

  if (scan.loading) {
    return (
      <section className="detail-loading">
        <span className="skeleton skeleton-page-large" />
        <span className="skeleton skeleton-panel" />
      </section>
    );
  }
  if (scan.error || !scan.data) return <ErrorState message={scan.error || "Scan not found"} />;

  return (
    <section className="scan-detail">
      <div className="detail-topbar">
        <Link to="/scans" className="back-link">
          ← All scans
        </Link>
        <div>
          <span className="library-tag">{scan.data.library}</span>
          <span>{scan.data.faceCount} detected {scan.data.faceCount === 1 ? "face" : "faces"}</span>
        </div>
      </div>

      <div className="scan-workspace">
        <div className="page-stage">
          <TransformWrapper
            key={scan.data.id}
            initialScale={1}
            minScale={1}
            maxScale={6}
            centerOnInit
            centerZoomedOut
            limitToBounds
            wheel={{ step: 0.16 }}
            pinch={{ step: 5, allowPanning: true }}
            panning={{ velocityDisabled: false, excluded: ["face-marker"] }}
            doubleClick={{ mode: "toggle", step: 0.9, excluded: ["face-marker"] }}
            onTransform={(_ref, state) => setPageScale(state.scale)}
            onPanning={(_ref, event) => {
              if (event.type !== "mousemove" && event.type !== "touchmove") return;
              didPanPage.current = true;
              suppressCanvasClickUntil.current = Date.now() + 300;
            }}
            onPanningStop={() => {
              if (!didPanPage.current) return;
              didPanPage.current = false;
              suppressCanvasClickUntil.current = Date.now() + 300;
            }}
            onPinch={() => {
              suppressCanvasClickUntil.current = Date.now() + 300;
            }}
            onPinchStop={() => {
              suppressCanvasClickUntil.current = Date.now() + 300;
            }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="page-toolbar">
                  <div className="bbox-legend" aria-label="Face annotation colors">
                    <span>
                      <i className="annotated" />
                      Named · {scan.data!.faces.filter((face) => face.votes.length > 0).length}
                    </span>
                    <span>
                      <i className="unannotated" />
                      No name · {scan.data!.faces.filter((face) => face.votes.length === 0).length}
                    </span>
                  </div>
                  <div className="zoom-controls" aria-label="Document zoom controls">
                    <button type="button" onClick={() => zoomOut(0.4)} aria-label="Zoom out">
                      −
                    </button>
                    <output aria-live="polite">{Math.round(pageScale * 100)}%</output>
                    <button type="button" onClick={() => zoomIn(0.4)} aria-label="Zoom in">
                      +
                    </button>
                    <button type="button" className="zoom-reset" onClick={() => resetTransform()}>
                      Reset
                    </button>
                  </div>
                </div>
                <TransformComponent
                  wrapperClass="page-zoom-viewport"
                  contentClass="page-zoom-content"
                  wrapperProps={{
                    role: "region",
                    "aria-label": "Zoomable scanned document page",
                  }}
                >
                  <div
                    className="page-canvas"
                    onClick={() => {
                      if (Date.now() < suppressCanvasClickUntil.current) return;
                      clearSelectedFace();
                    }}
                    style={
                      {
                        "--annotation-inverse-scale": 1 / pageScale,
                      } as React.CSSProperties
                    }
                  >
                    <img
                      src={pageImage(scan.data!.imagePath, 1800)}
                      alt={"Scanned archive page " + scan.data!.page}
                      draggable={false}
                    />
                    {scan.data!.pageWidth > 0 &&
                      scan.data!.pageHeight > 0 &&
                      scan.data!.faces.map((face, index) => {
                        const left = (face.pageLeft / scan.data!.pageWidth) * 100;
                        const top = (face.pageTop / scan.data!.pageHeight) * 100;
                        const width = (face.width / scan.data!.pageWidth) * 100;
                        const height = (face.height / scan.data!.pageHeight) * 100;
                        return (
                          <button
                            type="button"
                            className={
                              "face-marker " +
                              (face.votes.length > 0 ? "annotated " : "unannotated ") +
                              (selectedFace?.id === face.id ? "selected" : "")
                            }
                            style={{
                              left: left + "%",
                              top: top + "%",
                              width: width + "%",
                              height: height + "%",
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              selectFace(face);
                            }}
                            aria-label={
                              "Face " +
                              (index + 1) +
                              ": " +
                              (face.displayName || "unidentified")
                            }
                            key={face.id}
                          >
                            <span className="marker-number">{index + 1}</span>
                            {(face.feedbackCount > 0 || face.okCount > 0) && (
                              <span className="marker-feedback">
                                {face.feedbackCount > 0 && (
                                  <span className="marker-issues">
                                    <ArchiveIcon type="flag" />
                                    {face.feedbackCount}
                                  </span>
                                )}
                                {face.okCount > 0 && (
                                  <span className="marker-ok">
                                    <ArchiveIcon type="thumb" />
                                    {face.okCount}
                                  </span>
                                )}
                              </span>
                            )}
                            <span className="marker-label">
                              {face.displayName || "No name annotation"}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </TransformComponent>
                <p className="zoom-hint">
                  Pinch or scroll to zoom · drag to move · double-tap to toggle zoom
                </p>
              </>
            )}
          </TransformWrapper>
          <div className="scan-caption">
            <span>
              Page <strong>{scan.data.page.replace(/\.[^.]+$/, "")}</strong>
            </span>
            {scan.data.sourceUrl && (
              <a href={scan.data.sourceUrl} target="_blank" rel="noreferrer">
                View original source ↗
              </a>
            )}
          </div>
        </div>

        <aside className="annotation-drawer">
          {selectedFace ? (
            <>
              <div className="selected-face-header">
                <ImageWithFallback
                  src={faceImage(selectedFace.facePath)}
                  alt={selectedFace.displayName || "Selected detected face"}
                />
                <div>
                  <span className="eyebrow">Selected face</span>
                  <h2>{selectedFace.displayName || "Unidentified"}</h2>
                  <div className="selected-face-status">
                    {selectedFace.votes[0] && <AgreementBadge vote={selectedFace.votes[0]} />}
                    <IssueCount count={selectedFace.feedbackCount} />
                    <OkCount count={selectedFace.okCount} />
                  </div>
                  <div className="feedback-triggers">
                    <button
                      type="button"
                      className="feedback-trigger"
                      aria-expanded={feedbackFace?.id === selectedFace.id}
                      onClick={() =>
                        setFeedbackFace((current) =>
                          current?.id === selectedFace.id ? null : selectedFace,
                        )
                      }
                    >
                      <ArchiveIcon type="flag" />
                      Report issue
                    </button>
                    <button
                      type="button"
                      className="feedback-ok-trigger"
                      onClick={markSelectedFaceOk}
                      disabled={okMutation.isPending}
                    >
                      <ArchiveIcon type="thumb" />
                      {okMutation.isPending ? "Saving…" : "Looks OK"}
                    </button>
                  </div>
                </div>
              </div>
              {feedbackFace?.id === selectedFace.id && (
                <FeedbackPanel
                  face={selectedFace}
                  onClose={() => setFeedbackFace(null)}
                  onSubmitted={() => {
                    setFeedbackFace(null);
                    setFeedbackNotice("Thank you — your feedback was recorded.");
                    setFeedbackNoticeIsError(false);
                  }}
                />
              )}
              {feedbackNotice && (
                <p
                  className={"feedback-success " + (feedbackNoticeIsError ? "error" : "")}
                  role={feedbackNoticeIsError ? "alert" : "status"}
                >
                  {feedbackNotice}
                </p>
              )}
              <VotePanel face={selectedFace} />
            </>
          ) : (
            <div className="select-prompt">
              <span className="prompt-mark">+</span>
              <h2>Select a face</h2>
              <p>Tap any outlined face on the page to see its names and annotator agreement.</p>
            </div>
          )}

          <div className="face-roster">
            <div className="vote-heading">
              <span>Faces on this page</span>
              <small>{scan.data.faces.length} total</small>
            </div>
            {scan.data.faces.length === 0 ? (
              <p className="muted">No face detections were recorded for this page.</p>
            ) : (
              <div className="face-roster-list">
                {scan.data.faces.map((face, index) => (
                  <button
                    type="button"
                    onClick={() => selectFace(face)}
                    className={selectedFace?.id === face.id ? "active" : ""}
                    key={face.id}
                  >
                    <ImageWithFallback
                      src={faceImage(face.facePath)}
                      alt={face.displayName || "Unidentified face"}
                    />
                    <span>
                      <strong>{face.displayName || "Unidentified"}</strong>
                      <small>Face {index + 1}</small>
                      <span className="face-roster-feedback">
                        <IssueCount count={face.feedbackCount} compact />
                        <OkCount count={face.okCount} compact />
                      </span>
                    </span>
                    <AgreementBadge vote={face.votes[0]} compact />
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

interface PersonResponse extends PersonDetail {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function PersonDetailPage() {
  const [params, setParams] = useSearchParams();
  const name = params.get("name") ?? "";
  const page = Number(params.get("page") ?? 1);
  const person = useApi<PersonResponse>(
    "/api/person" + queryString({ name, page, pageSize: 36 }),
    { keepPreviousData: true },
  );

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  if (person.loading) {
    return (
      <section className="person-detail">
        <span className="skeleton skeleton-line" />
        <LoadingGrid circles />
      </section>
    );
  }
  if (person.error || !person.data) {
    return <ErrorState message={person.error || "Person not found"} />;
  }

  return (
    <section className="person-detail">
      <Link to="/people" className="back-link">
        ← All people
      </Link>
      <header className="person-title">
        <span className="eyebrow">Annotated person</span>
        <h1>{person.data.name}</h1>
        <div>
          <span>
            <strong>{person.data.total}</strong>{" "}
            {person.data.total === 1 ? "appearance" : "appearances"}
          </span>
          <span>
            <strong>{person.data.averageAgreement}%</strong> average agreement
          </span>
        </div>
      </header>

      <div className="appearance-grid">
        {person.data.faces.map((face) => {
          const vote = face.votes.find((item) => item.name === person.data!.name);
          return (
            <Link
              to={scanHref(face.library, face.document, face.page, face.cropName)}
              className="appearance-card"
              key={face.id}
            >
              <div className="appearance-image">
                <ImageWithFallback
                  src={faceImage(face.facePath)}
                  alt={person.data!.name + " in scan " + face.page}
                />
                <AgreementBadge vote={vote} compact />
                <span className="appearance-feedback">
                  <IssueCount count={face.feedbackCount} compact />
                  <OkCount count={face.okCount} compact />
                </span>
              </div>
              <div>
                <span className="library-tag">{face.library}</span>
                <h2>{face.page.replace(/\.[^.]+$/, "")}</h2>
                <p>
                  {vote?.count ?? 0} of {vote?.total ?? 0} annotators chose this name
                </p>
                <span className="card-link">
                  See in scan <ArchiveIcon type="arrow" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      <Pagination
        current={person.data.page}
        total={person.data.totalPages}
        onPage={goToPage}
      />
    </section>
  );
}

function NotFound() {
  const location = useLocation();
  return (
    <div className="empty-state full-page">
      <span className="empty-symbol">404</span>
      <h1>This archive page is missing</h1>
      <p>No view exists at {location.pathname}.</p>
      <Link className="primary-button" to="/scans">Browse scans</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/scans" replace />} />
          <Route path="/scans" element={<ScanBrowse />} />
          <Route path="/scans/:library/:document/:page" element={<ScanDetailPage />} />
          <Route path="/people" element={<PeopleBrowse />} />
          <Route path="/people/view" element={<PersonDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
