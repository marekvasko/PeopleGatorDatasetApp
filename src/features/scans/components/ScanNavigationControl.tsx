import { Link } from "react-router-dom";
import { scanHref } from "../../../api";
import { ArchiveIcon } from "../../../components/ArchiveIcon";
import type { ScanNavigationTarget } from "../../../types";

export function ScanNavigationControl({
  target,
  kind,
  label,
}: {
  target: ScanNavigationTarget | null;
  kind: "previous" | "random" | "next";
  label: string;
}) {
  const content = (
    <>
      <ArchiveIcon type={kind === "random" ? "random" : "arrow"} />
      <span>{label}</span>
    </>
  );

  if (!target) {
    return (
      <span className={"scan-navigation-control " + kind + " disabled"} aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <Link
      className={"scan-navigation-control " + kind}
      to={scanHref(target.library, target.document, target.page)}
    >
      {content}
    </Link>
  );
}

