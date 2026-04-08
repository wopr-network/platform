import { beforeEach, describe, expect, it, vi } from "vitest";
import { BotNotFoundError, FleetManager } from "./fleet-manager.js";
import type { INodeCommandBus } from "./node-command-bus.js";
import type { IProfileStore } from "./profile-store.js";
import type { BotProfile } from "./types.js";

// --- Mock helpers ---

function mockCommandBus(): INodeCommandBus {
  return {
    send: vi.fn().mockResolvedValue({ id: "cmd-1", type: "command_result", command: "bot.start", success: true }),
  };
}

function mockStore(): IProfileStore {
  const profiles = new Map<string, BotProfile>();
  return {
    get: vi.fn(async (id: string) => profiles.get(id) ?? null),
    save: vi.fn(async (p: BotProfile) => {
      profiles.set(p.id, p);
    }),
    delete: vi.fn(async (id: string) => {
      profiles.delete(id);
    }),
    list: vi.fn(async () => [...profiles.values()]),
  } as unknown as IProfileStore;
}

function baseProfile(overrides: Partial<BotProfile> = {}): Omit<BotProfile, "id"> {
  return {
    tenantId: "tenant-1",
    name: "test-bot",
    description: "A test bot",
    image: "registry.wopr.bot/wopr:managed",
    productSlug: "wopr",
    env: { PORT: "3100" },
    restartPolicy: "unless-stopped" as const,
    releaseChannel: "stable" as const,
    updatePolicy: "manual" as const,
    ...overrides,
  };
}

describe("FleetManager", () => {
  let fm: FleetManager;
  let bus: INodeCommandBus;
  let store: IProfileStore;

  beforeEach(() => {
    bus = mockCommandBus();
    store = mockStore();
    fm = new FleetManager("local", store);
    fm.setCommandBus(bus);
  });

  describe("create", () => {
    it("sends bot.start via command bus", async () => {
      const instance = await fm.create(baseProfile());
      expect(bus.send).toHaveBeenCalledWith("local", expect.objectContaining({ type: "bot.start" }));
      expect(instance.url).toContain("http://");
      expect(instance.profile.name).toBe("test-bot");
    });

    it("assigns a UUID when no id provided", async () => {
      const instance = await fm.create(baseProfile());
      expect(instance.id).toBeTruthy();
      expect(instance.id.length).toBeGreaterThan(10);
    });

    it("uses explicit id when provided", async () => {
      const instance = await fm.create({ ...baseProfile(), id: "explicit-id" });
      expect(instance.id).toBe("explicit-id");
    });

    it("throws if explicit id already exists", async () => {
      await fm.create({ ...baseProfile(), id: "dup" });
      await expect(fm.create({ ...baseProfile(), id: "dup" })).rejects.toThrow("already exists");
    });

    it("saves profile to store", async () => {
      await fm.create(baseProfile());
      expect(store.save).toHaveBeenCalled();
    });

    it("rolls back profile on command bus failure", async () => {
      (bus.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("node offline"));
      await expect(fm.create(baseProfile())).rejects.toThrow("node offline");
      expect(store.delete).toHaveBeenCalled();
    });

    it("emits created event", async () => {
      const emitter = { emit: vi.fn() };
      fm.setDeps({ eventEmitter: emitter as never });
      await fm.create(baseProfile());
      expect(emitter.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "bot.created" }));
    });

    it("tries pool claim first when pool is available", async () => {
      const poolRepo = {
        claim: vi.fn().mockResolvedValue({ id: "pool-1", containerId: "c-pool-1" }),
      } as never;
      fm.setDeps({ poolRepo });
      await fm.create({ ...baseProfile(), productSlug: "paperclip" });
      expect((poolRepo as { claim: ReturnType<typeof vi.fn> }).claim).toHaveBeenCalledWith("paperclip", "local");
      // bot.update for rename, not bot.start
      expect(bus.send).toHaveBeenCalledWith("local", expect.objectContaining({ type: "bot.update" }));
    });

    it("falls back to bot.start when pool is empty", async () => {
      const poolRepo = { claim: vi.fn().mockResolvedValue(null) } as never;
      fm.setDeps({ poolRepo });
      await fm.create({ ...baseProfile(), productSlug: "paperclip" });
      expect(bus.send).toHaveBeenCalledWith("local", expect.objectContaining({ type: "bot.start" }));
    });
  });

  describe("getInstance", () => {
    it("returns instance for existing profile", async () => {
      const created = await fm.create(baseProfile());
      const instance = await fm.getInstance(created.id);
      expect(instance.id).toBe(created.id);
    });

    it("throws BotNotFoundError for unknown id", async () => {
      await expect(fm.getInstance("nonexistent")).rejects.toThrow(BotNotFoundError);
    });
  });

  describe("remove", () => {
    it("sends bot.remove via command bus", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockClear();
      await fm.remove(created.id);
      expect(bus.send).toHaveBeenCalledWith("local", expect.objectContaining({ type: "bot.remove" }));
    });

    it("deletes profile from store", async () => {
      const created = await fm.create(baseProfile());
      await fm.remove(created.id);
      expect(store.delete).toHaveBeenCalledWith(created.id);
    });

    it("throws for unknown bot", async () => {
      await expect(fm.remove("nonexistent")).rejects.toThrow(BotNotFoundError);
    });

    it("survives command bus failure (container already gone)", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("container not found"));
      await fm.remove(created.id); // should not throw
    });
  });

  describe("update", () => {
    it("sends bot.update when container fields change", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockClear();
      await fm.update(created.id, { image: "new-image:latest" });
      expect(bus.send).toHaveBeenCalledWith("local", expect.objectContaining({ type: "bot.update" }));
    });

    it("does not send command for metadata-only changes", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockClear();
      await fm.update(created.id, { description: "new description" });
      expect(bus.send).not.toHaveBeenCalled();
    });

    it("rolls back profile on failure", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("node offline"));
      await expect(fm.update(created.id, { image: "bad:image" })).rejects.toThrow("node offline");
      const restored = await fm.getInstance(created.id);
      expect(restored.profile.image).toBe("registry.wopr.bot/wopr:managed");
    });
  });

  describe("logs", () => {
    it("sends bot.logs via command bus", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "cmd-2",
        type: "command_result",
        command: "bot.logs",
        success: true,
        data: "line1\nline2",
      });
      const result = await fm.logs(created.id);
      expect(result).toBe("line1\nline2");
    });
  });

  describe("status", () => {
    it("sends bot.inspect via command bus", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "cmd-3",
        type: "command_result",
        command: "bot.inspect",
        success: true,
        data: { state: "running", containerId: "abc123" },
      });
      const status = await fm.status(created.id);
      expect(status.state).toBe("running");
      expect(status.name).toBe("test-bot");
    });

    it("returns stopped when inspect fails", async () => {
      const created = await fm.create(baseProfile());
      (bus.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("container gone"));
      const status = await fm.status(created.id);
      expect(status.state).toBe("stopped");
    });
  });

  describe("listAll", () => {
    it("returns status for all bots", async () => {
      await fm.create({ ...baseProfile(), name: "bot-1" });
      await fm.create({ ...baseProfile(), name: "bot-2" });
      (bus.send as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "cmd-4",
        type: "command_result",
        command: "bot.inspect",
        success: true,
        data: { state: "running" },
      });
      const all = await fm.listAll();
      expect(all).toHaveLength(2);
    });
  });

  describe("command bus not set", () => {
    it("throws when trying to create without command bus", async () => {
      const nobus = new FleetManager("orphan", store);
      await expect(nobus.create(baseProfile())).rejects.toThrow("command bus not set");
    });
  });
});
