/**
 * Returns true if the WebMCP API (navigator.modelContext) is available.
 * Chrome 146+ DevTrial only. Returns false on all other browsers.
 */
export function isWebMCPAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "modelContext" in navigator &&
    navigator.modelContext != null &&
    typeof navigator.modelContext.registerTool === "function"
  );
}
