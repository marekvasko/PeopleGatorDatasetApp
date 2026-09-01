import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  faceImage,
  pageImage,
  useApi,
  useRecordFeedbackMutation,
} from "../../api";
import { ArchiveIcon } from "../../components/ArchiveIcon";
import { ErrorState, ImageWithFallback } from "../../components/archive-ui";
import {
  AgreementBadge,
  IssueCount,
  OkCount,
} from "../../components/feedback-metrics";
import type { FaceOccurrence, ScanDetail } from "../../types";
import { FeedbackPanel } from "../feedback/FeedbackPanel";
import { ScanDetailSkeleton } from "./components/ScanDetailSkeleton";
import { ScanNavigationControl } from "./components/ScanNavigationControl";
import { VotePanel } from "./components/VotePanel";
import { useFaceSelection } from "./useFaceSelection";

export function ScanDetailPage() {
  const route = useParams();
  const [pageScale, setPageScale] = useState(1);
  const [feedbackFace, setFeedbackFace] = useState<FaceOccurrence | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [feedbackNoticeIsError, setFeedbackNoticeIsError] = useState(false);
  const [loadedImagePath, setLoadedImagePath] = useState<string | null>(null);
  const quickFeedbackMutation = useRecordFeedbackMutation();
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
  const { selectedFace, chooseFace, clearSelectedFace } = useFaceSelection(
    scan.data?.faces,
  );

  useEffect(() => setPageScale(1), [scan.data?.id]);

  function selectFace(face: FaceOccurrence) {
    chooseFace(face);
    setFeedbackFace(null);
    setFeedbackNotice("");
    setFeedbackNoticeIsError(false);
  }

  function recordQuickFeedback(issueType: "invalid_detection" | "ok") {
    if (!selectedFace || quickFeedbackMutation.isPending) return;
    setFeedbackNotice("");
    if (issueType === "invalid_detection") setFeedbackFace(null);
    quickFeedbackMutation.mutate(
      { face: selectedFace, issueType },
      {
        onSuccess: () => {
          setFeedbackNotice(
            issueType === "ok"
              ? "Thank you — this detection was marked as OK."
              : "Thank you — this detection was reported as incorrect.",
          );
          setFeedbackNoticeIsError(false);
        },
        onError: (caught) => {
          setFeedbackNotice(
            caught.message ||
              (issueType === "ok"
                ? "Could not record the OK response."
                : "Could not report the incorrect detection."),
          );
          setFeedbackNoticeIsError(true);
        },
      },
    );
  }

  if (scan.loading) {
    return <ScanDetailSkeleton />;
  }
  if (scan.error || !scan.data) return <ErrorState message={scan.error || "Scan not found"} />;
  const pageScanImage = pageImage(scan.data.imagePath, 1800);
  const pageScanImageLoaded = loadedImagePath === scan.data.imagePath;

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
                      } as CSSProperties
                    }
                  >
                    {!pageScanImageLoaded && (
                      <span className="page-image-skeleton skeleton" aria-hidden="true" />
                    )}
                    <img
                      className={pageScanImageLoaded ? "page-scan-image loaded" : "page-scan-image"}
                      src={pageScanImage}
                      alt={"Scanned archive page " + scan.data!.page}
                      width={scan.data!.pageWidth || undefined}
                      height={scan.data!.pageHeight || undefined}
                      draggable={false}
                      onLoad={() => setLoadedImagePath(scan.data!.imagePath)}
                      onError={() => setLoadedImagePath(scan.data!.imagePath)}
                    />
                    {pageScanImageLoaded &&
                      scan.data!.pageWidth > 0 &&
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
          <nav className="scan-page-navigation" aria-label="Move between document scans">
            <ScanNavigationControl
              target={scan.data.navigation.previous}
              kind="previous"
              label="Previous"
            />
            <ScanNavigationControl
              target={scan.data.navigation.random}
              kind="random"
              label="Random"
            />
            <ScanNavigationControl
              target={scan.data.navigation.next}
              kind="next"
              label="Next"
            />
          </nav>
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
                </div>
              </div>
              <div className="selected-face-actions" aria-label="Selected face actions">
                <button
                  type="button"
                  className="feedback-trigger"
                  aria-expanded={feedbackFace?.id === selectedFace.id}
                  disabled={quickFeedbackMutation.isPending}
                  onClick={() =>
                    setFeedbackFace((current) =>
                      current?.id === selectedFace.id ? null : selectedFace,
                    )
                  }
                >
                  <ArchiveIcon type="flag" />
                  Report
                </button>
                <button
                  type="button"
                  className="feedback-invalid-trigger"
                  onClick={() => recordQuickFeedback("invalid_detection")}
                  disabled={quickFeedbackMutation.isPending}
                >
                  <ArchiveIcon type="flag" />
                  {quickFeedbackMutation.isPending &&
                  quickFeedbackMutation.variables?.issueType === "invalid_detection"
                    ? "Saving…"
                    : "Wrong detection"}
                </button>
                <button
                  type="button"
                  className="feedback-ok-trigger"
                  onClick={() => recordQuickFeedback("ok")}
                  disabled={quickFeedbackMutation.isPending}
                >
                  <ArchiveIcon type="thumb" />
                  {quickFeedbackMutation.isPending &&
                  quickFeedbackMutation.variables?.issueType === "ok"
                    ? "Saving…"
                    : "OK"}
                </button>
              </div>
              {feedbackFace?.id === selectedFace.id && (
                <FeedbackPanel
                  face={selectedFace}
                  onClose={() => setFeedbackFace(null)}
                  onSubmitted={() => {
                    setFeedbackFace(null);
                    setFeedbackNotice("Thank you — the corrected name was recorded.");
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
