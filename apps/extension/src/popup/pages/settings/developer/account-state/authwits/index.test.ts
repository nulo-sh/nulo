import { Flex, Input, RowAction } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { ref } from "vue"
import { installChromeStorage } from "../../../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import { trimAddress } from "@/utils/string"
import type { Authwit } from "@/wallet/services/auth-registry/client"
import { authwitRowKey } from "@/wallet/services/auth-registry/spec"
import { ContentKind, type Task, TaskStatus } from "@/wallet/services/task/spec"
import AuthwitsIndex from "./index.vue"

// Wire-shaped: 0x + 64 hex.
const ACCOUNT = `0x${"ab".repeat(32)}`
const { TOKEN } = vi.hoisted(() => ({ TOKEN: `0x${"1b".repeat(32)}` }))
const UNKNOWN = `0x${"2c".repeat(32)}`
const SCOPE = { profileId: "p", chainId: 1, account: ACCOUNT }
const row = (id: number, pending: boolean, contract = TOKEN): Authwit =>
	({
		...SCOPE,
		id,
		hash: `0x${id}`,
		txHash: `0x${"cd".repeat(32)}`,
		pending,
		content: { kind: "call", caller: `0x${"1a".repeat(32)}`, contract, method: "transfer_in_public", args: [] },
	}) as unknown as Authwit

const client = vi.hoisted(() => ({ current: undefined as undefined | Record<string, unknown> }))
const tasks = vi.hoisted(() => ({ snapshot: [] as unknown[], current: undefined as undefined | Record<string, unknown> }))

vi.mock("@/wallet/services/auth-registry/client", async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return {
		AuthRegistryServiceClient: function AuthRegistryServiceClient() {
			client.current = {
				getAuthwits: vi.fn(async () => [row(1, true)]),
				getRegistryEnabled: vi.fn(async () => true),
				onAuthwitAdded: new EventHandler(),
				onAuthwitUpdated: new EventHandler(),
				onAuthwitDeleted: new EventHandler(),
				onRegistryEnabled: new EventHandler(),
				onRegistryDisabled: new EventHandler(),
				disconnect: vi.fn(),
			}
			return client.current
		},
	}
})

vi.mock("@/wallet/services/task/client", async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return {
		TaskServiceClient: function TaskServiceClient() {
			tasks.current = {
				getTasks: vi.fn(async () => tasks.snapshot),
				onTaskCreated: new EventHandler(),
				onTaskUpdated: new EventHandler(),
				onTaskDeleted: new EventHandler(),
				disconnect: vi.fn(),
			}
			return tasks.current
		},
	}
})
vi.mock("@/wallet/services/token/client", () => ({
	TokenServiceClient: function TokenServiceClient() {
		return { getTokens: vi.fn(async () => []), disconnect: vi.fn() }
	},
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: function PriceServiceClient() {
		return { disconnect: vi.fn() }
	},
}))
vi.mock("@/composables/usePrices", () => ({
	useTokenFlags: () => ({
		mapped: ref(true),
		isFlagged: () => false,
		iconFor: () => undefined,
		listedAt: (t: { chainId?: number; contract?: string } | undefined) =>
			t?.chainId === 1 && t.contract === TOKEN ? { symbol: "TST", name: "Test Token" } : undefined,
		dispose: vi.fn(),
	}),
}))

enableAutoUnmount(afterEach)

// The app store reads and watches `chrome.storage.local` when it is created.
beforeEach(() => {
	tasks.snapshot = []
	vi.stubGlobal("chrome", { storage: {} })
	installChromeStorage({}, { persist: false })
})
afterEach(() => {
	vi.unstubAllGlobals()
})

function emit(event: string, payload: Authwit): void {
	const handler = client.current?.[event] as { invoke: (p: Authwit) => void } | undefined
	if (!handler) throw new Error(`the page built no client with ${event}`)
	handler.invoke(payload)
}

