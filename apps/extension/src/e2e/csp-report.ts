import { scrubUrls } from "@/utils/scrub-urls"

/**
 * E2E-only recorder of Content-Security-Policy violations, for every extension context.
 *
 * The background is the only writer: it appends each violation, its own and those the documents
 * forward, to {@link CSP_VIOLATIONS_KEY} in `chrome.storage.session` through one serialized chain.
 * When it loads it creates the key as an empty list only if the key is absent, so a successor
 * background never erases what an earlier instance recorded, and an armed run that finds no key
 * knows the recorder never ran. Documents forward over `runtime.sendMessage`, because the
 * offscreen document has no `chrome.storage` and a second writer would race the first.
 *
 * Built in only when `VITE_NULO_E2E_CSP_REPORT=1`. Each entry tests that variable as a literal
 * rather than through a constant in `./config.ts`: a module that several entries import gets a
 * chunk of its own unless the bundler can fold every importer's condition before it splits, so a
 * shared constant would ship this module, unused, in a release build. The single flag is
 * proportionate, as for the migration fixture: an armed recorder only listens and keeps a
 * session-scoped list, and the release build refuses the flag and greps its bundles for the key.
 */

/** Read by the e2e launch fixture; the release workflow greps release bundles for it. */
export const CSP_VIOLATIONS_KEY = "nulo:e2e:csp-violations"
export const CSP_VIOLATION_MESSAGE = "nulo:e2e:csp-violation"
/** Answered once every append received before it has been written. */
export const CSP_FLUSH_MESSAGE = "nulo:e2e:csp-flush"

/** One entry already fails the run; the cap keeps a violation in a loop from filling session storage. */
const MAX_ENTRIES = 50
const MAX_FIELD_LENGTH = 300

export interface CspViolation {
	/** The document's path, or `background`. */
	context: string
	directive: string
	/** The blocked resource, a web URL reduced to its origin, or the browser's keyword for it (`inline`, `eval`). */
	blocked: string
	/** The script that caused it, with its line. */
	source: string
}

export interface SessionArea {
	get(key: string): Promise<Record<string, unknown>>
	set(items: Record<string, unknown>): Promise<void>
}

type MessageListener = (message: unknown, sender: { url?: string }, sendResponse: (response: unknown) => void) => boolean

export interface BackgroundRecorderDeps {
	scope: EventTarget
	storage: SessionArea
	addMessageListener(listener: MessageListener): void
	/** `runtime.getURL("")`: only the extension's own documents may report or flush. */
	extensionOrigin: string
}

export interface PageRecorderDeps {
	scope: EventTarget
	context: string
	send(message: unknown): Promise<unknown>
}

const clip = (value: string) => value.slice(0, MAX_FIELD_LENGTH)

export function toViolation(event: SecurityPolicyViolationEvent, context: string): CspViolation {
	const line = event.lineNumber ? `:${event.lineNumber}` : ""
	return {
		context: clip(context),
		directive: clip(event.effectiveDirective || event.violatedDirective),
		blocked: clip(scrubUrls(event.blockedURI)),
		source: clip(`${scrubUrls(event.sourceFile)}${line}`),
	}
}

function parseViolation(value: unknown): CspViolation | undefined {
	if (typeof value !== "object" || value === null) return undefined
	const { context, directive, blocked, source } = value as Record<string, unknown>
	const fields = [context, directive, blocked, source]
	if (!fields.every((field) => typeof field === "string")) return undefined
	return {
		context: clip(context as string),
		directive: clip(directive as string),
		blocked: clip(blocked as string),
		source: clip(source as string),
	}
}

async function readList(storage: SessionArea): Promise<unknown[] | undefined> {
	const stored = (await storage.get(CSP_VIOLATIONS_KEY))[CSP_VIOLATIONS_KEY]
	return Array.isArray(stored) ? stored : undefined
}

async function appendViolation(storage: SessionArea, violation: CspViolation): Promise<void> {
	const list = (await readList(storage)) ?? []
	if (list.length >= MAX_ENTRIES) return
	await storage.set({ [CSP_VIOLATIONS_KEY]: [...list, violation] })
}

export function installBackgroundRecorder(deps: BackgroundRecorderDeps): void {
	const { storage } = deps
	let chain = Promise.resolve()
	const enqueue = (step: () => Promise<void>) => {
		chain = chain.then(step).catch((err) => console.warn("[e2e-csp] recording a violation failed", { error: err }))
	}
	enqueue(async () => {
		if ((await storage.get(CSP_VIOLATIONS_KEY))[CSP_VIOLATIONS_KEY] === undefined) await storage.set({ [CSP_VIOLATIONS_KEY]: [] })
	})

	deps.scope.addEventListener("securitypolicyviolation", (event) => {
		const violation = toViolation(event as SecurityPolicyViolationEvent, "background")
		enqueue(() => appendViolation(storage, violation))
	})
	deps.addMessageListener((message, sender, sendResponse) => {
		if (!sender.url?.startsWith(deps.extensionOrigin)) return false
		const { type, violation } = (message ?? {}) as { type?: unknown; violation?: unknown }
		if (type === CSP_VIOLATION_MESSAGE) {
			const parsed = parseViolation(violation)
			if (parsed) enqueue(() => appendViolation(storage, parsed))
			return false
		}
		if (type !== CSP_FLUSH_MESSAGE) return false
		void chain.then(() => sendResponse(true))
		return true
	})
}

export function installPageRecorder(deps: PageRecorderDeps): void {
	deps.scope.addEventListener("securitypolicyviolation", (event) => {
		const violation = toViolation(event as SecurityPolicyViolationEvent, deps.context)
		deps.send({ type: CSP_VIOLATION_MESSAGE, violation }).catch((err) =>
			console.warn("[e2e-csp] a violation could not reach the background", { error: err }),
		)
	})
}

/**
 * For the background entry, as its first statement, so its listeners are added at module scope
 * and a message that wakes the background reaches them. A violation raised while the imports
 * evaluated is dispatched as a later task, so it still reaches the listener added here.
 */
export function recordCspViolationsInBackground(): void {
	installBackgroundRecorder({
		scope: globalThis,
		storage: chrome.storage.session,
		addMessageListener: (listener) => chrome.runtime.onMessage.addListener(listener),
		extensionOrigin: chrome.runtime.getURL(""),
	})
}

/** For each document entry, as its first statement, for the same reason as the background's. */
export function recordCspViolationsInPage(): void {
	installPageRecorder({ scope: globalThis, context: location.pathname, send: (message) => chrome.runtime.sendMessage(message) })
}
