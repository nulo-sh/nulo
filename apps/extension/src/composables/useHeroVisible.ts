/** Vendor */
import { onMounted, onScopeDispose, type Ref, ref } from "vue"

/**
 * Whether a tab page's hero is on screen, so its compact title can show once the hero scrolls
 * away. True until the first delivery; an element absent at mount is never observed. The observer
 * disconnects with the caller's scope.
 */
export function useHeroVisible(el: Readonly<Ref<Element | null>>): Readonly<Ref<boolean>> {
	const visible = ref(true)
	let observer: IntersectionObserver | undefined

	onMounted(() => {
		if (!el.value) return
		observer = new IntersectionObserver(
			(entries) => {
				// One delivery batches every change since the last, oldest first: only the newest is current.
				const newest = entries.at(-1)
				if (newest) visible.value = newest.isIntersecting
			},
			{ threshold: 0 },
		)
		observer.observe(el.value)
	})

	onScopeDispose(() => observer?.disconnect())

	return visible
}
