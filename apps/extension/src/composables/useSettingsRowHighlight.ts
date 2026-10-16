import { type Directive, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import "./settings-row-highlight.css"

/**
 * The Settings row a search result opened. `?row=<id>` is read once on arrival and dropped from the
 * URL at once, so Back, a reload or a later visit outlines nothing. The row marked
 * `v-settings-row="<id>"` that next mounts with that id scrolls into view and is outlined for a
 * moment; `.inset` draws the outline inside a row whose container clips.
 */
export function useSettingsRowHighlight() {
	const route = useRoute()
	const router = useRouter()
	const target = ref<string | null>(null)

	watch(
		() => route.query.row,
		(row) => {
			if (row === undefined) return
			// Compared by strict equality only: never a selector, a key or markup.
			target.value = typeof row === "string" ? row : null
			void router.replace({ path: route.path })
		},
		{ immediate: true },
	)

	const vSettingsRow: Directive<HTMLElement, string, "inset"> = {
		mounted(el, { value: id, modifiers }) {
			el.dataset.settingsRow = id
			if (id !== target.value) return
			target.value = null
			el.dataset.highlighted = modifiers.inset ? "inset" : ""
			el.scrollIntoView({ block: "center" })
		},
	}

	return { vSettingsRow, target }
}
