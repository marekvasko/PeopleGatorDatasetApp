import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { faceImage, queryString, useApi } from "../../api";
import { ArchiveIcon } from "../../components/ArchiveIcon";
import {
  ErrorState,
  ImageWithFallback,
  LoadingGrid,
  Pagination,
  SearchBox,
} from "../../components/archive-ui";
import { IssueCount, OkCount } from "../../components/feedback-metrics";
import { useSyncedSearchQuery } from "../../hooks/useSyncedSearchQuery";
import type { Paginated, PersonSummary } from "../../types";

const formatNumber = new Intl.NumberFormat("en");

export function PeopleBrowsePage() {
  const { params, setParams, query, setQuery } = useSyncedSearchQuery();
  const page = Number(params.get("page") ?? 1);

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
                      <i style={{ "--agreement": person.averageAgreement + "%" } as CSSProperties} />
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

