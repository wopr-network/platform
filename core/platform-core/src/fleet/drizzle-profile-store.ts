import type { DrizzleDb } from "../db/index.js";
import { DrizzleBotProfileRepository } from "./drizzle-bot-profile-repository.js";
import type { IProfileStore } from "./profile-store.js";
import type { BotProfile } from "./types.js";

/**
 * Drizzle-backed implementation of IProfileStore.
 * Replaces the YAML-based ProfileStore with database persistence
 * by delegating to DrizzleBotProfileRepository.
 */
export class DrizzleBotProfileStore implements IProfileStore {
  private readonly repo: DrizzleBotProfileRepository;

  constructor(db: DrizzleDb) {
    this.repo = new DrizzleBotProfileRepository(db);
  }

  async init(): Promise<void> {
    // No-op: database is already initialized by Drizzle migrations
  }

  async save(profile: BotProfile): Promise<void> {
    await this.repo.save(profile);
  }

  async get(id: string): Promise<BotProfile | null> {
    return this.repo.get(id);
  }

  async list(): Promise<BotProfile[]> {
    return this.repo.list();
  }

  async delete(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }
}
