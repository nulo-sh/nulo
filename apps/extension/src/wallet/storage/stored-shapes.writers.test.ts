/**
 * Holds every described entry of `STORED_SHAPES` to its writer, twice: the schema's output type and
 * the writer's type are mutually assignable (checked by the typecheck), and what the real writer
 * stores parses back to itself (zod strips a key it does not describe, so the equality fails).
 */
import { LEGAL_ACCEPTANCE_KEY, type LegalAcceptanceRecord } from "@nulo/legal"
import { BUNDLED_TOKEN_CLASS_IDS, type PinnedKey, SEQUENCE_FLOOR } from "@nulo/token-list"
import { importSeed, publicKeyOf, signEnvelope } from "@nulo/token-list/envelope"
import {
	defineMigration,
	type Migration,
	Migrator,
	SCHEMA_ATTEMPTS_KEY,
	SCHEMA_BACKUP_KEY,
	SCHEMA_RUNNING_KEY,
	SCHEMA_VERSION_KEY,
} from "@nulo/wallet-core/migration"
import type { BrowserApi, ClockPort } from "@nulo/wallet-core/ports"
import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { fakeBrowser } from "@webext-core/fake-browser"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { z } from "zod"
import { type PinMap, usePinnedTokens } from "@/composables/usePinnedTokens"
import { FakeNodeFactory } from "@/core/testing/fake-node-factory"
import type { AppPick, SendSlots } from "@/utils/fee-picks"
import { markGetStarted } from "@/utils/get-started"
import {
	feePicksKey,
	getStartedAztecOpenedKey,
	getStartedBackupSavedKey,
	getStartedFeeJuiceHeldKey,
	getStartedHiddenKey,
	getStartedPhraseSavedKey,
	pinnedTokensKey,
	restoreOutcomeKey,
	sendFeePicksKey,
} from "@/utils/profile-ui-keys"
import { armRestoreOutcome, type RestoreOutcome } from "@/utils/restore-outcome"
import { ServiceCollection } from "@/wallet/base"
import { CONFIG_STORAGE_KEY, type Config, ConfigSchema, ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { createWalletRuntime } from "@/wallet/runtime"
import { svc, tokenListStub } from "@/wallet/services/composition-harness"
import { CONFIG_SERVICE_NAME } from "@/wallet/services/config/spec"
import {
	RegistrationAllowance,
	type RegistrationCounts,
	RegistrationCountsSchema,
} from "@/wallet/services/dapp-session/registration-allowance"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import { NetworkService } from "@/wallet/services/network/service"
import { ACTIVE_NETWORK_STORAGE_ROOT } from "@/wallet/services/network/spec"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { PriceService, type PriceState, TOKEN_PRICES_STORAGE_KEY } from "@/wallet/services/price/service"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import { PROFILE_SERVICE_NAME, PROFILE_STORAGE_ROOT, type Profile } from "@/wallet/services/profile/spec"
import { PinMismatchError, type SeedMarkerState, type SeedPreview, SEED_ATTEMPT_CAP } from "@/wallet/services/token/seeder"
import { CONTRACT, CHAIN_ID, disposeSeeders, makeSeeder, readMarker, skipBackoff } from "@/wallet/services/token/seeder.harness"
import { type FetchLike, TokenListService, type TokenListStoredState } from "@/wallet/services/token-list/service"
import { TOKEN_LIST_STORAGE_KEY } from "@/wallet/services/token-list/spec"
import {
	BASELINE_VERSION,
	type MigrationBlockedStatus,
	type MigrationDegradedStatus,
	SCHEMA_BLOCKED_KEY,
	SCHEMA_DEGRADED_KEY,
	SCHEMA_RETRY_REQUESTED_KEY,
} from "./migrations"
import {
	MigrationBlockedSchema,
	MigrationDegradedSchema,
	PriceStateSchema,
	ProfileRowSchema,
	STORED_SHAPES,
	SeedMarkersSchema,
	type StoredShapeName,
	TokenListStateSchema,
} from "./stored-shapes"
import { isSealedText } from "./sealed-entity-storage"
import { rowKeysForEveryProfile } from "./sealed-entity-storage.testing"

const bootMigrations = vi.hoisted((): Migration[] => [])
vi.mock("./migrations", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	migrations: bootMigrations,
}))

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
/** Mutual assignability, plus the same top-level keys: an optional key only one side has is assignable both ways. */
type Equivalent<A, B> = Mutual<A, B> extends true ? Mutual<keyof A, keyof B> : false
type Out<S extends z.ZodType> = z.output<S>
type Registered<N extends StoredShapeName> = Out<(typeof STORED_SHAPES)[N]["schema"]>
/** The legal record is a readonly view; `readonly` changes nothing that is stored. */
type DeepReadonly<T> = T extends (infer E)[]
	? readonly DeepReadonly<E>[]
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T
type Variant<T, K extends string> = Extract<T, { type: K }>

