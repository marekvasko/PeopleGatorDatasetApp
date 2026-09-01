import { Link } from "react-router-dom";
import { pageImage, queryString, scanHref, useApi } from "../../api";
import { ArchiveIcon } from "../../components/ArchiveIcon";
import {
  ErrorState,
  ImageWithFallback,
  LoadingGrid,
  Pagination,
  SearchBox,
  StatsStrip,
} from "../../components/archive-ui";
import { IssueCount, OkCount } from "../../components/feedback-metrics";
import { useSyncedSearchQuery } from "../../hooks/useSyncedSearchQuery";
import type {
  ArchiveStats,
  LibrarySummary,
  Paginated,
  ScanSummary,
} from "../../types";

const formatNumber = new Intl.NumberFormat("en");

export function ScanBrowsePage() {
  const { params, setParams, query, setQuery } = useSyncedSearchQuery();
  const page = Number(params.get("page") ?? 1);
  const library = params.get("library") ?? "";
  const faces = params.get("faces") ?? "named";

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
          <h1>Explore PeopleGator Dataset.</h1>
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

