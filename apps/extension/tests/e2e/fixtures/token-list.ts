/**
 * Signed token lists for the smoke suite. No launch fetches one by itself: a launch records Terms
 * acceptance by writing storage, which no listener hears, and the worker that booted before that
 * write saw no acceptance. A launch that needs the list's entries (a priced token, the defaults)
 * holds one from its first boot instead: `launchExtension({ tokenList: "held" })`.
 *
 * A source run signs with a per-process key that the armed build reads from `nulo:e2e:token-list`.
 * An artifact run holds the published envelope, the only list a release build's pinned keys accept.
 */
import { readFileSync } from "node:fs"
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http"
import path from "node:path"
import type { Page } from "puppeteer"
import { inject } from "vitest"
import { readTokenList, selectEntries, parsePayload, type PinnedKey, type TokenListEntry } from "@nulo/token-list"
import { decodeBase64Url, importSeed, publicKeyOf } from "@nulo/token-list/envelope"
import { signList } from "@nulo/token-list/sign"
import { E2E_TOKEN_LIST_KEY_ID, TOKEN_LIST_SOURCE_KEY } from "@/e2e/chrome-storage-token-list"
import { TOKEN_SEEDS_KEY } from "@/e2e/chrome-storage-token-seeds"
import { TOKEN_LIST_REFRESH_ALARM_NAME } from "@/wallet/services/token-list/spec"
import { REPO_ROOT } from "../lockfile"
import { listenClaimed } from "./egress-guard"

const LIST_PATH = "/v1/list.json"
const SOURCE_PATH = path.join(REPO_ROOT, "infra/token-list/list.source.json")
const PUBLISHED_PATH = path.join(REPO_ROOT, "infra/token-list/public/v1/list.json")
const STORAGE_KEY = "nulo:core:token-list"
/** Inside the service's longest deadline, so it is kept, and past any spec: the held list is never refetched. */
const HELD_FOR_MS = 12 * 60 * 60 * 1000

type Signer = { seedHex: string; pinned: PinnedKey }
let signer: Promise<Signer> | undefined

/** One Ed25519 key per test process. Its seed never leaves this module. */
export function e2eSigner(): Promise<Signer> {
	signer ??= (async () => {
		const seedHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")
		const publicKey = await publicKeyOf(await importSeed(seedHex))
		return { seedHex, pinned: { keyId: E2E_TOKEN_LIST_KEY_ID, publicKey } }
	})()
	return signer
}

/** `list.source.json` (or `tokens` in its place) signed with the run's key, at `nowMs`'s sequence. */
export async function signTestList(opts: { tokens?: readonly unknown[]; nowMs?: number } = {}): Promise<string> {
	const { seedHex, pinned } = await e2eSigner()
	const sourceText = opts.tokens === undefined ? readFileSync(SOURCE_PATH, "utf8") : JSON.stringify({ tokens: opts.tokens })
	const signed = await signList({ sourceText, seedHex, keyId: pinned.keyId, nowMs: opts.nowMs ?? Date.now(), keys: [pinned] })
	return signed.envelopeText
}

/** A list in the run key's name, signed by another key: what a host that holds no signing key can serve. */
export async function signForgedList(): Promise<string> {
	const { pinned } = await e2eSigner()
	const seedHex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")
	const forger = { keyId: pinned.keyId, publicKey: await publicKeyOf(await importSeed(seedHex)) }
	const sourceText = readFileSync(SOURCE_PATH, "utf8")
	return (await signList({ sourceText, seedHex, keyId: forger.keyId, nowMs: Date.now(), keys: [forger] })).envelopeText
}

export type ListRequest = { cookie?: string; referer?: string; origin?: string }

export interface ListHost {
	/** What the armed build's source names: `http://localhost`, never a granted host. */
	url: string
	/** The page a browser tab opens to store a cookie for the host. */
	cookieUrl: string
	serve(envelope: string): void
	/** The headers of every list request so far, in order. */
	requests(): readonly ListRequest[]
	stop(): Promise<void>
}

/** The production host's `/*` headers, so the browser meets the same CORS and caching rules. */
function workerHeaders(): Record<string, string> {
	const lines = readFileSync(path.join(REPO_ROOT, "infra/token-list/public/_headers"), "utf8").split("\n")
	return Object.fromEntries(
		lines.filter((line) => /^\s+[\w-]+:/.test(line)).map((line) => line.trim().split(/:\s*(.*)/s, 2) as [string, string]),
	)
}

