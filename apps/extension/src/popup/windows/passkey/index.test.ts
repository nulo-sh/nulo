import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import PasskeyWindow from "./index.vue"

const client = vi.hoisted(() => ({
	connect: vi.fn(),
	disconnect: vi.fn(),
	getPendingRequest: vi.fn(),
	resolvePasskeyRequest: vi.fn(),
	rejectPasskeyRequest: vi.fn(),
}))
vi.mock("@/wallet/services/passkey/client", () => ({
	PasskeyServiceClient: vi.fn(function () {
		return client
	}),
}))

const ceremony = vi.hoisted(() => ({ run: vi.fn(), confirm: vi.fn() }))
vi.mock("@/wallet/utils/passkey-ceremony", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/wallet/utils/passkey-ceremony")>()),
	runPasskeyCeremony: (...args: unknown[]) => ceremony.run(...args),
	confirmCreatedCredential: (...args: unknown[]) => ceremony.confirm(...args),
}))

vi.mock("vue-router", () => ({ useRoute: () => ({ query: { requestId: "req-1" } }) }))

const CREATE = { mode: "create", userHandle: "a3f29b14", name: "Savings", step: "create", profileName: "Savings" }
const DATA = { id: "cred-1", prf: "cHJm", userHandle: "a3f29b14" }
const dismissed = () => new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")

let closeWindow: ReturnType<typeof vi.spyOn>

function mountWindow() {
	return mount(PasskeyWindow, {
		global: {
			stubs: {
				Flex: { template: "<div><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				Button: { template: "<button @click=\"$emit('click')\"><slot /></button>", emits: ["click"] },
			},
		},
	})
}

const byTestId = (wrapper: ReturnType<typeof mountWindow>, id: string) => wrapper.find(`[data-testid="${id}"]`)
const windowState = (wrapper: ReturnType<typeof mountWindow>) => byTestId(wrapper, "passkey-window").attributes("data-state")

beforeEach(() => {
	for (const fn of [...Object.values(client), ...Object.values(ceremony)]) fn.mockReset()
	client.getPendingRequest.mockResolvedValue(CREATE)
	client.rejectPasskeyRequest.mockResolvedValue(undefined)
	closeWindow = vi.spyOn(window, "close").mockImplementation(() => undefined)
})

afterEach(() => {
	closeWindow.mockRestore()
})

