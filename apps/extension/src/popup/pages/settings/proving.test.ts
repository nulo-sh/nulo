import { Flex } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Ref } from "vue"

vi.mock("vue-router", async () => ({
	...(await vi.importActual<typeof import("vue-router")>("vue-router")),
	useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/composables/usePrestoCheck", async () => {
	const { ref } = await import("vue")
	const state = ref<{ kind: string; info?: object }>({ kind: "idle" })
	return {
		usePrestoCheck: vi.fn(() => ({ state, start: vi.fn(async () => {}), check: vi.fn(async () => {}), dispose: vi.fn() })),
		state,
	}
})
vi.mock("@/composables/usePrestoHostPermission", async () => {
	const { ref } = await import("vue")
	const missing = ref(false)
	const request = vi.fn()
	return { usePrestoHostPermission: vi.fn(() => ({ missing, request, dispose: vi.fn() })), missing, request }
})
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return { disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/execution/client", () => ({
	ExecutionServiceClient: vi.fn(function () {
		return { getLastProveOutcome: vi.fn(async () => null), disconnect: vi.fn() }
	}),
}))

import SettingsPageShell from "@/components/composite/SettingsPageShell.vue"
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import * as prestoCheck from "@/composables/usePrestoCheck"
import * as hostPermission from "@/composables/usePrestoHostPermission"
import Proving from "./proving.vue"

const state = (prestoCheck as unknown as { state: Ref<{ kind: string; info?: object }> }).state
const permission = hostPermission as unknown as { missing: Ref<boolean>; request: ReturnType<typeof vi.fn> }

/** `withHeader` renders the real shell and header, attached to the document so focus can land in it. */
const mountProving = ({ withHeader = false } = {}) =>
	mount(Proving, {
		attachTo: withHeader ? document.body : undefined,
		global: {
			components: { Flex, SettingsPageShell, SubPageHeader },
			stubs: {
				SettingsPageShell: withHeader ? false : { template: "<div><slot /></div>" },
				PrestoStatusCard: true,
				PrestoPermissionRow: {
					emits: ["allow"],
					template: `<button data-testid="presto-permission-allow" @click="$emit('allow')" />`,
				},
				ItemsContainer: { props: ["title"], template: `<section :data-title="title"><slot /></section>` },
				SettingItem: {
					inheritAttrs: false,
					props: ["title"],
					template: `<div :data-testid="$attrs['data-testid']">{{ title }}</div>`,
				},
				Text: { template: "<p><slot /></p>" },
			},
		},
	})

const sections = (w: ReturnType<typeof mountProving>) => w.findAll("section").map((s) => s.attributes("data-title"))
const NOTE = "Proofs are always generated on your machine."

afterEach(() => {
	state.value = { kind: "idle" }
	permission.missing.value = false
	permission.request.mockClear()
})

describe("settings proving", () => {
	test("hands the probe to the grant: start once allowed, check on each grant", () => {
		mountProving().unmount()
		const check = vi.mocked(prestoCheck.usePrestoCheck).mock.results.at(-1)?.value
		expect(hostPermission.usePrestoHostPermission).toHaveBeenLastCalledWith({ onFirstAllowed: check.start, onGranted: check.check })
		expect(check.start).not.toHaveBeenCalled()
	})

	test("with the grant the page is today's: the card, then Get Presto or the details, then the note", async () => {
		const w = mountProving()
		await flushPromises()
		expect(w.find("presto-status-card-stub").exists()).toBe(true)
		expect(sections(w)).toEqual(["Presto"])
		expect(w.find('[data-testid="settings-proving-get"]').exists()).toBe(true)

		state.value = { kind: "available", info: { appVersion: "1.1.1" } }
		await flushPromises()
		expect(sections(w)).toEqual(["Details"])
		expect(w.text()).toContain(NOTE)
		expect(w.find('[data-testid="presto-permission-allow"]').exists()).toBe(false)
		w.unmount()
	})

	test.each([
		["resting", { kind: "idle" }],
		["connected", { kind: "available", info: { appVersion: "1.1.1" } }],
	])("a missing grant puts the row in place of the card and the %s rows, and keeps the note", async (_label, next) => {
		state.value = next
		permission.missing.value = true
		const w = mountProving()
		await flushPromises()
		expect(w.find("presto-status-card-stub").exists()).toBe(false)
		expect(sections(w)).toEqual([])
		expect(w.text()).toContain(NOTE)

		await w.find('[data-testid="presto-permission-allow"]').trigger("click")
		expect(permission.request).toHaveBeenCalledOnce()
		w.unmount()
	})

	describe("focus when a grant takes the row away", () => {
		const focused = (w: ReturnType<typeof mountProving>, testid: string) => {
			const el = w.get(`[data-testid="${testid}"]`).element as HTMLElement
			el.focus()
			expect(document.activeElement).toBe(el)
			return el
		}

		test("from Allow, focus moves to the header's title", async () => {
			permission.missing.value = true
			const w = mountProving({ withHeader: true })
			await flushPromises()
			focused(w, "presto-permission-allow")

			permission.missing.value = false
			await flushPromises()
			expect(document.activeElement?.tagName).toBe("SPAN")
			expect(document.activeElement?.textContent).toBe("Proving")
			w.unmount()
		})

		test("from a control that stays, focus stays on it", async () => {
			permission.missing.value = true
			const w = mountProving({ withHeader: true })
			await flushPromises()
			const back = focused(w, "subpage-back")

			permission.missing.value = false
			await flushPromises()
			expect(w.find('[data-testid="presto-permission-allow"]').exists()).toBe(false)
			expect(document.activeElement).toBe(back)
			w.unmount()
		})
	})
})
