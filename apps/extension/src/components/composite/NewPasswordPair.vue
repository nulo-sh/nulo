<script setup lang="ts">
/**
 * `testids` names `input`, `confirm`, `toggle`, and optionally `hint` and the confirm field's native
 * `confirmInput`, exactly as the host's selectors know them. A host whose visibility state outlives
 * the pair binds `v-model:hidden`, so a pair mounted again keeps what the person revealed.
 *
 * `#repeatLabel` holds a host's heading for the repeat field: give it the slot's `id`, which labels the
 * field. `labelRepeat`'s built-in heading stays a sibling at the pair's 12 px.
 */
import PasswordVisibilityToggle from "@/components/composite/PasswordVisibilityToggle.vue"
import { MAX_PASSWORD_LENGTH } from "@/utils/password"
import { newPasswordHint } from "@/utils/password-hint"

defineProps({
	testids: { type: Object, required: true },
	placeholder: { type: String, default: "Enter new password" },
	repeatPlaceholder: { type: String, default: "Repeat password" },
	autofocus: { type: Boolean, default: false },
	maxLength: { type: Number, default: MAX_PASSWORD_LENGTH },
	labelRepeat: { type: Boolean, default: false },
	hideHint: { type: Boolean, default: false },
})

const password = defineModel("password", { default: "" })
const repeatedPassword = defineModel("repeatedPassword", { default: "" })
const hidden = defineModel("hidden", { type: Boolean, default: true })

const repeatLabelId = useId()
const hint = computed(() => newPasswordHint(password.value ?? "", repeatedPassword.value ?? ""))

/** The flag as last written, by this pair or the host: a bound model reads the host's value only
 *  after the host renders again, and two clicks in one task must cancel out. */
let latest = hidden.value
const toggleHidden = () => {
	latest = !latest
	hidden.value = latest
}

watch(hidden, (value) => (latest = value), { flush: "sync" })
</script>

<template>
	<Flex direction="column" gap="12">
		<Input
			v-model="password"
			:type="hidden ? 'password' : 'text'"
			:maxLength="maxLength"
			:placeholder="placeholder"
			autocomplete="new-password"
			:autofocus="autofocus"
			:data-testid="testids.input"
		>
			<template #suffix>
				<PasswordVisibilityToggle :hidden="hidden" :data-testid="testids.toggle" @toggle="toggleHidden" />
			</template>
			<template v-if="!hideHint" #bottom>
				<Flex align="center" gap="6" :class="$style.hint_row">
					<Icon name="lock" :size="12" color="tertiary" />
					<Text variant="body" color="tertiary" :data-testid="testids.hint">{{ hint }}</Text>
				</Flex>
			</template>
		</Input>
		<span v-if="labelRepeat" :id="repeatLabelId" class="export_section_label type--label-section">Repeat password</span>
		<Flex direction="column" gap="8">
			<slot name="repeatLabel" :id="repeatLabelId" />
			<Input
				v-model="repeatedPassword"
				:ariaLabelledby="labelRepeat || $slots.repeatLabel ? repeatLabelId : undefined"
				:type="hidden ? 'password' : 'text'"
				:maxLength="maxLength"
				:placeholder="repeatPlaceholder"
				autocomplete="new-password"
				:data-testid="testids.confirm"
				:inputTestid="testids.confirmInput"
			/>
		</Flex>
		<slot />
	</Flex>
</template>

<style module>
.hint_row {
	margin-top: 4px;
}
</style>
