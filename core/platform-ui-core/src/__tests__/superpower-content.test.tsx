import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SuperpowerContent } from "@/components/marketplace/superpower-content";

const SAMPLE_MD = `# Secretary

*Your AI executive assistant who never sleeps*

She manages your calendar, drafts emails, and keeps your world running.

## What she can do

- Schedule and manage meetings
- Draft and send emails
- Track action items

## What gets installed

- @wopr-network/wopr-plugin-secretary
- Calendar integration module
- Email drafting engine
`;

describe("SuperpowerContent", () => {
  it("renders the H1 as large display text", () => {
    render(<SuperpowerContent markdown={SAMPLE_MD} />);
    expect(screen.getByText("Secretary")).toBeInTheDocument();
  });

  it("renders the tagline", () => {
    render(<SuperpowerContent markdown={SAMPLE_MD} />);
    expect(screen.getByText(/never sleeps/)).toBeInTheDocument();
  });

  it("renders 'What gets installed' section", () => {
    render(<SuperpowerContent markdown={SAMPLE_MD} />);
    expect(screen.getByText(/What gets installed/i)).toBeInTheDocument();
  });

  it("renders 'What she can do' items", () => {
    render(<SuperpowerContent markdown={SAMPLE_MD} />);
    expect(screen.getByText(/Schedule and manage meetings/)).toBeInTheDocument();
  });
});