const INPUT_STUB = {
	props: ["modelValue"],
	emits: ["update:modelValue"],
	template: `<input data-testid="search" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
}

async function mountPage({ realInput = false } = {}) {
	const pinia = createTestingPinia({ createSpy: vi.fn })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.profile = { id: SCOPE.profileId } as never
	appStore.network = { id: "n", chainId: SCOPE.chainId } as never
	appStore.account = { address: ACCOUNT } as never
	const wrapper = mount(AuthwitsIndex, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: { Flex, Input, RowAction },
			stubs: {
				SubPageHeader: { template: "<div><slot name='trailing' /></div>" },
				Dropdown: { template: "<div />" },
				AsyncListStatus: true,
				ListStatusMessage: true,
				Tooltip: { template: "<span><slot /></span>" },
				Icon: true,
				Text: { template: "<span><slot /></span>" },
				ContractChip: {
					props: ["model", "explorer", "testid"],
					template: `<button type="button" data-testid="contract-chip" :data-level="model.level ?? 'pending'">{{ model.label }}</button>`,
				},
				...(realInput ? {} : { Input: INPUT_STUB }),
			},
		},
	})
	await flushPromises()
	return wrapper
}

const chips = (w: Awaited<ReturnType<typeof mountPage>>) => w.findAll('[data-testid="authwit-pending-chip"]')

/** A revoke task as the worker keeps it: it names its rows by id from the request to the registry read. */
const revokeTask = (ids: number[], status: TaskStatus, finishedAt?: number): Task => ({
	id: `t-${ids.join("-")}`,
	content: {
		kind: ContentKind.RevokeAuthwits,
		label: "Revoke public authwits",
		authwitIds: ids,
		authwitKeys: ids.map((id) => authwitRowKey(row(id, false))),
	} as Task["content"],
	status,
	createdAt: 1,
	subtasks: [],
	...(finishedAt ? { finishedAt } : {}),
})
function emitTask(event: "onTaskCreated" | "onTaskUpdated" | "onTaskDeleted", task: Task): void {
	;(tasks.current as Record<string, { invoke: (t: Task) => void }>)[event]?.invoke(task)
}
const stateChips = (w: Awaited<ReturnType<typeof mountPage>>) =>
	w.findAll('[data-testid="authwit-revoking-chip"], [data-testid="authwit-not-revoked-chip"]').map((c) => c.text())

test("a grant proven while the page is open loses its Pending chip in place, and keeps its title", async () => {
	const w = await mountPage()
	expect(chips(w)).toHaveLength(1)
	expect(w.text()).toContain("Transfer")

	emit("onAuthwitUpdated", row(1, false))
	await flushPromises()
	expect(chips(w)).toHaveLength(0)
	expect(w.text()).toContain("Transfer")
	expect(w.text()).not.toContain("Custom Authwit")
})

test("a call row names its action and its contract: a listed token by its symbol, any other by its short address", async () => {
	const w = await mountPage()
	emit("onAuthwitAdded", row(2, false, UNKNOWN))
	emit("onAuthwitAdded", { ...row(3, false), content: { kind: "intent", consumer: TOKEN, intent: [] } } as never)
	await flushPromises()
	const contracts = w.findAll('[data-testid="contract-chip"]').map((c) => [c.text(), c.attributes("data-level")])
	expect(contracts).toEqual([
		["TST", "nulo"],
		[trimAddress(UNKNOWN), "none"],
	])
	expect(w.text().match(/Transfer/g)).toHaveLength(2)
	expect(w.text()).toContain("Intent")
})

test("a grant added while the page is open reads its kind, and a search that misses it filters it out", async () => {
	const w = await mountPage()
	emit("onAuthwitAdded", { ...row(2, true), content: { kind: "intent", consumer: `0x${"2c".repeat(32)}`, intent: [] } } as never)
	await flushPromises()
	expect(w.text()).toContain("Intent")
	expect(chips(w)).toHaveLength(2)

	await w.find('[data-testid="search"]').setValue("transfer_in_public")
	expect(chips(w)).toHaveLength(1)
	expect(w.text()).not.toContain("Intent")
})

test.each([
	{ case: "with a zero-width space", pasted: "transfer_in\u200B_public", shown: 1 },
	{ case: "with a visible wrong character", pasted: "transfer_in_publik", shown: 0 },
])("a method name pasted $case shows $shown grant", async ({ pasted, shown }) => {
	const w = await mountPage({ realInput: true })
	expect(chips(w)).toHaveLength(1)
	await w.get("input").setValue(pasted)
	expect(chips(w)).toHaveLength(shown)
})

test("a revoke running when the page opens marks its row Revoking; the registry's prune then takes the row away", async () => {
	tasks.snapshot = [revokeTask([1], TaskStatus.Processing)]
	const w = await mountPage()
	expect(stateChips(w)).toEqual(["Revoking"])

	emit("onAuthwitDeleted", row(1, true))
	emitTask("onTaskUpdated", revokeTask([1], TaskStatus.Completed, 2))
	await flushPromises()
	expect(w.findAll('[data-testid="contract-chip"]')).toHaveLength(0)
	expect(stateChips(w)).toEqual([])
})

test("a revoke that fails leaves its row reading Not revoked; one that another row's task names leaves it alone", async () => {
	const w = await mountPage()
	emitTask("onTaskCreated", revokeTask([1], TaskStatus.Processing))
	emitTask("onTaskCreated", revokeTask([99], TaskStatus.Processing))
	await flushPromises()
	expect(stateChips(w)).toEqual(["Revoking"])

	emitTask("onTaskUpdated", revokeTask([1], TaskStatus.Failed, 2))
	await flushPromises()
	expect(stateChips(w)).toEqual(["Not revoked"])
	expect(chips(w)).toHaveLength(1)
})

test("leaving the page removes its three task handlers and disconnects the task client", async () => {
	const w = await mountPage()
	const current = tasks.current as Record<string, { remove: (handler: unknown) => void }>
	const removals = ["onTaskCreated", "onTaskUpdated", "onTaskDeleted"].map((event) => vi.spyOn(current[event]!, "remove"))
	w.unmount()
	expect(removals.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1])
	expect((tasks.current as { disconnect: ReturnType<typeof vi.fn> }).disconnect).toHaveBeenCalledTimes(1)
})
