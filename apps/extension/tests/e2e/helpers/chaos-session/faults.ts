/**
 * The `passkey` verb's faults, each set in its page's own `navigator.credentials` and spent by the
 * first prompt it applies to on that page: `refuse` by a create or an assertion, `no-prf` and
 * `other` by an assertion. A fault is lifted once the next command that drives its page has
 * settled, or when the session ends, and reported when no prompt spent it or its page was reloaded
 * or closed first. A hold is the exception: the next assertion on its page waits for
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

/** The next create or assertion on the page is refused as a person dismissing the prompt would
 *  refuse it; later calls run untouched. Set in the page on both browsers, since Firefox's own
 *  refusal is the session's authenticator's and would refuse every page's prompts. */
async function refuseNext(page: Page): Promise<void> {
	await page.evaluate(() => {
		const credentials = navigator.credentials
		const saved = (["create", "get"] as const).map((key) => [key, Object.getOwnPropertyDescriptor(credentials, key)] as const)
		const refuse = async (): Promise<never> => {
			for (const [key, descriptor] of saved) {
				if (descriptor) Object.defineProperty(credentials, key, descriptor)
				else Reflect.deleteProperty(credentials, key)
			}
			throw new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")
		}
		credentials.create = refuse
		credentials.get = refuse
	})
}

type ArmedProbe = Window & { __chaosArmed?: Record<string, unknown> }

/** Records the page's credential methods as the fault left them: each shim puts the page's own
 *  back once a prompt spends it. */
async function markArmed(page: Page): Promise<void> {
	await page.evaluate(() => {
		;(window as ArmedProbe).__chaosArmed = { get: navigator.credentials.get, create: navigator.credentials.create }
	})
}

/** Whether a prompt spent `fault` on its page, or "unknown" once the page's document is gone. */
async function spent(page: Page, fault: PasskeyFault): Promise<boolean | "unknown"> {
	if (page.isClosed()) return "unknown"
	const keys = fault === "refuse" ? ["create", "get"] : ["get"]
	return page
		.evaluate((names: string[]) => {
			const armed = (window as ArmedProbe).__chaosArmed
			if (!armed) return "unknown" as const
			const now = navigator.credentials as unknown as Record<string, unknown>
			return names.some((name) => now[name] !== armed[name])
		}, keys)
		.catch(() => "unknown" as const)
}

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
	/** Faults armed on each page, with what takes each off. */
	private readonly armed = new Map<PageId, { fault: PasskeyFault; page: Page; restore: () => Promise<void> }>()
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
		const credential = fault === "other" ? await credentialOf(this.s, profile ?? "") : undefined
		const restore = await keepCredentials(page)
		if (fault === "refuse") await refuseNext(page)
		else if (credential === undefined) await withholdGetPrf(page)
		else await answerWithCredential(page, credential)
		await markArmed(page)
		this.armed.set(id, { fault, page, restore })
		if (fault === "refuse") return `the next passkey prompt on ${id} is refused`
		return fault === "no-prf"
			? `the next passkey assertion on ${id} carries no PRF result`
			: `the next passkey assertion on ${id} answers with ${JSON.stringify(profile)}'s passkey`
	}

	/** Takes off the fault armed on `id`; returns why it may have applied to nothing: no prompt spent
	 *  it, or its page was reloaded or closed first. Holds stay. */
	public async lift(id: PageId): Promise<string | undefined> {
		const armed = this.armed.get(id)
		if (!armed) return undefined
		this.armed.delete(id)
		const was = await spent(armed.page, armed.fault)
		await armed.restore().catch(() => {})
		if (was === true) return undefined
		return was === "unknown"
			? `the passkey ${armed.fault} fault armed on ${id} was lifted after its page was reloaded or closed; whether a prompt met it is unknown`
			: `the passkey ${armed.fault} fault armed on ${id} met no prompt and was lifted`
	}

	/** As the session ends: every fault still armed, lifted, and every hold never released. */
	public async outstanding(): Promise<string[]> {
		const out: string[] = []
		for (const id of [...this.armed.keys()]) {
			const why = await this.lift(id)
			if (why) out.push(why)
		}
		for (const id of this.holds.keys()) out.push(`the passkey hold on ${id} was never released`)
		return out
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
