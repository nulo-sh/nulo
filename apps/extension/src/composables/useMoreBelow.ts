/** Vendor */
import { computed, onScopeDispose, type Ref, readonly, ref, watch } from "vue"

/** Composables */
import { leftToScroll, useScrollRemaining } from "@/composables/useScrollRemaining"

/** Utils */
import { isCalm } from "@/utils/motion"
import { nextScrollTop } from "@/components/composite/collapsing-hero"

/** The button's footprint: 36 px tall, 12 px above the visible bottom. It shows only while more than
 *  this is left below; each host keeps this much blank room under its last content, so the button is
 *  gone before it could cover the last control. */
export const MORE_FOOTPRINT_PX = 48

export interface MoreBelowEdges {
	/** The bottom edge, in viewport px, of a sticky bar the press lands sections under. */
	barBottom?: () => number | undefined
	/** Pixels at the scroller's bottom that an overlay inside it covers (a sticky footer, the nav). */
	coveredBottom?: () => number
}

/** What the document scrolls, read like an element scroller; its scrolls fire on `window`. */
function useDocumentRemaining(on: Readonly<Ref<boolean>>) {
	const remaining = ref(0)
	const gutter = ref(0)
	const measure = () => {
		const root = document.documentElement
		remaining.value = leftToScroll(root)
		gutter.value = window.innerWidth - root.clientWidth
	}
	const resizes = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)
	const detach = () => {
		window.removeEventListener("scroll", measure)
		window.removeEventListener("resize", measure)
		resizes?.disconnect()
	}
	watch(
		on,
		(next) => {
			detach()
			remaining.value = 0
			if (!next) return
			window.addEventListener("scroll", measure, { passive: true })
			window.addEventListener("resize", measure, { passive: true })
			// The body is pinned to the viewport's height; the app root under it grows with the content.
			for (const child of document.body.children) resizes?.observe(child)
			measure()
		},
		{ immediate: true },
	)
	onScopeDispose(detach)
	return { remaining: readonly(remaining), gutter: readonly(gutter) }
}

/**
 * The "more below" button's state and press for a scroller outside `CollapsingHeroLayout`: `"document"`
 * for a page the window scrolls. The host places `ScrollMoreButton` over the scroller's visible
 * bottom-right corner and keeps `MORE_FOOTPRINT_PX` of blank room after its last content.
 */
export function useMoreBelow(el: Readonly<Ref<HTMLElement | "document" | null>>, edges: MoreBelowEdges = {}) {
	const element = computed(() => (el.value instanceof HTMLElement ? el.value : null))
	const own = useScrollRemaining(element)
	const doc = useDocumentRemaining(computed(() => el.value === "document"))
	const isDocument = computed(() => el.value === "document")
	const remaining = computed(() => (isDocument.value ? doc.remaining.value : own.remaining.value))
	const gutter = computed(() => (isDocument.value ? doc.gutter.value : own.gutter.value))
	const shown = computed(() => remaining.value > MORE_FOOTPRINT_PX)

	/** Sections are read on each press: a step can swap them. */
	function press() {
		const scroller = isDocument.value ? document.documentElement : element.value
		if (!scroller) return
		const top = isDocument.value ? 0 : scroller.getBoundingClientRect().top
		const height = isDocument.value ? window.innerHeight : scroller.clientHeight
		const target = nextScrollTop({
			scrollTop: scroller.scrollTop,
			maxScroll: scroller.scrollHeight - scroller.clientHeight,
			barBottom: edges.barBottom?.() ?? top,
			viewBottom: top + height - (edges.coveredBottom?.() ?? 0),
			sections: [...scroller.querySelectorAll("[data-scroll-section]")].map((s) => s.getBoundingClientRect()),
		})
		const behavior = isCalm() ? "auto" : "smooth"
		if (isDocument.value) window.scrollTo({ top: target, behavior })
		else scroller.scrollTo({ top: target, behavior })
	}

	return { shown, gutter, press }
}
