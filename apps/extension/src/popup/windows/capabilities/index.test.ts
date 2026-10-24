/**
 * The capabilities approval window on the shared approval shell, whose own contracts
 * `composables/useDappApprovalWindow.test.ts` pins. This file pins what the window adds to it: the
 * services it connects and the order it disconnects them (A1, A5), an init the shell gates and
 * waits for, the profile fetch then the payload load (A2, A4, a throwing init included), its
 * overlay dismiss and its reject routed through the shell's close (A6, B8), the reject it still
 * sends with no request id, where execute and discover bail (B9), the profile guard it subscribes
 * (C12) and how a refused approve reads. Then the window's own business: the account picker's
 * widening consent, and the permission rows with the answer they produce.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Icon, RowAction, Toggle } from "@nulo/design"
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { type DOMWrapper, flushPromises, mount } from "@vue/test-utils"
import {
	approval,
	beforeunloadAdds,
	beforeunloadRemoves,
	callLog,
	completeInit,
	getActiveProfileMock,
	installWindowSpies,
	onActiveProfileChangedAddMock,
	rejectViaInteractionServiceMock,
	resetWindowHarness,
	windowsRemoveMock,
} from "../../../../tests/helpers/approval-window-harness"

const resolveInteractionMock = vi.fn(async () => undefined)
const copyWithToastMock = vi.fn(async (..._args: unknown[]) => true)
vi.mock("@/utils/clipboard", () => ({
	copyWithToast: (...args: unknown[]) => copyWithToastMock(...args),
}))

vi.mock(
	"@/composables/useDappInteractionPayload",
	async () => (await import("../../../../tests/helpers/approval-window-harness")).payloadModule,
)
vi.mock(
	"@/wallet/services/profile/client",
	async () => (await import("../../../../tests/helpers/approval-window-harness")).profileClientModule,
)
vi.mock("@/wallet/services/dapp-interaction/client", async () =>
	(await import("../../../../tests/helpers/approval-window-harness")).interactionClientModule(() => ({
		resolveInteraction: resolveInteractionMock,
	})),
)
vi.mock("@/stores/app.store", async () => (await import("../../../../tests/helpers/approval-window-harness")).appStoreModule)
vi.mock("vue-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("vue-router")>()),
	...(await import("../../../../tests/helpers/approval-window-harness")).routerModule,
}))

beforeEach(() => {
	installWindowSpies()
	approval.appStore.networks = []
})

let w: ReturnType<typeof factory> | undefined

afterEach(() => {
	// Unmount first, so the window's listener removal goes through the spy.
	w?.unmount()
	w = undefined
	resetWindowHarness()
})

// ── Stubs (children flattened; overlay stub re-emits dismiss on click) ──

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Tooltip: { template: "<div><slot /></div>" },
	Button: {
		props: ["disabled", "loading"],
		emits: ["click"],
		template: `
			<button
				:data-testid="$attrs['data-testid']"
				:disabled="disabled || loading"
				@click="$emit('click', $event)"
			>
				<slot />
			</button>
		`,
	},
	SectionLabel: { template: "<div />" },
	ItemsContainer: { template: "<div><slot /></div>" },
	PermissionRow: { template: "<div />" },
	AccountSelectRow: { template: "<div />" },
	DappStatusStrip: { template: '<div data-testid="status-strip" />', props: ["accountName", "networkName", "status"] },
	DappIdentityBlock: {
		template: '<div data-testid="identity-block" />',
		props: ["dapp", "actionLabel"],
	},
	DappCancelledOverlay: {
		props: ["message"],
		emits: ["dismiss"],
		template: `<div data-testid="cancelled-overlay" :data-message="message" @click="$emit('dismiss')" />`,
	},
}

// Lazy import after vi.mock hoist
import PermissionRow from "@/components/composite/capabilities/PermissionRow.vue"
import Capabilities from "./index.vue"

const factory = () => mount(Capabilities, { global: { stubs: STUBS } })

type CapVm = { reject: (end: "reject") => Promise<void>; closeWindow: (interactionCompleted?: boolean) => void }

describe("capabilities window — shell lifecycle frozen oracle", () => {
	test("A1: onMounted eager-connects exactly profile → interaction, in order", async () => {
		w = factory()
		await flushPromises()
		expect(callLog.filter((c) => c.endsWith(".connect"))).toEqual(["profile.connect", "interaction.connect"])
	})

	test("A2: session gate — init and beforeunload wait for isSessionChecked", async () => {
		approval.appStore.isSessionChecked = false
		w = factory()
		await flushPromises()
		expect(getActiveProfileMock).not.toHaveBeenCalled()
		expect(beforeunloadAdds()).toBe(0)
		approval.appStore.isSessionChecked = true
		await flushPromises()
		expect(getActiveProfileMock).toHaveBeenCalledTimes(1)
	})

	test("A4: beforeunload is added AFTER init resolves — exactly once", async () => {
		w = factory()
		await flushPromises()
		// init is suspended on getActiveProfile — listener must not exist yet.
		expect(beforeunloadAdds()).toBe(0)
		approval.resolveProfile?.({ id: "p1" })
		await flushPromises()
		// Still inside init (payload load pending).
		expect(beforeunloadAdds()).toBe(0)
		approval.resolveLoad?.()
		await flushPromises()
		expect(beforeunloadAdds()).toBe(1)
	})

	test("A4: beforeunload is STILL added when init throws internally", async () => {
		// init swallows its own errors into the error strip; the listener must be
		// registered anyway so a failed popup still rejects the request on close.
		w = factory()
		await flushPromises()
		const failure = new Error("profile-fetch-failed")
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			approval.rejectProfile?.(failure)
			await flushPromises()
			expect(logged.mock.calls).toEqual([["Capabilities window init failed", { error: failure }]])
		} finally {
			logged.mockRestore()
		}
		expect(beforeunloadAdds()).toBe(1)
		expect(w.find('[data-testid="error-text"]').exists()).toBe(true)
	})

	test("A5: unmount disconnect ORDER verbatim — profile, interaction, listener removal LAST", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		w.unmount()
		w = undefined
		expect(callLog).toEqual(["profile.disconnect", "interaction.disconnect", "removeEventListener:beforeunload"])
	})

	test("A6: overlay @dismiss wires to closeWindow() with NO arg — listener stays attached", async () => {
		w = factory()
		await completeInit()
		approval.isCancelled.value = true
		await w.vm.$nextTick()
		const overlay = w.find('[data-testid="cancelled-overlay"]')
		expect(overlay.exists()).toBe(true)
		await overlay.trigger("click")
		// Dismiss closes WITHOUT detaching beforeunload — the rejection is
		// deliberately delivered by the unload event, not a direct call.
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
		expect(beforeunloadRemoves()).toBe(0)
	})

	test("B8: window-local reject() detaches the unload listener, sends its end, THEN closes — order pinned", async () => {
		w = factory()
		await completeInit()
		callLog.length = 0
		await (w.vm as unknown as CapVm).reject("reject")
		expect(callLog).toEqual(["removeEventListener:beforeunload", "composableReject:User rejected:reject", "windows.remove"])
	})

	test("B9 (DIVERGENCE): reject() with NO requestId still closes + detaches the listener", async () => {
		// capabilities' reject() guards only on isInteractionCancelled — unlike
		// execute/discover, which also bail on !requestId. With requestId undefined
		// the composable-level reject is an internal no-op, but capabilities still
		// invokes it and still runs closeWindow(true). Preserved verbatim — a shell
		// must reproduce this asymmetry or get owner sign-off to normalize it.
		w = factory()
		await flushPromises()
		expect(approval.requestId.value).toBeUndefined()
		await (w.vm as unknown as CapVm).reject("reject")
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledWith("User rejected", "reject")
		expect(beforeunloadRemoves()).toBe(1)
		expect(windowsRemoveMock).toHaveBeenCalledTimes(1)
	})

	test("C12: onActiveProfileChanged — undefined or different id rejects; same id is a no-op", async () => {
		w = factory()
		// Registered synchronously during setup, before the mounted hook.
		expect(onActiveProfileChangedAddMock).toHaveBeenCalledTimes(1)
		const handler = onActiveProfileChangedAddMock.mock.calls[0][0] as (p?: { id: string }) => void
		await completeInit({ id: "p1" })
		handler({ id: "p1" })
		await flushPromises()
		expect(rejectViaInteractionServiceMock).not.toHaveBeenCalled()
		expect(windowsRemoveMock).not.toHaveBeenCalled()
		handler({ id: "p-other" })
		await flushPromises()
		expect(rejectViaInteractionServiceMock).toHaveBeenLastCalledWith("User rejected", "switch")
		handler(undefined)
		await flushPromises()
		expect(rejectViaInteractionServiceMock).toHaveBeenLastCalledWith("User rejected", "lock")
		expect(rejectViaInteractionServiceMock).toHaveBeenCalledTimes(2)
	})

	test("a raced approve refused with JobCancelledError classifies as CANCELLED, not an error", async () => {
		resolveInteractionMock.mockRejectedValueOnce(new JobCancelledError())
		// Minimal payload so init() reaches initComplete (empty delta = no account gating).
		approval.payloadToLoad = { params: { delta: [], existingGrants: [] }, session: { chainId: "1" } }
		w = factory()
		await completeInit()
		const vm = w.vm as unknown as { approve: () => Promise<void> }
		await vm.approve()
		await flushPromises()
		expect(w.find('[data-testid="cancelled-overlay"]').exists()).toBe(true)
		expect(w.find('[data-testid="error-text"]').exists()).toBe(false)
	})

	test("an approve refused with any other error shows the error strip and is logged under a named key", async () => {
		const refusal = new Error("service unavailable")
		resolveInteractionMock.mockRejectedValueOnce(refusal)
		approval.payloadToLoad = { params: { delta: [], existingGrants: [] }, session: { chainId: "1" } }
		w = factory()
		await completeInit()
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			const vm = w.vm as unknown as { approve: () => Promise<void> }
			await vm.approve()
			await flushPromises()
			expect(logged.mock.calls).toEqual([["Capabilities approve failed", { error: refusal }]])
		} finally {
			logged.mockRestore()
		}
		expect(w.find('[data-testid="error-text"]').exists()).toBe(true)
	})
})

describe("capabilities window — account widening consent (real rows)", () => {
	const A = { address: `0x${"aa".repeat(32)}`, name: "Alpha", chainId: 1 }
	const B = { address: `0x${"bb".repeat(32)}`, name: "Beta", chainId: 1 }
	const accountsCap = { type: "accounts", canGet: true, canCreateAuthWit: false }
	const realRows = () => {
		resolveInteractionMock.mockClear()
		return mount(Capabilities, { global: { stubs: { ...STUBS, AccountSelectRow: false } } })
	}
	const rows = () => w!.findAll('[data-testid="cap-account-item"]')
	const resolvedArg = () =>
		(
			resolveInteractionMock.mock.calls[0] as unknown as [
				string,
				{ selectedAccounts?: string[]; granted: Array<Record<string, unknown>> },
			]
		)[1]

	test("held rows are pre-selected and locked; a membership-only approve needs a new row; approve returns held ∪ picked", async () => {
		approval.payloadToLoad = {
			params: {
				delta: [accountsCap],
				existingGrants: [],
				availableAccounts: [A, B],
				grantedAccounts: [A.address],
				accountsMembershipOnly: true,
			},
			session: { chainId: "1" },
		}
		w = realRows()
		await completeInit()
		const [rowA, rowB] = rows()
		expect(rowA.attributes("data-granted")).toBe("true")
		expect(rowA.attributes("data-selected")).toBe("true")
		expect(rowB.attributes("data-granted")).toBeUndefined()
		expect(rowB.attributes("data-selected")).toBeUndefined()
		await rowA.trigger("click")
		expect(rowA.attributes("data-selected")).toBe("true")

		const vm = w!.vm as unknown as { approve: () => Promise<void> }
		await vm.approve()
		await flushPromises()
		expect(resolveInteractionMock).not.toHaveBeenCalled()
		expect(w!.find('[data-testid="error-text"]').exists()).toBe(true)

		await rowB.trigger("click")
		await vm.approve()
		await flushPromises()
		expect(resolveInteractionMock).toHaveBeenCalledTimes(1)
		expect(resolvedArg().selectedAccounts).toEqual([`aztec:1:${A.address}`, `aztec:1:${B.address}`])
		expect(resolvedArg().granted).toEqual([accountsCap])
	})

	test("a flag-only request (field-diff) approves with no new row and keeps the held row locked", async () => {
		const wide = { ...accountsCap, canCreateAuthWit: true }
		approval.payloadToLoad = {
			params: {
				delta: [wide],
				existingGrants: [],
				availableAccounts: [A, B],
				grantedAccounts: [A.address],
				accountsMembershipOnly: false,
			},
			session: { chainId: "1" },
		}
		w = realRows()
		await completeInit()
		expect(rows()[0].attributes("data-granted")).toBe("true")
		const vm = w!.vm as unknown as { approve: () => Promise<void> }
		await vm.approve()
		await flushPromises()
		expect(resolveInteractionMock).toHaveBeenCalledTimes(1)
		expect(resolvedArg().selectedAccounts).toEqual([`aztec:1:${A.address}`])
		expect(resolvedArg().granted).toEqual([wide])
	})
})

describe("capabilities window — permission rows and the answer (real rows)", () => {
	// Wire-shaped: 0x + 64 hex, each value below the field modulus.
	const TOKEN = `0x${"1b".repeat(32)}`
	const FEE_JUICE = `0x${"0".repeat(63)}3`
	const ALICE = { address: `0x${"0a".repeat(32)}`, name: "Alice", chainId: 1 }
	const ALICE_CAIP = `aztec:1:${ALICE.address}`
	const listed = [{ contract: TOKEN, function: "transfer_public_to_public" }]
	const authwitAccounts = { type: "accounts", canGet: true, canCreateAuthWit: true }
	const txAny = { type: "transaction", scope: "*" }
	const txListed = { type: "transaction", scope: listed }
	const contractsAny = { type: "contracts", contracts: "*", canRegister: true, canGetMetadata: true }
	const manifest = (capabilities: unknown[]) => ({
		version: "1.0",
		metadata: { name: "nulo-playground", version: "0.1.0", url: "http://localhost:5173" },
		capabilities,
	})
	/** A first request: the dispatcher's delta is the manifest's capabilities. */
	const firstRequest = (capabilities: unknown[], extra: Record<string, unknown> = {}) => ({
		params: {
			sessionId: "s1",
			manifest: manifest(capabilities),
			delta: capabilities,
			existingGrants: [],
			heldGrants: [],
			...extra,
		},
		session: { chainId: "1" },
	})
	const STYLE = (PermissionRow as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style
	const mountWindow = async (payload: unknown) => {
		approval.payloadToLoad = payload
		resolveInteractionMock.mockClear()
		w = mount(Capabilities, {
			global: {
				components: { RowAction, Toggle, Icon },
				stubs: {
					...STUBS,
					Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
					SectionLabel: { props: ["label", "count"], template: "<h2 :data-count='count'>{{ label }}</h2>" },
					DappIdentityBlock: {
						props: ["dapp", "actionLabel"],
						template: '<div data-testid="identity-block" :data-action-label="actionLabel" />',
					},
					PermissionRow: false,
					AccountSelectRow: false,
				},
			},
		})
		await completeInit()
	}
	const shownRows = () => w!.findAll('[data-testid="cap-item"]').filter((c) => c.attributes("data-cap-granted") === undefined)
	const rowKeys = () => shownRows().map((c) => c.attributes("data-cap-row"))
	const rowOf = (key: string) => {
		const found = shownRows().find((c) => c.attributes("data-cap-row") === key)
		if (!found) throw new Error(`no new ${key} row`)
		return found
	}
	const heldRowOf = (key: string) => {
		const found = w!.findAll('[data-cap-granted="true"]').find((c) => c.attributes("data-cap-row") === key)
		if (!found) throw new Error(`no held ${key} row`)
		return found
	}
	const toggleOf = (key: string) => rowOf(key).find('[data-testid="cap-toggle"]')
	/** The line as read: the dotted term's always-mounted definition copy is `hidden`. */
	const lineIn = (row: DOMWrapper<Element>) => {
		const sub = row.find('[data-testid="cap-row-sub"]')
		if (!sub.exists()) return ""
		const copy = sub.element.cloneNode(true) as HTMLElement
		for (const hidden of copy.querySelectorAll("[hidden]")) hidden.remove()
		return copy.textContent?.replace(/\s+/g, " ").trim()
	}
	const lineOf = (key: string) => lineIn(rowOf(key))
	/** Each row as the drawing reads it: title, line, switch state, flag and chip. */
	const readRow = (row: DOMWrapper<Element>) => {
		const chip = row.find(`.${STYLE.chip}`)
		const toggle = row.find('[data-testid="cap-toggle"]')
		const flagged = row.classes().includes(STYLE.flagged)
		// The e2e suite reads the flag from this attribute, so it must say what the class draws.
		expect(row.attributes("data-cap-flagged") === "true").toBe(flagged)
		return {
			title: row.find(`.${STYLE.title}`).text(),
			line: lineIn(row),
			on: toggle.exists() ? toggle.attributes("aria-checked") === "true" : undefined,
			flagged,
			chip: chip.exists() ? chip.text() : undefined,
		}
	}
	const read = (key: string) => readRow(rowOf(key))
	const readHeld = (key: string) => readRow(heldRowOf(key))
	const fold = () => w!.find('[data-testid="cap-already-allowed"]')
	const foldLabel = () => fold().find("span").text()
	const openFold = () => fold().trigger("click")
	/** The fold's panel sits beside its button, inside the disclosure's root. */
	const inFold = (el: Element) => fold().exists() && fold().element.parentElement?.contains(el) === true
	const groupsWhere = (folded: boolean) =>
		w!
			.findAll("[data-cap-group]")
			.filter((group) => inFold(group.element) === folded)
			.map((group) => [
				group.find("h2").text(),
				group.findAll('[data-testid="cap-item"]').map((row) => row.attributes("data-cap-row")),
			])
	const groups = () => groupsWhere(false)
	const foldGroups = () => groupsWhere(true)
	const detailsToggle = () => w!.find('[data-testid="cap-detail-toggle"]')
	const note = () => w!.find('[data-testid="cap-unknown-contracts-note"]')
	const approve = async () => {
		await (w!.vm as unknown as { approve: () => Promise<void> }).approve()
		await flushPromises()
		expect(resolveInteractionMock).toHaveBeenCalledTimes(1)
		return (resolveInteractionMock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]
	}
	const identity = () => w!.find('[data-testid="identity-block"]').attributes("data-action-label")
	const confirmLabel = () => w!.find('[data-testid="cap-approve-btn"]').text()

	describe("S1: listed scopes, one contract Nulo knows", () => {
		const simulation = {
			type: "simulation",
			transactions: { scope: listed },
			utilities: { scope: [{ contract: FEE_JUICE, function: "balance_of_public" }] },
		}
		const contracts = { type: "contracts", contracts: [TOKEN], canRegister: true, canGetMetadata: true }
		const request = firstRequest([authwitAccounts, simulation, contracts, txListed], {
			availableAccounts: [ALICE],
			knownContracts: [{ address: FEE_JUICE, name: "Fee Juice" }],
		})

		test("the account, the three groups and the words of the shot", async () => {
			await mountWindow(request)
			expect(identity()).toBe("wants to connect on Aztec:1")
			expect(w!.findAll("h2").map((h) => [h.text(), h.attributes("data-count")])).toEqual([
				["Account to share", "1"],
				["Always asks you first", undefined],
				["If you allow, it can", undefined],
				["Without asking, it can", undefined],
			])
			expect(groups()).toEqual([
				["Always asks you first", ["transaction"]],
				["If you allow, it can", ["authorizations"]],
				["Without asking, it can", ["account-address", "simulation", "contracts"]],
			])
			expect(read("account-address")).toEqual({
				title: "Let this app list all your accounts",
				line: "It always knows the account you connect with.",
				on: undefined,
				flagged: false,
				chip: undefined,
			})
			expect(read("simulation")).toMatchObject({
				title: "Run simulations and read the results",
				line: "Results can include your private balances.",
			})
			expect(read("contracts")).toMatchObject({ title: "Add contracts to your wallet", line: "", on: undefined })
			expect(read("authorizations")).toEqual({
				title: "Act for you in transactions you approve",
				line: "Nulo signs its authorizations without asking.",
				on: true,
				flagged: false,
				chip: undefined,
			})
			expect(rowOf("authorizations").find('[data-testid="cap-auth-term"]').text()).toBe("authorizations")
			expect(read("transaction")).toEqual({
				title: "Every transaction, on 1 contract",
				line: "",
				on: undefined,
				flagged: false,
				chip: undefined,
			})
			expect(note().exists()).toBe(false)
			expect(confirmLabel()).toBe("Connect")
		})

		test("the answer grants what the window shows, with the switch On", async () => {
			await mountWindow(request)
			expect(await approve()).toEqual({
				granted: [authwitAccounts, simulation, contracts, txListed],
				selectedAccounts: [ALICE_CAIP],
				accountAliases: { [ALICE_CAIP]: "Alice" },
				authorizationsWithoutAsking: true,
			})
		})

		test("Details lists both contracts, and a copied address goes to the snack whole", async () => {
			await mountWindow(request)
			expect(detailsToggle().find("span").text()).toBe("Details · 2 contracts")
			await detailsToggle().trigger("click")
			expect(w!.findAll('[data-testid="cap-details-row"]')).toHaveLength(2)
			await w!.find('[data-testid="cap-details-copy"]').trigger("click")
			expect(copyWithToastMock).toHaveBeenCalledExactlyOnceWith(TOKEN, expect.any(Function), "Address is copied", { sanitize: true })
		})
	})

	test.each([
		["an accounts-only connect", [{ type: "accounts", canGet: true, canCreateAuthWit: false }]],
		["the address book alone", [{ type: "data", addressBook: true }]],
	])("no Details when the grants reach no contract or class: %s", async (_case, capabilities) => {
		await mountWindow(firstRequest(capabilities, { availableAccounts: [ALICE] }))
		expect(shownRows().length).toBeGreaterThan(0)
		expect(detailsToggle().exists()).toBe(false)
	})

	test("S2: the same rows, and the note when Nulo knows none of the contracts", async () => {
		const simulation = { type: "simulation", transactions: { scope: listed } }
		const contracts = { type: "contracts", contracts: [TOKEN], canRegister: true, canGetMetadata: true }
		await mountWindow(
			firstRequest([authwitAccounts, simulation, contracts, txListed], {
				availableAccounts: [ALICE],
				knownContracts: [{ address: FEE_JUICE, name: "Fee Juice" }],
			}),
		)
		expect(rowKeys()).toEqual(["transaction", "authorizations", "account-address", "simulation", "contracts"])
		expect(note().text()).toBe("Nulo doesn't recognize any of its contracts.")
	})

	describe("S3: every broad flag", () => {
		const simulation = { type: "simulation", transactions: { scope: "*" }, utilities: { scope: "*" } }
		const request = firstRequest(
			[authwitAccounts, simulation, { type: "data", addressBook: true }, { type: "experimental_v2" }, txAny],
			{
				availableAccounts: [ALICE],
			},
		)

		test("flags, the chip, the Off defaults and the any-contract words", async () => {
			await mountWindow(request)
			expect(groups()).toEqual([
				["Always asks you first", ["transaction"]],
				["If you allow, it can", ["authorizations", "address-book", "unknown"]],
				["Without asking, it can", ["account-address", "simulation"]],
			])
			expect(read("simulation")).toEqual({
				title: "Run simulations on any contract",
				line: "Results can include your private balances.",
				on: undefined,
				flagged: true,
				chip: "Any contract",
			})
			expect(read("authorizations")).toEqual({
				title: "Act for you in transactions you approve",
				line: "You confirm each authorization first. Off because it listed any contract.",
				on: false,
				flagged: true,
				chip: undefined,
			})
			expect(read("address-book")).toEqual({
				title: "See your address book",
				line: "Every name and address you saved.",
				on: true,
				flagged: true,
				chip: undefined,
			})
			expect(read("unknown")).toEqual({
				title: "Use 1 permission Nulo doesn't recognize",
				line: "Nulo can't tell you what it allows.",
				on: false,
				flagged: true,
				chip: undefined,
			})
			expect(rowOf("unknown").find('[data-testid="cap-unrecognized-badge"]').text()).toBe("Use 1 permission Nulo doesn't recognize")
			expect(rowOf("unknown").attributes("data-cap-id")).toBeUndefined()
			expect(read("transaction").title).toBe("Every transaction, on any contract")
			expect(note().exists()).toBe(false)
		})

		test("the answer keeps the unknown type out and the authorizations Off", async () => {
			await mountWindow(request)
			expect(await approve()).toEqual({
				granted: [authwitAccounts, simulation, { type: "data", addressBook: true }, txAny],
				selectedAccounts: [ALICE_CAIP],
				accountAliases: { [ALICE_CAIP]: "Alice" },
				authorizationsWithoutAsking: false,
			})
		})
	})

	test("the switch flips the row's line and the answer", async () => {
		await mountWindow(firstRequest([authwitAccounts, txAny], { availableAccounts: [ALICE] }))
		await toggleOf("authorizations").trigger("click")
		expect(lineOf("authorizations")).toBe("For any call, on any contract.")
		expect(toggleOf("authorizations").attributes("aria-checked")).toBe("true")
		expect((await approve()).authorizationsWithoutAsking).toBe(true)
	})

	test("data: two rows, each with its switch; private events on any contract start Off with the chip", async () => {
		await mountWindow(firstRequest([{ type: "data", addressBook: true, privateEvents: { contracts: "*" } }, contractsAny]))
		expect(rowKeys()).toEqual(["address-book", "private-events", "contracts"])
		expect(rowOf("address-book").attributes("data-cap-id")).toBe("data")
		expect(read("address-book")).toMatchObject({ title: "See your address book", line: "Every name and address you saved.", on: true })
		expect(toggleOf("address-book").attributes("aria-label")).toBe("Share address book")
		expect(read("private-events")).toEqual({
			title: "See private events from any contract",
			line: "Not shared. The app may ask again later.",
			on: false,
			flagged: true,
			chip: "Any contract",
		})
		expect(read("contracts")).toMatchObject({ title: "Add any contract to your wallet", flagged: true, chip: "Any contract" })
		expect(await approve()).toEqual({ granted: [{ type: "data", addressBook: true }, contractsAny] })
	})

	test("data: both rows Off never sends a data grant", async () => {
		await mountWindow(firstRequest([{ type: "data", addressBook: true, privateEvents: { contracts: "*" } }, contractsAny]))
		await toggleOf("address-book").trigger("click")
		expect(await approve()).toEqual({ granted: [contractsAny] })
	})

	test("data on a contract its calls reach: both rows On; private events switched Off keeps the address book", async () => {
		await mountWindow(firstRequest([{ type: "data", addressBook: true, privateEvents: { contracts: [TOKEN] } }, txListed]))
		expect(read("private-events")).toMatchObject({
			title: "See private events from 1 contract",
			line: "Private messages its contracts sent to your accounts, like a transfer you received.",
			on: true,
		})
		await toggleOf("private-events").trigger("click")
		expect(await approve()).toEqual({ granted: [{ type: "data", addressBook: true }, txListed] })
	})

	test("the reach of each row, and private events Off for a contract outside the call scope", async () => {
		const OTHER = `0x${"2c".repeat(32)}`
		const CLASS = `0x${"3d".repeat(32)}`
		const events = { type: "data", privateEvents: { contracts: [TOKEN, OTHER] } }
		const details = { type: "contracts", contracts: "*", canGetMetadata: true }
		const classes = { type: "contractClasses", classes: [CLASS], canGetMetadata: true }
		await mountWindow(
			firstRequest([events, details, classes, txListed], { knownContracts: [{ address: FEE_JUICE, name: "Fee Juice" }] }),
		)
		expect(read("transaction").title).toBe("Every transaction, on 1 contract")
		expect(read("private-events")).toEqual({
			title: "See private events from 2 contracts",
			line: "Not shared. The app may ask again later.",
			on: false,
			flagged: false,
			chip: undefined,
		})
		expect(read("contract-details")).toEqual({
			title: "See details of any contract in your wallet",
			line: "",
			on: undefined,
			flagged: true,
			chip: "Any contract",
		})
		expect(read("contract-classes")).toEqual({
			title: expect.stringMatching(/^Look up the code of 1 contract class on /),
			line: "Whether it is on chain, and if this wallet has its code.",
			on: undefined,
			flagged: false,
			chip: undefined,
		})
		expect(await approve()).toEqual({ granted: [details, classes, txListed] })
	})

	test("a lookup of every class is flagged with its chip, like adding any contract", async () => {
		const register = { type: "contracts", contracts: [TOKEN], canRegister: true, canGetMetadata: true }
		const classes = { type: "contractClasses", classes: "*", canGetMetadata: true }
		await mountWindow(firstRequest([register, classes]))
		expect(read("contract-classes")).toEqual({
			title: expect.stringMatching(/^Look up contract code on /),
			line: "Whether it is on chain, and if this wallet has its code.",
			on: undefined,
			flagged: true,
			chip: "Any class",
		})
		expect(read("contracts")).toMatchObject({ flagged: false, chip: undefined })
		expect(await approve()).toEqual({ granted: [register, classes] })
	})

	test("Details shows what the app asked for, a row switched Off included, with its classes", async () => {
		const events = { type: "data", privateEvents: { contracts: [TOKEN] } }
		const classes = { type: "contractClasses", classes: [FEE_JUICE], canGetMetadata: true }
		await mountWindow(firstRequest([events, classes]))
		expect(read("private-events").on).toBe(false)
		expect(detailsToggle().find("span").text()).toBe("Details · 1 contract")
		await detailsToggle().trigger("click")
		const spokenRows = w!.findAll('[data-testid="cap-details-row"]').map((row) => {
			const id = row.attributes("aria-labelledby")
			return w!.find(`[id="${id}"]`).text()
		})
		expect(spokenRows).toEqual(["Unknown contract 0x1b1b…1b1b: events", "Contract class 0x0000…0003: code"])
	})

	test("grants reaching only contract classes still show Details, counting the classes", async () => {
		await mountWindow(firstRequest([{ type: "contractClasses", classes: [FEE_JUICE], canGetMetadata: true }]))
		expect(detailsToggle().find("span").text()).toBe("Details · 1 contract class")
	})

	test("a Settings change after dispatch: the defaults follow the snapshot, not the session", async () => {
		const held = [{ type: "accounts", canGet: false, canCreateAuthWit: true }, txListed]
		await mountWindow({
			params: {
				sessionId: "s1",
				manifest: manifest([authwitAccounts, txListed]),
				delta: [authwitAccounts],
				existingGrants: held,
				heldGrants: held,
				authorizationsWithoutAsking: { broad: false },
				availableAccounts: [ALICE],
				grantedAccounts: [ALICE.address],
			},
			// Re-read after the snapshot: Settings has since turned the consent off.
			session: { chainId: "1", authorizationsWithoutAsking: undefined, capabilityGrants: [] },
		})
		expect(toggleOf("authorizations").attributes("aria-checked")).toBe("true")
		expect(await approve()).toEqual({
			granted: [authwitAccounts, txListed],
			selectedAccounts: [ALICE_CAIP],
			accountAliases: { [ALICE_CAIP]: "Alice" },
			authorizationsWithoutAsking: true,
		})
	})

	test("a transaction widening with a held data record: only the transaction row is new", async () => {
		const heldData = { type: "data", addressBook: true, privateEvents: { contracts: [TOKEN] } }
		await mountWindow({
			params: {
				sessionId: "s1",
				manifest: manifest([txAny, heldData]),
				delta: [txAny],
				existingGrants: [heldData],
				heldGrants: [heldData],
			},
			session: { chainId: "1" },
		})
		expect(rowKeys()).toEqual(["transaction"])
		expect(await approve()).toEqual({ granted: [txAny, heldData] })
	})

	test("Details lists the held events a data request for the address book alone keeps", async () => {
		const heldEvents = { type: "data", privateEvents: { contracts: [TOKEN] } }
		const book = { type: "data", addressBook: true }
		await mountWindow({
			params: { sessionId: "s1", manifest: manifest([book]), delta: [book], existingGrants: [heldEvents], heldGrants: [heldEvents] },
			session: { chainId: "1" },
		})
		expect(detailsToggle().find("span").text()).toBe("Details · 1 contract")
		await detailsToggle().trigger("click")
		const row = w!.find('[data-testid="cap-details-row"]')
		expect(w!.find(`[id="${row.attributes("aria-labelledby")}"]`).text()).toBe("Unknown contract 0x1b1b…1b1b: events")
		expect(await approve()).toEqual({ granted: [{ type: "data", addressBook: true, privateEvents: { contracts: [TOKEN] } }] })
	})

	describe("U1: a connected app asks for more", () => {
		const simulation = {
			type: "simulation",
			transactions: { scope: listed },
			utilities: { scope: [{ contract: FEE_JUICE, function: "balance_of_public" }] },
		}
		const contracts = { type: "contracts", contracts: [TOKEN], canRegister: true, canGetMetadata: true }
		/** The tools app's four grants; its accounts give two rows, so the fold reads five. */
		const TOOLS = [authwitAccounts, simulation, contracts, txListed]
		const heldData = { type: "data", addressBook: true, privateEvents: { contracts: [TOKEN] } }
		const eventsAny = { type: "data", addressBook: true, privateEvents: { contracts: "*" } }
		const TOOLS_FOLDED = [
			["Always asks you first", ["transaction"]],
			["If you allow, it can", ["authorizations"]],
			["Without asking, it can", ["account-address", "simulation", "contracts"]],
		]
		/** A re-request under a narrow consent: the snapshot holds `held`, the request asks `delta`. */
		const reRequest = (delta: unknown[], held: unknown[], extra: Record<string, unknown> = {}) => ({
			params: {
				sessionId: "s1",
				manifest: manifest(delta),
				delta,
				existingGrants: held,
				heldGrants: held,
				authorizationsWithoutAsking: { broad: false },
				knownContracts: [{ address: FEE_JUICE, name: "Fee Juice" }],
				...extra,
			},
			session: { chainId: "1" },
		})

		test("A-5: a request for any contract: its rows new, the authorizations Off again, the rest folded", async () => {
			const simAny = { type: "simulation", transactions: { scope: "*" }, utilities: { scope: "*" } }
			await mountWindow(reRequest([simAny, txAny], TOOLS))
			expect(identity()).toBe("wants more permissions on Aztec:1")
			expect(groups()).toEqual([
				["Always asks you first", ["transaction"]],
				["If you allow, it can", ["authorizations"]],
				["Without asking, it can", ["simulation"]],
			])
			expect(read("simulation")).toMatchObject({ title: "Run simulations on any contract", flagged: true, chip: "Any contract" })
			expect(read("authorizations")).toEqual({
				title: "Act for you in transactions you approve",
				line: "You confirm each authorization first. Off because it listed any contract.",
				on: false,
				flagged: true,
				chip: undefined,
			})
			expect(read("transaction").title).toBe("Every transaction, on any contract")
			expect(foldLabel()).toBe("Already allowed · 5")
			expect(fold().attributes("aria-expanded")).toBe("false")
			expect(detailsToggle().find("span").text()).toBe("Details · any contract")
			expect(confirmLabel()).toBe("Allow")

			await openFold()
			expect(foldGroups()).toEqual(TOOLS_FOLDED)
			expect(fold().element.parentElement?.querySelector('[data-testid="cap-toggle"]')).toBeNull()
			expect(readHeld("account-address").title).toBe("Let this app list all your accounts")
			expect(readHeld("authorizations")).toEqual({
				title: "Act for you in transactions you approve",
				line: "Nulo signs its authorizations without asking.",
				on: undefined,
				flagged: false,
				chip: undefined,
			})
			expect(await approve()).toEqual({ granted: [simAny, txAny, authwitAccounts, contracts], authorizationsWithoutAsking: false })
		})

		test("a declined data widening keeps the held rows folded; private events new and Off", async () => {
			await mountWindow(reRequest([eventsAny], [...TOOLS, heldData]))
			expect(groups()).toEqual([["If you allow, it can", ["private-events"]]])
			expect(read("private-events")).toEqual({
				title: "See private events from any contract",
				line: "Not shared. The app may ask again later.",
				on: false,
				flagged: true,
				chip: "Any contract",
			})
			expect(foldLabel()).toBe("Already allowed · 7")
			await openFold()
			expect(foldGroups()).toEqual([
				TOOLS_FOLDED[0],
				["If you allow, it can", ["authorizations", "address-book", "private-events"]],
				TOOLS_FOLDED[2],
			])
			expect(readHeld("private-events")).toMatchObject({
				title: "See private events from 1 contract",
				line: "Private messages its contracts sent to your accounts, like a transfer you received.",
			})
			expect(await approve()).toEqual({ granted: TOOLS })
		})

		test("every row in the fold draws its title as held; the new row does not", async () => {
			await mountWindow(reRequest([eventsAny], [...TOOLS, heldData]))
			await openFold()
			const held = w!.findAll('[data-cap-granted="true"]')
			expect(held).toHaveLength(7)
			for (const row of held) expect(row.classes()).toContain(STYLE.granted)
			expect(shownRows().map((row) => [row.attributes("data-cap-row"), row.classes().includes(STYLE.granted)])).toEqual([
				["private-events", false],
			])
		})

		test("the same request after that rejection: the badge on the new row, none in the fold", async () => {
			// The stored rejection drops `data` from the echo list, never from the held grants.
			await mountWindow(reRequest([eventsAny], [...TOOLS, heldData], { existingGrants: TOOLS, reRequested: ["data"] }))
			expect(rowKeys()).toEqual(["private-events"])
			expect(toggleOf("private-events").attributes("aria-checked")).toBe("false")
			expect(rowOf("private-events").find('[data-testid="cap-rerequested-badge"]').text()).toBe("previously denied")
			expect(foldLabel()).toBe("Already allowed · 7")
			await openFold()
			expect(heldRowOf("address-book").find('[data-testid="cap-rerequested-badge"]').exists()).toBe(false)
			expect(await approve()).toEqual({ granted: TOOLS })
		})

		test("a membership-only accounts widening folds the authorizations row with its line; no consent sent", async () => {
			const BOB = { address: `0x${"0b".repeat(32)}`, name: "Bob", chainId: 1 }
			const BOB_CAIP = `aztec:1:${BOB.address}`
			await mountWindow(
				reRequest([authwitAccounts], TOOLS, {
					availableAccounts: [ALICE, BOB],
					grantedAccounts: [ALICE.address],
					accountsMembershipOnly: true,
				}),
			)
			expect(rowKeys()).toEqual(["account-address"])
			expect(w!.find("h2").text()).toBe("Accounts to share")
			expect(w!.findAll('[data-testid="cap-toggle"]')).toHaveLength(0)
			await w!.findAll('[data-testid="cap-account-item"]')[1].trigger("click")
			expect(foldLabel()).toBe("Already allowed · 5")
			await openFold()
			expect(foldGroups()).toEqual(TOOLS_FOLDED)
			expect(readHeld("authorizations").line).toBe("Nulo signs its authorizations without asking.")
			const answer = await approve()
			expect(answer).toEqual({
				granted: TOOLS,
				selectedAccounts: [ALICE_CAIP, BOB_CAIP],
				accountAliases: { [ALICE_CAIP]: "Alice", [BOB_CAIP]: "Bob" },
			})
			expect(answer).not.toHaveProperty("authorizationsWithoutAsking")
		})
	})
})
