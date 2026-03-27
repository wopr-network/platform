/** Base class for all platform errors. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

/** Thrown when an API request returns a non-2xx status. */
export class ApiError extends AppError {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, message?: string) {
    super(message ?? `API error: ${status} ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

/** Thrown for client-side validation failures (form fields, input checks). */
export class ValidationError extends AppError {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

/** Thrown when a fetch fails due to network issues (no response received). */
export class NetworkError extends AppError {
  constructor(message = "A network error occurred. Please try again.") {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Extract a user-friendly message from any thrown value.
 * Use in catch blocks: `setError(toUserMessage(err))`
 */
export function toUserMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}
