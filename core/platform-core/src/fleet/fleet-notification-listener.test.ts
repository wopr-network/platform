import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { INotificationPreferencesRepository, NotificationPrefs } from "../email/notification-repository-types.js";
import type { NotificationService } from "../email/notification-service.js";
import type { BotFleetEvent } from "./fleet-event-emitter.js";
import { FleetEventEmitter } from "./fleet-event-emitter.js";
import { initFleetNotificationListener } from "./fleet-notification-listener.js";

vi.mock("../config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 100;

function makePrefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    billing_low_balance: true,
    billing_receipts: true,
    billing_auto_topup: true,
    agent_channel_disconnect: true,
    agent_status_changes: false,
    account_role_changes: true,
    account_team_invites: true,
    fleet_updates: true,
    ...overrides,
  };
}

function makePrefsRepo(prefs: NotificationPrefs = makePrefs()): INotificationPreferencesRepository {
  return {
    get: vi.fn().mockResolvedValue(prefs),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as INotificationPreferencesRepository;
}

function makeNotificationService(): NotificationService {
  return {
    notifyFleetUpdateComplete: vi.fn(),
    notifyFleetUpdateAvailable: vi.fn(),
    notifyLowBalance: vi.fn(),
  } as unknown as NotificationService;
}

function botUpdated(tenantId: string, version = "v1.2.0"): BotFleetEvent {
  return {
    type: "bot.updated",
    botId: `bot-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    timestamp: new Date().toISOString(),
    version,
  };
}

function botUpdateFailed(tenantId: string, version = "v1.2.0"): BotFleetEvent {
  return {
    type: "bot.update_failed",
    botId: `bot-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    timestamp: new Date().toISOString(),
    version,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("initFleetNotificationListener", () => {
  let emitter: FleetEventEmitter;

  beforeEach(() => {
    vi.useFakeTimers();
    emitter = new FleetEventEmitter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores non-bot events (node events)", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();

    initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail: vi.fn().mockResolvedValue("user@example.com"),
      debounceMs: DEBOUNCE_MS,
    });

    emitter.emit({
      type: "node.provisioned",
      nodeId: "node-1",
      timestamp: new Date().toISOString(),
    });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(notificationService.notifyFleetUpdateComplete).not.toHaveBeenCalled();
  });

  it("ignores non-update bot events (bot.started, bot.stopped)", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();

    initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail: vi.fn().mockResolvedValue("user@example.com"),
      debounceMs: DEBOUNCE_MS,
    });

    emitter.emit({
      type: "bot.started",
      botId: "bot-1",
      tenantId: "t1",
      timestamp: new Date().toISOString(),
    });

    emitter.emit({
      type: "bot.stopped",
      botId: "bot-2",
      tenantId: "t1",
      timestamp: new Date().toISOString(),
    });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(notificationService.notifyFleetUpdateComplete).not.toHaveBeenCalled();
  });

  it("aggregates multiple bot.updated events per tenant into one notification", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();
    const resolveEmail = vi.fn().mockResolvedValue("owner@example.com");

    initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail,
      debounceMs: DEBOUNCE_MS,
    });

    // Emit 3 successful updates for the same tenant
    emitter.emit(botUpdated("t1", "v2.0.0"));
    emitter.emit(botUpdated("t1", "v2.0.0"));
    emitter.emit(botUpdated("t1", "v2.0.0"));

    // No notification yet — debounce hasn't fired
    expect(notificationService.notifyFleetUpdateComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(notificationService.notifyFleetUpdateComplete).toHaveBeenCalledOnce();
    expect(notificationService.notifyFleetUpdateComplete).toHaveBeenCalledWith(
      "t1",
      "owner@example.com",
      "v2.0.0",
      3, // succeeded
      0, // failed
    );
  });

  it("sends summary with correct succeeded/failed counts after debounce", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();
    const resolveEmail = vi.fn().mockResolvedValue("owner@example.com");

    initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail,
      debounceMs: DEBOUNCE_MS,
    });

    emitter.emit(botUpdated("t1", "v3.0.0"));
    emitter.emit(botUpdated("t1", "v3.0.0"));
    emitter.emit(botUpdateFailed("t1", "v3.0.0"));

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(notificationService.notifyFleetUpdateComplete).toHaveBeenCalledWith(
      "t1",
      "owner@example.com",
      "v3.0.0",
      2, // succeeded
      1, // failed
    );
  });

  it("updates version from subsequent events", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();
    const resolveEmail = vi.fn().mockResolvedValue("owner@example.com");

    initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail,
      debounceMs: DEBOUNCE_MS,
    });

    // First event has v1.0.0, subsequent event changes to v1.1.0
    emitter.emit(botUpdated("t1", "v1.0.0"));
    emitter.emit(botUpdated("t1", "v1.1.0"));

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(notificationService.notifyFleetUpdateComplete).toHaveBeenCalledWith(
      "t1",
      "owner@example.com",
      "v1.1.0", // updated to latest version
      2,
      0,
    );
  });

  it("checks fleet_updates preference — skips if disabled", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo(makePrefs({ fleet_updates: false }));
    const resolveEmail = vi.fn().mockResolvedValue("owner@example.com");

    initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail,
      debounceMs: DEBOUNCE_MS,
    });

    emitter.emit(botUpdated("t1"));

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(preferences.get).toHaveBeenCalledWith("t1");
    expect(notificationService.notifyFleetUpdateComplete).not.toHaveBeenCalled();
  });

  it("skips if email resolver returns null", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();
    const resolveEmail = vi.fn().mockResolvedValue(null);

    initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail,
      debounceMs: DEBOUNCE_MS,
    });

    emitter.emit(botUpdated("t1"));

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(resolveEmail).toHaveBeenCalledWith("t1");
    expect(notificationService.notifyFleetUpdateComplete).not.toHaveBeenCalled();
  });

  it("async shutdown flushes pending notifications", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();
    const resolveEmail = vi.fn().mockResolvedValue("owner@example.com");

    const shutdown = initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail,
      debounceMs: DEBOUNCE_MS,
    });

    emitter.emit(botUpdated("t1", "v5.0.0"));
    emitter.emit(botUpdated("t2", "v5.0.0"));

    // Don't advance timers — flush via shutdown instead
    await shutdown();

    // Both tenants should have been flushed
    expect(notificationService.notifyFleetUpdateComplete).toHaveBeenCalledTimes(2);

    const calls = vi.mocked(notificationService.notifyFleetUpdateComplete).mock.calls;
    const tenantIds = calls.map((c) => c[0]);
    expect(tenantIds).toContain("t1");
    expect(tenantIds).toContain("t2");
  });

  it("no further events after shutdown", async () => {
    const notificationService = makeNotificationService();
    const preferences = makePrefsRepo();
    const resolveEmail = vi.fn().mockResolvedValue("owner@example.com");

    const shutdown = initFleetNotificationListener({
      eventEmitter: emitter,
      notificationService,
      preferences,
      resolveEmail,
      debounceMs: DEBOUNCE_MS,
    });

    await shutdown();

    // Events after shutdown should not trigger anything
    emitter.emit(botUpdated("t1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50);

    expect(notificationService.notifyFleetUpdateComplete).not.toHaveBeenCalled();
  });
});
