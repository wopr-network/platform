import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IncidentDashboard } from "./incident-dashboard";

vi.mock("@/lib/admin-incident-api", () => ({
  classifyIncidentSeverity: vi.fn().mockResolvedValue({
    severity: "SEV2",
    label: "Partial Outage",
    description: "Degraded service affecting some customers",
  }),
  getEscalationMatrix: vi.fn().mockResolvedValue({
    severity: "SEV1",
    contacts: [{ role: "On-Call Engineer", name: "Jane Doe", method: "PagerDuty", within: "5m" }],
  }),
  getResponseProcedure: vi.fn().mockResolvedValue({
    severity: "SEV1",
    steps: ["Acknowledge the alert", "Assemble incident team"],
  }),
  getCommunicationTemplates: vi.fn().mockResolvedValue({
    customer: "We are experiencing an issue...",
    internal: "Internal: SEV1 declared...",
  }),
  generatePostmortem: vi.fn().mockResolvedValue("# Post-Mortem Report\n\n## Summary\n..."),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("IncidentDashboard", () => {
  it("renders the classify tab by default", () => {
    render(<IncidentDashboard />);
    expect(screen.getByText("Classify Severity")).toBeTruthy();
  });

  it("renders all tab buttons", () => {
    render(<IncidentDashboard />);
    expect(screen.getByText("Classify")).toBeTruthy();
    expect(screen.getByText("Escalation")).toBeTruthy();
    expect(screen.getByText("Procedure")).toBeTruthy();
    expect(screen.getByText("Communications")).toBeTruthy();
    expect(screen.getByText("Post-Mortem")).toBeTruthy();
  });
});
