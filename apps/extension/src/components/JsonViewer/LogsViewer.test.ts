/**
 * The log viewer's fetch deadline and its capped document. The view is a stub over a real
 * `EditorState`, so the document keeps CodeMirror's line-break normalization.
 */
import type { EditorState, TransactionSpec } from "@codemirror/state"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type LogEntry, logsDocument } from "./logs-format"

interface StubView {
	state: EditorState
	dispatch: ReturnType<typeof vi.fn>
}

const H = vi.hoisted(() => ({
	getLogs: vi.fn(),
	clearLogs: vi.fn(),
	openToast: vi.fn(),
	editors: [] as unknown[],
	// A real handler, so a removed listener stops receiving; set per test.
	onLog: undefined as unknown as EventHandler<LogEntry>,
	onLogAdd: undefined as unknown as ReturnType<typeof vi.fn>,
	onUpdate: { add: vi.fn(), remove: vi.fn() },
}))

vi.mock("@/wallet/services/log-viewer/client", () => ({
	LogViewerServiceClient: vi.fn(function () {
		return { disconnect: vi.fn(), onLog: H.onLog, getLogs: H.getLogs, clearLogs: H.clearLogs }
	}),
}))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: vi.fn(function () {
		return { disconnect: vi.fn(), onUpdate: H.onUpdate, getValue: vi.fn().mockResolvedValue(false) }
	}),
}))
vi.mock("@/wallet/config", () => ({ defaultConfig: () => ({ debugMode: false }) }))
vi.mock("@/utils", () => ({ downloadFile: vi.fn() }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: H.openToast }) }))
vi.mock("./logs-decoration", () => ({ logDecorationsField: [] }))
vi.mock("./creator.js", () => ({ createLoggerTheme: () => [] }))
vi.mock("@codemirror/view", () => ({ keymap: { of: () => [] }, highlightActiveLine: () => [] }))
vi.mock("@codemirror/commands", () => ({ defaultKeymap: [] }))
vi.mock("@codemirror/search", () => ({ searchKeymap: [] }))
vi.mock("codemirror", () => {
	class EditorView {
		static scrollIntoView = () => ({ scrollTo: true })
		state: EditorState
		scrollDOM = { addEventListener: vi.fn(), removeEventListener: vi.fn(), scrollTop: 0, scrollHeight: 0, clientHeight: 0 }
		scrollSnapshot = () => ({ map: () => ({ snapshot: true }) })
		requestMeasure = vi.fn()
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

function mountViewer(attachTo?: HTMLElement) {
	return mount(LogsViewer, {
		attachTo,
		global: { stubs: { LogsToolbar: true, Flex: true, Icon: true } },
	})
}

beforeEach(() => {
	vi.useFakeTimers()
	H.getLogs.mockReset()
	H.clearLogs.mockReset()
	H.openToast.mockReset()
	H.onLog = new EventHandler<LogEntry>()
	H.onLogAdd = vi.spyOn(H.onLog, "add") as unknown as ReturnType<typeof vi.fn>
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
		const onLog = H.onLogAdd.mock.calls[0][0] as (entry: LogEntry) => void
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

describe("LogsViewer Clear logs", () => {
	const t = Date.now()
	const log = (id: number): LogEntry => ({ id, timestamp: t, source: "ui", level: 1, data: [`log ${id}`] })

	async function mountCleared(clearLogs: () => Promise<void>) {
		H.getLogs.mockResolvedValueOnce([log(1)]).mockResolvedValue([])
		H.clearLogs.mockImplementation(clearLogs)
		const wrapper = mountViewer()
		await vi.advanceTimersByTimeAsync(0)
		const view = H.editors[0] as StubView
		wrapper.findComponent({ name: "LogsToolbar" }).vm.$emit("clearLogs")
		await vi.advanceTimersByTimeAsync(0)
		return {
			wrapper,
			doc: () => view.state.doc.toString(),
			docOf: (entries: LogEntry[]) => view.state.toText(logsDocument(entries)).toString(),
		}
	}

	test("a failed clear keeps the window live", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {})
		const { wrapper, doc, docOf } = await mountCleared(() => Promise.reject(new Error("port closed")))
		expect(H.openToast).toHaveBeenCalledExactlyOnceWith({ kind: "error", label: "Failed to clear logs" })
		H.onLog.invoke(log(2))
		expect(doc()).toBe(docOf([log(1), log(2)]))
		wrapper.unmount()
	})

	test("a log that lands while a clear finishes is kept", async () => {
		// Delivered two microtasks after the clear answers: after the listener is back, during the redraw's tick.
		const { wrapper, doc, docOf } = await mountCleared(() => {
			const cleared = Promise.resolve()
			cleared.then(() => {}).then(() => H.onLog.invoke(log(2)))
			return cleared
		})
		expect(H.openToast).not.toHaveBeenCalled()
		expect(doc()).toBe(docOf([log(2)]))
		wrapper.unmount()
	})
})

describe("LogsViewer auto-scroll around the search panel", () => {
	const t = Date.now()
	const log = (id: number): LogEntry => ({ id, timestamp: t, source: "ui", level: 1, data: [`log ${id}`] })

	/** Focus moving from one element of the editor's shadow root to another, as CodeMirror's search
	 *  panel takes it from the content: the document never hears it, seeing the host as both the
	 *  target and the related target. */
	async function focusInEditor(className: string) {
		H.getLogs.mockResolvedValueOnce([log(1)]).mockResolvedValue([])
		const wrapper = mountViewer(document.body)
		await vi.advanceTimersByTimeAsync(0)
		const root = [...wrapper.element.querySelectorAll("div")].find((el) => el.shadowRoot)?.shadowRoot
		if (!root) throw new Error("the editor has no shadow root")
		const from = root.appendChild(document.createElement("div"))
		const holder = root.appendChild(document.createElement("div"))
		holder.className = className
		const input = holder.appendChild(document.createElement("input"))
		const view = H.editors[0] as StubView
		view.dispatch.mockClear()
		input.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true, relatedTarget: from }))
		H.onLog.invoke(log(2))
		const scrolled = view.dispatch.mock.calls.some(([spec]) => spec.effects?.scrollTo)
		return { wrapper, scrolled }
	}

	test("focus moving into the search panel stops it", async () => {
		const { wrapper, scrolled } = await focusInEditor("cm-panel cm-search")
		expect(scrolled).toBe(false)
		wrapper.unmount()
	})

	test("focus elsewhere in the editor keeps it", async () => {
		const { wrapper, scrolled } = await focusInEditor("cm-content")
		expect(scrolled).toBe(true)
		wrapper.unmount()
	})
})

