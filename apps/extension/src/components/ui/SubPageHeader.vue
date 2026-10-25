<script setup>
// Wrapper-backed: the bare <SubPageHeader> tag + the 3 explicit page
// importers (journal/tx/tokens [id].vue) resolve HERE (NOT via the resolver). The router-free base
// lives in @nulo/design; this wrapper owns the router + history policy and the /popup/general fallback.
import { SubPageHeaderBase } from "@nulo/design"
import { goBack } from "@/utils/page-back"

const props = defineProps({
	title: {
		type: String,
		required: false,
		default: "",
	},
	backTo: {
		type: String,
		required: false,
	},
	showBack: {
		type: Boolean,
		default: true,
	},
	leadingIcon: {
		type: String,
		required: false,
	},
	leadingIconColor: {
		type: String,
		default: "secondary",
	},
})

const router = useRouter()
const base = useTemplateRef("base")
defineExpose({ focusTitle: () => base.value?.focusTitle() })

function handleBack() {
	void goBack(router, props.backTo)
}
</script>

<template>
	<SubPageHeaderBase
		ref="base"
		:title="title"
		:show-back="showBack"
		:leading-icon="leadingIcon"
		:leading-icon-color="leadingIconColor"
		@back="handleBack"
	>
		<!-- Forward slots only when provided so the base's title default (icon + title prop) still fires. -->
		<template v-if="$slots.title" #title><slot name="title" /></template>
		<template v-if="$slots.trailing" #trailing><slot name="trailing" /></template>
	</SubPageHeaderBase>
</template>
