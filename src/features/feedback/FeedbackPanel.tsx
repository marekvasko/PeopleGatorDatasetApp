import { useMemo, useState, type FormEvent } from "react";
import {
  faceImage,
  queryString,
  useApi,
  useRecordFeedbackMutation,
} from "../../api";
import { ArchiveIcon } from "../../components/ArchiveIcon";
import { ImageWithFallback, SearchBox } from "../../components/archive-ui";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { normalizePersonName } from "../../lib/personNames";
import type {
  FaceOccurrence,
  FeedbackPersonSuggestion,
  FeedbackResult,
  Paginated,
} from "../../types";

export function FeedbackPanel({
  face,
  onClose,
  onSubmitted,
}: {
  face: FaceOccurrence;
  onClose: () => void;
  onSubmitted: (result: FeedbackResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [selectedNameSource, setSelectedNameSource] = useState<
    "dataset" | "feedback" | "new" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const feedbackMutation = useRecordFeedbackMutation();
  const submitting = feedbackMutation.isPending;
  const debouncedQuery = useDebouncedValue(query.trim(), 220);
  const currentNames = useMemo(
    () => new Set(face.votes.map((vote) => normalizePersonName(vote.name))),
    [face],
  );
  const people = useApi<Paginated<FeedbackPersonSuggestion>>(
    debouncedQuery.length >= 2
      ? "/api/feedback/people" + queryString({ q: debouncedQuery, pageSize: 10 })
      : null,
  );
  const suggestions =
    people.data?.items.filter((person) => !currentNames.has(normalizePersonName(person.name))) ?? [];
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizePersonName(trimmedQuery);
  const queryMatchesCurrentName = currentNames.has(normalizedQuery);
  const hasExactSuggestion = suggestions.some(
    (person) => normalizePersonName(person.name) === normalizedQuery,
  );
  const canAddNewName =
    trimmedQuery.length >= 2 &&
    trimmedQuery.length <= 200 &&
    debouncedQuery === trimmedQuery &&
    !people.loading &&
    !people.error &&
    !queryMatchesCurrentName &&
    !hasExactSuggestion;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedName) {
      setError("Search for and select the person who should be shown here.");
      return;
    }
    feedbackMutation.mutate(
      {
        face,
        issueType: "wrong_person",
        options: {
          suggestedPersonName: selectedName,
        },
      },
      {
        onSuccess: onSubmitted,
        onError: (caught) => setError(caught.message || "Could not save feedback"),
      },
    );
  }

  return (
    <section className="feedback-panel" aria-labelledby="feedback-title">
      <header className="feedback-panel-header">
        <div>
          <span className="eyebrow">Help improve this archive</span>
          <h3 id="feedback-title">Suggest the correct person</h3>
        </div>
        <button type="button" onClick={onClose} disabled={submitting} aria-label="Close feedback form">
          ×
        </button>
      </header>
      <form onSubmit={submit}>
        <div className="feedback-person-picker">
          <span className="feedback-person-label">Who should this be?</span>
          <SearchBox
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (value !== selectedName) {
                setSelectedName("");
                setSelectedNameSource(null);
              }
            }}
            label="Search for a different person"
            placeholder="Start typing a name…"
          />
          {selectedName ? (
            <div className="selected-suggestion">
              <span>
                {selectedNameSource === "new"
                  ? "New name"
                  : selectedNameSource === "feedback"
                    ? "From feedback"
                    : "Selected"}
              </span>
              <strong>{selectedName}</strong>
              <button
                type="button"
                onClick={() => {
                  setSelectedName("");
                  setSelectedNameSource(null);
                  setQuery("");
                }}
              >
                Change
              </button>
            </div>
          ) : query.trim() ? (
            <div className="person-suggestions" role="listbox" aria-label="Matching people">
                  {debouncedQuery.length < 2 && <p>Type at least two characters.</p>}
                  {people.loading && <p>Searching people…</p>}
                  {people.error && <p>{people.error}</p>}
                  {!people.loading &&
                    debouncedQuery.length >= 2 &&
                    suggestions.length === 0 && (
                      <p>
                        {queryMatchesCurrentName
                          ? "This name is already assigned to the detection."
                          : "No existing matching person found."}
                      </p>
                    )}
                  {trimmedQuery.length > 200 && (
                    <p>Person names can contain at most 200 characters.</p>
                  )}
                  {suggestions.map((person) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      key={person.name}
                      onClick={() => {
                        setSelectedName(person.name);
                        setSelectedNameSource(person.source);
                        setQuery(person.name);
                      }}
                    >
                      {person.previewFacePath ? (
                        <ImageWithFallback src={faceImage(person.previewFacePath)} alt="" />
                      ) : (
                        <span className="image-fallback"><ArchiveIcon type="people" /></span>
                      )}
                      <span>
                        <strong>{person.name}</strong>
                        <small>
                          {person.source === "feedback"
                            ? "Previously suggested in feedback"
                            : person.faceCount +
                              " " +
                              (person.faceCount === 1 ? "appearance" : "appearances")}
                        </small>
                      </span>
                    </button>
                  ))}
                  {canAddNewName && (
                    <button
                      type="button"
                      className="add-person-suggestion"
                      onClick={() => {
                        setSelectedName(trimmedQuery);
                        setSelectedNameSource("new");
                      }}
                    >
                      <span className="new-person-mark">+</span>
                      <span>
                        <strong>Add “{trimmedQuery}”</strong>
                        <small>Create a new feedback person name</small>
                      </span>
                    </button>
                  )}
            </div>
          ) : null}
        </div>

        {error && <p className="feedback-error" role="alert">{error}</p>}
        <div className="feedback-actions">
          <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" disabled={submitting || !selectedName}>
            {submitting ? "Saving…" : "Submit correction"}
          </button>
        </div>
      </form>
    </section>
  );
}
