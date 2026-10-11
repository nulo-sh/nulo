/**
 * The log viewer's fetch deadline and its capped document. The view is a stub over a real
 * `EditorState`, so the document keeps CodeMirror's line-break normalization.
 */
import type { EditorState, TransactionSpec } from "@codemirror/state"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { type LogEntry, logsDocument } from "./logs-format"

interface StubView {
	state: EditorState
	dispatch: ReturnType<typeof vi.fn>
}

const H = vi.hoisted(() => ({
	getLogs: vi.fn(),
	editors: [] as unknown[],
	onLog: { add: vi.fn(), remove: vi.fn() },
	onUpdate: { add: vi.fn(), remove: vi.fn() },
}))

vi.mock("@/wallet/services/log-viewer/client", () => ({
	LogViewerServiceClient: vi.fn(function () {
		return { disconnect: vi.fn(), onLog: H.onLog, getLogs: H.getLogs, clearLogs: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return { disconnect: vi.fn(), onUpdate: H.onUpdate, getValue: vi.fn().mockResolvedValue(false) }
	}),
}))
vi.mock("@/wallet/config", () => ({ defaultConfig: () => ({ debugMode: false }) }))
vi.mock("@/utils", () => ({ downloadFile: vi.fn() }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("./logs-decoration", () => ({ logDecorationsField: [] }))
vi.mock("./creator.js", () => ({ createLoggerTheme: () => [] }))
vi.mock("@codemirror/view", () => ({ keymap: { of: () => [] }, highlightActiveLine: () => [] }))
vi.mock("@codemirror/commands", () => ({ defaultKeymap: [] }))
vi.mock("@codemirror/search", () => ({ searchKeymap: [] }))
vi.mock("codemirror", () => {
	class EditorView {
		static scrollIntoView = () => ({})
		state: EditorState
		scrollDOM = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
		// Applies document changes only: the scroll effects are stubs.
		dispatch = vi.fn((spec: TransactionSpec) => {
			if (spec.changes) this.state = this.state.update({ changes: spec.changes }).state
		})
		constructor(config: { state: EditorState }) {
			this.state = config.state
			H.editors.push(this)
		}
	}
	return { EditorView }
})

import LogsViewer from "./LogsViewer.vue"

const DEADLINE_MS = 500

function mountViewer() {
	return mount(LogsViewer, {
		global: { stubs: { LogsToolbar: true, Flex: true, Icon: true } },
	})
}

beforeEach(() => {
	vi.useFakeTimers()
	H.getLogs.mockReset()
	H.onLog.add.mockClear()
	H.editors.length = 0
})

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("LogsViewer first document", () => {
	test("ends with a newline, so the first live line does not join the last loaded one", async () => {
		const t = Date.now()
		H.getLogs.mockResolvedValue([
			{ id: 1, timestamp: t, source: "a", level: 1, data: ["x"] },
			{ id: 2, timestamp: t, source: "b", level: 2, data: ["y"] },
		])
		const wrapper = mountViewer()
		await vi.advanceTimersByTimeAsync(0)
		const doc = (H.editors[0] as StubView).state.doc.toString()
		expect(doc.split("\n")).toHaveLength(3)
		expect(doc.endsWith("[b] WARN: y\n")).toBe(true)
		wrapper.unmount()
	})
})

describe("LogsViewer fetch deadline", () => {
	test("a batch that arrives in time clears its deadline timer", async () => {
		H.getLogs.mockResolvedValue([])
		const set = vi.spyOn(globalThis, "setTimeout")
		const clear = vi.spyOn(globalThis, "clearTimeout")
		const wrapper = mountViewer()
		await vi.advanceTimersByTimeAsync(0)
		expect(H.editors).toHaveLength(1)
		const armed = set.mock.calls.findIndex(([, ms]) => ms === DEADLINE_MS)
		expect(armed).toBeGreaterThanOrEqual(0)
		expect(clear).toHaveBeenCalledWith(set.mock.results[armed].value)
		wrapper.unmount()
	})

	test("a batch that misses the deadline is retried with a quarter of the count", async () => {
		H.getLogs.mockReturnValueOnce(new Promise(() => {})).mockResolvedValue([])
		const wrapper = mountViewer()
		await vi.advanceTimersByTimeAsync(0)
		expect(H.getLogs.mock.calls).toEqual([[1024, undefined]])
		expect(H.editors).toHaveLength(0)
		await vi.advanceTimersByTimeAsync(DEADLINE_MS)
		expect(H.getLogs.mock.calls).toEqual([
			[1024, undefined],
			[256, undefined],
		])
		expect(H.editors).toHaveLength(1)
		wrapper.unmount()
	})
})

describe("LogsViewer live log past the cap", () => {
	// The default cap (Debug mode off) plus the 100 entries the list drops at a time.
	const FULL = 1_100
	const t = Date.now()
	const log = (id: number, source = "ui", data = `log ${id}`): LogEntry => ({ id, timestamp: t, source, level: 1, data: [data] })

	async function mountOn(loaded: LogEntry[]) {
		H.getLogs.mockResolvedValueOnce(loaded.slice(0, 1024)).mockResolvedValue(loaded.slice(1024))
		const wrapper = mountViewer()
		await vi.advanceTimersByTimeAsync(0)
		const view = H.editors[0] as StubView
		view.dispatch.mockClear()
		const onLog = H.onLog.add.mock.calls[0][0] as (entry: LogEntry) => void
		return { wrapper, view, onLog, changeDispatches: () => view.dispatch.mock.calls.filter(([spec]) => spec.changes).length }
	}

	const full = () => Array.from({ length: FULL }, (_, i) => log(i + 1, "ui", i === 2 ? "first\r\nsecond" : `log ${i + 1}`))

	test("drops from the document exactly the entries the list drops, in one dispatch", async () => {
		const loaded = full()
		const { wrapper, view, onLog, changeDispatches } = await mountOn(loaded)
		const live = log(FULL + 1)
		onLog(live)
		const kept = [...loaded.slice(100), live]
		expect(view.state.doc.toString()).toBe(view.state.toText(logsDocument(kept)).toString())
		expect(changeDispatches()).toBe(1)
		wrapper.unmount()
	})

	test("trims even when the live log is one the filter keeps out", async () => {
		const loaded = full()
		const { wrapper, view, onLog, changeDispatches } = await mountOn(loaded)
		onLog(log(FULL + 1, "unlisted"))
		expect(view.state.doc.toString()).toBe(view.state.toText(logsDocument(loaded.slice(100))).toString())
		expect(changeDispatches()).toBe(1)
		wrapper.unmount()
	})

	test("under the cap, appends the live log and trims nothing", async () => {
		const loaded = full().slice(0, FULL - 1)
		const { wrapper, view, onLog } = await mountOn(loaded)
		const live = log(FULL)
		onLog(live)
		expect(view.state.doc.toString()).toBe(view.state.toText(logsDocument([...loaded, live])).toString())
		wrapper.unmount()
	})
})
