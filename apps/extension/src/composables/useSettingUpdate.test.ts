import { flushPromises } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { type Ref, ref } from "vue"
import type { ConfigKey } from "@/wallet/config"
import { useSettingUpdate } from "./useSettingUpdate"

const fakes = vi.hoisted(() => ({ openToast: vi.fn() }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: fakes.openToast }) }))

const FAILED = { kind: "error", label: "Failed to update setting" }

type Rows = Record<string, { model: Ref<unknown> }>

/** A page's rows over a config client whose writes stay pending until the test settles them. */
function harness(rows: Rows, apply?: (key: ConfigKey, value: unknown) => unknown) {
	const writes: { key: string; value: unknown; settle: PromiseWithResolvers<void> }[] = []
	const setValue = vi.fn((key: string, value: unknown) => {
		const settle = Promise.withResolvers<void>()
		writes.push({ key, value, settle })
		return settle.promise
	})
	const applySetting = vi.fn(
		apply ??
			((key: ConfigKey, value: unknown) => {
				rows[key].model.value = value
			}),
	)
	const { updateSetting } = useSettingUpdate({ setValue } as never, rows, applySetting)
	return { setValue, applySetting, updateSetting, writes }
}

/** Settles each write as it arrives, a re-entered one included, in the order they were asked. */
async function storeEach(writes: { settle: PromiseWithResolvers<void> }[]) {
	for (let i = 0; i < writes.length; i++) {
		writes[i].settle.resolve()
		await flushPromises()
	}
}

beforeEach(() => fakes.openToast.mockReset())

describe("useSettingUpdate", () => {
	test("a key the page has no row for writes nothing", async () => {
		const h = harness({ theme: { model: ref("dark") } })
		await h.updateSetting("privacyMode", true)
		expect(h.setValue).not.toHaveBeenCalled()
		expect(h.applySetting).not.toHaveBeenCalled()
	})

	test.each([
		["theme", "dark"],
		["defaultExplorer", null],
	] as const)("a row already showing the value writes nothing (%s: %s)", async (key, value) => {
		const h = harness({ [key]: { model: ref(value) } })
		await h.updateSetting(key, value)
		expect(h.setValue).not.toHaveBeenCalled()
		expect(h.applySetting).not.toHaveBeenCalled()
	})

	test("a new value is written once, then applied with its key, and toasts nothing", async () => {
		const rows = { defaultExplorer: { model: ref<unknown>("aztecscan") } }
		const h = harness(rows)
		const done = h.updateSetting("defaultExplorer", null)
		h.writes[0].settle.resolve()
		await done
		expect(h.setValue).toHaveBeenCalledExactlyOnceWith("defaultExplorer", null)
		expect(h.applySetting).toHaveBeenCalledExactlyOnceWith("defaultExplorer", null)
		expect(rows.defaultExplorer.model.value).toBeNull()
		expect(fakes.openToast).not.toHaveBeenCalled()
	})

	test("nothing is applied while the write is pending", async () => {
		const rows = { showFiatValues: { model: ref<unknown>(true) } }
		const h = harness(rows)
		void h.updateSetting("showFiatValues", false)
		await flushPromises()
		expect(h.setValue).toHaveBeenCalledOnce()
		expect(h.applySetting).not.toHaveBeenCalled()
		expect(rows.showFiatValues.model.value).toBe(true)
	})

	test("a refused write toasts the failure and applies nothing", async () => {
		const rows = { showFiatValues: { model: ref<unknown>(true) } }
		const h = harness(rows)
		const done = h.updateSetting("showFiatValues", false)
		h.writes[0].settle.reject(new Error("persist failed"))
		await done
		expect(fakes.openToast).toHaveBeenCalledExactlyOnceWith(FAILED)
		expect(h.applySetting).not.toHaveBeenCalled()
		expect(rows.showFiatValues.model.value).toBe(true)
	})

	test("after a refused write, asking again writes again", async () => {
		const rows = { showFiatValues: { model: ref<unknown>(true) } }
		const h = harness(rows)
		const first = h.updateSetting("showFiatValues", false)
		h.writes[0].settle.reject(new Error("persist failed"))
		await first
		const second = h.updateSetting("showFiatValues", false)
		h.writes[1].settle.resolve()
		await second
		expect(h.setValue).toHaveBeenCalledTimes(2)
		expect(rows.showFiatValues.model.value).toBe(false)
	})

	test("the write settles without waiting for the apply", async () => {
		const applied = Promise.withResolvers<void>()
		const h = harness({ sidePanel: { model: ref<unknown>(false) } }, () => applied.promise)
		const done = h.updateSetting("sidePanel", true)
		h.writes[0].settle.resolve()
		await expect(done).resolves.toBeUndefined()
		expect(h.applySetting).toHaveBeenCalledOnce()
		applied.resolve()
	})

	test("a second ask before the first write settles writes again, since the row moves only once stored", async () => {
		const rows = { showFiatValues: { model: ref<unknown>(true) } }
		const h = harness(rows)
		void h.updateSetting("showFiatValues", false)
		void h.updateSetting("showFiatValues", false)
		await storeEach(h.writes)
		expect(h.setValue).toHaveBeenCalledTimes(2)
		expect(h.applySetting).toHaveBeenCalledTimes(2)
		expect(rows.showFiatValues.model.value).toBe(false)
	})

	test("an apply may ask for another row, whose write follows the one that applied", async () => {
		const rows: Rows = { developerMode: { model: ref(true) }, indicateFailures: { model: ref(true) } }
		const h = harness(rows, (key, value) => {
			rows[key].model.value = value
			if (key === "developerMode") void h.updateSetting("indicateFailures", value as boolean)
		})
		void h.updateSetting("developerMode", false)
		await storeEach(h.writes)
		expect(h.setValue.mock.calls).toEqual([
			["developerMode", false],
			["indicateFailures", false],
		])
		expect(rows.indicateFailures.model.value).toBe(false)
	})
})
