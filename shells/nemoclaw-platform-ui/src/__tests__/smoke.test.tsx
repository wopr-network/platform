import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the core landing page component
vi.mock("@core/components/landing/landing-page", () => ({
  LandingPage: () => (
    <div>
      <h1>NemoPod</h1>
      <p>Run NemoPod agents at scale</p>
    </div>
  ),
}));

// Mock next-auth for login page
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => ({ get: vi.fn() })),
}));

import Home from "@/app/page";

describe("smoke: landing page", () => {
  it("renders without crashing", () => {
    const { container } = render(<Home />);
    expect(container).toBeTruthy();
  });

  it("displays the NemoPod brand name", () => {
    render(<Home />);
    expect(screen.getAllByText(/nemopod/i)[0]).toBeInTheDocument();
  });
});
