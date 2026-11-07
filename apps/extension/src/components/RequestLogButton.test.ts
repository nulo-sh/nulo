import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

const H = vi.hoisted(() => ({
	findRequestTrace: vi.fn(),
	getRequestReport: vi.fn(),
	disconnect: vi.fn(),
	downloadFile: vi.fn(),
	openToast: vi.fn(),
}))

vi.mock("@/wallet/services/log-viewer/client", () => ({
	LogViewerServiceClient: vi.fn(function () {
		return { findRequestTrace: H.findRequestTrace, getRequestReport: H.getRequestReport, disconnect: H.disconnect }
	}),
}))
vi.mock("@/utils/files", () => ({ downloadFile: H.downloadFile }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: H.openToast }) }))

import RequestLogButton from "./RequestLogButton.vue"

const ButtonStub = { name: "Button", props: ["variant", "size", "loading"], template: "<button v-bind='$attrs'><slot /></button>" }
const IconStub = { name: "Icon", props: ["name", "size"], template: "<i />" }

function mountButton(props: { journalId?: string; interactionId?: string }) {
	return mount(RequestLogButton, { props, global: { stubs: { Button: ButtonStub, Icon: IconStub } } })
}

beforeEach(() => {
	for (const fn of Object.values(H)) fn.mockReset()
})

describe("RequestLogButton", () => {
	test("renders nothing when the wallet kept no logs for the request", async () => {
		H.findRequestTrace.mockResolvedValue(undefined)
		const wrapper = mountButton({ journalId: "0123456789abcdef" })
		await flushPromises()
		expect(H.findRequestTrace).toHaveBeenCalledWith({ journalId: "0123456789abcdef" })
		expect(wrapper.find('[data-testid="request-log-download"]').exists()).toBe(false)
	})

	test("asks by interaction in the execute window, and shows the download chip once a trace is found", async () => {
		H.findRequestTrace.mockResolvedValue("1a2b3c4d")
		const wrapper = mountButton({ interactionId: "fedcba9876543210" })
		await flushPromises()
		expect(H.findRequestTrace).toHaveBeenCalledWith({ interactionId: "fedcba9876543210" })
		const button = wrapper.findComponent(ButtonStub)
		expect(button.text()).toBe("Download logs")
		expect(button.props()).toMatchObject({ variant: "secondary", size: "small" })
		expect(button.findComponent(IconStub).props("name")).toBe("download")
	})

	test("a click downloads nulo-request-<id>.txt holding the report's text", async () => {
		H.findRequestTrace.mockResolvedValue("1a2b3c4d")
		H.getRequestReport.mockResolvedValue({ fileName: "nulo-request-1a2b3c4d.txt", text: "Trace id: 1a2b3c4d\n" })
		const wrapper = mountButton({ journalId: "0123456789abcdef" })
		await flushPromises()
		await wrapper.find('[data-testid="request-log-download"]').trigger("click")
		await flushPromises()
		expect(H.getRequestReport).toHaveBeenCalledWith("1a2b3c4d")
		expect(H.downloadFile).toHaveBeenCalledWith({ data: "Trace id: 1a2b3c4d\n", filename: "nulo-request-1a2b3c4d.txt" })
		expect(H.openToast).toHaveBeenCalledWith({ kind: "success", label: "Logs downloaded successfully" })
	})

	test("a report the wallet no longer has shows the error toast, downloads nothing and hides the button", async () => {
		H.findRequestTrace.mockResolvedValue("1a2b3c4d")
		H.getRequestReport.mockResolvedValue(undefined)
		const wrapper = mountButton({ journalId: "0123456789abcdef" })
		await flushPromises()
		await wrapper.find('[data-testid="request-log-download"]').trigger("click")
		await flushPromises()
		expect(H.downloadFile).not.toHaveBeenCalled()
		expect(H.openToast).toHaveBeenCalledWith({ kind: "error", label: "Failed to download logs" })
		expect(wrapper.find('[data-testid="request-log-download"]').exists()).toBe(false)
	})

	test("disconnects its client on unmount", async () => {
		H.findRequestTrace.mockResolvedValue(undefined)
		const wrapper = mountButton({ journalId: "0123456789abcdef" })
		await flushPromises()
		wrapper.unmount()
		expect(H.disconnect).toHaveBeenCalledTimes(1)
	})
})