/** The stored value as the registry says it is encoded, parsed by its schema back to itself. */
function expectDescribed(name: StoredShapeName, raw: unknown): void {
	const { encoding, schema } = STORED_SHAPES[name]
	if (encoding === "json") expect(typeof raw).toBe("string")
	const stored: unknown = encoding === "json" ? JSON.parse(raw as string) : raw
	expect(stored).toBeDefined()
	expect(schema.parse(stored)).toEqual(stored)
}

async function rawOf(api: FakeBrowserApi, key: string): Promise<unknown> {
	return (await api.storage.local.get(key))[key]
}

/** `chrome.storage.local` over memory, for the writers that reach the global. */
function stubChromeStorage(): MemoryStorageArea {
	const local = new MemoryStorageArea()
	vi.stubGlobal("chrome", {
		...chrome,
		storage: { local, session: new MemoryStorageArea(), onChanged: { addListener: () => {}, removeListener: () => {} } },
	})
	return local
}

const logger = () => new LoggerStore(new ConfigStore())

afterEach(() => {
	disposeSeeders()
	vi.useRealTimers()
	vi.restoreAllMocks()
	bootMigrations.splice(0)
})

describe("described schemas match their writers' types", () => {
	test("each described schema's output and its writer's type are mutually assignable", () => {
		const checks: [
			Equivalent<Out<typeof ConfigSchema>, Config>,
			Equivalent<Out<typeof PriceStateSchema>, PriceState>,
			Equivalent<Out<typeof TokenListStateSchema>, TokenListStoredState>,
			Equivalent<Out<typeof SeedMarkersSchema>, SeedMarkerState>,
			Equivalent<Out<typeof RegistrationCountsSchema>, RegistrationCounts>,
			Equivalent<Variant<Out<typeof ProfileRowSchema>, "password">, Variant<Profile, "password">>,
			Equivalent<Variant<Out<typeof ProfileRowSchema>, "passkey">, Variant<Profile, "passkey">>,
			Equivalent<DeepReadonly<Registered<"legalAccepted">>, LegalAcceptanceRecord>,
			Equivalent<Registered<"uiPinnedTokens">, PinMap>,
			Equivalent<Registered<"uiFeePicks">, Record<string, AppPick>>,
			Equivalent<Registered<"uiSendFeePicks">, Record<string, SendSlots>>,
			Equivalent<Registered<"uiRestoreOutcome">, RestoreOutcome>,
			Equivalent<Out<typeof MigrationBlockedSchema>, MigrationBlockedStatus>,
			Equivalent<Out<typeof MigrationDegradedSchema>, MigrationDegradedStatus>,
			Equivalent<Registered<"activeNetwork">, string>,
			Equivalent<Registered<"uiActiveAccount">, string>,
			Equivalent<Registered<"uiLastActiveProfile">, string>,
			Equivalent<Registered<"onboardingCompleted">, boolean>,
		] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]
		const controls: [Equivalent<{ a: string }, { a?: string }>, Equivalent<{ a: string; b?: string }, { a: string }>] = [false, false]
		// The check is the typecheck of these two assignments; the run only records that they compiled.
		expect([checks.length, controls.length]).toEqual([18, 2])
	})

	// Entries built through `described()` or `engine()` are typed `StoredShape`, whose schema is any
	// `ZodType`: the checks above read the exported schema, which must be the one registered.
	test("the exported schemas the type checks read are the registered ones", () => {
		expect(STORED_SHAPES.config.schema).toBe(ConfigSchema)
		expect(STORED_SHAPES.tokenPrices.schema).toBe(PriceStateSchema)
		expect(STORED_SHAPES.tokenList.schema).toBe(TokenListStateSchema)
		expect(STORED_SHAPES.tokenSeeded.schema).toBe(SeedMarkersSchema)
		expect(STORED_SHAPES.dappRegistrations.schema).toBe(RegistrationCountsSchema)
		expect(STORED_SHAPES.profiles.schema).toBe(ProfileRowSchema)
		expect(STORED_SHAPES.schemaBlocked.schema).toBe(MigrationBlockedSchema)
		expect(STORED_SHAPES.schemaDegraded.schema).toBe(MigrationDegradedSchema)
	})
})

