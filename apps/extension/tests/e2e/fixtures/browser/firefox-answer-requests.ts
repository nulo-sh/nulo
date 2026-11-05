import type { AnsweredRequests, RequestAnswer } from "./index"

/** Calls `declaration` with string arguments in a window of Firefox's own and resolves with its result. */
export type FirefoxScopeCall = (declaration: string, args: string[]) => Promise<unknown>

/** Where each page's tally is kept between calls, keyed by the page's navigable id: the window
 *  Firefox-scope calls run in, which outlives every window a test opens. */
const SLOT = "__nuloE2eRequestAnswers"

/**
 * One observer for the page `id` names, answering only that tab's requests for the exact URLs in
 * `answers`. It acts at `http-on-before-connect`, where Firefox applies its own response overrides, so
 * no connection, and no TLS handshake, is ever started. The tab is read as DevTools reads it. An
 * answer that throws cancels its channel, so that request never reaches loopback, and is kept as a
 * fault.
 */
const ARM = `function (slot, id, answersJson) {
	const { NavigableManager } = ChromeUtils.importESModule("chrome://remote/content/shared/NavigableManager.sys.mjs");
	const browser = NavigableManager.getBrowserById(id);
	if (!browser) return "no such page " + id;
	window[slot] ??= {};
	if (window[slot][id]) return "the page's requests are already answered";
	const { browserId } = browser;
	const answers = new Map(JSON.parse(answersJson));
	const tally = { hits: {}, faults: [] };
	const answer = (channel, how) => {
		if (how === "refused") return channel.cancel(Cr.NS_ERROR_CONNECTION_REFUSED);
		const response = Cc["@mozilla.org/network/replaced-http-response;1"].createInstance(Ci.nsIReplacedHttpResponse);
		response.responseStatus = how.status;
		response.setResponseHeader("Content-Type", "application/json", false);
		// A byte string, so the text goes in as UTF-8, as BiDi's own override encodes it.
		response.responseBody = String.fromCharCode(...new TextEncoder().encode(how.body));
		channel.QueryInterface(Ci.nsIHttpChannelInternal).setResponseOverride(response);
	};
	const observer = {
		observe(subject) {
			const channel = subject.QueryInterface(Ci.nsIHttpChannel);
			const url = channel.URI.spec;
			const context = channel.loadInfo?.browsingContext ?? channel.loadInfo?.associatedBrowsingContext;
			if (!answers.has(url) || context?.browserId !== browserId) return;
			tally.hits[url] = (tally.hits[url] ?? 0) + 1;
			try {
				answer(channel, answers.get(url));
			} catch (err) {
				tally.faults.push(url + ": " + err);
				channel.cancel(Cr.NS_ERROR_FAILURE);
			}
		},
	};
	Services.obs.addObserver(observer, "http-on-before-connect");
	window[slot][id] = tally;
	return "armed";
}`

const READ = `function (slot, id) {
	const tally = window[slot]?.[id];
	return tally ? JSON.stringify(tally) : "";
}`

interface Tally {
	hits: Record<string, number>
	faults: string[]
}

/**
 * Firefox's `answerRequests`. Firefox 157 and later refuse, on an extension page, the page-scoped BiDi
 * interception Puppeteer arms, so the answer comes from the parent process. The launch owns the
 * observer and its tally; once the page closes the observer matches nothing, since no later tab has
 * its `browserId`.
 */
export async function answerPageRequests(
	call: FirefoxScopeCall,
	pageId: string,
	answers: ReadonlyMap<string, RequestAnswer>,
): Promise<AnsweredRequests> {
	const wire = [...answers].map(([url, how]) => [url, how === "refused" ? how : { status: how.status, body: JSON.stringify(how.body) }])
	const armed = await call(ARM, [SLOT, pageId, JSON.stringify(wire)])
	if (armed !== "armed") throw new Error(`answerRequests: ${String(armed)}`)
	return {
		hits: async (url) => {
			const read = await call(READ, [SLOT, pageId])
			if (typeof read !== "string" || !read) throw new Error("answerRequests: the page's answerer is no longer armed")
			const tally = JSON.parse(read) as Tally
			if (tally.faults.length > 0) throw new Error(`answerRequests: ${tally.faults.join("; ")}`)
			return tally.hits[url] ?? 0
		},
	}
}