describe("the passkey window", () => {
	test("shows the step it runs, hands the result over, and closes once the step is done", async () => {
		ceremony.run.mockResolvedValue(DATA)
		let finish!: (outcome: string) => void
		client.resolvePasskeyRequest.mockReturnValue(new Promise((resolve) => (finish = resolve)))
		const wrapper = mountWindow()
		await flushPromises()

		expect(wrapper.text()).toContain("New profile · Savings")
		expect(client.resolvePasskeyRequest).toHaveBeenCalledWith("req-1", DATA)
		expect(windowState(wrapper)).toBe("finishing")
		expect(wrapper.find('[role="status"]').text()).toBe("Finishing up. This window closes by itself.")
		// Cancel keeps its place so the screen does not move, but nothing can reach it.
		expect(byTestId(wrapper, "passkey-window-cancel").element.closest("[inert]")).not.toBeNull()
		expect(closeWindow).not.toHaveBeenCalled()

		finish("done")
		await flushPromises()
		expect(closeWindow).toHaveBeenCalledTimes(1)
	})

	test("a failed prompt offers Try again, which asks again and finishes the step", async () => {
		ceremony.run.mockRejectedValueOnce(dismissed()).mockResolvedValueOnce(DATA)
		client.resolvePasskeyRequest.mockResolvedValue("done")
		const wrapper = mountWindow()
		await flushPromises()

		expect(windowState(wrapper)).toBe("failed")
		expect(byTestId(wrapper, "passkey-window-error").text()).toBe(
			"The passkey request was cancelled or took too long. Nothing changed.",
		)
		await byTestId(wrapper, "passkey-window-retry").trigger("click")
		await flushPromises()

		expect(client.getPendingRequest).toHaveBeenCalledTimes(2)
		expect(ceremony.run).toHaveBeenCalledTimes(2)
		expect(closeWindow).toHaveBeenCalledTimes(1)
	})

	test("a saved but unconfirmed passkey is confirmed on Try again, never created twice", async () => {
		ceremony.run.mockRejectedValue(new PasskeyUnconfirmedError("cred-1", "a3f29b14", dismissed()))
		ceremony.confirm.mockResolvedValue(DATA)
		client.resolvePasskeyRequest.mockResolvedValue("done")
		const wrapper = mountWindow()
		await flushPromises()

		expect(byTestId(wrapper, "passkey-window-error").text()).toBe("Your passkey was saved but not confirmed. Try again to finish.")
		await byTestId(wrapper, "passkey-window-retry").trigger("click")
		await flushPromises()

		expect(ceremony.run).toHaveBeenCalledTimes(1)
		expect(ceremony.confirm).toHaveBeenCalledWith("cred-1", "a3f29b14", expect.any(AbortSignal))
		expect(client.resolvePasskeyRequest).toHaveBeenCalledWith("req-1", DATA)
	})

	test("a request that is gone shows the step failure, and Try again is never offered", async () => {
		client.getPendingRequest.mockRejectedValue(new Error("Invalid request id"))
		const wrapper = mountWindow()
		await flushPromises()

		expect(windowState(wrapper)).toBe("step-failed")
		expect(ceremony.run).not.toHaveBeenCalled()
		expect(byTestId(wrapper, "passkey-window-retry").exists()).toBe(false)
	})

	test("Try again finds the request gone and shows the step failure instead of asking again", async () => {
		ceremony.run.mockRejectedValue(dismissed())
		const wrapper = mountWindow()
		await flushPromises()
		client.getPendingRequest.mockRejectedValue(new Error("Invalid request id"))

		await byTestId(wrapper, "passkey-window-retry").trigger("click")
		await flushPromises()

		expect(windowState(wrapper)).toBe("step-failed")
		expect(ceremony.run).toHaveBeenCalledTimes(1)
	})

	test("a step that failed after the passkey names what failed, and Close only closes", async () => {
		ceremony.run.mockResolvedValue(DATA)
		client.resolvePasskeyRequest.mockResolvedValue("failed")
		const wrapper = mountWindow()
		await flushPromises()

		expect(windowState(wrapper)).toBe("step-failed")
		expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
		expect(wrapper.findAll("h1 span").map((line) => line.text())).toEqual(["Couldn't", "create the profile"])
		expect(byTestId(wrapper, "passkey-window-error").text()).toBe("Close this window and try again from Nulo.")
		await byTestId(wrapper, "passkey-window-close").trigger("click")
		expect(client.rejectPasskeyRequest).not.toHaveBeenCalled()
		expect(closeWindow).toHaveBeenCalledTimes(1)
	})

	test("Cancel while waiting stops the passkey request, cancels the step and closes", async () => {
		let signal!: AbortSignal
		ceremony.run.mockImplementation((_req: unknown, s: AbortSignal) => {
			signal = s
			return new Promise(() => undefined)
		})
		const wrapper = mountWindow()
		await flushPromises()

		await byTestId(wrapper, "passkey-window-cancel").trigger("click")
		await flushPromises()
		expect(signal.aborted).toBe(true)
		expect(client.rejectPasskeyRequest).toHaveBeenCalledWith("req-1")
		expect(closeWindow).toHaveBeenCalledTimes(1)
	})

	test("Close after a failed prompt cancels the step, then closes", async () => {
		ceremony.run.mockRejectedValue(dismissed())
		const wrapper = mountWindow()
		await flushPromises()

		await byTestId(wrapper, "passkey-window-close").trigger("click")
		await flushPromises()
		expect(client.rejectPasskeyRequest).toHaveBeenCalledWith("req-1")
		expect(closeWindow).toHaveBeenCalledTimes(1)
	})

	test("one attempt at a time: a second Try again while the first is asking does nothing", async () => {
		ceremony.run.mockRejectedValueOnce(dismissed()).mockReturnValue(new Promise(() => undefined))
		const wrapper = mountWindow()
		await flushPromises()

		const retry = byTestId(wrapper, "passkey-window-retry")
		await retry.trigger("click")
		await retry.trigger("click")
		await flushPromises()
		expect(ceremony.run).toHaveBeenCalledTimes(2)
	})

	test("closing the window stops the passkey request and lets the client go", async () => {
		let signal!: AbortSignal
		ceremony.run.mockImplementation((_req: unknown, s: AbortSignal) => {
			signal = s
			return new Promise(() => undefined)
		})
		const wrapper = mountWindow()
		await flushPromises()

		wrapper.unmount()
		expect(signal.aborted).toBe(true)
		expect(client.disconnect).toHaveBeenCalledTimes(1)
	})
})
