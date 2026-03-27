import { describe, expect, it } from "vitest";
import { ApiError, AppError, NetworkError, toUserMessage, ValidationError } from "./errors";

describe("error classes", () => {
  it("ApiError carries status and statusText", () => {
    const err = new ApiError(404, "Not Found");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.statusText).toBe("Not Found");
    expect(err.message).toBe("API error: 404 Not Found");
  });

  it("ApiError accepts custom message", () => {
    const err = new ApiError(422, "Unprocessable", "Invalid bot name");
    expect(err.message).toBe("Invalid bot name");
    expect(err.status).toBe(422);
  });

  it("ValidationError carries optional field", () => {
    const err = new ValidationError("Name is required", "name");
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("ValidationError");
    expect(err.field).toBe("name");
    expect(err.message).toBe("Name is required");
  });

  it("ValidationError works without field", () => {
    const err = new ValidationError("Invalid input");
    expect(err.field).toBeUndefined();
  });

  it("NetworkError has sensible default message", () => {
    const err = new NetworkError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("NetworkError");
    expect(err.message).toBe("A network error occurred. Please try again.");
  });
});

describe("toUserMessage", () => {
  it("extracts message from Error", () => {
    expect(toUserMessage(new Error("boom"))).toBe("boom");
  });

  it("extracts message from ApiError", () => {
    expect(toUserMessage(new ApiError(500, "Internal"))).toBe("API error: 500 Internal");
  });

  it("returns string as-is", () => {
    expect(toUserMessage("oops")).toBe("oops");
  });

  it("returns fallback for non-Error objects", () => {
    expect(toUserMessage(42)).toBe("Something went wrong. Please try again.");
    expect(toUserMessage(null)).toBe("Something went wrong. Please try again.");
    expect(toUserMessage(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("accepts custom fallback", () => {
    expect(toUserMessage({}, "Custom fallback")).toBe("Custom fallback");
  });
});
