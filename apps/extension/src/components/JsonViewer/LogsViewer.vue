<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Vendor */
import { onMounted, ref } from "vue"
import { EditorView } from "codemirror"
import { EditorState } from "@codemirror/state"
import { keymap, highlightActiveLine } from "@codemirror/view"
import { defaultKeymap } from "@codemirror/commands"
import { searchKeymap } from "@codemirror/search"

/** Components */
import LogsToolbar from "./LogsToolbar.vue"

/** Utils */
import { defaultConfig } from "@/wallet/config"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { LogViewerServiceClient } from "@/wallet/services/log-viewer/client"
import { downloadFile } from "@/utils"

/** Composables */
import { useToast } from "@/composables/toast"
const { openToast } = useToast()

/** Logs helpers */
import { droppedPrefixLength, formatSingleLog, logsDocument } from "./logs-format"
import { buildLogsCsv } from "./logs-csv"
import { logDecorationsField } from "./logs-decoration"
import { useLogFilters } from "./useLogFilters"
import { createLoggerTheme } from "./creator.js"
import { editorShadowRoot } from "./editor-shadow"

const editorRef = ref(null)
let view = null

const logViewerService = new LogViewerServiceClient()
logViewerService.onLog.add(onLogAdded)

const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)

const logs = ref([])
const filters = useLogFilters()
const filteredLogs = computed(() => logs.value.filter((log) => filters.isLogInclude(log)))

const AUTO_SCROLL_TIMEOUT_MS = 30_000
const SCROLL_DISABLE_THRESHOLD = 20
const MAX_LOGS_DIFF = 100
const maxLogsCount = ref(defaultConfig().debugMode ? 10_000 : 1_000)

const shouldAutoScroll = ref(true)
const showScrollBtn = ref(false)
let scrollTimeout = null
let snapshotPending = false
let lastScrollTop = 0

function onLogAdded(log) {
	logs.value.push(log)
	const dropped = logs.value.length > maxLogsCount.value + MAX_LOGS_DIFF ? logs.value.splice(0, MAX_LOGS_DIFF) : []
	if (!view) return

	// One change set against one document: the append offset is the length before the trim.
	const changes = []
	const trimmed = droppedPrefixLength(view.state, dropped)
	if (trimmed) changes.push({ from: 0, to: trimmed })
	const appended = filters.isLogInclude(log)
	if (appended) changes.push({ from: view.state.doc.length, insert: `${formatSingleLog(log)}\n` })
	if (changes.length) {
		const set = view.state.changes(changes)
		view.dispatch({ changes: set, effects: holdPlace(set) })
	}
	if (!appended) return

	if (shouldAutoScroll.value) scrollToBottom()
	else showScrollBtn.value = true
}

// CodeMirror keeps a view resting within 4px of its end at its end, which would carry a selection
// or a search held there away, so while not following a change carries the view's place. A snapshot
// taken before CodeMirror measures reads the old scroll offset against a trimmed document: a later
// change in the same frame leaves the pending one for CodeMirror to map through its changes.
function holdPlace(changes) {
	if (shouldAutoScroll.value || snapshotPending) return []
	snapshotPending = true
	view.requestMeasure({ read: () => (snapshotPending = false) })
	// The snapshot replaces a follow still due, whose scroll then never comes to lower the reference.
	lastScrollTop = Math.min(lastScrollTop, view.scrollDOM.scrollTop)
	return view.scrollSnapshot().map(changes)
}

