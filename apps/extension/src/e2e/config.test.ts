// Loaded during collection, so each case's re-import only re-evaluates it.
import "./config"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Pins the LOAD-BEARING proverless guard (layer 1, see config.ts): proverless
 * must be OFF by default and arm ONLY when BOTH double-opt-in flags are set;
 * exactly one flag must fail CLOSED by throwing at module evaluation. A
 * regression here risks shipping a wallet that broadcasts UNPROVEN transactions
 * — the production catastrophe the guard exists to prevent.
 *
 * The guard runs at module-evaluation time (top-level `if (...) throw`), so each
 * case stubs `import.meta.env` then re-imports a fresh module instance.
 */
describe("e2e-proverless config (layer-1 fail-closed guard)", () => {
	beforeEach(() => {
		vi.resetModules()
	})
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.resetModules()
	})

	test("default (neither flag) → proverless OFF, no build stamp", async () => {
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS", "")
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS_CONFIRM", "")
		const mod = await import("./config")
		expect(mod.E2E_PROVERLESS).toBe(false)
		expect(mod.E2E_PROVERLESS_BUILD_STAMP).toBeNull()
	})

	test("both flags set → proverless ON, build stamp present", async () => {
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS", "1")
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS_CONFIRM", "1")
		const mod = await import("./config")
		expect(mod.E2E_PROVERLESS).toBe(true)
		expect(mod.E2E_PROVERLESS_BUILD_STAMP).toBe("NULO_E2E_PROVERLESS_BUILD_STAMP")
	})

	test("only the primary flag → throws (fail-closed)", async () => {
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS", "1")
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS_CONFIRM", "")
		await expect(import("./config")).rejects.toThrow(/both are required|double opt-in/i)
	})

	test("only the confirm flag → throws (fail-closed)", async () => {
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS", "")
		vi.stubEnv("VITE_NULO_E2E_PROVERLESS_CONFIRM", "1")
		await expect(import("./config")).rejects.toThrow(/both are required|double opt-in/i)
	})
})

/**
 * Same fail-closed shape for the token-seed source, and for a sharper reason
 * than the migration fixture's single flag: an armed build REPLACES the
 * token list, so a stray single flag would not be inert — it would
 * ship a wallet that silently stops seeding default tokens.
 */
describe("e2e-token-seeds config (layer-1 fail-closed guard)", () => {
	beforeEach(() => {
		vi.resetModules()
	})
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.resetModules()
	})

	test("default (neither flag) → source OFF, no build stamp", async () => {
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS", "")
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM", "")
		const mod = await import("./config")
		expect(mod.E2E_TOKEN_SEEDS).toBe(false)
		expect(mod.E2E_TOKEN_SEEDS_BUILD_STAMP).toBeNull()
	})

	test("both flags set → source ON, build stamp present", async () => {
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS", "1")
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM", "1")
		const mod = await import("./config")
		expect(mod.E2E_TOKEN_SEEDS).toBe(true)
		expect(mod.E2E_TOKEN_SEEDS_BUILD_STAMP).toBe("NULO_E2E_TOKEN_SEEDS_BUILD_STAMP")
	})

	test("only the primary flag → throws (fail-closed)", async () => {
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS", "1")
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM", "")
		await expect(import("./config")).rejects.toThrow(/both are required|double opt-in/i)
	})

	test("only the confirm flag → throws (fail-closed)", async () => {
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS", "")
		vi.stubEnv("VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM", "1")
		await expect(import("./config")).rejects.toThrow(/both are required|double opt-in/i)
	})
})

/**
 * The wallet clocks: a build without the flag gets no e2e values and no stamp, so its services keep
 * their production defaults and the release grep has nothing to find.
 */
describe("e2e-wallet-clocks config", () => {
	beforeEach(() => {
		vi.resetModules()
	})
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.resetModules()
	})

	test("unset → no e2e values, no build stamp", async () => {
		vi.stubEnv("VITE_NULO_E2E_WALLET_CLOCKS", "")
		const mod = await import("./config")
		expect(mod.E2E_WALLET_CLOCKS).toBeNull()
		expect(mod.E2E_WALLET_CLOCKS_BUILD_STAMP).toBeNull()
	})

	test("0, as the prover-ON build passes it → no e2e values, no build stamp", async () => {
		vi.stubEnv("VITE_NULO_E2E_WALLET_CLOCKS", "0")
		const mod = await import("./config")
		expect(mod.E2E_WALLET_CLOCKS).toBeNull()
		expect(mod.E2E_WALLET_CLOCKS_BUILD_STAMP).toBeNull()
	})

	test("1 → the e2e values and the build stamp", async () => {
		vi.stubEnv("VITE_NULO_E2E_WALLET_CLOCKS", "1")
		const mod = await import("./config")
		expect(mod.E2E_WALLET_CLOCKS).toEqual({ incomingPollMs: 10_000, finalityReadMs: 10_000 })
		expect(mod.E2E_WALLET_CLOCKS_BUILD_STAMP).toBe("NULO_E2E_WALLET_CLOCKS_BUILD_STAMP")
	})
})

/**
 * The extra default network: an armed build offers it to every person, so it takes both flags and
 * exactly one fails closed, like the token-seed source.
 */
describe("e2e-extra-seed config (layer-1 fail-closed guard)", () => {
	beforeEach(() => {
		vi.resetModules()
	})
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.resetModules()
	})

	test("default (neither flag) → no extra seed, no build stamp", async () => {
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED", "")
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED_CONFIRM", "")
		const mod = await import("./config")
		expect(mod.E2E_EXTRA_SEED).toBeNull()
		expect(mod.E2E_EXTRA_SEED_BUILD_STAMP).toBeNull()
	})

	test("both flags set → the extra seed and the build stamp", async () => {
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED", "1")
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED_CONFIRM", "1")
		const mod = await import("./config")
		const { E2E_EXTRA_SEED } = await import("./extra-seed")
		expect(mod.E2E_EXTRA_SEED).toEqual(E2E_EXTRA_SEED)
		expect(mod.E2E_EXTRA_SEED_BUILD_STAMP).toBe("NULO_E2E_EXTRA_SEED_BUILD_STAMP")
	})

	test("only the primary flag → throws (fail-closed)", async () => {
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED", "1")
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED_CONFIRM", "")
		await expect(import("./config")).rejects.toThrow(/both are required|double opt-in/i)
	})

	test("only the confirm flag → throws (fail-closed)", async () => {
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED", "")
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED_CONFIRM", "1")
		await expect(import("./config")).rejects.toThrow(/both are required|double opt-in/i)
	})

	test("no shipped seed has the extra seed's kind or chainId", async () => {
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED", "")
		vi.stubEnv("VITE_NULO_E2E_EXTRA_SEED_CONFIRM", "")
		const { DEFAULT_SEEDS } = await import("@/wallet/services/network/seeds")
		const { E2E_EXTRA_SEED } = await import("./extra-seed")
		// It stands in for a default no shipped build seeds yet. Once one ships with its kind, an armed
		// build would seed two of that kind: retire the arm, or give it a kind no shipped seed has.
		expect(DEFAULT_SEEDS.filter(({ kind, chainId }) => kind === E2E_EXTRA_SEED.kind || chainId === E2E_EXTRA_SEED.chainId)).toEqual([])
	})
})