describe("what each writer stores parses back to itself", () => {
	test("config: ConfigStore.set", async () => {
		const local = stubChromeStorage()
		const store = new ConfigStore()
		await store.set("theme", "dark")
		await store.set("defaultExplorer", null)
		await store.set("incomingDustUsdThreshold", 2.5)
		await store.set("developerMode", true)
		expectDescribed("config", local.data.get(CONFIG_STORAGE_KEY))
	})

	test("tokenPrices: PriceService refresh, quotes with and without a provider time", async () => {
		await fakeBrowser.reset()
		const api = new FakeBrowserApi()
		const now = 1_000_000_000
		const body = { aztec: { usd: 0.0147, last_updated_at: now / 1000 }, tether: { usd: 1.0001 } }
		const fetchFn = async () => new Response(JSON.stringify(body), { status: 200 })
		const services = new ServiceCollection()
		services.add(
			svc(CONFIG_SERVICE_NAME, {
				onUpdate: new EventHandler<{ key: string; value: unknown }>(),
				getValue: async (key: string) => key === "showFiatValues",
			}),
		)
		services.add(
			svc(PROFILE_SERVICE_NAME, {
				onActiveProfileChanged: new EventHandler<unknown>(),
				getActiveProfile: async () => ({ id: "p1", name: "P", type: "password" }),
				peekLiveSerial: () => 1,
			}),
		)
		services.add(tokenListStub())
		const service = new PriceService(logger(), api, { fetchFn, now: () => now })
		services.add(service)
		await services.start()

		await service.refreshIfStale()

		const stored = JSON.parse((await rawOf(api, TOKEN_PRICES_STORAGE_KEY)) as string) as PriceState
		expect(stored.aztec.providerUpdatedAt).toBe(now)
		expect(stored.tether.providerUpdatedAt).toBeNull()
		expectDescribed("tokenPrices", await rawOf(api, TOKEN_PRICES_STORAGE_KEY))
	})

	test("tokenList: TokenListService refresh, after an accepted list and after a failure", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const keyId = "nulo-ci-1"
		const privateKey = await importSeed("11".repeat(32))
		const keys: PinnedKey[] = [{ keyId, publicKey: await publicKeyOf(privateKey) }]
		const payload = {
			format: "nulo-token-list/1",
			sequence: SEQUENCE_FLOOR + 1,
			issuedAt: new Date(0).toISOString(),
			tokens: [
				{
					chainId: 7,
					address: `0x${"1".padStart(64, "0")}`,
					classId: BUNDLED_TOKEN_CLASS_IDS[0],
					symbol: "USDC",
					decimals: 6,
					name: "T",
				},
			],
			flagged: [],
		}
		const envelope = JSON.stringify(await signEnvelope(new TextEncoder().encode(JSON.stringify(payload)), privateKey, keyId))
		const answers = [new Response(envelope), new Response("", { status: 503 })]
		const fetchFn: FetchLike = async () => answers.shift() ?? new Response("", { status: 503 })
		const log = logger()
		const legal = new LegalAcceptanceService(log, api, () => 1_000)
		await legal.accept("onboarding")
		const service = new TokenListService(log, api, {
			getSource: async () => ({ url: "https://t.example/l.json", keys }),
			fetchFn,
			now: () => 1_000,
		})
		const services = new ServiceCollection()
		services.add(legal)
		services.add(service)
		await services.start()
		await service.booted

		expect(JSON.parse((await rawOf(api, TOKEN_LIST_STORAGE_KEY)) as string)).toMatchObject({
			envelope,
			lastSuccessAt: 1_000,
			failures: 0,
		})
		expectDescribed("tokenList", await rawOf(api, TOKEN_LIST_STORAGE_KEY))

		await service.refresh()

		expect(JSON.parse((await rawOf(api, TOKEN_LIST_STORAGE_KEY)) as string)).toMatchObject({ envelope, failures: 1 })
		expectDescribed("tokenList", await rawOf(api, TOKEN_LIST_STORAGE_KEY))
	})

	test("tokenSeeded: TokenSeeder markers across seeded, retrying, capped, rejected and deleted", async () => {
		vi.useFakeTimers({ toFake: ["Date"] })
		const failing = (error: Error) => vi.fn(async (): Promise<SeedPreview> => Promise.reject(error))
		const markers: SeedMarkerState[] = []
		const scenarios: Array<() => Promise<void>> = [
			async () => {
				await makeSeeder().seeder.run()
			},
			async () => {
				await makeSeeder({ preview: failing(new Error("rpc down")) }).seeder.run()
			},
			async () => {
				const { seeder } = makeSeeder({ preview: failing(new Error("rpc down")) })
				for (let i = 0; i < SEED_ATTEMPT_CAP; i++) {
					await seeder.run()
					skipBackoff()
				}
			},
			async () => {
				await makeSeeder({ preview: failing(new PinMismatchError("class id differs")) }).seeder.run()
			},
			async () => {
				await makeSeeder().seeder.markDeletedByUser("p1", CHAIN_ID, CONTRACT)
			},
		]
		for (const scenario of scenarios) {
			await fakeBrowser.reset()
			await scenario()
			// Sealed at rest: the registered schema describes the opened row.
			const raw = (await fakeBrowser.storage.local.get("nulo:core:token-seeded@p1"))["nulo:core:token-seeded@p1"]
			expect(isSealedText(raw)).toBe(true)
			const marker = await readMarker()
			expectDescribed("tokenSeeded", JSON.stringify(marker))
			markers.push(marker)
		}
		const fields = new Set(markers.flatMap((m) => Object.values(m).flatMap((entry) => Object.keys(entry))))
		expect([...fields].sort()).toEqual(
			["attempts", "cappedAtVersion", "nextAttemptAt", "observedDecimals", "outcome", "rejectedAtVersion", "verifiedPins"].sort(),
		)
	})

	test("dappRegistrations: RegistrationAllowance.admit for two apps on two chains", async () => {
		const area = new MemoryStorageArea()
		const allowance = new RegistrationAllowance(area)
		await allowance.admit("p1", 1, "https://a.example")
		await allowance.admit("p1", 1, "https://b.example")
		await allowance.admit("p1", 2, "https://a.example")
		const raw = (await area.get("nulo:core:dappRegistrations@p1"))["nulo:core:dappRegistrations@p1"]
		expectDescribed("dappRegistrations", raw)
	})

	test("activeNetwork: NetworkService.getOrInitNetworks points the profile at its primary seed", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const service = new NetworkService(logger(), api, new FakeNodeFactory())
		const deletion = new ProfileDeletionState()
		Object.assign(service, {
			initialized: true,
			profileService: {
				...(await rowKeysForEveryProfile()),
				captureExecutionFence: async () => ({ profileId: "p1", epoch: deletion.capture("p1") }),
				getDeletionState: () => deletion,
			},
		})

		const seeded = await service.getOrInitNetworks()

		const raw = await rawOf(api, `${ACTIVE_NETWORK_STORAGE_ROOT}@p1`)
		expect(seeded.map((n) => n.id)).toContain(raw)
		expectDescribed("activeNetwork", raw)
	})

	test("profiles, uiFeePicks, uiSendFeePicks: ProfileService create, createPasskey and saveFeePick", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const log = logger()
		const passkeys = svc(PASSKEY_SERVICE_NAME, {
			createKey: async (userHandle: string) => ({
				credential: {
					id: `cred-${userHandle}`,
					userHandle,
					deriveMasterSecret: async () => new Uint8Array(32).fill(7),
					deriveDekWrapKey: async () =>
						crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
				},
				finish: () => {},
			}),
		})
		const service = new ProfileService(new ConfigStore(), log, api)
		const services = new ServiceCollection()
		services.add(passkeys)
		services.add(service)
		await services.start()

		const password = await service.createProfile("P", "correct horse")
		const passkey = await service.createPasskeyProfile("K")
		const passwordRow = await rawOf(api, `${PROFILE_STORAGE_ROOT}@${password.id}`)
		const passkeyRow = await rawOf(api, `${PROFILE_STORAGE_ROOT}@${passkey.id}`)
		expect(JSON.parse(passwordRow as string)).toMatchObject({ type: "password" })
		expect(JSON.parse(passkeyRow as string)).toMatchObject({ type: "passkey" })
		expectDescribed("profiles", passwordRow)
		expectDescribed("profiles", passkeyRow)

		const address = `0x${"ab".repeat(32)}`
		const other = `0x${"cd".repeat(32)}`
		const fpc = { id: "fpc-1" }
		expect(
			await service.saveFeePick(password.id, {
				kind: "app",
				address,
				pick: { type: "fpc", title: "Sponsored", subtitle: "FPC", fpc: { ...fpc, isProtocol: true } },
			}),
		).toBe(true)
		await service.saveFeePick(password.id, { kind: "app", address: other, pick: { type: "private_fpc" } })
		await service.saveFeePick(password.id, {
			kind: "send",
			address,
			side: "private",
			pick: { type: "fpc", fpc: { ...fpc, name: "Sponsor" } },
		})
		await service.saveFeePick(password.id, { kind: "send", address, side: "public", pick: { type: "fj" } })
		const app = await rawOf(api, feePicksKey(password.id))
		const send = await rawOf(api, sendFeePicksKey(password.id))
		expect(app).toMatchObject({ [address]: { title: "Sponsored", fpc: { isProtocol: true } }, [other]: { type: "private_fpc" } })
		expect(send).toMatchObject({ [address]: { private: { fpc: { name: "Sponsor" } }, public: { type: "fj" } } })
		expectDescribed("uiFeePicks", app)
		expectDescribed("uiSendFeePicks", send)
	}, 30_000)

	test("legalAccepted: LegalAcceptanceService.accept, twice so the history carries entries", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const legal = new LegalAcceptanceService(logger(), api, () => 5_000)
		await legal.accept("onboarding")
		await legal.accept("popup")
		const raw = await rawOf(api, LEGAL_ACCEPTANCE_KEY)
		expect(raw).toMatchObject({ surface: "popup", history: [{ surface: "onboarding" }, { surface: "popup" }] })
		expectDescribed("legalAccepted", raw)
	})

	test("uiPinnedTokens: usePinnedTokens.pin on two chains", async () => {
		const local = stubChromeStorage()
		const scope = { profileId: "p1", chainId: 7 }
		const pins = usePinnedTokens({ getScope: () => scope, knownContracts: () => undefined })
		await pins.pin(`0x${"a1".repeat(32)}`)
		await pins.pin(`0x${"B2".repeat(32)}`)
		scope.chainId = 9
		await pins.pin(`0x${"c3".repeat(32)}`)
		pins.dispose()
		const raw = local.data.get(pinnedTokensKey("p1"))
		expect(raw).toEqual({ "7": [`0x${"a1".repeat(32)}`, `0x${"b2".repeat(32)}`], "9": [`0x${"c3".repeat(32)}`] })
		expectDescribed("uiPinnedTokens", raw)
	})

	test("uiRestoreOutcome: armRestoreOutcome", async () => {
		const local = stubChromeStorage()
		vi.stubGlobal("navigator", { locks: { request: (_name: string, fn: () => Promise<unknown>) => fn() } })
		const run = await armRestoreOutcome("p1", "ab".repeat(32), ["net-1", "net-2", "net-1"])
		const raw = local.data.get(restoreOutcomeKey("p1"))
		expect(raw).toMatchObject({ run, networkIds: ["net-1", "net-2"] })
		expectDescribed("uiRestoreOutcome", raw)
	})

	test("the Get started flags: markGetStarted", async () => {
		const local = stubChromeStorage()
		const marks = [
			["phraseSaved", "uiGetStartedPhraseSaved", getStartedPhraseSavedKey],
			["backupSaved", "uiGetStartedBackupSaved", getStartedBackupSavedKey],
			["aztecOpened", "uiGetStartedAztecOpened", getStartedAztecOpenedKey],
			["hidden", "uiGetStartedHidden", getStartedHiddenKey],
			["feeJuiceHeld", "uiGetStartedFeeJuiceHeld", getStartedFeeJuiceHeldKey],
		] as const
		for (const [flag, name, keyOf] of marks) {
			await markGetStarted("p1", flag)
			expect(keyOf("p1")).toBe(`${(STORED_SHAPES[name].ref as { root: string }).root}@p1`)
			expectDescribed(name, local.data.get(keyOf("p1")))
		}
	})

	test("schemaVersion, schemaRunning, schemaBackup, schemaAttempts: Migrator journal, mid-run and after a failed restore", async () => {
		const prices = STORED_SHAPES.tokenPrices.ref
		const contacts = STORED_SHAPES.contacts.ref
		const store = new MemoryStorageArea().seed({
			[SCHEMA_VERSION_KEY]: BASELINE_VERSION,
			"nulo:core:token-prices": JSON.stringify({}),
			"nulo:core:contacts@1": JSON.stringify({ id: "1" }),
		})
		let restoring = false
		const area = {
			get: (keys?: string | string[]) => store.get(keys),
			remove: (keys: string | string[]) => store.remove(keys),
			set: async (items: Record<string, unknown>) => {
				if (restoring && "nulo:core:contacts@1" in items) throw new Error("disk full")
				await store.set(items)
			},
		}
		let midRun: Record<string, unknown> = {}
		const migration = defineMigration({
			version: BASELINE_VERSION + 1,
			description: "fails after its backup, then cannot restore",
			reads: [prices],
			writes: [contacts],
			up: async () => {
				midRun = await store.get()
				restoring = true
				throw new Error("boom")
			},
		})

		const result = await new Migrator({ store: area, migrations: [migration], baselineVersion: BASELINE_VERSION }).run()

		expect(result).toMatchObject({ kind: "needs-recovery" })
		expect(midRun[SCHEMA_BACKUP_KEY]).toMatchObject({ refs: [prices, contacts] })
		const after = await store.get()
		expect(after[SCHEMA_BACKUP_KEY]).toMatchObject({ counted: true })
		for (const [name, key] of [
			["schemaVersion", SCHEMA_VERSION_KEY],
			["schemaRunning", SCHEMA_RUNNING_KEY],
			["schemaBackup", SCHEMA_BACKUP_KEY],
		] as const) {
			expectDescribed(name, midRun[key])
			expectDescribed(name, after[key])
		}
		expectDescribed("schemaAttempts", after[SCHEMA_ATTEMPTS_KEY])
	})

	describe("the boot gate's statuses: createWalletRuntime over a failing registry", () => {
		/** One SW boot. A synchronous `config.load` throw stops it right after the migration outcome
		 *  is persisted, before Barretenberg or any service is touched. */
		function boot(local: MemoryStorageArea, now: number): Promise<unknown> {
			const browserApi = {
				runtime: { setUninstallURL: async () => {} },
				storage: { local, session: new MemoryStorageArea() },
			} as unknown as BrowserApi
			const clock = { now: () => now, setInterval: () => 0, clearInterval: () => {} } as unknown as ClockPort
			const config = {
				load: () => {
					throw new Error("halt")
				},
			} as unknown as ConfigStore
			const noop = { log: () => {}, applyRetentionPolicy: () => {} } as unknown as LoggerStore
			return createWalletRuntime({ browserApi, clock, config, logger: noop, manifestVersion: "1.2.3" })
				.start()
				.catch((error: unknown) => error)
		}

		test("schemaBlocked: the run-end status and the gate's gesture claim", async () => {
			const local = new MemoryStorageArea().seed({ [SCHEMA_VERSION_KEY]: BASELINE_VERSION })
			let claimed: unknown
			bootMigrations.push(
				defineMigration({
					version: BASELINE_VERSION + 1,
					description: "always fails",
					reads: [],
					writes: [],
					up: async () => {
						claimed = local.data.get(SCHEMA_BLOCKED_KEY)
						throw new Error("boom")
					},
				}),
			)
			await boot(local, 1_000)
			expectDescribed("schemaBlocked", local.data.get(SCHEMA_BLOCKED_KEY))

			local.data.set(SCHEMA_RETRY_REQUESTED_KEY, { requestedAt: 2_000 })
			await boot(local, 2_000)

			expect(claimed).toMatchObject({ gestureRuns: 1, claimedAt: 2_000 })
			expectDescribed("schemaBlocked", claimed)
			expectDescribed("schemaBlocked", local.data.get(SCHEMA_BLOCKED_KEY))
		})

		test("schemaDegraded: a failed additive tail migration", async () => {
			const local = new MemoryStorageArea().seed({ [SCHEMA_VERSION_KEY]: BASELINE_VERSION })
			bootMigrations.push(
				defineMigration({
					version: BASELINE_VERSION + 1,
					description: "additive, fails",
					breaking: false,
					reads: [],
					writes: [],
					up: async () => {
						throw new Error("boom")
					},
				}),
			)
			expect(await boot(local, 1_000)).toMatchObject({ message: "halt" })
			expect(local.data.get(SCHEMA_DEGRADED_KEY)).toMatchObject({ version: BASELINE_VERSION + 1, error: "boom" })
			expectDescribed("schemaDegraded", local.data.get(SCHEMA_DEGRADED_KEY))
		})
	})
})
