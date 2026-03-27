import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock tRPC
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("@core/lib/trpc", () => ({
	trpc: {
		fleet: {
			listInstances: {
				useQuery: (...args: unknown[]) => mockUseQuery(...args),
			},
			createInstance: {
				useMutation: (...args: unknown[]) => mockUseMutation(...args),
			},
		},
	},
}));

// Mock framer-motion — render children only, no DOM prop spreading
vi.mock("framer-motion", () => ({
	motion: {
		div: (props: Record<string, unknown>) => {
			const { children } = props;
			return <div>{children as React.ReactNode}</div>;
		},
	},
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	MotionConfig: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

// Mock brand config
vi.mock("@core/lib/brand-config", () => ({
	getBrandConfig: () => ({
		domain: "runpaperclip.com",
		productName: "Paperclip",
	}),
	productName: () => "Paperclip",
}));

// Mock api (mapBotState)
vi.mock("@core/lib/api", () => ({
	mapBotState: (state: string) => {
		if (state === "running") return "running";
		if (state === "error" || state === "dead") return "error";
		return "stopped";
	},
	apiFetch: vi.fn(),
}));

// Mock errors
vi.mock("@core/lib/errors", () => ({
	toUserMessage: (_err: unknown, fallback: string) => fallback,
}));

// Mock sonner toast — use vi.hoisted so the reference is available at mock hoist time
const mockToast = vi.hoisted(() => ({
	loading: vi.fn(() => "toast-1"),
	success: vi.fn(),
	error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mockToast }));

// Mock Input to avoid @/ alias resolution issue inside node_modules
vi.mock("@core/components/ui/input", () => ({
	Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

import { PaperclipDashboard } from "@/components/paperclip-dashboard";

function renderWithQueryClient(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	);
}

const oneBotResponse = {
	bots: [
		{
			id: "inst-1",
			name: "my-bot",
			state: "running",
			env: {},
			uptime: new Date().toISOString(),
			createdAt: new Date().toISOString(),
		},
	],
};

const stoppedBotResponse = {
	bots: [
		{
			id: "inst-1",
			name: "my-bot",
			state: "stopped",
			env: {},
			uptime: null,
			createdAt: new Date().toISOString(),
		},
	],
};

const twoBotResponse = {
	bots: [
		...oneBotResponse.bots,
		{
			id: "inst-2",
			name: "second-bot",
			state: "stopped",
			env: {},
			uptime: null,
			createdAt: new Date().toISOString(),
		},
	],
};

const fiveBotResponse = {
	bots: Array.from({ length: 5 }, (_, i) => ({
		id: `inst-${i + 1}`,
		name: `bot-${i + 1}`,
		state: "running",
		env: {},
		uptime: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	})),
};

describe("PaperclipDashboard", () => {
	let mutateFn: ReturnType<typeof vi.fn>;
	let capturedOnSuccess: (() => void) | undefined;
	let capturedOnError: ((err: unknown) => void) | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		mutateFn = vi.fn();
		capturedOnSuccess = undefined;
		capturedOnError = undefined;

		mockUseMutation.mockImplementation((opts: Record<string, unknown>) => {
			capturedOnSuccess = opts.onSuccess as () => void;
			capturedOnError = opts.onError as (err: unknown) => void;
			return { mutate: mutateFn, isPending: false };
		});
	});

	// --- Basic rendering ---

	it("shows loading state while fetching", () => {
		mockUseQuery.mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(screen.getByText(/loading/i)).toBeInTheDocument();
	});

	it("shows error state on query failure", () => {
		mockUseQuery.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error("Network error"),
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
	});

	it("shows empty state when no instances exist", () => {
		mockUseQuery.mockReturnValue({
			data: { bots: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(screen.getByText(/no paperclips yet/i)).toBeInTheDocument();
		expect(
			screen.getByText(/create your first organization/i),
		).toBeInTheDocument();
	});

	it("renders hero card for single instance with status-aware subtitle", () => {
		mockUseQuery.mockReturnValue({
			data: oneBotResponse,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(screen.getByText("my-bot")).toBeInTheDocument();
		expect(screen.getByText(/my-bot\.runpaperclip\.com/)).toBeInTheDocument();
		expect(screen.getByText(/add another paperclip/i)).toBeInTheDocument();
		expect(
			screen.getByText(/your organization is running/i),
		).toBeInTheDocument();
	});

	it("shows correct status subtitle when single instance is stopped", () => {
		mockUseQuery.mockReturnValue({
			data: stoppedBotResponse,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(
			screen.getByText(/your organization is stopped/i),
		).toBeInTheDocument();
	});

	it("renders card grid for multiple instances", () => {
		mockUseQuery.mockReturnValue({
			data: twoBotResponse,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(screen.getByText("my-bot")).toBeInTheDocument();
		expect(screen.getByText("second-bot")).toBeInTheDocument();
	});

	it("hides search when fewer than 5 instances", () => {
		mockUseQuery.mockReturnValue({
			data: twoBotResponse,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
	});

	it("shows search when 5+ instances", () => {
		mockUseQuery.mockReturnValue({
			data: fiveBotResponse,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);
		expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
	});

	// --- State machine: creation flow ---

	it("shows optimistic provisioning card immediately on create", () => {
		mockUseQuery.mockReturnValue({
			data: { bots: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);

		// The AddPaperclipCard in empty state is a button with "Add another Paperclip" text
		// In card variant (empty state), the button contains a Plus icon and text
		const addButtons = screen.getAllByRole("button");
		const addBtn = addButtons.find((b) =>
			b.textContent?.includes("Add another Paperclip"),
		);
		fireEvent.click(addBtn!);
		const input = screen.getByPlaceholderText(/name your paperclip/i);
		fireEvent.change(input, { target: { value: "Atlas" } });
		fireEvent.keyDown(input, { key: "Enter" });

		// Should show provisioning card immediately (name is lowercased subdomain label)
		expect(screen.getByText("PROVISIONING")).toBeInTheDocument();
		expect(screen.getByText("atlas")).toBeInTheDocument();
		expect(screen.getByText(/atlas\.runpaperclip\.com/)).toBeInTheDocument();
	});

	it("fires toast.loading on create, not toast.success", () => {
		mockUseQuery.mockReturnValue({
			data: { bots: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);

		const addButtons = screen.getAllByRole("button");
		const addBtn = addButtons.find((b) =>
			b.textContent?.includes("Add another Paperclip"),
		)!;
		fireEvent.click(addBtn);
		const input = screen.getByPlaceholderText(/name your paperclip/i);
		fireEvent.change(input, { target: { value: "Atlas" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(mockToast.loading).toHaveBeenCalledWith("Creating atlas...");
		expect(mockToast.success).not.toHaveBeenCalled();
	});

	it("updates toast to booting phase when server responds", () => {
		const refetchFn = vi.fn();
		mockUseQuery.mockReturnValue({
			data: { bots: [] },
			isLoading: false,
			error: null,
			refetch: refetchFn,
		});
		renderWithQueryClient(<PaperclipDashboard />);

		// Trigger create
		const addButtons = screen.getAllByRole("button");
		const addBtn = addButtons.find((b) =>
			b.textContent?.includes("Add another Paperclip"),
		)!;
		fireEvent.click(addBtn);
		const input = screen.getByPlaceholderText(/name your paperclip/i);
		fireEvent.change(input, { target: { value: "Atlas" } });
		fireEvent.keyDown(input, { key: "Enter" });

		// Simulate server success callback
		act(() => {
			capturedOnSuccess?.();
		});

		expect(mockToast.loading).toHaveBeenCalledWith(
			"Booting up — running migrations...",
			expect.objectContaining({ id: "toast-1" }),
		);
		expect(refetchFn).toHaveBeenCalled();
	});

	it("shows error toast and removes provisioning card on failure", () => {
		mockUseQuery.mockReturnValue({
			data: { bots: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);

		// Trigger create
		const addButtons = screen.getAllByRole("button");
		const addBtn = addButtons.find((b) =>
			b.textContent?.includes("Add another Paperclip"),
		)!;
		fireEvent.click(addBtn);
		const input = screen.getByPlaceholderText(/name your paperclip/i);
		fireEvent.change(input, { target: { value: "Atlas" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByText("PROVISIONING")).toBeInTheDocument();

		// Simulate error callback
		act(() => {
			capturedOnError?.(new Error("quota exceeded"));
		});

		expect(mockToast.error).toHaveBeenCalledWith(
			"Failed to create Paperclip",
			expect.objectContaining({ id: "toast-1" }),
		);
		// Provisioning card should be gone
		expect(screen.queryByText("PROVISIONING")).not.toBeInTheDocument();
	});

	it("shows PROVISIONING IN PROGRESS subtitle during creation", () => {
		mockUseQuery.mockReturnValue({
			data: oneBotResponse,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);

		// Trigger create via the "Add another Paperclip" link
		fireEvent.click(screen.getByText(/add another paperclip/i));
		const input = screen.getByPlaceholderText(/name your paperclip/i);
		fireEvent.change(input, { target: { value: "Bolt" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByText(/provisioning in progress/i)).toBeInTheDocument();
	});

	it("polls faster (3s) during provisioning, slower (30s) otherwise", () => {
		// Start with no provisioning
		mockUseQuery.mockReturnValue({
			data: { bots: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);

		// First render: no provisioning → slow poll
		const firstCallOpts = mockUseQuery.mock.calls[0]?.[1] as
			| { refetchInterval?: number }
			| undefined;
		expect(firstCallOpts?.refetchInterval).toBe(30_000);
	});

	it("calls mutate with correct payload", () => {
		mockUseQuery.mockReturnValue({
			data: { bots: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		renderWithQueryClient(<PaperclipDashboard />);

		const addButtons = screen.getAllByRole("button");
		const addBtn = addButtons.find((b) =>
			b.textContent?.includes("Add another Paperclip"),
		)!;
		fireEvent.click(addBtn);
		const input = screen.getByPlaceholderText(/name your paperclip/i);
		fireEvent.change(input, { target: { value: "My Corp" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(mutateFn).toHaveBeenCalledWith({
			name: "my-corp",
			provider: "default",
			channels: [],
			plugins: [],
		});
	});
});
