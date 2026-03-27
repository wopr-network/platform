import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the entire API module before importing the component
vi.mock("@/lib/api", () => ({
  listFriends: vi.fn(),
  listDiscoveredBots: vi.fn(),
  listFriendRequests: vi.fn(),
  getAutoAcceptConfig: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  rejectFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  updateAutoAcceptConfig: vi.fn(),
  updateFriendCapabilities: vi.fn(),
}));

import type { AutoAcceptConfig, DiscoveredBot, Friend, FriendRequest } from "@/lib/api";
import {
  getAutoAcceptConfig,
  listDiscoveredBots,
  listFriendRequests,
  listFriends,
} from "@/lib/api";
import { FriendsTab } from "./friends-tab";

const mockListFriends = listFriends as ReturnType<typeof vi.fn>;
const mockListDiscovered = listDiscoveredBots as ReturnType<typeof vi.fn>;
const mockListRequests = listFriendRequests as ReturnType<typeof vi.fn>;
const mockGetAutoAccept = getAutoAcceptConfig as ReturnType<typeof vi.fn>;

const INSTANCE_ID = "test-instance-123";

const defaultAutoAccept: AutoAcceptConfig = {
  enabled: false,
  rules: {},
};

function mockAllApis(overrides?: {
  friends?: Friend[];
  discovered?: DiscoveredBot[];
  requests?: FriendRequest[];
  autoAccept?: AutoAcceptConfig;
}) {
  mockListFriends.mockResolvedValue(overrides?.friends ?? []);
  mockListDiscovered.mockResolvedValue(overrides?.discovered ?? []);
  mockListRequests.mockResolvedValue(overrides?.requests ?? []);
  mockGetAutoAccept.mockResolvedValue(overrides?.autoAccept ?? defaultAutoAccept);
}

describe("FriendsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeletons initially", () => {
    // Never resolve the API calls — component stays in loading state
    const pending = new Promise<never>(() => undefined);
    mockListFriends.mockReturnValue(pending);
    mockListDiscovered.mockReturnValue(pending);
    mockListRequests.mockReturnValue(pending);
    mockGetAutoAccept.mockReturnValue(pending);

    const { container } = render(<FriendsTab instanceId={INSTANCE_ID} />);
    // Loading state renders 4 Skeleton elements
    const skeletons = container.querySelectorAll(".h-24");
    expect(skeletons.length).toBe(4);
  });

  it("shows error message when API calls fail", async () => {
    mockListFriends.mockRejectedValue(new Error("Network down"));
    mockListDiscovered.mockRejectedValue(new Error("Network down"));
    mockListRequests.mockRejectedValue(new Error("Network down"));
    mockGetAutoAccept.mockRejectedValue(new Error("Network down"));

    const { container } = render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      // toUserMessage returns err.message for Error instances
      expect(screen.getByText("Network down")).toBeInTheDocument();
    });
    // Error is displayed in the red error div
    const errorDiv = container.querySelector(".text-red-500");
    expect(errorDiv).toBeInTheDocument();
  });

  it("renders empty state when there are no friends", async () => {
    mockAllApis();

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(
        screen.getByText("No friends yet. Discover bots on the network below."),
      ).toBeInTheDocument();
    });
  });

  it("renders empty discovered bots state", async () => {
    mockAllApis();

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText(/No bots discovered on the network/)).toBeInTheDocument();
    });
  });

  it("renders friends list with names and status", async () => {
    const friends: Friend[] = [
      {
        id: "f1",
        name: "BotAlpha",
        status: "online",
        sharedCapabilities: ["tts"],
        connectedAt: new Date().toISOString(),
      },
      {
        id: "f2",
        name: "BotBeta",
        status: "offline",
        sharedCapabilities: [],
        connectedAt: new Date().toISOString(),
      },
    ];
    mockAllApis({ friends });

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText("BotAlpha")).toBeInTheDocument();
      expect(screen.getByText("BotBeta")).toBeInTheDocument();
    });
    // Check friend count in header
    expect(screen.getByText("Friends (2)")).toBeInTheDocument();
    // Status badges
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("renders discovered bots with capabilities", async () => {
    const discovered: DiscoveredBot[] = [
      {
        id: "d1",
        name: "DiscBot",
        capabilities: ["image-gen", "tts"],
        discoveredAt: new Date().toISOString(),
      },
    ];
    mockAllApis({ discovered });

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText("DiscBot")).toBeInTheDocument();
    });
    expect(screen.getByText("Discovered Bots (1)")).toBeInTheDocument();
    expect(screen.getByText("image-gen")).toBeInTheDocument();
    expect(screen.getByText("tts")).toBeInTheDocument();
  });

  it("renders inbound friend requests", async () => {
    const requests: FriendRequest[] = [
      {
        id: "r1",
        fromId: "bot-x",
        fromName: "FriendlyBot",
        toId: INSTANCE_ID,
        toName: "MyBot",
        direction: "inbound",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ];
    mockAllApis({ requests });

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText("FriendlyBot")).toBeInTheDocument();
    });
    expect(screen.getByText("Pending Requests (1)")).toBeInTheDocument();
    expect(screen.getByText("Inbound")).toBeInTheDocument();
    expect(screen.getByLabelText("Accept request from FriendlyBot")).toBeInTheDocument();
    expect(screen.getByLabelText("Reject request from FriendlyBot")).toBeInTheDocument();
  });

  it("renders outbound friend requests with cancel button", async () => {
    const requests: FriendRequest[] = [
      {
        id: "r2",
        fromId: INSTANCE_ID,
        fromName: "MyBot",
        toId: "bot-y",
        toName: "TargetBot",
        direction: "outbound",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ];
    mockAllApis({ requests });

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText("TargetBot")).toBeInTheDocument();
    });
    expect(screen.getByText("Outbound")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel request to TargetBot")).toBeInTheDocument();
  });

  it("renders auto-accept toggle when config is loaded", async () => {
    mockAllApis({ autoAccept: { enabled: true, rules: {} } });

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText("Auto-Accept Rules")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Toggle auto-accept")).toBeInTheDocument();
  });

  it("calls all four API functions with the instanceId on mount", async () => {
    mockAllApis();

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(mockListFriends).toHaveBeenCalledWith(INSTANCE_ID);
      expect(mockListDiscovered).toHaveBeenCalledWith(INSTANCE_ID);
      expect(mockListRequests).toHaveBeenCalledWith(INSTANCE_ID);
      expect(mockGetAutoAccept).toHaveBeenCalledWith(INSTANCE_ID);
    });
  });

  it("shows shared capabilities on friend row", async () => {
    const friends: Friend[] = [
      {
        id: "f1",
        name: "CapBot",
        status: "online",
        sharedCapabilities: ["tts", "image-gen"],
        connectedAt: new Date().toISOString(),
      },
    ];
    mockAllApis({ friends });

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText("CapBot")).toBeInTheDocument();
    });
    expect(screen.getByText("tts")).toBeInTheDocument();
    expect(screen.getByText("image-gen")).toBeInTheDocument();
  });

  it("shows 'None' when friend has no shared capabilities", async () => {
    const friends: Friend[] = [
      {
        id: "f1",
        name: "PlainBot",
        status: "offline",
        sharedCapabilities: [],
        connectedAt: new Date().toISOString(),
      },
    ];
    mockAllApis({ friends });

    render(<FriendsTab instanceId={INSTANCE_ID} />);
    await waitFor(() => {
      expect(screen.getByText("PlainBot")).toBeInTheDocument();
    });
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});
