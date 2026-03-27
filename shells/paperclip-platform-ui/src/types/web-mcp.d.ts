/**
 * Ambient type declarations for the WebMCP API (Chrome 146+ DevTrial).
 * These types will be removed once @types/web-mcp is published.
 */

interface ModelContextTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	handler: (params: Record<string, unknown>) => Promise<unknown>;
}

interface ModelContext {
	registerTool(tool: ModelContextTool): void;
}

interface Navigator {
	modelContext?: ModelContext;
}
