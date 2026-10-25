import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { computed, effectScope, nextTick, reactive, ref } from "vue"
import {
	buildFeeMethods,
	type FeeScope,
	type GasBalances,
	isLiveFeeScope,
	type RegisteredFpc,
} from "@/popup/components/modules/send/fee-helpers"
import type { FeePickUpdate } from "@/utils/fee-picks"
import { feePicksKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import type { BalanceScope } from "@/stores/balances.store"
import { type FeeSelection, type SelectionLoad, useAppFeeSelection, useSendFeeSelection } from "./useFeeSelection"
import { useSponsorVerdicts } from "./useSponsorVerdicts"
import { readFeePicks } from "../../tests/helpers/ui-preference-fake"

const HELD = "1000000000000000000"
const AT = `0x${"0a".repeat(32)}`
const PRIVATE_FPC: RegisteredFpc = { id: "p1", type: 2, name: "Private FPC", isProtocol: true }
const SPONSOR: RegisteredFpc = { id: "s1", type: 1, name: "Sponsor", isProtocol: true, address: AT }
const HAND: RegisteredFpc = { id: "s2", type: 1, name: "Dev sponsor", isProtocol: false, address: `0x${"0b".repeat(32)}` }
const SCOPE: BalanceScope = { profileId: "p1", networkId: "n1", chainId: 1, accountAddress: "0xa" }

/** The preference client: picks read from `storage`, keyed as the service keys its rows; saves recorded. */
class PreferenceClient {
	readonly saved: Array<[string, FeePickUpdate]> = []
	readonly getFeePicks = vi.fn((profileId: string) =>
		readFeePicks(
			{ get: async (keys) => Object.fromEntries(keys.filter((k) => k in storage).map((k) => [k, structuredClone(storage[k])])) },
			profileId,
		),
	)
	async saveFeePick(profileId: string, update: FeePickUpdate) {
		this.saved.push([profileId, update])
		return true
	}
}

let storage: Record<string, unknown>

beforeEach(() => {
	storage = {}
})

afterEach(() => {
	vi.restoreAllMocks()
})

type Mode = { origin: "private" | "public" } | { lockedMethod?: string; fallsBack?: boolean }

function setup(mode: Mode, fpcs: RegisteredFpc[] = [PRIVATE_FPC, SPONSOR]) {
	const props = reactive({
		profile: { id: "p1" },
		network: { id: "n1", chainId: 1 },
		account: { address: "0xa" },
		originPrivacy: "origin" in mode ? mode.origin : null,
		lockedMethod: "lockedMethod" in mode ? (mode.lockedMethod ?? null) : null,
		fallsBack: "fallsBack" in mode ? Boolean(mode.fallsBack) : false,
	})
	const isInitComplete = ref(false)
	const gasBalances = ref<GasBalances | undefined>(undefined)
	const committedScope = ref<BalanceScope | null>(null)
	const scopeIsLiveIdentity = (scope: FeeScope | null) => Boolean(scope) && isLiveFeeScope(props, scope as FeeScope)
	const snapshot = {
		isInitComplete,
		gasBalances,
		committedScope,
		snapshotCommitted: computed(() => isInitComplete.value && scopeIsLiveIdentity(committedScope.value)),
		scopeIsLiveIdentity,
	}
	const client = new PreferenceClient()
	const scope = effectScope()
	const built = scope.run(() => {
		const verdicts = useSponsorVerdicts({ isEstimating: () => false })
		const knownFpcs = ref(fpcs)
		const methods = computed(() =>
			buildFeeMethods(knownFpcs.value, isInitComplete.value ? gasBalances.value : undefined, {
				shortSponsorIds: verdicts.shortSponsorIds,
				setAsideSponsorIds: verdicts.setAsideSponsorIds,
			}),
		)
		const input = {
			props,
			snapshot,
			verdicts,
			knownFpcs,
			methods,
			getFeePicks: (profileId: string) => client.getFeePicks(profileId),
			saveFeePick: (profileId: string, update: FeePickUpdate) => client.saveFeePick(profileId, update),
		}
		const rules =
			"origin" in mode
				? useSendFeeSelection({ ...input, origin: () => props.originPrivacy as "private" | "public" })
				: useAppFeeSelection({ ...input, lockedMethod: () => props.lockedMethod, fallsBack: () => props.fallsBack })
		return { rules, verdicts, methods, knownFpcs }
	})
	if (!built) throw new Error("no scope")
	/** The snapshot's run: the selection read, then the commit with the reconcile inside it. */
	const commit = async (gas: GasBalances | undefined, load?: SelectionLoad | null) => {
		const read = load === undefined ? await built.rules.load(SCOPE, () => true) : load
		gasBalances.value = gas
		if (read) built.rules.reconcile(read, SCOPE)
		committedScope.value = { ...SCOPE }
		isInitComplete.value = true
	}
	const row = (type: string, id?: string) => built.methods.value.find((m) => m.type === type && m.fpc?.id === id)
	return { ...built, props, snapshot, client, commit, row, stop: () => scope.stop() }
}

const type = (r: FeeSelection) => r.effectiveMethod.value?.type
const fpcId = (r: FeeSelection) => r.effectiveMethod.value?.fpc?.id

describe("Send's rule book", () => {
	test("while the snapshot loads, the saved pick's row is a preview and nothing pays", async () => {
		storage[sendFeePicksKey("p1")] = { "0xa": { private: { type: "fpc", fpc: { id: "s1" } } } }
		const t = setup({ origin: "private" })
		await t.rules.load(SCOPE, () => true)
		expect(t.rules.previewMethod.value?.fpc?.id).toBe("s1")
		expect(t.rules.effectiveMethod.value).toBeUndefined()

		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: "0" }, null)
		expect(t.rules.previewMethod.value).toBeUndefined()
		expect(fpcId(t.rules)).toBe("s1")
		t.stop()
	})

	test("a pending selection keeps its cached result while unread identity fields change", async () => {
		const t = setup({ origin: "private" })
		if (!("selection" in t.rules)) throw new Error("not Send's rule book")
		const { selection } = t.rules as ReturnType<typeof useSendFeeSelection>
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: "0" })
		expect(selection.value.kind).toBe("selected")
		t.props.profile.id = "p2"
		t.snapshot.isInitComplete.value = false
		await nextTick()
		const pending = selection.value
		expect(pending.kind).toBe("pending")
		t.props.network.chainId = 222
		t.props.network.id = "n2"
		await nextTick()
		expect(selection.value).toBe(pending)
		t.stop()
	})

	test("the selection follows the live origin", async () => {
		const t = setup({ origin: "private" })
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		expect(type(t.rules)).toBe("private_fpc")
		t.props.originPrivacy = "public"
		expect(type(t.rules)).toBe("fj")
		t.stop()
	})

	test("a pick is saved for the profile, address and side it was made on, and holds only on that side", async () => {
		const t = setup({ origin: "private" })
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		t.rules.pick(t.row("fpc", "s1")!)
		t.props.originPrivacy = "public"
		await Promise.resolve()
		expect(t.client.saved).toEqual([
			["p1", { kind: "send", address: "0xa", side: "private", pick: { type: "fpc", fpc: { id: "s1", name: "Sponsor" } } }],
		])
		expect(type(t.rules)).toBe("fj")
		t.props.originPrivacy = "private"
		expect(fpcId(t.rules)).toBe("s1")
		t.stop()
	})

	test("the load merges saved picks under the mount's own, and hands back nothing once superseded", async () => {
		storage[sendFeePicksKey("p1")] = { "0xa": { private: { type: "fj" }, public: { type: "fpc", fpc: { id: "s1" } } } }
		const t = setup({ origin: "private" })
		t.rules.pick(t.row("private_fpc", "p1")!)
		expect(await t.rules.load(SCOPE, () => false)).toBeNull()
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: HELD }, null)
		expect(type(t.rules)).toBe("private_fpc")
		t.props.originPrivacy = "public"
		expect(fpcId(t.rules)).toBe("s1")
		expect(await t.rules.load(SCOPE, () => true)).toEqual({ saved: {}, baseline: null })
		t.stop()
	})

	test("a recovery reads nothing, where the app windows' reads their saved picks", async () => {
		const send = setup({ origin: "private" })
		expect(await send.rules.reload(SCOPE)).toEqual({ saved: {}, baseline: null })
		expect(send.client.getFeePicks).not.toHaveBeenCalled()

		const app = setup({})
		await app.rules.reload(SCOPE)
		expect(app.client.getFeePicks).toHaveBeenCalledWith("p1")
		send.stop()
		app.stop()
	})

	test("held when the private default cannot be established on a confirmed read", async () => {
		const t = setup({ origin: "private" }, [PRIVATE_FPC])
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		expect(t.rules.held.value).toBe(true)
		expect(t.rules.effectiveMethod.value).toBeUndefined()
		t.props.originPrivacy = "public"
		expect(t.rules.held.value).toBe(false)
		t.stop()
	})

	test("a short verdict counts against the sponsor the selection names without the verdicts", async () => {
		storage[sendFeePicksKey("p1")] = { "0xa": { public: { type: "fpc", fpc: { id: "s1" } } } }
		const t = setup({ origin: "public" }, [PRIVATE_FPC, SPONSOR, HAND])
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: "0" })
		t.verdicts.shortSponsorIds.add("s2")
		expect(t.rules.sponsorShort.value).toBe(false)
		t.verdicts.shortSponsorIds.add("s1")
		t.verdicts.setAsideSponsorIds.add("s1")
		expect(t.rules.sponsorShort.value).toBe(true)
		expect(type(t.rules)).toBe("fj")
		t.stop()
	})

	test.each([
		{ gas: { publicFeeJuice: "0", privateFeeJuice: "0" }, missing: true },
		{ gas: { publicFeeJuice: null, privateFeeJuice: "0" }, missing: false },
	])("the nudge holds only when every payer was read empty: $gas", async ({ gas, missing }) => {
		const t = setup({ origin: "private" }, [PRIVATE_FPC])
		await t.commit(gas)
		expect(t.rules.feeJuiceMissing.value).toBe(missing)
		t.stop()
	})

	test("a short verdict, an FPC edit or a deletion leaves Send's derived selection to itself", async () => {
		const t = setup({ origin: "public" })
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: HELD })
		const before = t.rules.effectiveMethod.value
		expect(t.rules.onShort("s1")).toBe(false)
		t.rules.fpcUpdated({ ...SPONSOR, isProtocol: false })
		t.rules.fpcDeleted()
		expect(t.rules.effectiveMethod.value).toBe(before)
		expect(t.rules.forceRefresh()).toBe(true)
		t.stop()
	})
})

