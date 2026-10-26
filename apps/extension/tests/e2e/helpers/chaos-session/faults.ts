/**
 * The `passkey` verb's faults. Each applies to the prompts its page starts until the next command
 * that drives that page has settled; then the page answers prompts normally again, and a fault no
 * prompt met is reported. `refuse` applies to a create or an assertion, `no-prf` and `other` to an
 * assertion only. A hold is the exception: the next assertion on its page waits for
 * `passkey release`, and a cancel still ends it.
 */
import type { Page } from "puppeteer"
import { prepareKeys } from "../../fixtures/browser"
import { answerWithCredential, holdNextGet, withholdGetPrf } from "../../fixtures/passkey"
import { callService } from "../../fixtures/session"
import type { RunState } from "../profile-chaos/state"
import { CommandRefused, type PageId, type PasskeyFault } from "./protocol"

type SavedProbe = Window & { __chaosCredentials?: [string, PropertyDescriptor | undefined][] }

/** Keeps the page's own `navigator.credentials` methods, so a shim set after it can be undone
 *  whether or not a prompt used it. */
async function keepCredentials(page: Page): Promise<() => Promise<void>> {
	await page.evaluate(() => {
		const credentials = navigator.credentials
		;(window as SavedProbe).__chaosCredentials = (["create", "get"] as const).map((key) => [
			key,
			Object.getOwnPropertyDescriptor(credentials, key),
		])
	})
	return async () => {
		await page
			.evaluate(() => {
				const saved = (window as SavedProbe).__chaosCredentials
				if (!saved) return
				const credentials = navigator.credentials
				for (const [key, descriptor] of saved) {
					if (descriptor) Object.defineProperty(credentials, key, descriptor)
					else Reflect.deleteProperty(credentials, key)
				}
				;(window as SavedProbe).__chaosCredentials = undefined
			})
			.catch(() => {})
	}
}

type HitProbe = Window & { __chaosPromptHits?: number }

/** Counts the prompts the page starts from now on, through whatever shim is in place. */
async function countPrompts(page: Page): Promise<void> {
	await page.evaluate(() => {
		const credentials = navigator.credentials
		const probe = window as HitProbe
		probe.__chaosPromptHits = 0
		for (const key of ["create", "get"] as const) {
			const inner = credentials[key] as (options?: unknown) => Promise<Credential | null>
			Object.defineProperty(credentials, key, {
				configurable: true,
				writable: true,
				value: (options?: unknown) => {
					probe.__chaosPromptHits = (probe.__chaosPromptHits ?? 0) + 1
					return inner.call(credentials, options)
				},
			})
		}
	})
}

/** How many prompts the page started since `countPrompts`, or undefined once its document is gone. */
const promptHits = (page: Page): Promise<number | undefined> =>
	page.isClosed() ? Promise.resolve(undefined) : page.evaluate(() => (window as HitProbe).__chaosPromptHits).catch(() => undefined)

/** The stored credential id of the passkey profile named `name`. */
async function credentialOf(s: RunState, name: string): Promise<string> {
	const profiles = await callService<{ id: string; name: string; type: string }[]>(s.anchor, "profile", "getProfiles")
	const target = profiles.find((p) => p.name === name && p.type === "passkey")
	if (!target) throw new CommandRefused(`no passkey profile is named ${JSON.stringify(name)}`)
	const id = await s.anchor.evaluate(async (key: string) => {
		const raw = (await chrome.storage.local.get(key))[key]
		return typeof raw === "string" ? (JSON.parse(raw) as { credentialId?: unknown }).credentialId : undefined
	}, `nulo:core:profiles@${target.id}`)
	if (typeof id !== "string") throw new CommandRefused(`${JSON.stringify(name)}'s row holds no credential id`)
	return id
}

export class PasskeyFaults {
	/** Faults armed on each page, with what lifts each. */
	private readonly armed = new Map<PageId, { fault: PasskeyFault; page: Page; lift: () => Promise<void> }>()
	private readonly holds = new Map<PageId, { page: Page; hold: Awaited<ReturnType<typeof holdNextGet>>; restore: () => Promise<void> }>()

	public constructor(private readonly s: RunState) {}

	/** Pages whose held assertion the page has reached: their pending state is the hold's, not a
	 *  stall. An armed hold no prompt has met exempts nothing. */
	public async held(): Promise<ReadonlySet<PageId>> {
		const out = new Set<PageId>()
		for (const [id, { page, hold }] of this.holds) {
			if (page.isClosed()) {
				this.holds.delete(id)
				continue
			}
			if (await hold.isReached()) out.add(id)
		}
		return out
	}

	public async apply(id: PageId, page: Page, fault: PasskeyFault, profile?: string): Promise<string> {
		if (fault === "release") return this.release(id)
		if (this.armed.has(id) || this.holds.has(id)) throw new CommandRefused(`a passkey fault is already armed on ${id}`)
		if (fault === "hold") {
			const restore = await keepCredentials(page)
			this.holds.set(id, { page, hold: await holdNextGet(page), restore })
			return `the next passkey assertion on ${id} waits for passkey release`
		}
		if (fault === "refuse") {
			const auth = this.s.auth
			if (!auth) throw new CommandRefused("the session holds no authenticator")
			const restore = await keepCredentials(page)
			// Counted through the refusal, which Chrome sets in the page itself.
			const allow = await auth.refuseNextStep(page)
			await countPrompts(page)
			const lift = async () => {
				await allow().catch(() => {})
				await restore()
			}
			this.armed.set(id, { fault, page, lift })
			return `the next passkey prompt on ${id} is refused`
		}
		const credential = fault === "other" ? await credentialOf(this.s, profile ?? "") : undefined
		const restore = await keepCredentials(page)
		if (credential === undefined) await withholdGetPrf(page)
		else await answerWithCredential(page, credential)
		await countPrompts(page)
		this.armed.set(id, { fault, page, lift: restore })
		return fault === "no-prf"
			? `the next passkey assertion on ${id} carries no PRF result`
			: `the next passkey assertion on ${id} answers with ${JSON.stringify(profile)}'s passkey`
	}

	/** Lifts the fault armed on `id` once a command that drove it has settled; returns why it
	 *  applied to nothing, when no prompt met it. Holds stay. */
	public async lift(id: PageId): Promise<string | undefined> {
		const armed = this.armed.get(id)
		if (!armed) return undefined
		this.armed.delete(id)
		const hits = await promptHits(armed.page)
		await armed.lift().catch(() => {})
		return hits === 0 ? `the passkey ${armed.fault} fault armed on ${id} met no prompt and was lifted` : undefined
	}

	/** Pages whose hold was never released. */
	public unreleased(): PageId[] {
		return [...this.holds.keys()]
	}

	/** Lets a held assertion go on, from its page brought to the front as a person answering the
	 *  prompt would (Firefox refuses an assertion from a window without focus); a hold no assertion
	 *  reached is taken off, so it catches none later. */
	private async release(id: PageId): Promise<string> {
		const held = this.holds.get(id)
		if (!held) throw new CommandRefused(`no passkey hold is armed on ${id}`)
		this.holds.delete(id)
		if (!(await held.hold.isReached())) {
			await held.restore()
			return `lifted the hold on ${id}; no assertion had reached it`
		}
		await prepareKeys(held.page)
		await held.hold.release()
		return `released the held passkey assertion on ${id}`
	}
}
