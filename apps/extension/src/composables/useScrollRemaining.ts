/** Vendor */
import { onScopeDispose, type Ref, readonly, ref, watch } from "vue"

/** The pixels of `el`'s content below its visible bottom. */
export const leftToScroll = (el: Element): number => Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop)

/**
 * How far a scroller's content runs past its visible bottom, and its scrollbar's width. Content
 * changes are heard as resizes of the scroller's children: content crossing the fold resizes the
 * normal-flow child that holds it.
 */
export function useScrollRemaining(el: Readonly<Ref<HTMLElement | null>>): {
	remaining: Readonly<Ref<number>>
	gutter: Readonly<Ref<number>>
} {
	const remaining = ref(0)
	const gutter = ref(0)
	let current: HTMLElement | null = null

	const measure = () => {
		if (!current) return
		remaining.value = leftToScroll(current)
		gutter.value = current.offsetWidth - current.clientWidth
	}
	// jsdom has no ResizeObserver; there scrolls still measure.
	const resizes = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)

	const detach = () => {
		current?.removeEventListener("scroll", measure)
		resizes?.disconnect()
		current = null
	}

	watch(
		el,
		(next) => {
			detach()
			remaining.value = 0
			gutter.value = 0
			if (!next) return
			current = next
			next.addEventListener("scroll", measure, { passive: true })
			resizes?.observe(next)
			for (const child of next.children) resizes?.observe(child)
			measure()
		},
		{ immediate: true },
	)
	onScopeDispose(detach)

	return { remaining: readonly(remaining), gutter: readonly(gutter) }
}