describe("the app windows' rule book", () => {
	test.each([
		{ case: "a lock", mode: { lockedMethod: "fj" }, saved: { type: "fpc", fpc: { id: "s1" } }, shows: "fj" },
		{ case: "a saved pick", mode: {}, saved: { type: "fpc", title: "Sponsor", fpc: { id: "s1" } }, shows: "fpc" },
		{ case: "nothing saved", mode: {}, saved: undefined, shows: undefined },
	])("the load pre-fills from $case before the snapshot lands", async ({ mode, saved, shows }) => {
		if (saved) storage[feePicksKey("p1")] = { "0xa": saved }
		const t = setup(mode)
		const load = await t.rules.load(SCOPE, () => true)
		expect(type(t.rules)).toBe(shows)
		expect(load?.baseline?.method).toBe(t.rules.effectiveMethod.value)
		t.stop()
	})

	test("a superseded load pre-fills nothing", async () => {
		storage[feePicksKey("p1")] = { "0xa": { type: "fj" } }
		const t = setup({})
		expect(await t.rules.load(SCOPE, () => false)).toBeNull()
		expect(t.rules.effectiveMethod.value).toBeUndefined()
		t.stop()
	})

	test("the reconcile: a lock wins, then a pick made meanwhile, then the saved pick, then the default", async () => {
		const locked = setup({ lockedMethod: "fj" })
		await locked.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		expect(type(locked.rules)).toBe("fj")

		const touched = setup({})
		const load = await touched.rules.load(SCOPE, () => true)
		touched.rules.pick({ type: "fpc", title: "Sponsor", subtitle: "sponsored", fpc: { id: "s1", type: 1 } })
		await touched.commit({ publicFeeJuice: HELD, privateFeeJuice: null }, load)
		// Read again from the snapshot's row, which carries the sponsor's current metadata.
		expect(touched.rules.effectiveMethod.value).toEqual(touched.row("fpc", "s1"))
		expect(touched.rules.effectiveMethod.value?.fpc?.address).toBe(AT)

		storage[feePicksKey("p1")] = { "0xa": { type: "fj" } }
		const saved = setup({})
		await saved.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		expect(type(saved.rules)).toBe("fj")

		storage = {}
		const fallback = setup({})
		await fallback.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		expect(fpcId(fallback.rules)).toBe("s1")
		for (const t of [locked, touched, saved, fallback]) t.stop()
	})

	test("a pick is saved as an app pick for the live account", async () => {
		const t = setup({})
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		t.rules.pick(t.row("fj")!)
		await Promise.resolve()
		expect(t.client.saved).toEqual([
			["p1", { kind: "app", address: "0xa", pick: { type: "fj", title: "Public Fee Juice", subtitle: "public" } }],
		])
		t.stop()
	})

	test.each([
		{ fallsBack: true, next: "fj" },
		{ fallsBack: false, next: undefined },
	])(
		"a short verdict on the paying sponsor drops it (fallsBack $fallsBack), and sponsorShort follows the drop",
		async ({ fallsBack, next }) => {
			const t = setup({ fallsBack })
			await t.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
			expect(fpcId(t.rules)).toBe("s1")
			expect(t.rules.onShort("s2")).toBe(false)
			t.verdicts.shortSponsorIds.add("s1")
			t.verdicts.setAsideSponsorIds.add("s1")
			expect(t.rules.onShort("s1")).toBe(true)
			expect(type(t.rules)).toBe(next)
			expect(t.rules.sponsorShort.value).toBe(false)
			t.verdicts.droppedForVerdictId.value = "s1"
			expect(t.rules.sponsorShort.value).toBe(true)
			t.stop()
		},
	)

	test("the nudge: the selected Fee Juice read as zero, or no payer left on the public walk", async () => {
		const zero = setup({}, [])
		await zero.commit({ publicFeeJuice: "0", privateFeeJuice: null })
		zero.rules.pick(zero.row("fj")!)
		expect(zero.rules.feeJuiceMissing.value).toBe(true)

		const walk = setup({}, [HAND])
		await walk.commit({ publicFeeJuice: "0", privateFeeJuice: null })
		expect(walk.rules.effectiveMethod.value).toBeUndefined()
		expect(walk.rules.feeJuiceMissing.value).toBe(true)
		walk.rules.pick(walk.row("fpc", "s2")!)
		expect(walk.rules.feeJuiceMissing.value).toBe(false)
		zero.stop()
		walk.stop()
	})

	test("an FPC edit drops a default whose row became custom, and carries a picked row's edit", async () => {
		const defaulted = setup({})
		await defaulted.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		defaulted.rules.fpcUpdated({ ...SPONSOR, isProtocol: false })
		expect(defaulted.rules.effectiveMethod.value).toBeUndefined()

		const picked = setup({})
		await picked.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		picked.rules.pick(picked.row("fpc", "s1")!)
		const edited = { ...SPONSOR, isProtocol: false, address: `0x${"0c".repeat(32)}` }
		picked.rules.fpcUpdated(edited)
		expect(picked.rules.effectiveMethod.value?.fpc).toEqual(edited)
		defaulted.stop()
		picked.stop()
	})

	test("deleting the paying row clears the selection", async () => {
		const t = setup({})
		await t.commit({ publicFeeJuice: HELD, privateFeeJuice: null })
		expect(fpcId(t.rules)).toBe("s1")
		t.rules.fpcDeleted()
		expect(t.rules.effectiveMethod.value).toBeUndefined()
		t.stop()
	})

	test("a locked mount reads fresh; an unlocked one may use the reader's snapshot", () => {
		const locked = setup({ lockedMethod: "fj" })
		const unlocked = setup({})
		expect(locked.rules.forceRefresh()).toBe(true)
		expect(unlocked.rules.forceRefresh()).toBe(false)
		expect(unlocked.rules.held.value).toBe(false)
		expect(unlocked.rules.previewMethod.value).toBeUndefined()
		locked.stop()
		unlocked.stop()
	})
})
