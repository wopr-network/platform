import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockMarkComplete = vi.fn();
const mockSaveState = vi.fn();
let mockIsComplete = false;

vi.mock("@/lib/onboarding-store", () => ({
  isOnboardingComplete: () => mockIsComplete,
  markOnboardingComplete: (...args: unknown[]) => mockMarkComplete(...args),
  saveOnboardingState: (...args: unknown[]) => mockSaveState(...args),
  loadOnboardingState: () => ({
    currentStep: 0,
    providers: [],
    channels: [],
    channelsConfigured: [],
    channelConfigs: {},
    plugins: ["memory"],
    instanceName: "",
  }),
}));

vi.mock("@/lib/onboarding-data", () => ({
  presets: [
    {
      id: "discord-ai-bot",
      name: "Discord AI Bot",
      description: "A Discord bot powered by Claude.",
      channels: ["discord"],
      providers: ["anthropic"],
      plugins: ["semantic-memory"],
      keyCount: 2,
    },
    {
      id: "custom",
      name: "Custom",
      description: "Full wizard.",
      channels: [],
      providers: [],
      plugins: [],
      keyCount: 0,
    },
  ],
}));

import OnboardingPage from "@/app/(dashboard)/onboarding/page";

describe("OnboardingPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockMarkComplete.mockClear();
    mockSaveState.mockClear();
    mockIsComplete = false;
  });

  it("renders step 1 — name your bot", () => {
    render(<OnboardingPage />);
    expect(screen.getByText(/name your/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("redirects to /marketplace if onboarding already complete", async () => {
    mockIsComplete = true;
    render(<OnboardingPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/marketplace");
    });
  });

  it("advances to step 2 after entering a name", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);
    const input = screen.getByRole("textbox");
    await user.type(input, "My Bot");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/pick a preset/i)).toBeInTheDocument();
  });

  it("completes onboarding and redirects to marketplace", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    // Step 1: name
    await user.type(screen.getByRole("textbox"), "My Bot");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: pick preset
    await user.click(screen.getByText("Discord AI Bot"));
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 3: confirm & launch
    await user.click(screen.getByRole("button", { name: /launch/i }));

    expect(mockMarkComplete).toHaveBeenCalled();
    expect(mockSaveState).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/marketplace");
  });
});
