/**
 * The passkey's answers on the pages the run drives: each answer's PRF result kept in the page as
 * the wallet receives it, then drained into the run's needles, so O7 searches storage, logs and files
 * for it; and each answer's credential id, so a step binds a credential it minted, and checks one it
 * reused, by what the authenticator answered rather than by the row under test. A window the wallet
 * opens on its own is not watched; the run's ceremonies all run on its own pages.
 */
import type { Page } from "puppeteer"
import { type Answer, bindCeremonies, type Ceremony, type DiscoveryRequest } from "./checkers"
import type { CredentialRef } from "./model"
import type { RunState } from "./state"

type CaptureProbe = Window & { __chaosPrf?: string[]; __chaosAnswers?: Answer[]; __chaosPicks?: DiscoveryRequest[] }

/** Wraps the page's `navigator.credentials` once per document; a hook a driver installs later wraps
 *  this one, so every answer still passes through it. */
export async function capturePrf(page: Page): Promise<void> {
	await page.evaluate(() => {
		const probe = window as CaptureProbe
		if (probe.__chaosPrf) return
		probe.__chaosPrf = []
		probe.__chaosAnswers = []
		const credentials = navigator.credentials
		const b64 = (source: BufferSource) => {
			const bytes = ArrayBuffer.isView(source)
				? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
				: new Uint8Array(source)
			return btoa(String.fromCharCode(...bytes))
		}
		const keep = (kind: Answer["kind"], credential: Credential | null) => {
			const key = credential as PublicKeyCredential | null
			if (key?.rawId) probe.__chaosAnswers?.push({ kind, id: b64(key.rawId) })
			const results = key?.getClientExtensionResults?.() as { prf?: { results?: { first?: BufferSource } } } | undefined
			const first = results?.prf?.results?.first
			if (first) probe.__chaosPrf?.push(b64(first))
		}
		for (const kind of ["get", "create"] as const) {
			const call = credentials[kind].bind(credentials)
			credentials[kind] = async (options?: CredentialRequestOptions & CredentialCreationOptions) => {
				const credential = await call(options)
				keep(kind, credential)
				return credential
			}
		}
	})
}

/** What `page` captured, leaving its lists empty. A page that is gone, or a document that replaced
 *  the watched one, gives nothing. */
async function takeAll(page: Page): Promise<{ prf: string[]; answers: Answer[]; picks: DiscoveryRequest[] }> {
	return page
		.evaluate(() => {
			const probe = window as CaptureProbe
			return {
				prf: probe.__chaosPrf?.splice(0) ?? [],
				answers: probe.__chaosAnswers?.splice(0) ?? [],
				picks: probe.__chaosPicks?.splice(0) ?? [],
			}
		})
		.catch(() => ({ prf: [], answers: [], picks: [] }))
}

/** The PRF outputs `page` captured, leaving every list empty. */
export async function takePrf(page: Page): Promise<string[]> {
	return (await takeAll(page)).prf
}

/** Moves what `page` captured into the run; answers no step asked for are dropped with it. */
export async function drainPrf(s: RunState, page: Page): Promise<void> {
	for (const value of await takePrf(page)) s.prf.add(value)
}

/**
 * The browser's pick in its passkey chooser, as a person makes it: the next `get` on `page` is
 * narrowed to `credentialId` (base64, as a row stores it), but only when the wallet's own request
 * names no credential and asks for the PRF output; any other request passes untouched, and
 * `answeredCredentials` fails the step on it.
 */
export async function pickDiscovered(page: Page, credentialId: string): Promise<void> {
	await page.evaluate((id: string) => {
		const probe = window as CaptureProbe
		const credentials = navigator.credentials
		const get = credentials.get.bind(credentials)
		const bytes = Uint8Array.from(atob(id), (c) => c.charCodeAt(0))
		credentials.get = async (options) => {
			credentials.get = get
			const publicKey = options?.publicKey
			const named = publicKey?.allowCredentials?.length ?? 0
			const prf = (publicKey?.extensions as { prf?: { eval?: unknown } } | undefined)?.prf?.eval !== undefined
			probe.__chaosPicks = [...(probe.__chaosPicks ?? []), { named, prf }]
			if (!publicKey || named || !prf) return get(options)
			return get({ ...options, publicKey: { ...publicKey, allowCredentials: [{ type: "public-key", id: bytes }] } })
		}
	}, credentialId)
}

/** A mint's ceremonies: the create, and the get that may confirm it. */
export const minted = (credential: CredentialRef): Ceremony[] => [
	{ kind: "create", credential },
	{ kind: "get", credential, optional: true },
]

/** Checks the answers `page` received since the last drain against `expected` (`bindCeremonies`),
 *  sending every PRF output to the run first; throws what it found wrong. */
export async function answeredCredentials(s: RunState, page: Page, expected: readonly Ceremony[]): Promise<void> {
	const { prf, answers, picks } = await takeAll(page)
	for (const value of prf) s.prf.add(value)
	const wrong = bindCeremonies(s.bindings, { answers, picks }, expected)
	if (wrong) throw new Error(wrong)
}
