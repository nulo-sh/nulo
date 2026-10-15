import { Flex, Text } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Ref } from "vue"

const footer = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock("@/composables/snackInset", () => ({
	vSnackFooter: {
		mounted: (_: Element, { value }: { value: unknown }) => footer.values.push(value),
		updated: (_: Element, { value }: { value: unknown }) => footer.values.push(value),
	},
}))
vi.mock("@/composables/usePrestoCheck", async () => {
	const { ref } = await import("vue")
	const state = ref<{ kind: string; info?: object }>({ kind: "detecting" })
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
vi.mock("@alejoamiras/presto-banners/register", () => ({}))
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import * as prestoCheck from "@/composables/usePrestoCheck"
import * as hostPermission from "@/composables/usePrestoHostPermission"
import OnboardingSkipLink from "../components/OnboardingSkipLink.vue"
import Presto from "./presto.vue"

const state = (prestoCheck as unknown as { state: Ref<{ kind: string; info?: object }> }).state
const permission = hostPermission as unknown as { missing: Ref<boolean>; request: ReturnType<typeof vi.fn> }

const mountPresto = () =>
	mount(Presto, {
		global: {
			components: { Flex, Text, OnboardingSkipLink },
			stubs: {
				OnboardingPage: { template: "<div><slot /></div>" },
				Button: { template: '<button v-bind="$attrs"><slot /></button>' },
				StepIndicator: true,
				BrutalistTitle: true,
				SectionLabel: true,
				PrestoStatusCard: true,
				PrestoPermissionRow: {
					emits: ["allow"],
					template: `<button data-testid="presto-permission-allow" @click="$emit('allow')" />`,
				},
				"presto-banner": true,
			},
		},
	})

afterEach(() => {
	footer.values.length = 0
	state.value = { kind: "detecting" }
	permission.missing.value = false
	permission.request.mockClear()
})

describe("onboarding presto", () => {
	test("the action slot counts as the page's bottom row only while Continue or the skip link renders", async () => {
		const w = mount(Presto, {
			global: {
				components: { Flex, Text, OnboardingSkipLink },
				stubs: {
					OnboardingPage: { template: "<div><slot /></div>" },
					Button: { template: '<button v-bind="$attrs"><slot /></button>' },
					StepIndicator: true,
					BrutalistTitle: true,
					SectionLabel: true,
					PrestoStatusCard: true,
					"presto-banner": true,
				},
			},
		})
		await flushPromises()
		expect(w.find("button").exists()).toBe(false)
		expect(footer.values.at(-1)).toBe(false)

		for (const [kind, action] of [
			["offline", "onboarding-presto-skip"],
			["available", "onboarding-presto-continue"],
		]) {
			state.value = { kind, info: {} }
			await flushPromises()
			expect(w.find(`[data-testid="${action}"]`).exists()).toBe(true)
			expect(footer.values.at(-1)).toBe(true)
		}

		state.value = { kind: "detecting" }
		await flushPromises()
		expect(w.find("button").exists()).toBe(false)
		expect(footer.values.at(-1)).toBe(false)
		w.unmount()
	})

	test("hands the probe to the grant: start once allowed, check on each grant", () => {
		mountPresto().unmount()
		const check = vi.mocked(prestoCheck.usePrestoCheck).mock.results.at(-1)?.value
		expect(hostPermission.usePrestoHostPermission).toHaveBeenLastCalledWith({ onFirstAllowed: check.start, onGranted: check.check })
		expect(check.start).not.toHaveBeenCalled()
	})

	test("a missing grant puts the row in place of the pitch, the card and the note, and offers Skip", async () => {
		state.value = { kind: "available", info: {} }
		const w = mountPresto()
		await flushPromises()
		expect(w.find("presto-status-card-stub").exists()).toBe(true)
		expect(w.find('[data-testid="presto-permission-allow"]').exists()).toBe(false)

		permission.missing.value = true
		await flushPromises()
		expect(w.find("presto-status-card-stub").exists()).toBe(false)
		expect(w.text()).not.toContain("Presto will ask you to allow Nulo")
		const pitch = w.find('[data-testid="onboarding-presto-pitch"]')
		expect(pitch.exists()).toBe(true)
		expect(pitch.element.parentElement?.style.display).toBe("none")
		expect(w.find('[data-testid="onboarding-presto-continue"]').exists()).toBe(false)
		expect(w.find('[data-testid="onboarding-presto-skip"]').exists()).toBe(true)
		expect(footer.values.at(-1)).toBe(true)

		await w.find('[data-testid="presto-permission-allow"]').trigger("click")
		expect(permission.request).toHaveBeenCalledOnce()
		w.unmount()
	})
})
