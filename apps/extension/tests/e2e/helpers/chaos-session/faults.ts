/**
 * The `passkey` verb's faults. Each applies to the prompts the next command starts on its page;
 * once that command has settled the page answers prompts normally again. A hold is the exception:
 * the next assertion on its page waits for `passkey release`, and a cancel still ends it.
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
	/** Faults armed for the next command, by page, with what lifts each. */
	private readonly armed = new Map<PageId, () => Promise<void>>()
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
			this.armed.set(id, await auth.refuseNextStep(page))
			return `the passkey prompt the next command starts on ${id} is refused`
		}
		const restore = await keepCredentials(page)
		if (fault === "no-prf") await withholdGetPrf(page)
		else await answerWithCredential(page, await credentialOf(this.s, profile ?? ""))
		this.armed.set(id, restore)
		return fault === "no-prf"
			? `the next passkey assertion on ${id} carries no PRF result`
			: `the next passkey assertion on ${id} answers with ${JSON.stringify(profile)}'s passkey`
	}

	/** Lifts every fault armed for the command that just settled; holds stay. */
	public async lift(): Promise<void> {
		for (const [id, lift] of this.armed) {
			this.armed.delete(id)
			await lift().catch(() => {})
		}
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
