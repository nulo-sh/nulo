<script setup>
/**
 * `v-model` reaches the `Input` through `$attrs`, not a declared model: a declared model drops an
 * update whose value did not change, and a host may clear its error on every one. The host owns the
 * eye's flag and negates `hidden` on `toggle`.
 */
import PasswordVisibilityToggle from "@/components/composite/PasswordVisibilityToggle.vue"

defineOptions({ inheritAttrs: false })

defineProps({
	error: { type: Boolean, default: false },
	errorText: { type: String, default: "Wrong password" },
	errorTestid: { type: String, required: true },
	toggleTestid: { type: String, default: undefined },
	hidden: { type: Boolean, default: true },
})

const emit = defineEmits(["toggle"])
</script>

<template>
	<div :class="[error && $style.shake]">
		<Input v-bind="$attrs" :type="toggleTestid && !hidden ? 'text' : 'password'" :error="error" :ariaInvalid="error">
			<template v-if="toggleTestid" #suffix>
				<PasswordVisibilityToggle :hidden="hidden" :data-testid="toggleTestid" @toggle="emit('toggle')" />
			</template>
		</Input>
	</div>
	<Transition name="fade">
		<span v-if="error" :class="$style.error_text" role="alert" :data-testid="errorTestid">
			{{ errorText }}
		</span>
	</Transition>
</template>

<style module>
.error_text {
	composes: type--body from global;
	color: var(--txt-danger);
	margin-top: 4px;
	display: block;
}

.shake {
	composes: shake_password from "./shake.module.css";
}
</style>
