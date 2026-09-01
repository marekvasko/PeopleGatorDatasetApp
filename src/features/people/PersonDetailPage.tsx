import { Link, useSearchParams } from "react-router-dom";
import { faceImage, queryString, scanHref, useApi } from "../../api";
import { ArchiveIcon } from "../../components/ArchiveIcon";
import {
  ErrorState,
  ImageWithFallback,
  LoadingGrid,
  Pagination,
} from "../../components/archive-ui";
import {
  AgreementBadge,
  IssueCount,
  OkCount,
} from "../../components/feedback-metrics";
import type { PersonDetail } from "../../types";

interface PersonResponse extends PersonDetail {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function PersonDetailPage() {
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

