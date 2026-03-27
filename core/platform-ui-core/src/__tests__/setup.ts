import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Default fetch mock: reject all API calls so components fall back to mock data immediately.
// Individual tests can override with vi.stubGlobal("fetch", ...) as needed.
vi.stubGlobal(
  "fetch",
  vi.fn().mockRejectedValue(new Error("Network request not allowed in tests")),
);

// Polyfill IntersectionObserver for framer-motion whileInView in test env
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {
    /* no-op stub */
  }
  unobserve() {
    /* no-op stub */
  }
  disconnect() {
    /* no-op stub */
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

// Polyfill window.matchMedia for components that call it in useEffect (e.g. TerminalSequence).
// Returns matches: true so animation components skip async sequences in tests.
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

// Polyfill ResizeObserver for Radix UI components (e.g. Checkbox via @radix-ui/react-use-size).
// jsdom does not provide ResizeObserver natively. Must be a class (constructor) not an arrow fn.
class MockResizeObserver {
  observe() {
    /* no-op stub */
  }
  unobserve() {
    /* no-op stub */
  }
  disconnect() {
    /* no-op stub */
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

// Polyfill EventSource for SSE hooks (e.g. use-fleet-sse) in test env.
// jsdom does not provide EventSource natively.
class MockEventSource {
  addEventListener() {
    /* no-op stub */
  }
  removeEventListener() {
    /* no-op stub */
  }
  close() {
    /* no-op stub */
  }
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
}

if (typeof globalThis.EventSource === "undefined") {
  globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
}
