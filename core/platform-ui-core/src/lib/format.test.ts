import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "./format";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for less than 60 seconds ago", () => {
    const thirtySecsAgo = new Date("2025-06-15T11:59:30Z");
    expect(formatRelativeTime(thirtySecsAgo)).toBe("just now");
  });

  it("returns 'just now' for 0 seconds ago", () => {
    const now = new Date("2025-06-15T12:00:00Z");
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinsAgo = new Date("2025-06-15T11:55:00Z");
    expect(formatRelativeTime(fiveMinsAgo)).toBe("5m ago");
  });

  it("returns 1m ago at exactly 60 seconds", () => {
    const oneMinAgo = new Date("2025-06-15T11:59:00Z");
    expect(formatRelativeTime(oneMinAgo)).toBe("1m ago");
  });

  it("returns hours ago", () => {
    const threeHoursAgo = new Date("2025-06-15T09:00:00Z");
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it("returns 1h ago at exactly 60 minutes", () => {
    const oneHourAgo = new Date("2025-06-15T11:00:00Z");
    expect(formatRelativeTime(oneHourAgo)).toBe("1h ago");
  });

  it("returns days ago", () => {
    const twoDaysAgo = new Date("2025-06-13T12:00:00Z");
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
  });

  it("returns 1d ago at exactly 24 hours", () => {
    const oneDayAgo = new Date("2025-06-14T12:00:00Z");
    expect(formatRelativeTime(oneDayAgo)).toBe("1d ago");
  });

  it("accepts ISO string input", () => {
    expect(formatRelativeTime("2025-06-15T11:55:00Z")).toBe("5m ago");
  });

  it("handles large day counts", () => {
    const thirtyDaysAgo = new Date("2025-05-16T12:00:00Z");
    expect(formatRelativeTime(thirtyDaysAgo)).toBe("30d ago");
  });
});
