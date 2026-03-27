import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-capability-meta", () => ({
  useCapabilityMeta: () => ({
    meta: [
      {
        capability: "transcription",
        label: "Transcription",
        description: "Powered by Whisper.",
        pricing: "$0.006/min",
        hostedProvider: "Whisper",
        icon: "mic",
        sortOrder: 0,
      },
      {
        capability: "llm",
        label: "LLM",
        description: "200+ models via OpenRouter.",
        pricing: "$0.002/1K tokens",
        hostedProvider: "OpenRouter",
        icon: "bot",
        sortOrder: 1,
      },
      {
        capability: "webhook",
        label: "Webhooks",
        description: "HTTP webhooks.",
        pricing: "",
        hostedProvider: "",
        icon: "link",
        sortOrder: 2,
      },
    ],
    loading: false,
    error: false,
    getMeta: (cap: string) => {
      const all: Record<
        string,
        {
          capability: string;
          label: string;
          description: string;
          pricing: string;
          hostedProvider: string;
          icon: string;
          sortOrder: number;
        }
      > = {
        transcription: {
          capability: "transcription",
          label: "Transcription",
          description: "Powered by Whisper.",
          pricing: "$0.006/min",
          hostedProvider: "Whisper",
          icon: "mic",
          sortOrder: 0,
        },
        llm: {
          capability: "llm",
          label: "LLM",
          description: "200+ models via OpenRouter.",
          pricing: "$0.002/1K tokens",
          hostedProvider: "OpenRouter",
          icon: "bot",
          sortOrder: 1,
        },
        webhook: {
          capability: "webhook",
          label: "Webhooks",
          description: "HTTP webhooks.",
          pricing: "",
          hostedProvider: "",
          icon: "link",
          sortOrder: 2,
        },
      };
      return (
        all[cap] ?? {
          capability: cap,
          label: cap.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: "",
          pricing: "",
          hostedProvider: "",
          icon: "sparkles",
          sortOrder: 999,
        }
      );
    },
  }),
}));

import {
  CapabilityLabel,
  CapabilityPricing,
  CapabilityProviderPicker,
} from "@/components/capability/CapabilityResolver";

describe("CapabilityProviderPicker", () => {
  it("renders hosted/BYOK options only for capabilities with hostedProvider", () => {
    const onChoose = vi.fn();
    render(
      <CapabilityProviderPicker
        capabilities={["transcription", "llm", "webhook"]}
        choices={{}}
        onChoose={onChoose}
      />,
    );

    expect(screen.getByText("Transcription")).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("$0.006/min")).toBeInTheDocument();
    expect(screen.getByText("$0.002/1K tokens")).toBeInTheDocument();
    // webhook has no hostedProvider — should NOT show picker
    expect(screen.queryByText("Webhooks")).not.toBeInTheDocument();
  });

  it("defaults to hosted and calls onChoose when BYOK clicked", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <CapabilityProviderPicker
        capabilities={["transcription"]}
        choices={{}}
        onChoose={onChoose}
      />,
    );

    await user.click(screen.getByText("Use your key"));
    expect(onChoose).toHaveBeenCalledWith("transcription", "byok");
  });

  it("renders empty state when no capabilities have hosted providers", () => {
    render(<CapabilityProviderPicker capabilities={["webhook"]} choices={{}} onChoose={vi.fn()} />);
    expect(screen.getByText(/No hosted provider options/)).toBeInTheDocument();
  });

  it("shows selected state for BYOK when choice is byok", () => {
    render(
      <CapabilityProviderPicker
        capabilities={["transcription"]}
        choices={{ transcription: "byok" }}
        onChoose={vi.fn()}
      />,
    );

    expect(screen.getByText("Use your key").closest("button")).toBeInTheDocument();
    expect(screen.getByText("Platform Hosted").closest("button")).toBeInTheDocument();
  });
});

describe("CapabilityResolver components", () => {
  it("CapabilityLabel renders label for known capability", () => {
    render(<CapabilityLabel capability="transcription" />);
    expect(screen.getByText("Transcription")).toBeInTheDocument();
  });

  it("CapabilityLabel renders auto-formatted label for unknown capability", () => {
    render(<CapabilityLabel capability="brand-new-cap" />);
    expect(screen.getByText("Brand New Cap")).toBeInTheDocument();
  });

  it("CapabilityPricing renders pricing badge for known capability", () => {
    render(<CapabilityPricing capability="transcription" />);
    expect(screen.getByText("$0.006/min")).toBeInTheDocument();
  });

  it("CapabilityPricing renders nothing for unknown capability with no pricing", () => {
    const { container } = render(<CapabilityPricing capability="unknown-thing" />);
    expect(container.textContent).toBe("");
  });
});