/** A loopback stand-in for `tokens.nulo.sh`, on a port claimed in the host registry. */
export async function serveTokenList(): Promise<ListHost> {
	const headers = { ...workerHeaders(), "Content-Type": "application/json" }
	const seen: ListRequest[] = []
	let envelope = ""
	const handle = (req: IncomingMessage, res: ServerResponse) => {
		req.resume()
		if (req.url === "/cookie") return res.writeHead(200, { "Set-Cookie": "nulo-e2e=1; Path=/" }).end("ok")
		if (req.url !== LIST_PATH) return res.writeHead(404).end()
		seen.push({ cookie: req.headers.cookie, referer: req.headers.referer, origin: req.headers.origin })
		res.writeHead(200, headers).end(envelope)
	}
	const { server, port, release } = await listenClaimed<Server>(() => createServer(handle), "token-list-host")
	let stopping: Promise<void> | undefined
	return {
		url: `http://localhost:${port}${LIST_PATH}`,
		cookieUrl: `http://localhost:${port}/cookie`,
		serve: (text) => {
			envelope = text
		},
		requests: () => seen,
		stop: () => {
			stopping ??= new Promise<void>((resolve) => {
				server.closeAllConnections()
				server.close(() => resolve())
			}).finally(release)
			return stopping
		},
	}
}

/** The worker's refresh alarm, fired now from an extension page: the daily refresh, brought forward. */
export async function requestListRefresh(page: Page): Promise<void> {
	await page.evaluate((name: string) => chrome.alarms.create(name, { when: Date.now() }), TOKEN_LIST_REFRESH_ALARM_NAME)
}

export type StoredListState = { envelope?: string; failures: number }

/** Waits for the worker's stored list state to satisfy `done`, and returns it. */
export async function waitForStoredList(
	page: Page,
	done: (state: StoredListState) => boolean,
	timeoutMs = 15_000,
): Promise<StoredListState> {
	const deadline = Date.now() + timeoutMs
	let state: StoredListState = { failures: 0 }
	while (Date.now() < deadline) {
		state = await page.evaluate(async (key: string) => {
			const raw = (await chrome.storage.local.get(key))[key]
			return typeof raw === "string" ? (JSON.parse(raw) as StoredListState) : { failures: 0 }
		}, STORAGE_KEY)
		if (done(state)) return state
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	throw new Error(`the stored token list never reached the expected state within ${timeoutMs / 1000}s: failures ${state.failures}`)
}

const isArtifactRun = (): boolean => inject("liveLeg") === true

function publishedEnvelope(): string {
	try {
		return readFileSync(PUBLISHED_PATH, "utf8")
	} catch {
		throw new Error(
			"an artifact run holds the published token list, and infra/token-list/public/v1/list.json does not exist: publish one first",
		)
	}
}

/**
 * The entries the wallet acts on in the list a held launch carries, read without verifying: the
 * wallet verified it, and a spec only needs to know which tokens it names.
 */
export function heldListEntries(): TokenListEntry[] {
	if (!isArtifactRun()) return selectEntries((JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as { tokens: TokenListEntry[] }).tokens)
	const { payload } = JSON.parse(publishedEnvelope()) as { payload: string }
	const bytes = decodeBase64Url(payload)
	if (!bytes) throw new Error("the published token list's payload is not base64url")
	return selectEntries(parsePayload(bytes, "wallet").tokens)
}

/**
 * What a held launch writes before the worker restarts: the stored list it boots from, and in a
 * source run the key it verifies with plus an empty seed list, so the profile shows no defaults as
 * before. The source's URL is never fetched: the stored deadline outlives the launch.
 */
export async function heldListStorage(): Promise<{ local: Record<string, string>; session: Record<string, unknown> }> {
	const now = Date.now()
	const envelope = isArtifactRun() ? publishedEnvelope() : await signTestList({ nowMs: now })
	const local = { [STORAGE_KEY]: JSON.stringify({ envelope, failures: 0, nextAttemptAt: now + HELD_FOR_MS }) }
	if (isArtifactRun()) {
		await readTokenList(envelope)
		return { local, session: {} }
	}
	const { pinned } = await e2eSigner()
	await readTokenList(envelope, [pinned])
	return {
		local,
		session: {
			[TOKEN_LIST_SOURCE_KEY]: { url: "http://localhost:9/v1/list.json", publicKey: pinned.publicKey },
			// An array that is not exactly one sandbox seed reads as "seed nothing".
			[TOKEN_SEEDS_KEY]: [],
		},
	}
}
