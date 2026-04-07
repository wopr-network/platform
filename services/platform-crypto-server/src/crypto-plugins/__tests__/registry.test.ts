import type { IChainPlugin } from "@wopr-network/platform-crypto-server/plugin";
import { describe, expect, it } from "vitest";
import { bitcoinPlugin, dogecoinPlugin, evmPlugin, litecoinPlugin, solanaPlugin, tronPlugin } from "../index.js";

const allPlugins: IChainPlugin[] = [evmPlugin, bitcoinPlugin, litecoinPlugin, dogecoinPlugin, tronPlugin, solanaPlugin];

/** Plugin IDs that have real createWatcher implementations. */
const implementedIds = new Set(["evm", "bitcoin", "litecoin", "dogecoin", "tron", "solana"]);

/** Plugin IDs that have real createSweeper implementations (don't throw on construction). */
const sweeperImplementedIds = new Set(["solana"]);

/** Plugins that still have stub watcher/sweeper implementations. */
const stubPlugins = allPlugins.filter((p) => !implementedIds.has(p.pluginId));

/** Plugins with real createWatcher implementations. */
const implementedPlugins = allPlugins.filter((p) => implementedIds.has(p.pluginId));

describe("Plugin registry", () => {
	it("all plugins have unique pluginIds", () => {
		const ids = allPlugins.map((p) => p.pluginId);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("all plugins implement IChainPlugin shape", () => {
		for (const plugin of allPlugins) {
			expect(plugin.pluginId).toBeTypeOf("string");
			expect(plugin.supportedCurve).toMatch(/^(secp256k1|ed25519)$/);
			expect(plugin.encoders).toBeTypeOf("object");
			expect(plugin.createWatcher).toBeTypeOf("function");
			expect(plugin.createSweeper).toBeTypeOf("function");
			expect(plugin.version).toBeTypeOf("number");
		}
	});

	it("secp256k1 plugins: evm, bitcoin, litecoin, dogecoin, tron", () => {
		const secp = allPlugins.filter((p) => p.supportedCurve === "secp256k1");
		expect(secp.map((p) => p.pluginId).sort()).toEqual(["bitcoin", "dogecoin", "evm", "litecoin", "tron"]);
	});

	it("ed25519 plugins: solana", () => {
		const ed = allPlugins.filter((p) => p.supportedCurve === "ed25519");
		expect(ed.map((p) => p.pluginId)).toEqual(["solana"]);
	});

	it("stub createWatcher throws Not implemented", () => {
		for (const plugin of stubPlugins) {
			expect(() => plugin.createWatcher({} as never)).toThrow("Not implemented");
		}
	});

	it("implemented createWatcher does not throw", () => {
		for (const plugin of implementedPlugins) {
			expect(() => plugin.createWatcher({} as never)).not.toThrow();
		}
	});

	it("stub createSweeper throws Not implemented", () => {
		const sweeperStubs = allPlugins.filter((p) => !sweeperImplementedIds.has(p.pluginId));
		for (const plugin of sweeperStubs) {
			expect(() => plugin.createSweeper({} as never)).toThrow("Not implemented");
		}
	});

	it("implemented createSweeper does not throw", () => {
		const sweeperImpl = allPlugins.filter((p) => sweeperImplementedIds.has(p.pluginId));
		for (const plugin of sweeperImpl) {
			expect(() => plugin.createSweeper({} as never)).not.toThrow();
		}
	});

	it("evm plugin has evm encoder", () => {
		expect(evmPlugin.encoders).toHaveProperty("evm");
		expect(evmPlugin.encoders.evm.encodingType()).toBe("evm");
	});

	it("solana plugin has base58-solana encoder", () => {
		expect(solanaPlugin.encoders).toHaveProperty("base58-solana");
		expect(solanaPlugin.encoders["base58-solana"].encodingType()).toBe("base58-solana");
	});

	it("can build a registry map from plugins", () => {
		const registry = new Map<string, IChainPlugin>();
		for (const plugin of allPlugins) {
			registry.set(plugin.pluginId, plugin);
		}
		expect(registry.size).toBe(6);
		expect(registry.get("evm")).toBe(evmPlugin);
		expect(registry.get("solana")).toBe(solanaPlugin);
	});
});
