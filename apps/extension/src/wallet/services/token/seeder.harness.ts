/** Shared fixtures for the `TokenSeeder` unit suites. Test-only. */

import { afterAll, vi } from "vitest"
import { fakeBrowser } from "@webext-core/fake-browser"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import type { MinimalStorageArea } from "@nulo/wallet-core/storage"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { rowKeysForEveryProfile, trackSubtleCrypto } from "@/wallet/storage/sealed-entity-storage.testing"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import type { DefaultTokenSeed } from "./default-tokens"
import { type SeedMarkerEntry, type SeedPreview, TokenSeeder, type TokenSeederDeps } from "./seeder"
import type { TokenInterface } from "./spec"

export const CHAIN_ID = 999
export const CONTRACT = "0x018d47f656a0d242e28e5d15b5c965f39529bd860f2eaae947527b5094d800f6"
export const CLASS_ID = "0x0225da0f4227a139c3d6562b6554750adcdec45fd62d9b16af11da21033ef2cf"
export const MARKER_KEY = "nulo:core:token-seeded@p1"
export const KEY = `${CHAIN_ID}:${CONTRACT}`

/** One key for every profile, as an unlocked worker holds it. */
const ROW_KEYS = await rowKeysForEveryProfile()

const crypto = trackSubtleCrypto()
afterAll(() => crypto.restore())

/** Lets every in-flight seal finish: a pass a test left running then writes nothing into the next. */
export const settleSeals = (): Promise<void> => crypto.settled()

/** Lets every in-flight seal finish, then advances the fake clock by `ms` and lets the passes its
 *  timers start run until they park: a marker's seal resolves outside the fake clock, and a timer
 *  armed after a read must be armed before the clock moves past it. */
export async function advanceSeeders(ms: number): Promise<void> {
	await settleSeals()
	await vi.advanceTimersByTimeAsync(ms)
	for (let round = 0; round < 5; round++) {
		await settleSeals()
		await vi.advanceTimersByTimeAsync(0)
	}
}

/** The sealed marker root a seeder reads and writes, under {@link ROW_KEYS}. */
export const markerStore = (area: MinimalStorageArea) => sealedEntityStorage("tokenSeeded", area, ROW_KEYS.rowKeys)

export const SEED: DefaultTokenSeed = {
	chainId: CHAIN_ID,
	contract: CONTRACT,
	expectedClassId: CLASS_ID,
	expectedSymbol: "cUSD",
	expectedDecimals: 6,
	displayName: "Compressed USD",
}

export const IFACE = { chainId: CHAIN_ID, contract: CONTRACT, isComplete: true } as unknown as TokenInterface

export function goodPreview(): SeedPreview {
	return { name: "Compressed USD", symbol: "cUSD", decimals: 6, interface: IFACE }
}

/** Every seeder a suite builds. A failed attempt arms a real retry timer and the
 *  marker storage is shared across tests, so a timer outliving its test would
 *  write into the next one — `disposeSeeders` belongs in every `afterEach`. */
const liveSeeders: TokenSeeder[] = []

export function trackSeeder(seeder: TokenSeeder): TokenSeeder {
	liveSeeders.push(seeder)
	return seeder
}

export function disposeSeeders(): void {
	for (const seeder of liveSeeders.splice(0)) seeder.dispose()
}

export function makeSeeder(overrides?: Partial<TokenSeederDeps> & { version?: string; getVersion?: () => string }) {
	const api = new FakeBrowserApi()
	const logger = new LoggerStore(new ConfigStore())
	const deps: TokenSeederDeps = {
		getSeeds: vi.fn(async () => [SEED]),
		getActiveProfile: vi.fn(async () => ({ id: "p1" })),
		getActiveNetwork: vi.fn(async () => ({ id: "net1", chainId: CHAIN_ID })),
		getAccounts: vi.fn(async () => [{ address: "0xacc1" }]),
		preview: vi.fn(async () => goodPreview()),
		isTokenPresent: vi.fn(async () => false),
		persist: vi.fn(async () => {}),
		onStatusChanged: vi.fn(),
		...overrides,
	}
	const getVersion = overrides?.getVersion ?? (() => overrides?.version ?? "1.0.0")
	const seeder = trackSeeder(new TokenSeeder(deps, markerStore(api.storage.local), logger, getVersion))
	return { seeder, deps, api, logger }
}

/** The marker as stored, opened when it is sealed. */
export async function readMarker(): Promise<Record<string, SeedMarkerEntry>> {
	return ((await markerStore(fakeBrowser.storage.local).get("p1")) as Record<string, SeedMarkerEntry> | undefined) ?? {}
}

export async function writeMarker(state: unknown): Promise<void> {
	await fakeBrowser.storage.local.set({ [MARKER_KEY]: JSON.stringify(state) })
}

/** Moves the clock past the longest retry wait, so back-to-back `run()` calls each attempt. */
export function skipBackoff(): void {
	vi.setSystemTime(Date.now() + 61_000)
}
