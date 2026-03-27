import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWebMCPTools } from "../lib/webmcp/register";

vi.mock("../lib/webmcp/feature-detect", () => ({
  isWebMCPAvailable: vi.fn(),
}));

vi.mock("../lib/webmcp/tools", () => ({
  getWebMCPTools: vi.fn(),
  getChatWebMCPTools: vi.fn().mockReturnValue([]),
}));

vi.mock("../lib/webmcp/marketplace-onboarding-tools", () => ({
  getMarketplaceOnboardingTools: vi.fn().mockReturnValue([]),
}));

import { isWebMCPAvailable } from "../lib/webmcp/feature-detect";
import { getWebMCPTools } from "../lib/webmcp/tools";

const mockIsWebMCPAvailable = vi.mocked(isWebMCPAvailable);
const mockGetWebMCPTools = vi.mocked(getWebMCPTools);
const mockConfirm = vi.fn<(message: string) => Promise<boolean>>();

const MOCK_TOOLS: ModelContextTool[] = [
  {
    name: "platform_list_instances",
    description: "List instances",
    inputSchema: { type: "object", properties: {} },
    handler: vi.fn(),
  },
  {
    name: "platform_create_instance",
    description: "Create instance",
    inputSchema: { type: "object", properties: {} },
    handler: vi.fn(),
  },
  {
    name: "platform_control_instance",
    description: "Control instance",
    inputSchema: { type: "object", properties: {} },
    handler: vi.fn(),
  },
];

describe("registerWebMCPTools", () => {
  let mockRegisterTool: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRegisterTool = vi.fn();
    Object.defineProperty(navigator, "modelContext", {
      value: { registerTool: mockRegisterTool },
      writable: true,
      configurable: true,
    });
    mockGetWebMCPTools.mockReturnValue(MOCK_TOOLS);
  });

  afterEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "modelContext", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("returns false when WebMCP is not available", () => {
    mockIsWebMCPAvailable.mockReturnValue(false);

    const result = registerWebMCPTools(true, mockConfirm, { router: { push: vi.fn() } });

    expect(result).toBe(false);
    expect(mockRegisterTool).not.toHaveBeenCalled();
  });

  it("returns false when user is not authenticated", () => {
    mockIsWebMCPAvailable.mockReturnValue(true);

    const result = registerWebMCPTools(false, mockConfirm, { router: { push: vi.fn() } });

    expect(result).toBe(false);
    expect(mockRegisterTool).not.toHaveBeenCalled();
  });

  it("registers all tools when authenticated and WebMCP is available", () => {
    mockIsWebMCPAvailable.mockReturnValue(true);

    const result = registerWebMCPTools(true, mockConfirm, { router: { push: vi.fn() } });

    expect(result).toBe(true);
    expect(mockRegisterTool).toHaveBeenCalledTimes(MOCK_TOOLS.length);
  });

  it("calls navigator.modelContext.registerTool for each tool", () => {
    mockIsWebMCPAvailable.mockReturnValue(true);

    registerWebMCPTools(true, mockConfirm, { router: { push: vi.fn() } });

    for (const tool of MOCK_TOOLS) {
      expect(mockRegisterTool).toHaveBeenCalledWith(tool);
    }
  });
});
