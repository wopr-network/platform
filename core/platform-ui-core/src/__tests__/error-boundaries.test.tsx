import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingError from "@/app/(dashboard)/billing/error";
import DashboardError from "@/app/(dashboard)/error";
import SettingsError from "@/app/(dashboard)/settings/error";
import ChannelsError from "@/app/channels/error";
import GlobalError from "@/app/error";
import FleetError from "@/app/fleet/error";
import InstancesError from "@/app/instances/error";
import PluginsError from "@/app/plugins/error";

const boundaries = [
  { name: "GlobalError (root)", Component: GlobalError, title: "Something went wrong" },
  { name: "DashboardError", Component: DashboardError, title: "Dashboard Error" },
  { name: "BillingError", Component: BillingError, title: "Billing Error" },
  { name: "SettingsError", Component: SettingsError, title: "Settings Error" },
  { name: "FleetError", Component: FleetError, title: "Fleet Error" },
  { name: "InstancesError", Component: InstancesError, title: "Fleet Management Error" },
  { name: "PluginsError", Component: PluginsError, title: "Plugins Error" },
  { name: "ChannelsError", Component: ChannelsError, title: "Channels Error" },
] as const;

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional suppression of console.error in tests
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("error.tsx boundaries render fallback UI", () => {
  const testError = Object.assign(new Error("Test explosion"), { digest: "abc123" });

  for (const { name, Component, title } of boundaries) {
    describe(name, () => {
      it("renders the error title", () => {
        const reset = vi.fn();
        render(<Component error={testError} reset={reset} />);
        expect(screen.getByText(title)).toBeInTheDocument();
      });

      it("renders a Try Again button that calls reset", async () => {
        const reset = vi.fn();
        render(<Component error={testError} reset={reset} />);
        const btn = screen.getByRole("button", { name: /try again/i });
        expect(btn).toBeInTheDocument();
        await userEvent.click(btn);
        expect(reset).toHaveBeenCalledOnce();
      });

      it("renders a Dashboard link", () => {
        const reset = vi.fn();
        render(<Component error={testError} reset={reset} />);
        const link = screen.getByRole("link", { name: /dashboard/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", expect.stringMatching(/^\//));
      });
    });
  }
});
