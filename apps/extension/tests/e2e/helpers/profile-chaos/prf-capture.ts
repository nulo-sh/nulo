/**
 * The passkey's output on the pages the run drives: each answer's PRF result kept in the page as
 * the wallet receives it, then drained into the run's needles, so O7 searches storage, logs and files
 * for it. A window the wallet opens on its own is not watched; the run's ceremonies all run on its
 * own pages.
 */
import type { Page } from "puppeteer"
import type { RunState } from "./state"

type CaptureProbe = Window & { __chaosPrf?: string[] }

/** Wraps the page's `navigator.credentials` once per document; a hook a driver installs later wraps
 *  this one, so every answer still passes through it. */
export async function capturePrf(page: Page): Promise<void> {
	await page.evaluate(() => {
		const probe = window as CaptureProbe
		if (probe.__chaosPrf) return
		probe.__chaosPrf = []
		const credentials = navigator.credentials
		const keep = (credential: Credential | null) => {
			const results = (credential as PublicKeyCredential | null)?.getClientExtensionResults?.() as
				| { prf?: { results?: { first?: BufferSource } } }
				| undefined
			const first = results?.prf?.results?.first
			if (!first) return
			const bytes = new Uint8Array(ArrayBuffer.isView(first) ? first.buffer : first)
			probe.__chaosPrf?.push(btoa(String.fromCharCode(...bytes)))
		}
		for (const kind of ["get", "create"] as const) {
			const call = credentials[kind].bind(credentials)
			credentials[kind] = async (options?: CredentialRequestOptions & CredentialCreationOptions) => {
				const credential = await call(options)
				keep(credential)
				return credential
			}
		}
	})
}

/** What `page` captured, leaving its list empty. A page that is gone, or a document that replaced
 *  the watched one, gives nothing. */
export async function takePrf(page: Page): Promise<string[]> {
	return page
		.evaluate(() => {
			const probe = window as CaptureProbe
			return probe.__chaosPrf?.splice(0) ?? []
		})
		.catch(() => [] as string[])
}

/** Moves what `page` captured into the run. */
export async function drainPrf(s: RunState, page: Page): Promise<void> {
	for (const value of await takePrf(page)) s.prf.add(value)
}
