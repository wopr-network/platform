import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Reject all fetch by default — tests must explicitly stub
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.reject(new Error("fetch not stubbed"))),
);

// Polyfill IntersectionObserver
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// Polyfill matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("dark"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