function enableAutoScroll() {
	clearTimeout(scrollTimeout)
	shouldAutoScroll.value = true
}
function disableAutoScroll() {
	clearTimeout(scrollTimeout)
	shouldAutoScroll.value = false
	scrollTimeout = setTimeout(() => {
		shouldAutoScroll.value = true
	}, AUTO_SCROLL_TIMEOUT_MS)
}
// Only a scroll that moved the view down resumes the follow at the end: a trim's held view comes
// back up into the end band, and must stay held.
function updateShouldAutoScroll() {
	const el = view?.scrollDOM
	if (!el) return
	const movedDown = el.scrollTop > lastScrollTop
	lastScrollTop = el.scrollTop
	if (el.scrollHeight - el.scrollTop - el.clientHeight >= SCROLL_DISABLE_THRESHOLD) {
		showScrollBtn.value = true
		disableAutoScroll()
	} else if (movedDown) {
		showScrollBtn.value = false
		enableAutoScroll()
	}
}
// Chrome reports a selection inside a shadow root only through the root, retargeting the
// document's to the host; Firefox's root has no `getSelection` and its document's reaches inside.
function editorSelection() {
	const root = editorRef.value?.shadowRoot
	return root?.getSelection ? root.getSelection() : document.getSelection()
}
// Resumes the follow itself: at the end the scroll moves nothing, so no scroll event would.
function scrollToBottom() {
	if (!view) return
	enableAutoScroll()
	const lastLine = view.state.doc.line(view.state.doc.lines)
	view.dispatch({ effects: EditorView.scrollIntoView(lastLine.from, { y: "end" }) })
	// The follow's own landing must not read as the reader moving down: no scroll does until the next
	// scroll event resets this, once CodeMirror's listener, registered first, has landed every follow
	// still due. Reading the end instead would force a layout per line.
	lastScrollTop = Number.POSITIVE_INFINITY
	showScrollBtn.value = false
}

function updateEditorContent() {
	if (!view) return
	const newDoc = logsDocument(filteredLogs.value)
	const currentDoc = view.state.doc.toString()
	if (currentDoc === newDoc) return

	view.dispatch({
		changes: { from: 0, to: currentDoc.length, insert: newDoc },
	})
	requestAnimationFrame(() => {
		if (shouldAutoScroll.value) scrollToBottom()
	})
}

function scrollToTargetLog(targetLogId) {
	if (!view) return
	const idx = logs.value.findIndex((l) => l.id === targetLogId)
	if (idx === -1) return
	// The editor stores every line break as "\n": measure the logs before it as the editor holds them.
	const pos = view.state.toText(logsDocument(logs.value.slice(0, idx))).length
	view.dispatch({
		effects: EditorView.scrollIntoView(pos, { y: "center" }),
		selection: { anchor: pos },
	})
	// A held line must not replace the pending target with its snapshot: CodeMirror maps a pending
	// target through later changes, but a later scroll effect replaces it, and it runs this read in the
	// measure that applies the target, before applying it. The target's landing is the viewer's own
	// scroll, which must not read as the reader moving down.
	snapshotPending = true
	view.requestMeasure({ read: () => (snapshotPending = false) })
	lastScrollTop = Number.POSITIVE_INFINITY
}

const handleToggleFilter = (kind, value) => {
	filters.updateFilter(kind, value)
	updateEditorContent()
}
const handleSelectAll = (kind) => {
	filters.selectAll(kind)
	updateEditorContent()
}

async function exportLogsToCSV() {
	try {
		const csv = buildLogsCsv(logs.value)
		await downloadFile({
			data: csv,
			filename: `NuloWalletLogs_${Math.floor(Date.now() / 1000)}.csv`,
		})
		openToast({ kind: "success", label: "Logs downloaded successfully" })
	} catch (err) {
		console.error(err)
		openToast({ kind: "error", label: "Failed to download logs" })
	}
}

async function handleClearLogs() {
	logViewerService.onLog.remove(onLogAdded)
	try {
		await logViewerService.clearLogs()
	} catch (err) {
		openToast({ kind: "error", label: "Failed to clear logs" })
		console.error(err)
		return
	} finally {
		// Back before the list is emptied, so a line that lands during the redraw tick is kept.
		logViewerService.onLog.add(onLogAdded)
	}
	logs.value = []
	await nextTick()
	updateEditorContent()
}

async function getLogs() {
	const res = []
	while (true) {
		const batch = await fetchLogs(1024, res.at(-1)?.id)
		res.push(...batch)
		if (
			batch.length !== 1024 &&
			batch.length !== 256 &&
			batch.length !== 64 &&
			batch.length !== 16 &&
			batch.length !== 4 &&
			batch.length !== 1
		) {
			break
		}
	}
	return res
}

