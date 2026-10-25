import { describe, expect, test, vi } from "vitest"
import { computed, effectScope, nextTick, ref, type Ref } from "vue"
import type { FeeMethodOption } from "@/popup/components/modules/send/fee-helpers"
import { type SponsorFundingVerdict, useSponsorVerdicts, watchSponsorVerdicts } from "./useSponsorVerdicts"

const AT = `0x${"0a".repeat(32)}`
const OTHER_AT = `0x${"0b".repeat(32)}`
const sponsor = (id: string, address = AT): FeeMethodOption => ({
	type: "fpc",
	title: id,
	subtitle: "sponsored",
	fpc: { id, type: 1, isProtocol: true, address },
})
const FJ: FeeMethodOption = { type: "fj", title: "Public Fee Juice", subtitle: "public" }

function setup(
	opts: { rows?: FeeMethodOption[]; payer?: (v: ReturnType<typeof useSponsorVerdicts>) => Ref<FeeMethodOption | undefined> } = {},
) {
	const verdict = ref<SponsorFundingVerdict | null>(null)
	const txShape = ref("tx0")
	const priority = ref("normal")
	const isEstimating = ref(false)
	const rows = ref<FeeMethodOption[]>(opts.rows ?? [sponsor("s1"), sponsor("s2", OTHER_AT), FJ])
	const onShort = vi.fn((_: string) => false)
	const scope = effectScope()
	const out = scope.run(() => {
		const v = useSponsorVerdicts({ isEstimating: () => isEstimating.value })
		const payer = opts.payer ? opts.payer(v) : ref<FeeMethodOption | undefined>(undefined)
		watchSponsorVerdicts(v, { verdict, txShape, priority, isEstimating: () => isEstimating.value, rows, payer, onShort })
		return { v, payer }
	})
	if (!out) throw new Error("no scope")
	const say = async (fpcId: string, funded: boolean, address = AT) => {
		verdict.value = { fpcId, address, funded }
		await nextTick()
	}
	return { ...out, verdict, txShape, priority, isEstimating, rows, onShort, scope, say }
}

describe("useSponsorVerdicts", () => {
	test("a verdict counts only for a listed sponsor row at the address it was read for", async () => {
		const t = setup()
		await t.say("s9", false)
		await t.say("s2", false, AT)
		expect([...t.v.shortSponsorIds]).toEqual([])
		expect(t.v.lastVerdict.value).toBeNull()
		expect(t.onShort).not.toHaveBeenCalled()
		await t.say("s1", false)
		expect([...t.v.shortSponsorIds]).toEqual(["s1"])
		expect(t.v.lastVerdict.value).toEqual({ fpcId: "s1", funded: false })
		t.scope.stop()
	})

	test("a short verdict fills both sets and asks onShort; a funded one clears both", async () => {
		const t = setup()
		await t.say("s1", false)
		expect(t.onShort).toHaveBeenCalledWith("s1")
		expect([...t.v.shortSponsorIds]).toEqual(["s1"])
		expect([...t.v.setAsideSponsorIds]).toEqual(["s1"])
		expect(t.v.droppedForVerdictId.value).toBeNull()

		await t.say("s1", true)
		expect([...t.v.shortSponsorIds]).toEqual([])
		expect([...t.v.setAsideSponsorIds]).toEqual([])
		expect(t.v.lastVerdict.value).toEqual({ fpcId: "s1", funded: true })
		t.scope.stop()
	})

	test("a drop is recorded only when onShort dropped the selection", async () => {
		const t = setup()
		t.onShort.mockReturnValue(true)
		await t.say("s1", false)
		expect(t.v.droppedForVerdictId.value).toBe("s1")
		t.scope.stop()
	})

	test("a pick takes its sponsor off the set-aside list and ends a drop; an address edit clears its short", async () => {
		const t = setup()
		t.onShort.mockReturnValue(true)
		await t.say("s1", false)
		t.v.picked(sponsor("s1"))
		expect([...t.v.setAsideSponsorIds]).toEqual([])
		expect(t.v.droppedForVerdictId.value).toBeNull()
		expect([...t.v.shortSponsorIds]).toEqual(["s1"])
		t.v.addressEdited("s1")
		expect([...t.v.shortSponsorIds]).toEqual([])
		t.scope.stop()
	})

	test.each([
		["priority", (t: ReturnType<typeof setup>) => (t.priority.value = "fast")],
		["transaction", (t: ReturnType<typeof setup>) => (t.txShape.value = "tx1")],
	])("a new %s clears the shorts and nothing else", async (_, change) => {
		const t = setup()
		await t.say("s1", false)
		change(t)
		await nextTick()
		expect([...t.v.shortSponsorIds]).toEqual([])
		expect([...t.v.setAsideSponsorIds]).toEqual(["s1"])
		expect(t.v.lastVerdict.value).toEqual({ fpcId: "s1", funded: false })
		t.scope.stop()
	})

	test("a new transaction arms the re-check only for a paying sponsor row", async () => {
		const t = setup()
		t.payer.value = FJ
		t.txShape.value = "tx1"
		await nextTick()
		expect(t.v.recheckFpcId.value).toBeNull()

		t.payer.value = sponsor("s1")
		await nextTick()
		t.txShape.value = "tx2"
		t.isEstimating.value = true
		await nextTick()
		expect(t.v.recheckFpcId.value).toBe("s1")
		expect(t.v.verifyingSponsorId.value).toBe("s1")
		t.scope.stop()
	})

	test.each([
		["the payer moves off it", async (t: ReturnType<typeof setup>) => (t.payer.value = FJ)],
		["the estimate ends", async (t: ReturnType<typeof setup>) => (t.isEstimating.value = false)],
		["a verdict for it lands", (t: ReturnType<typeof setup>) => t.say("s1", true)],
	])("the re-check disarms when %s", async (_, disarm) => {
		const t = setup()
		t.payer.value = sponsor("s1")
		t.isEstimating.value = true
		await nextTick()
		t.txShape.value = "tx1"
		await nextTick()
		expect(t.v.recheckFpcId.value).toBe("s1")
		await disarm(t)
		await nextTick()
		expect(t.v.recheckFpcId.value).toBeNull()
		expect(t.v.verifyingSponsorId.value).toBeNull()
		t.scope.stop()
	})

	test("forget clears every verdict", async () => {
		const t = setup()
		t.onShort.mockReturnValue(true)
		t.payer.value = sponsor("s2", OTHER_AT)
		await nextTick()
		t.txShape.value = "tx1"
		await t.say("s1", false)
		expect(t.v.recheckFpcId.value).toBe("s2")
		t.v.forget()
		expect([...t.v.shortSponsorIds]).toEqual([])
		expect([...t.v.setAsideSponsorIds]).toEqual([])
		expect(t.v.lastVerdict.value).toBeNull()
		expect(t.v.droppedForVerdictId.value).toBeNull()
		expect(t.v.recheckFpcId.value).toBeNull()
		t.scope.stop()
	})

	test("a new transaction while the paying sponsor is short re-checks it: the shorts clear before the arm", async () => {
		// The payer resolves past a short sponsor, as Send's selection does.
		const t = setup({ payer: (v) => computed(() => (v.shortSponsorIds.has("s1") ? FJ : sponsor("s1"))) })
		await t.say("s1", false)
		expect(t.payer.value).toBe(FJ)
		t.txShape.value = "tx1"
		await nextTick()
		expect(t.v.recheckFpcId.value).toBe("s1")
		t.scope.stop()
	})
})
