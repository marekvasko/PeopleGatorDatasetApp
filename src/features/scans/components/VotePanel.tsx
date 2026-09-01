import { Link } from "react-router-dom";
import { queryString } from "../../../api";
import { ArchiveIcon } from "../../../components/ArchiveIcon";
import { AgreementBadge } from "../../../components/feedback-metrics";
import type { FaceOccurrence } from "../../../types";

export function VotePanel({ face }: { face: FaceOccurrence }) {
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

