/**
 * The per-entry offset memory and the page-scroller lookup. The hook order inside a real router and
 * a real layout is the smoke navigation spec's; here each history move is replayed in the order the
 * router runs it: `leave` from `afterEach`, then `arrive` from `scrollBehavior`.
 */
import { describe, expect, test } from "vitest"
import type { RouteLocationNormalized } from "vue-router"
import { createScrollMemory, pageScroller } from "./scroll-memory"

function history() {
	let position = 0
	const memory = createScrollMemory(() => position)
	/** One navigation: `move` is the entry's index change, as a push (+1), a replace (0) or a pop. */
	const go = (
		from: { scrollTop: number } | null,
		to: { scrollTop: number } | null,
		move: number,
		how: { restore?: boolean; reused?: boolean } = {},
	) => {
		position += move
		memory.leave(from)
		memory.arrive(to, { restore: how.restore ?? false, reused: how.reused ?? false })
	}
	return { go }
}

describe("createScrollMemory", () => {
	test("back restores the offset the page had when its entry was left", () => {
		const { go } = history()
		const settings = { scrollTop: 0 }
		go(null, settings, 0)
		settings.scrollTop = 420
		const developer = { scrollTop: 0 }
		go(settings, developer, 1)
		const settingsAgain = { scrollTop: 0 }
		go(developer, settingsAgain, -1, { restore: true })
		expect(settingsAgain.scrollTop).toBe(420)
	})

	test("two entries of one path keep their own offsets", () => {
		const { go } = history()
		const list = { scrollTop: 0 }
		go(null, list, 0)
		list.scrollTop = 100
		const detail = { scrollTop: 0 }
		go(list, detail, 1)
		const listAgain = { scrollTop: 0 }
		go(detail, listAgain, 1)
		listAgain.scrollTop = 900
		const detailAgain = { scrollTop: 0 }
		go(listAgain, detailAgain, 1)

		const back = { scrollTop: 0 }
		go(detailAgain, back, -1, { restore: true })
		expect(back.scrollTop).toBe(900)
		const detailBack = { scrollTop: 0 }
		go(back, detailBack, -1, { restore: true })
		const first = { scrollTop: 0 }
		go(detailBack, first, -1, { restore: true })
		expect(first.scrollTop).toBe(100)
	})

	test("a push to a new page writes nothing, so a page that scrolls itself on mount keeps it", () => {
		const { go } = history()
		const home = { scrollTop: 300 }
		go(null, home, 0)
		const page = { scrollTop: 75 }
		go(home, page, 1)
		expect(page.scrollTop).toBe(75)
	})

	test("a push that reuses the mounted page opens it at its top; back restores where it was", () => {
		const { go } = history()
		const activity = { scrollTop: 0 }
		go(null, activity, 0)
		activity.scrollTop = 640
		go(activity, activity, 1, { reused: true })
		expect(activity.scrollTop).toBe(0)
		go(activity, activity, -1, { restore: true, reused: true })
		expect(activity.scrollTop).toBe(640)
	})

	test("a replace that reuses the mounted page writes nothing", () => {
		const { go } = history()
		const activity = { scrollTop: 0 }
		go(null, activity, 0)
		activity.scrollTop = 640
		go(activity, activity, 0, { reused: true })
		expect(activity.scrollTop).toBe(640)
	})

	test("a page left with no scroller clears its entry, so back never applies the replaced page's offset", () => {
		const { go } = history()
		const list = { scrollTop: 0 }
		go(null, list, 0)
		list.scrollTop = 400
		go(list, null, 0)
		go(null, { scrollTop: 0 }, 1)
		const back = { scrollTop: 0 }
		go(null, back, -1, { restore: true })
		expect(back.scrollTop).toBe(0)
	})

	test("an entry never left has nothing to restore", () => {
		const { go } = history()
		const page = { scrollTop: 50 }
		go(null, page, 0, { restore: true })
		expect(page.scrollTop).toBe(50)
	})
})

describe("pageScroller", () => {
	const routeOf = (el: unknown) =>
		({ matched: [{ instances: { default: el === undefined ? undefined : { $el: el } } }] }) as never as RouteLocationNormalized

	function page(html: string): Element {
		const host = document.createElement("div")
		host.innerHTML = html
		document.body.replaceChildren(host)
		return host.firstElementChild as Element
	}

	test("finds the first descendant that scrolls, in document order", () => {
		const root = page(
			'<section><header style="overflow-y: hidden"></header><div id="a" style="overflow-y: auto"><div id="b" style="overflow-y: scroll"></div></div></section>',
		)
		expect(pageScroller(routeOf(root))?.id).toBe("a")
	})

	test("returns the root when the root scrolls", () => {
		const root = page('<main id="root" style="overflow-y: scroll"><div style="overflow-y: auto"></div></main>')
		expect(pageScroller(routeOf(root))?.id).toBe("root")
	})

	test("returns null for a comment root, no instance, or a page where nothing scrolls", () => {
		expect(pageScroller(routeOf(document.createComment("v-if")))).toBeNull()
		expect(pageScroller(routeOf(undefined))).toBeNull()
		expect(pageScroller({ matched: [] } as never as RouteLocationNormalized)).toBeNull()
		expect(pageScroller(routeOf(page('<div><p style="overflow-y: hidden"></p></div>')))).toBeNull()
	})
})
