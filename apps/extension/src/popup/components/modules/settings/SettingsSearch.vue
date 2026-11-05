<script setup>
/** Components */
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"

/** Utils */
import { isComposing } from "@nulo/design/composables/keys.ts"
import { searchSettings, settingsResultTo, visibleSettingsRows } from "@/utils/settings-search"
import { stripBidiAndZeroWidth } from "@/utils/string"

const props = defineProps({
	/** The `SettingsContext` that decides which rows exist. */
	context: { type: Object, required: true },
})
const query = defineModel({ type: String, default: "" })

const router = useRouter()

const root = useTemplateRef("root")
const field = useTemplateRef("field")
const groups = computed(() => searchSettings(visibleSettingsRows(props.context), query.value))
const firstResult = computed(() => groups.value?.[0]?.rows[0])

function focusField() {
	field.value?.focus()
}

function stops() {
	return [field.value?.inputEl, ...(root.value?.$el.querySelectorAll("[data-settings-result]") ?? [])].filter(Boolean)
}

function moveFocus(step) {
	const all = stops()
	if (all.length < 2) return false
	const at = all.indexOf(document.activeElement)
	all[(at + step + all.length) % all.length].focus()
	return true
}

function onEscape(e) {
	if (query.value) {
		query.value = ""
		focusField()
		e.preventDefault()
		return
	}
	// A held Escape that just emptied the field must not go on to close the toolbar popup.
	if (e.repeat) e.preventDefault()
}

function onFieldEnter(e) {
	e.preventDefault()
	if (e.repeat || !firstResult.value) return
	void router.push(settingsResultTo(firstResult.value))
}

function onKeydown(e) {
	// A modified arrow or Enter keeps the field's own meaning (Shift+ArrowUp selects to the start).
	if (isComposing(e) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
	if (e.key === "ArrowDown" || e.key === "ArrowUp") {
		if (moveFocus(e.key === "ArrowDown" ? 1 : -1)) e.preventDefault()
	} else if (e.key === "Escape") {
		onEscape(e)
	} else if (e.key === "Enter" && e.target === field.value?.inputEl) {
		onFieldEnter(e)
	}
}
</script>

<template>
	<Flex ref="root" direction="column" gap="32" @keydown="onKeydown">
		<Input
			ref="field"
			v-model="query"
			:normalize="stripBidiAndZeroWidth"
			icon="search"
			clearable
			placeholder="Search settings"
			inputTestid="settings-search-input"
			@clear="query = ''"
		/>

		<template v-if="groups">
			<ItemsContainer v-for="group in groups" :key="group.caption" :title="group.caption" :danger="group.danger">
				<SettingItem
					v-for="row in group.rows"
					:key="row.id"
					:to="settingsResultTo(row)"
					:title="row.title"
					:description="row.description"
					chevron
					data-settings-result
					:data-testid="`settings-search-result-${row.id}`"
				/>
			</ItemsContainer>

			<Text v-if="!groups.length" variant="body" color="tertiary" data-testid="settings-search-empty">No settings found</Text>
		</template>
	</Flex>
</template>
