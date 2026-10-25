/** Vendor */
import { nextTick, onMounted, onScopeDispose, type Ref, ref } from "vue"

/**
 * Whether a tab page's hero is on screen, so its compact title can show once the hero scrolls
 * away. `visible` is true until the first delivery; an element absent at mount is never observed.
 * `settled` turns true once the first delivery is drawn: until then the caller keeps the compact
 * bar's transition off, so a return to a scrolled page shows the bar at once and only a later
 * delivery, a real scroll, fades it. The observer disconnects with the caller's scope.
 */
export function useHeroVisible(
	el: Readonly<Ref<Element | null>>,
	bar: Readonly<Ref<Element | null>>,
): { visible: Readonly<Ref<boolean>>; settled: Readonly<Ref<boolean>> } {
	const visible = ref(true)
	const settled = ref(false)
	let observer: IntersectionObserver | undefined

	async function settle() {
		await nextTick()
		if (!bar.value) return
		// The read commits the drawn state with no transition, so dropping the class starts no fade.
		getComputedStyle(bar.value).opacity
		settled.value = true
	}

	onMounted(() => {
		if (!el.value) return
		observer = new IntersectionObserver(
			(entries) => {
				// One delivery batches every change since the last, oldest first: only the newest is current.
				visible.value = entries[entries.length - 1].isIntersecting
				if (!settled.value) void settle()
			},
			{ threshold: 0 },
		)
		observer.observe(el.value)
	})

	onScopeDispose(() => observer?.disconnect())

	return { visible, settled }
}
