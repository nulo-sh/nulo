/** Vendor */
import { computed, onScopeDispose, type Ref, readonly, ref } from "vue"

/** Composables */
import { leftToScroll, useScrollRemaining } from "@/composables/useScrollRemaining"

/** Utils */
import { isCalm } from "@/utils/motion"
import { nextScrollTop } from "@/utils/next-scroll-top"

/** The button's footprint: 36 px tall, 12 px above the visible bottom. It shows only while more than
 *  this is left below; each host keeps this much blank room after its last content, so the button is
 *  gone before it could cover the last control. */
export const MORE_FOOTPRINT_PX = 48

export interface MoreBelowEdges {
	/** The bottom edge, in viewport px, of a sticky bar a press lands sections under; without one, the
	 *  scroller's top. */
	barBottom?: () => number | undefined
}

/** What is left below the window's fold. Its scrolls fire on `window`; a host that pins `body` to the
 *  viewport grows in `body`'s children, so their resizes are what content changes sound like. */
function useDocumentRemaining(): ReturnType<typeof useScrollRemaining> {
	const remaining = ref(0)
	const gutter = ref(0)
	const width = ref(0)
	const root = document.documentElement
	const measure = () => {
		remaining.value = leftToScroll(root)
		gutter.value = window.innerWidth - root.clientWidth
		width.value = root.clientWidth
	}
	// jsdom has no ResizeObserver; there scrolls still measure.
	const resizes = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)
	window.addEventListener("scroll", measure, { passive: true })
	window.addEventListener("resize", measure, { passive: true })
	for (const child of document.body.children) resizes?.observe(child)
	measure()
	onScopeDispose(() => {
		window.removeEventListener("scroll", measure)
		window.removeEventListener("resize", measure)
		resizes?.disconnect()
	})
	return { remaining: readonly(remaining), gutter: readonly(gutter), width: readonly(width) }
}

/**
 * The "more below" button's state and press over `scroller`, or over the window for `"document"`.
 * The host places `ScrollMoreButton` over the scroller's visible bottom and keeps
 * `MORE_FOOTPRINT_PX` of blank room after its last content. Listeners end with the calling scope.
 */
export function useMoreBelow(scroller: Readonly<Ref<HTMLElement | null>> | "document", edges: MoreBelowEdges = {}) {
	const isDocument = scroller === "document"
	const { remaining, gutter, width } = isDocument ? useDocumentRemaining() : useScrollRemaining(scroller)
	const shown = computed(() => remaining.value > MORE_FOOTPRINT_PX)

	/** Sections are read on each press: a step can swap them. */
	function press() {
		const el = isDocument ? document.documentElement : scroller.value
		if (!el) return
		const top = isDocument ? 0 : el.getBoundingClientRect().top
		const target = nextScrollTop({
			scrollTop: el.scrollTop,
			maxScroll: el.scrollHeight - el.clientHeight,
			barBottom: edges.barBottom?.() ?? top,
			viewBottom: top + el.clientHeight,
			sections: [...el.querySelectorAll("[data-scroll-section]")].map((section) => section.getBoundingClientRect()),
		})
		el.scrollTo({ top: target, behavior: isCalm() ? "auto" : "smooth" })
	}

	return { shown, remaining, gutter, width, press }
}
