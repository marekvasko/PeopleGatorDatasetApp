import { useState } from "react";
import type { ArchiveStats } from "../types";
import { ArchiveIcon } from "./ArchiveIcon";

const formatNumber = new Intl.NumberFormat("en");

export function SearchBox({
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

export function ImageWithFallback({
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

export function StatsStrip({ stats }: { stats: ArchiveStats | null }) {
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

export function Pagination({
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

export function LoadingGrid({ circles = false }: { circles?: boolean }) {
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

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">!</span>
      <h2>We could not open this part of the archive</h2>
      <p>{message}</p>
    </div>
  );
}

