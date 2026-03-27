import { apiFetch } from "./api";
import type { ChangesetDetail } from "./changeset-types";

/** Fetch a single changeset by ID with full details. */
export async function getChangeset(id: string): Promise<ChangesetDetail> {
  return apiFetch<ChangesetDetail>(`/v1/changesets/${encodeURIComponent(id)}`);
}

/** Submit a review for a changeset. */
export async function submitChangesetReview(
  id: string,
  review: { status: "approved" | "rejected" | "changes_requested"; body?: string },
): Promise<unknown> {
  return apiFetch<unknown>(`/v1/changesets/${encodeURIComponent(id)}/reviews`, {
    method: "POST",
    body: JSON.stringify(review),
  });
}

/** Post a comment on a changeset. */
export async function addChangesetComment(
  id: string,
  comment: { body: string; filePath?: string; lineNumber?: number },
): Promise<unknown> {
  return apiFetch<unknown>(`/v1/changesets/${encodeURIComponent(id)}/comments`, {
    method: "POST",
    body: JSON.stringify(comment),
  });
}
