/**
 * Fleet-related error classes.
 *
 * These used to live in fleet-manager.ts (now deleted). Moved to their own
 * file so callers can import them without depending on a defunct module.
 */

/**
 * Thrown when a fleet operation references an instance that doesn't exist
 * (no `bot_instances` row). Call sites in the marketplace + bot-plugins
 * routes use `err instanceof BotNotFoundError` to return 404 instead of 500.
 */
export class BotNotFoundError extends Error {
  constructor(instanceId: string) {
    super(`Bot not found: ${instanceId}`);
    this.name = "BotNotFoundError";
  }
}
