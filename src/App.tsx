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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { faceImage, pageImage, queryString, scanHref, useApi } from "./api";
import type {
  ArchiveStats,
  FaceOccurrence,
  LibrarySummary,
  Paginated,
  PersonDetail,
  PersonSummary,
  ScanDetail,
  ScanSummary,
  VoteSummary,
} from "./types";

const formatNumber = new Intl.NumberFormat("en");

function ArchiveIcon({ type }: { type: "scans" | "people" | "search" | "arrow" }) {
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
      <ArchiveIcon type="search" />
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
  const scans = useApi<Paginated<ScanSummary>>(scansUrl);
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

function ScanDetailPage() {
  const route = useParams();
  const [params, setParams] = useSearchParams();
  const url =
    "/api/scans/" +
    encodeURIComponent(route.library ?? "") +
    "/" +
    encodeURIComponent(route.document ?? "") +
    "/" +
    encodeURIComponent(route.page ?? "");
  const scan = useApi<ScanDetail>(url);
  const selectedCrop = params.get("face");
  const selectedFace =
    scan.data?.faces.find((face) => face.cropName === selectedCrop) ?? null;

  function selectFace(face: FaceOccurrence) {
    const next = new URLSearchParams(params);
    next.set("face", face.cropName);
    setParams(next, { replace: true });
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
          <div className="bbox-legend" aria-label="Face annotation colors">
            <span>
              <i className="annotated" />
              Named · {scan.data.faces.filter((face) => face.votes.length > 0).length}
            </span>
            <span>
              <i className="unannotated" />
              No name · {scan.data.faces.filter((face) => face.votes.length === 0).length}
            </span>
          </div>
          <div className="page-canvas">
            <img
              src={pageImage(scan.data.imagePath, 1800)}
              alt={"Scanned archive page " + scan.data.page}
            />
            {scan.data.pageWidth > 0 &&
              scan.data.pageHeight > 0 &&
              scan.data.faces.map((face, index) => {
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
                    style={{ left: left + "%", top: top + "%", width: width + "%", height: height + "%" }}
                    onClick={() => selectFace(face)}
                    aria-label={
                      "Face " + (index + 1) + ": " + (face.displayName || "unidentified")
                    }
                    key={face.id}
                  >
                    <span className="marker-number">{index + 1}</span>
                    <span className="marker-label">{face.displayName || "No name annotation"}</span>
                  </button>
                );
              })}
          </div>
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
                  {selectedFace.votes[0] && <AgreementBadge vote={selectedFace.votes[0]} />}
                </div>
              </div>
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
