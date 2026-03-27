/** Review status for a changeset */
export type ChangesetReviewStatus = "pending" | "approved" | "rejected" | "changes_requested";

/** Status of the changeset itself */
export type ChangesetStatus = "open" | "merged" | "closed";

/** A single file change within a changeset */
export interface ChangesetFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  /** Only present for renamed files */
  previousPath?: string;
  /** Unified diff string; may be null for binary files */
  patch: string | null;
}

/** A review on a changeset */
export interface ChangesetReview {
  id: string;
  author: string;
  status: ChangesetReviewStatus;
  body: string | null;
  createdAt: string;
}

/** A comment on a changeset */
export interface ChangesetComment {
  id: string;
  author: string;
  body: string;
  filePath: string | null;
  lineNumber: number | null;
  createdAt: string;
}

/** Full changeset detail response */
export interface ChangesetDetail {
  id: string;
  title: string;
  description: string | null;
  status: ChangesetStatus;
  reviewStatus: ChangesetReviewStatus;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  files: ChangesetFile[];
  reviews: ChangesetReview[];
  comments: ChangesetComment[];
  totalAdditions: number;
  totalDeletions: number;
}