async function fetchLogs(cnt, fromId) {
	let timer
	try {
		const fetch = logViewerService.getLogs(cnt, fromId)
		const timeout = new Promise((_, reject) => {
			timer = setTimeout(() => reject("Logs fetch timeout"), 500)
		})
		try {
			await Promise.race([fetch, timeout])
		} finally {
			clearTimeout(timer)
		}
		return await fetch
	} catch {
		if (cnt === 1) throw new Error("Failed to fetch logs")
		return await fetchLogs(cnt / 4, fromId)
	}
}

async function onSettingUpdate(setting) {
	if (setting.key === "debugMode") {
		maxLogsCount.value = setting.value ? 10_000 : 1_000
		logs.value = await getLogs()
		updateEditorContent()
	}
}

onMounted(async () => {
	await nextTick()

	maxLogsCount.value = (await configService.getValue("debugMode")) ? 10_000 : 1_000
	logs.value = await getLogs()

	view = new EditorView({
		parent: editorShadowRoot(editorRef.value),
		state: EditorState.create({
			doc: logsDocument(logs.value),
			extensions: [
				keymap.of([...defaultKeymap, ...searchKeymap]),
				...createLoggerTheme(),
				highlightActiveLine(),
				EditorState.readOnly.of(true),
				logDecorationsField,
			],
		}),
	})

	view.scrollDOM?.addEventListener("scroll", updateShouldAutoScroll)

	document.addEventListener("selectionchange", () => {
		const selection = editorSelection()
		if (selection && !selection.isCollapsed) disableAutoScroll()
	})

	// On the shadow root, not the document: focus moving inside the root, as from the content to the
	// search panel, never leaves it, its target and related target both retargeting to the host.
	editorRef.value.shadowRoot.addEventListener("focusin", (e) => {
		if (e.target.closest?.(".cm-panel.cm-search")) disableAutoScroll()
	})

	const params = new URLSearchParams(window.location.search)
	const targetLogId = params.get("logId")
	if (targetLogId) {
		scrollToTargetLog(+targetLogId)
		disableAutoScroll()
	} else {
		requestAnimationFrame(() => scrollToBottom())
	}
})

onBeforeUnmount(() => {
	logViewerService.disconnect()
	configService.disconnect()
	clearTimeout(scrollTimeout)
	view?.scrollDOM?.removeEventListener("scroll", updateShouldAutoScroll)
})
</script>

<template>
	<div :class="$style.wrapper">
		<LogsToolbar
			:popovers="filters.popovers"
			:filters="filters.filters"
			:searchTerm="filters.searchTerm.value"
			:allOptionsSelected="filters.allOptionsSelected.value"
			@openPopover="filters.openPopover"
			@closePopover="filters.closePopover"
			@toggleFilter="handleToggleFilter"
			@selectAll="handleSelectAll"
			@update:searchTerm="filters.searchTerm.value = $event"
			@exportCsv="exportLogsToCSV"
			@clearLogs="handleClearLogs"
		/>

		<Flex v-if="showScrollBtn" data-testid="logs-scroll-btn" @click="scrollToBottom" align="center" :class="$style.scroll_btn">
			<Icon name="forward" size="24" rotate="90" color="tertiary" />
		</Flex>

		<div ref="editorRef" data-testid="logs-editor" :class="$style.logs_viewer" />
	</div>
</template>

<style module>
.wrapper {
	width: 100vw;
	height: 100vh;
	display: flex;
	flex-direction: column;
}

.logs_viewer {
	display: flex;
	flex: 1 1 auto;
	overflow: hidden;
}

.scroll_btn {
	user-select: none;
	position: absolute;
	right: 18px;
	bottom: 18px;
	z-index: 1;

	padding: 4px 4px;
	background-color: var(--nulo-surface);
	border: 1px solid var(--nulo-border);
	border-radius: 50%;
	box-shadow: 0 1px 2px rgba(10, 9, 8, 0.3);

	cursor: pointer;

	&:hover {
		background: var(--dropdown-bg);
		border-color: var(--nulo-outline);
		svg {
			color: var(--txt-secondary);
		}
	}

	&:active {
		transform: scale(0.9);
	}
}
</style>
