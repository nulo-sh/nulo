/**
 * The pages an agent session drives, by id: `p0` is the run's anchor, whatever page currently holds
 * that role; every other extension page gets the next id when the session opens it or the wallet
 * does, and keeps it until it closes. Downloads are captured in each page as they happen.
 */
import { Buffer } from "node:buffer"
import type { Page, Target } from "puppeteer"
import { EXTENSION_SCHEME } from "../../fixtures/browser"
import type { RunPage } from "../profile-chaos/collect"
import type { RunState } from "../profile-chaos/state"
import type { PageId } from "./protocol"

type CaptureWindow = Window & { __chaosDownloads?: { name: string; b64?: string; error?: string }[] }

export interface CapturedDownload {
	name: string
	bytes?: Buffer
	error?: string
}

export class SessionPages {
	private readonly extra = new Map<PageId, Page>()
	private next = 1
	private readonly onTarget = (target: Target) => {
		void this.adopt(target)
	}

	public constructor(private readonly s: RunState) {}

	/** Firefox announces a window as `about:blank` and names its page only once it commits, so a
	 *  page is adopted on either event. */
	public start(): void {
		this.s.ctx.browser.on("targetcreated", this.onTarget)
		this.s.ctx.browser.on("targetchanged", this.onTarget)
	}

	public stop(): void {
		this.s.ctx.browser.off("targetcreated", this.onTarget)
		this.s.ctx.browser.off("targetchanged", this.onTarget)
	}

	/** The page `id` names, while it is open. */
	public get(id: PageId): Page | undefined {
		if (id === "p0") return this.s.anchor
		const page = this.extra.get(id)
		return page && !page.isClosed() ? page : undefined
	}

	/** Gives `page` the next id, or the one it already has. */
	public add(page: Page): PageId {
		if (page === this.s.anchor) return "p0"
		for (const [id, held] of this.extra) if (held === page) return id
		const id = `p${this.next++}` as PageId
		this.extra.set(id, page)
		this.s.errors.watch(page, id)
		void page.evaluateOnNewDocument(installCapture).catch(() => {})
		return id
	}

	/** Every open page, the anchor first. */
	public list(): { id: PageId; page: Page }[] {
		for (const [id, page] of this.extra) if (page.isClosed() || page === this.s.anchor) this.extra.delete(id)
		return [{ id: "p0" as PageId, page: this.s.anchor }, ...[...this.extra].map(([id, page]) => ({ id, page }))]
	}

	public runPages(): RunPage[] {
		return this.list().map(({ id, page }) => ({ label: id, page, anchor: id === "p0" }))
	}

	/** Replaces `chrome.downloads` in every open page, once per document, with a capture the
	 *  session drains: the file never reaches the disk through the browser. */
	public async armDownloads(): Promise<void> {
		for (const { page } of this.list()) await page.evaluate(installCapture).catch(() => {})
	}

	/** Every download the pages captured since the last drain. */
	public async drainDownloads(): Promise<CapturedDownload[]> {
		const out: CapturedDownload[] = []
		for (const { page } of this.list()) {
			const got = await page
				.evaluate(() => (window as CaptureWindow).__chaosDownloads?.splice(0) ?? [])
				.catch(() => [] as NonNullable<CaptureWindow["__chaosDownloads"]>)
			for (const d of got)
				out.push({
					name: d.name,
					...(d.b64 === undefined ? {} : { bytes: Buffer.from(d.b64, "base64") }),
					...(d.error ? { error: d.error } : {}),
				})
		}
		return out
	}

	private async adopt(target: Target): Promise<void> {
		if (target.type() !== "page" || !target.url().startsWith(EXTENSION_SCHEME)) return
		const page = await target.page().catch(() => null)
		if (page) this.add(page)
	}
}

/** Runs in the page: the wallet looks `chrome.downloads.download` up at call time, so a stub set
 *  now takes the next download, whatever wrote it. Another capture may replace it (a `do` step's
 *  export arms its own), so the stub carries a mark and is set again whenever the mark is gone. Only
 *  a `blob:` URL is read: the wallet writes nothing else, and the page fetches nothing for it. */
function installCapture(): void {
	type Download = ((opts: { url: string; filename?: string }, cb: (id?: number) => void) => void) & { chaos?: true }
	const w = window as CaptureWindow
	// A new window's first document is `about:blank`, where no extension API exists.
	const c = (globalThis as { chrome?: { downloads?: { download?: Download } } }).chrome
	if (!c?.downloads || c.downloads.download?.chaos) return
	w.__chaosDownloads ??= []
	const queue = w.__chaosDownloads
	const download: Download = (opts, cb) => {
		const name = String(opts.filename ?? "download")
		const url = String(opts.url)
		if (!url.startsWith("blob:")) {
			queue.push({ name, error: "the wallet asked to download a URL that is not a blob" })
			cb(queue.length)
			return
		}
		fetch(url)
			.then((r) => r.arrayBuffer())
			.then((buf) => {
				let bin = ""
				for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b)
				queue.push({ name, b64: btoa(bin) })
				cb(queue.length)
			})
			.catch((err: unknown) => {
				queue.push({ name, error: String(err) })
				cb(queue.length)
			})
	}
	download.chaos = true
	c.downloads = { download }
}
