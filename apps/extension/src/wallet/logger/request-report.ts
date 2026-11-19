import { getLogLevelName } from "./format"
import type { RequestCapture, RequestStage } from "./request-log"
import { scrubReportText } from "./utils"

export type ReportContext = { walletVersion: string; browser: string; networkName: string | undefined }

const NETWORK_NAME_CHARS = 64

export function requestReportFileName(walletTraceId: string): string {
	return `nulo-request-${walletTraceId}.txt`
}

/** `Chrome 131` or `Firefox 132` from a user agent; Brave and Edge read as Chrome. */
export function browserOf(userAgent: string): string {
	const firefox = /Firefox\/(\d+)/.exec(userAgent)
	if (firefox) return `Firefox ${firefox[1]}`
	const chrome = /Chrome\/(\d+)/.exec(userAgent)
	return chrome ? `Chrome ${chrome[1]}` : "unknown"
}

const iso = (at: number) => new Date(at).toISOString()

function timelineLine(stage: RequestStage): string {
	const duration = stage.end === undefined ? "-" : `${stage.end - stage.start} ms`
	return [iso(stage.start), duration, stage.stage, stage.outcome].filter((part) => part !== undefined).join("  ")
}

/** Every line takes the text pass again, so nothing a capture held unscrubbed can reach the file. */
export function buildRequestReport(capture: RequestCapture, context: ReportContext): string {
	const network = (context.networkName ?? "unknown").slice(0, NETWORK_NAME_CHARS)
	const counted = capture.dropped > 0 ? `${capture.lines.length}, ${capture.dropped} dropped` : `${capture.lines.length}`
	const envelope = capture.envelope ? JSON.stringify(capture.envelope, null, 2).split("\n") : ["(no answer yet)"]
	// The send's recorded error is its terminal journal entry's outcome, kept apart for its larger cap.
	const terminal = capture.journalError === undefined ? undefined : capture.stages.findLast((stage) => stage.kind === "journal")
	const withCause = (stage: RequestStage): RequestStage =>
		stage === terminal ? { ...stage, outcome: [stage.outcome, capture.journalError].filter(Boolean).join(": ") } : stage
	const lines = [
		`Wallet version: ${context.walletVersion}`,
		`Browser: ${context.browser}`,
		`Network: ${network}`,
		`Trace id: ${capture.walletTraceId}`,
		`dApp origin host: ${capture.originHost}`,
		"",
		"Timeline",
		// Stages are appended as they finish; the timeline reads by start, ties in arrival order.
		...[...capture.stages].sort((a, b) => a.start - b.start).map((stage) => timelineLine(withCause(stage))),
		"",
		`Log lines (${counted})`,
		...capture.lines.map((line) => `${iso(line.at)} ${line.context}:${line.source} ${getLogLevelName(line.level)} ${line.text}`),
		"",
		"Error envelope",
		...envelope,
	]
	return `${lines.map(scrubReportText).join("\n")}\n`
}