/** A viewer following at its end, 400px over 1,000px of lines. The stub scroller moves only when a
 *  test sets it, so a scroll's landing and its event can be separated. */
async function followingAtEnd() {
	const t = Date.now()
	const log = (id: number): LogEntry => ({ id, timestamp: t, source: "ui", level: 1, data: [`log ${id}`] })
	H.getLogs.mockResolvedValueOnce([log(1)]).mockResolvedValue([])
	const wrapper = mountViewer()
	await vi.advanceTimersByTimeAsync(0)
	const view = H.editors[0] as StubView & {
		scrollDOM: { scrollTop: number; scrollHeight: number; clientHeight: number; addEventListener: ReturnType<typeof vi.fn> }
	}
	const el = view.scrollDOM
	const onScroll = el.addEventListener.mock.calls.find(([type]) => type === "scroll")?.[1] as () => void
	const scrollTo = (top: number, height = el.scrollHeight) => {
		Object.assign(el, { scrollTop: top, scrollHeight: height })
		onScroll()
	}
	el.clientHeight = 400
	scrollTo(600, 1_000)
	let next = 2
	const followsNext = () => {
		view.dispatch.mockClear()
		H.onLog.invoke(log(next++))
		return view.dispatch.mock.calls.some(([spec]) => spec.effects?.scrollTo)
	}
	return { wrapper, el, onScroll, scrollTo, followsNext, button: () => wrapper.find('[data-testid="logs-scroll-btn"]') }
}

describe("LogsViewer follow after a hold", () => {
	/** A viewer at its end, then held by a person scrolling 300px up: the scroll button shows. */
	async function held() {
		const viewer = await followingAtEnd()
		viewer.scrollTo(300)
		await viewer.wrapper.vm.$nextTick()
		return viewer
	}

	test("a scroll that moves the view up into the end band, as a trim's restore does, keeps the hold", async () => {
		const { wrapper, scrollTo, followsNext } = await held()
		scrollTo(200, 619)
		expect(followsNext()).toBe(false)
		wrapper.unmount()
	})

	test("a scroll that moves the view down into the end band resumes the follow", async () => {
		const { wrapper, scrollTo, followsNext } = await held()
		scrollTo(590)
		expect(followsNext()).toBe(true)
		wrapper.unmount()
	})

	test("the scroll button resumes the follow when the view already rests at the end", async () => {
		const { wrapper, scrollTo, followsNext, button } = await held()
		scrollTo(200, 619)
		await wrapper.vm.$nextTick()
		await button().trigger("click")
		expect(followsNext()).toBe(true)
		wrapper.unmount()
	})
})

