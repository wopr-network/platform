import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings",
}));

const mockCreateOrganization = vi.fn();
vi.mock("@/lib/org-api", () => ({
  createOrganization: (...args: unknown[]) => mockCreateOrganization(...args),
}));

vi.mock("framer-motion", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      {
        get:
          (_target: unknown, tag: string) =>
          ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
            React.createElement(tag, props, children),
      },
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
  };
});

import CreateOrgWizard from "@/components/settings/create-org-wizard";

describe("CreateOrgWizard", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockCreateOrganization.mockClear();
  });

  it("renders the trigger button", () => {
    render(<CreateOrgWizard />);
    expect(screen.getByRole("button", { name: /create organization/i })).toBeInTheDocument();
  });

  it("opens the dialog when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    expect(screen.getByText("Name your organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toBeInTheDocument();
  });

  it("auto-generates slug from name", async () => {
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");

    expect(screen.getByLabelText("Slug")).toHaveValue("acme-corp");
  });

  it("stops auto-generating slug once slug is manually edited", async () => {
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme");
    expect(screen.getByLabelText("Slug")).toHaveValue("acme");

    // Use fireEvent.change to set custom slug (userEvent treats hyphens as special keys)
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "customslug" } });
    expect(screen.getByLabelText("Slug")).toHaveValue("customslug");

    // Type more in name — slug should NOT change since slug was manually edited
    await user.type(screen.getByLabelText("Organization name"), " Corp");
    expect(screen.getByLabelText("Slug")).toHaveValue("customslug");
  });

  it("sanitizes slug to lowercase, alphanumeric, hyphens only", async () => {
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Hello World! @#$ Test");

    expect(screen.getByLabelText("Slug")).toHaveValue("hello-world-test");
  });

  it("disables Next button when name or slug is empty", async () => {
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("advances to confirm step on Next", async () => {
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("acme-corp")).toBeInTheDocument();
  });

  it("goes back from confirm to name step", async () => {
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Name your organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization name")).toHaveValue("Acme Corp");
  });

  it("calls createOrganization and shows done step on success", async () => {
    mockCreateOrganization.mockResolvedValue({ id: "org-1", name: "Acme Corp", slug: "acme-corp" });
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockCreateOrganization).toHaveBeenCalledWith({ name: "Acme Corp", slug: "acme-corp" });
    expect(await screen.findByText("Organization created")).toBeInTheDocument();
  });

  it("shows 409 conflict error message", async () => {
    mockCreateOrganization.mockRejectedValue(new Error("409 Conflict"));
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText(/slug is already taken/)).toBeInTheDocument();
  });

  it("shows generic error for non-409 failures", async () => {
    mockCreateOrganization.mockRejectedValue(new Error("500 Server Error"));
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText(/Failed to create organization/)).toBeInTheDocument();
  });

  it("navigates to /settings/org on done step button click", async () => {
    mockCreateOrganization.mockResolvedValue({ id: "org-1", name: "Acme Corp", slug: "acme-corp" });
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    const goBtn = await screen.findByRole("button", { name: /go to organization settings/i });
    await user.click(goBtn);
    expect(mockPush).toHaveBeenCalledWith("/settings/org");
  });

  it("disables Create button while creating", async () => {
    mockCreateOrganization.mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );
    const user = userEvent.setup();
    render(<CreateOrgWizard />);

    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText("Organization name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Creating...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
  });
});
