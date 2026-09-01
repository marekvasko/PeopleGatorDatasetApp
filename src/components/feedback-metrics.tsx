import type { VoteSummary } from "../types";
import { ArchiveIcon } from "./ArchiveIcon";

export function AgreementBadge({ vote, compact = false }: { vote?: VoteSummary; compact?: boolean }) {
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

export function IssueCount({ count, compact = false }: { count: number; compact?: boolean }) {
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

export function OkCount({ count, compact = false }: { count: number; compact?: boolean }) {
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

