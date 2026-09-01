export function ScanDetailSkeleton() {
  return (
    <section className="scan-detail scan-detail-skeleton" aria-busy="true" aria-label="Loading scan">
      <div className="detail-topbar">
        <span className="skeleton skeleton-back-link" />
        <span className="skeleton skeleton-detail-meta" />
      </div>
      <div className="scan-workspace">
        <div className="page-stage skeleton-page-stage">
          <div className="skeleton-page-toolbar">
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
          <span className="skeleton skeleton-document" />
          <span className="skeleton skeleton-caption" />
        </div>
        <aside className="annotation-drawer skeleton-annotation-drawer">
          <div className="skeleton-navigation-row">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
          <div className="skeleton-selected-face">
            <span className="skeleton skeleton-face-preview" />
            <div>
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line short" />
            </div>
          </div>
          <div className="skeleton-selected-face-actions">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
          <div className="skeleton-drawer-section">
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line short" />
          </div>
        </aside>
      </div>
    </section>
  );
}