describe("LogsViewer follow stopped by a selection", () => {
	function selectInEditor() {
		vi.spyOn(document, "getSelection").mockReturnValue({ isCollapsed: false } as Selection)
		document.dispatchEvent(new Event("selectionchange"))
	}

	/** A line grows the document 18px while following, and a selection stops the follow with that
	 *  line's scroll event still due; a scaled display lands it a fraction past the rounded end. */
	test.each([618, 618.4])("the follow's own scroll, landing at %s, keeps the hold", async (top) => {
		const { wrapper, el, onScroll, followsNext, button } = await followingAtEnd()
		el.scrollHeight = 1_018
		expect(followsNext()).toBe(true)
		selectInEditor()
		el.scrollTop = top
		onScroll()
		expect(followsNext()).toBe(false)
		await wrapper.vm.$nextTick()
		expect(button().exists()).toBe(true)
		wrapper.unmount()
	})

	test("the follow's own sub-pixel scroll, in a document a line overflows by under a pixel, keeps the hold", async () => {
		const { wrapper, el, onScroll, scrollTo, followsNext } = await followingAtEnd()
		scrollTo(0, 400)
		expect(followsNext()).toBe(true)
		selectInEditor()
		el.scrollTop = 0.4
		onScroll()
		expect(followsNext()).toBe(false)
		wrapper.unmount()
	})

	test("a reader's scroll down into the end band still resumes it", async () => {
		const { wrapper, el, onScroll, scrollTo, followsNext } = await followingAtEnd()
		el.scrollHeight = 1_018
		followsNext()
		selectInEditor()
		el.scrollTop = 618
		onScroll()
		scrollTo(300)
		scrollTo(610)
		expect(followsNext()).toBe(true)
		wrapper.unmount()
	})

	test("a held line whose snapshot replaces the follow still due leaves the reader's next scroll down free", async () => {
		const { wrapper, el, scrollTo, followsNext } = await followingAtEnd()
		el.scrollHeight = 1_018
		followsNext()
		selectInEditor()
		el.scrollHeight = 1_036
		expect(followsNext()).toBe(false)
		scrollTo(617)
		expect(followsNext()).toBe(true)
		wrapper.unmount()
	})

	test("after a follow with nothing to travel, the reader's second scroll down resumes it", async () => {
		const { wrapper, el, scrollTo, followsNext } = await followingAtEnd()
		scrollTo(0, 400)
		followsNext()
		selectInEditor()
		el.scrollHeight = 418
		scrollTo(0.4)
		scrollTo(0.8)
		expect(followsNext()).toBe(true)
		wrapper.unmount()
	})
})

describe("LogsViewer opened at a log", () => {
	const t = Date.now()
	const log = (id: number): LogEntry => ({ id, timestamp: t, source: "ui", level: 1, data: [`log ${id}`] })
	const home = window.location.href
	afterEach(() => window.history.replaceState(null, "", home))

	/** The window opened at log 3 of 3, 400px over 1,000px of lines: CodeMirror centres it as far as
	 *  the end lets it, so the target lands in the end band. */
	async function openedAtLatest() {
		window.history.replaceState(null, "", "?logId=3")
		H.getLogs.mockResolvedValueOnce([log(1), log(2), log(3)]).mockResolvedValue([])
		const wrapper = mountViewer()
		await vi.advanceTimersByTimeAsync(0)
		const view = H.editors[0] as StubView & {
			requestMeasure: ReturnType<typeof vi.fn>
			scrollDOM: { scrollTop: number; scrollHeight: number; clientHeight: number; addEventListener: ReturnType<typeof vi.fn> }
		}
		const el = view.scrollDOM
		const onScroll = el.addEventListener.mock.calls.find(([type]) => type === "scroll")?.[1] as () => void
		const scrollTo = (top: number) => {
			el.scrollTop = top
			onScroll()
		}
		Object.assign(el, { clientHeight: 400, scrollHeight: 1_000 })
		const targeted = view.dispatch.mock.calls.some(([spec]) => spec.effects?.scrollTo && spec.selection)
		const measure = () => {
			for (const [request] of view.requestMeasure.mock.calls) request.read()
		}
		let next = 4
		const nextLineDispatches = (effect: "scrollTo" | "snapshot") => {
			view.dispatch.mockClear()
			H.onLog.invoke(log(next++))
			return view.dispatch.mock.calls.some(([spec]) => spec.effects?.[effect])
		}
		const followsNext = () => nextLineDispatches("scrollTo")
		const snapshotsNext = () => nextLineDispatches("snapshot")
		return {
			wrapper,
			targeted,
			measure,
			scrollTo,
			followsNext,
			snapshotsNext,
			button: () => wrapper.find('[data-testid="logs-scroll-btn"]'),
		}
	}

	test("a line before CodeMirror's first measure leaves the target pending", async () => {
		const { wrapper, targeted, measure, scrollTo, snapshotsNext } = await openedAtLatest()
		expect(targeted).toBe(true)
		expect(snapshotsNext()).toBe(false)
		measure()
		scrollTo(590)
		expect(snapshotsNext()).toBe(true)
		wrapper.unmount()
	})

	test("the target's own scroll into the end band keeps the hold", async () => {
		const { wrapper, scrollTo, followsNext, button } = await openedAtLatest()
		scrollTo(590)
		expect(followsNext()).toBe(false)
		await wrapper.vm.$nextTick()
		expect(button().exists()).toBe(true)
		wrapper.unmount()
	})

	test("a reader's scroll down into the end band after it still resumes the follow", async () => {
		const { wrapper, scrollTo, followsNext } = await openedAtLatest()
		scrollTo(590)
		scrollTo(300)
		scrollTo(600)
		expect(followsNext()).toBe(true)
		wrapper.unmount()
	})
})
