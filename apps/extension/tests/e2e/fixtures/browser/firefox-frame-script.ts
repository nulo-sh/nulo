import type { WebDriverSession } from "./webdriver-classic"

let evaluations = 0
/** Under geckodriver's 30 s script timeout, so a frame script that never answers is reported by name. */
const REPLY_DEADLINE_MS = 10_000

/**
 * Where a frame script goes. `locate` is privileged source, run with the add-on id and the browser
 * window as `addonId` and `win`, that returns the `<browser>` element hosting the document, or null —
 * which is reported as `missing`.
 */
export interface FrameScriptTarget {
	addonId: string
	locate: string
	missing: string
}

/**
 * Evaluates `body` — the source of a function body whose `content` is the document's window — inside
 * the `<browser>` that `target.locate` finds, and resolves with the JSON-serialisable value it
 * returns. A `body` that throws rejects with its message. Each evaluation replies on a channel of its
 * own: a frame script cannot be cancelled, and one that outlives its deadline must not be able to
 * answer the next call. Privileged, so it needs geckodriver's `--allow-system-access`.
 */
export async function evaluateViaFrameScript<T>(session: WebDriverSession, target: FrameScriptTarget, body: string): Promise<T> {
	const channel = `nulo-e2e:result:${++evaluations}`
	const name = JSON.stringify(channel)
	const frameScript = `
		try { sendAsyncMessage(${name}, { value: (function () { ${body} })() }); }
		catch (err) { sendAsyncMessage(${name}, { error: String(err) }); }`
	const reply = await session.chromeScript<{ value?: T; error?: string }>(
		`
		const [addonId, source, channel, deadline, missing, done] = arguments;
		const win = Services.wm.getMostRecentWindow("navigator:browser");
		const host = (function (addonId, win) { ${target.locate} })(addonId, win);
		if (!host) return done({ error: missing });
		const mm = host.messageManager;
		const settle = (reply) => { mm.removeMessageListener(channel, listener); win.clearTimeout(timer); done(reply); };
		const listener = (message) => settle(message.data);
		const timer = win.setTimeout(() => settle({ error: "the frame script never answered" }), deadline);
		mm.addMessageListener(channel, listener);
		mm.loadFrameScript("data:application/javascript;charset=utf-8," + encodeURIComponent(source), false);
		`,
		[target.addonId, frameScript, channel, REPLY_DEADLINE_MS, target.missing],
	)
	if (reply.error !== undefined) throw new Error(reply.error)
	return reply.value as T
}

/**
 * Clicks the centre of the element with `testid`, in the document `target` locates, with a real
 * pointer in the window `chromeScript` runs in, which also gives that document focus. The element is
 * scrolled into view first, as WebDriver's element click does; one still outside the view is refused,
 * since no person could click it there. The document's coordinates are mapped onto the window's,
 * which holds only while both share one scale.
 */
export async function clickWithPointer(session: WebDriverSession, target: FrameScriptTarget, testid: string): Promise<void> {
	const point = await evaluateViaFrameScript<{ x: number; y: number; scale: number; inView: boolean } | null>(
		session,
		target,
		`const el = content.document.querySelector(${JSON.stringify(`[data-testid="${testid}"]`)});
		if (!el) return null;
		el.scrollIntoView({ block: "nearest", inline: "nearest" });
		const rect = el.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		return { x: content.mozInnerScreenX + x, y: content.mozInnerScreenY + y, scale: content.devicePixelRatio, inView: x >= 0 && y >= 0 && x < content.innerWidth && y < content.innerHeight };`,
	)
	if (!point) throw new Error(`no ${testid} there`)
	if (!point.inView) throw new Error(`${testid} is outside the view`)
	const origin = await session.chromeScript<{ x: number; y: number; scale: number }>(
		`const [done] = arguments; done({ x: window.mozInnerScreenX, y: window.mozInnerScreenY, scale: window.devicePixelRatio });`,
	)
	if (origin.scale !== point.scale)
		throw new Error(`the document is zoomed (scale ${point.scale}, its window ${origin.scale}), so the click would miss`)
	await session.chromeActions([
		{
			type: "pointer",
			id: "mouse",
			parameters: { pointerType: "mouse" },
			actions: [
				{ type: "pointerMove", x: Math.round(point.x - origin.x), y: Math.round(point.y - origin.y), origin: "viewport" },
				{ type: "pointerDown", button: 0 },
				{ type: "pointerUp", button: 0 },
			],
		},
	])
}

/** The event page Firefox runs the wallet's `background.scripts` in — absent while it is not running. */
export const LOCATE_BACKGROUND_PAGE = `
	const { extension } = WebExtensionPolicy.getByID(addonId);
	for (const view of extension.views) if (view.viewType === "background") return view.xulBrowser;
	return null;`
