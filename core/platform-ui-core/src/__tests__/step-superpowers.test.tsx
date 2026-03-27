import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mockSuperpowers = [
  {
    id: "image-gen",
    name: "ImageGen",
    tagline: "/imagine anything",
    description: "Generate images from text descriptions.",
    icon: "Image",
    color: "#F59E0B",
    requiresKey: true,
    configFields: [],
  },
  {
    id: "voice",
    name: "Voice",
    tagline: "Talk to your bot",
    description: "Speech-to-text and text-to-speech.",
    icon: "Mic",
    color: "#8B5CF6",
    requiresKey: false,
    configFields: [],
  },
  {
    id: "search",
    name: "Search",
    tagline: "Search the web",
    description: "Real-time web search.",
    icon: "Search",
    color: "#3B82F6",
    requiresKey: true,
    configFields: [],
  },
];

vi.mock("@/hooks/use-plugin-registry", () => ({
  usePluginRegistry: () => ({
    superpowers: mockSuperpowers,
    channels: [],
    providers: [],
    categories: [],
    personalities: [],
    presets: [],
    heroModels: [],
    additionalModels: [],
    allModels: [],
    byokProviders: [],
    modelCount: "0",
    providerOptions: [],
    channelOptions: [],
    pluginOptions: [],
    getAllPlugins: () => [],
    getPluginById: () => undefined,
    collectConfigFields: () => [],
    resolveDependencies: () => [],
    validateField: () => null,
  }),
}));

import { StepSuperpowers } from "@/components/onboarding/step-superpowers";

describe("StepSuperpowers", () => {
  describe("rendering superpower cards", () => {
    it("renders all superpowers with name and tagline", () => {
      render(<StepSuperpowers selected={[]} onToggle={vi.fn()} />);

      for (const sp of mockSuperpowers) {
        expect(screen.getByText(sp.name)).toBeInTheDocument();
        expect(screen.getByText(sp.tagline)).toBeInTheDocument();
      }
    });

    it("renders a switch for each superpower with correct aria-label", () => {
      render(<StepSuperpowers selected={[]} onToggle={vi.fn()} />);

      for (const sp of mockSuperpowers) {
        expect(screen.getByRole("switch", { name: `Toggle ${sp.name}` })).toBeInTheDocument();
      }
    });

    it("renders step number and code", () => {
      const { container } = render(<StepSuperpowers selected={[]} onToggle={vi.fn()} />);

      const stepDiv = container.querySelector("[aria-hidden='true']");
      expect(stepDiv?.textContent).toContain("STEP");
      expect(stepDiv?.textContent).toContain("04");
      expect(stepDiv?.textContent).toContain("SUPERPOWERS");
    });

    it("renders custom step number and code when provided", () => {
      const { container } = render(
        <StepSuperpowers selected={[]} onToggle={vi.fn()} stepNumber="07" stepCode="POWERS" />,
      );

      const stepDiv = container.querySelector("[aria-hidden='true']");
      expect(stepDiv?.textContent).toContain("STEP");
      expect(stepDiv?.textContent).toContain("07");
      expect(stepDiv?.textContent).toContain("POWERS");
    });
  });

  describe("selection visual feedback", () => {
    it("shows switch as checked when superpower is in selected array", () => {
      render(<StepSuperpowers selected={["image-gen"]} onToggle={vi.fn()} />);

      const imageGenSwitch = screen.getByRole("switch", { name: "Toggle ImageGen" });
      expect(imageGenSwitch).toBeChecked();

      const voiceSwitch = screen.getByRole("switch", { name: "Toggle Voice" });
      expect(voiceSwitch).not.toBeChecked();
    });

    it("shows multiple switches as checked for multiple selections", () => {
      render(<StepSuperpowers selected={["image-gen", "voice"]} onToggle={vi.fn()} />);

      expect(screen.getByRole("switch", { name: "Toggle ImageGen" })).toBeChecked();
      expect(screen.getByRole("switch", { name: "Toggle Voice" })).toBeChecked();
      expect(screen.getByRole("switch", { name: "Toggle Search" })).not.toBeChecked();
    });
  });

  describe("toggle interaction", () => {
    it("calls onToggle with superpower id when switch is clicked", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      render(<StepSuperpowers selected={[]} onToggle={onToggle} />);

      await user.click(screen.getByRole("switch", { name: "Toggle ImageGen" }));
      expect(onToggle).toHaveBeenCalledWith("image-gen");
    });

    it("calls onToggle for already-selected superpower (to deselect)", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      render(<StepSuperpowers selected={["voice"]} onToggle={onToggle} />);

      await user.click(screen.getByRole("switch", { name: "Toggle Voice" }));
      expect(onToggle).toHaveBeenCalledWith("voice");
    });
  });

  describe("no selection message", () => {
    it("shows 'NO SUPERPOWERS SELECTED' when nothing is selected", () => {
      render(<StepSuperpowers selected={[]} onToggle={vi.fn()} />);

      expect(screen.getByText(/NO SUPERPOWERS SELECTED/)).toBeInTheDocument();
    });

    it("hides message when at least one superpower is selected", () => {
      render(<StepSuperpowers selected={["image-gen"]} onToggle={vi.fn()} />);

      expect(screen.queryByText(/NO SUPERPOWERS SELECTED/)).not.toBeInTheDocument();
    });
  });

  describe("onboarding mode text", () => {
    it("shows default onboarding description", () => {
      render(<StepSuperpowers selected={[]} onToggle={vi.fn()} />);

      expect(screen.getByText("Pick as many as you want. All optional.")).toBeInTheDocument();
    });

    it("shows fleet-add description in fleet-add mode", () => {
      render(<StepSuperpowers selected={[]} onToggle={vi.fn()} mode="fleet-add" />);

      expect(
        screen.getByText("Pre-checked from your other bots. Add or remove as you like."),
      ).toBeInTheDocument();
    });
  });

  describe("fleet-add mode usage info", () => {
    it("shows which bots use a superpower in fleet-add mode", () => {
      render(
        <StepSuperpowers
          selected={[]}
          onToggle={vi.fn()}
          mode="fleet-add"
          existingBots={[
            { id: "1", name: "Bot Alpha", plugins: [], superpowers: ["image-gen"] },
            { id: "2", name: "Bot Beta", plugins: [], superpowers: ["image-gen"] },
          ]}
        />,
      );

      expect(screen.getByText("Bot Alpha, Bot Beta use this")).toBeInTheDocument();
    });

    it("shows singular 'uses' for one bot", () => {
      render(
        <StepSuperpowers
          selected={[]}
          onToggle={vi.fn()}
          mode="fleet-add"
          existingBots={[{ id: "1", name: "Bot Alpha", plugins: [], superpowers: ["voice"] }]}
        />,
      );

      expect(screen.getByText("Bot Alpha uses this")).toBeInTheDocument();
    });

    it("does not show usage info in default onboarding mode", () => {
      render(
        <StepSuperpowers
          selected={[]}
          onToggle={vi.fn()}
          existingBots={[{ id: "1", name: "Bot Alpha", plugins: [], superpowers: ["image-gen"] }]}
        />,
      );

      expect(screen.queryByText(/uses this/)).not.toBeInTheDocument();
    });
  });
});
