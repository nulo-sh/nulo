<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import PasswordVisibilityToggle from "@/components/composite/PasswordVisibilityToggle.vue"
import UnlockMethodChoice from "@/components/composite/import/UnlockMethodChoice.vue"
import { showsDecryptCta } from "@/utils/full-backup-ctas"
import { newPasswordHint } from "@/utils/password"
import { COLLAPSING_HERO } from "../collapsing-hero"
import { restoreWarningText } from "./restore-warning"
/**
 * Renders the full-backup-restore form: file picker, error/warning
 * banners, decryption-password section (when the backup is encrypted),
 * and how the new profile will unlock (when restoring into a new one).
 * Visibility toggles for the password fields are local.
 */
const props = defineProps({
	selectedBackup: { type: Object, default: null },
	restoreStatus: { type: [String, null], default: "" },
	isRestoreHasErrors: { type: Boolean, default: false },
	/** Names of the networks a Retry replays; the warning names them. */
	unrestoredNetworks: { type: Array, default: () => [] },
	hasOtherErrors: { type: Boolean, default: false },
	/** Imported accounts the restore kept for networks the new profile lacks; the warning names them. */
	heldAccounts: { type: Array, default: () => [] },
	/** Replaces the warning the form words from `unrestoredNetworks` and `hasOtherErrors`. */
	warningText: { type: String, default: undefined },
	/** The failed-Retry line the page adds above its buttons, which raises their edge again. */
	retryFailedAgain: { type: Boolean, default: false },
	/** Restoring into a new profile asks for its password; restoring into the open one does not. */
	askNewPassword: { type: Boolean, default: true },
	error: { type: Object, default: () => ({ type: "", title: "", tooltip: "" }) },
	isCopied: { type: Boolean, default: false },
	maxPasswordLength: { type: Number, default: 128 },
})

const emit = defineEmits(["pickFile", "copyError", "passwordInput"])

const decryptionPassword = defineModel("decryptionPassword", { default: "" })
const password = defineModel("password", { default: "" })
const repeatedPassword = defineModel("repeatedPassword", { default: "" })
const unlockMethod = defineModel("unlockMethod", { default: "password" })

const hero = inject(COLLAPSING_HERO, null)

const isPasswordType = ref(true)
const isDecryptionPasswordType = ref(true)
const warningRef = useTemplateRef("warningRef")

const passwordHint = computed(() => newPasswordHint(password.value ?? "", repeatedPassword.value ?? ""))
const showWarning = computed(() => props.restoreStatus === "finished" && props.isRestoreHasErrors)
const shownWarning = computed(
	() => props.warningText ?? restoreWarningText(props.unrestoredNetworks, props.hasOtherErrors, props.heldAccounts),
)

// The errors screen's footer buttons appear with the warning and shorten the popup's scroller,
// which leaves the warning below its edge; the failed-Retry line shortens it once more.
watch(
	[showWarning, () => props.retryFailedAgain],
	([shown]) => {
		const el = shown ? warningRef.value?.$el : null
		if (!el) return
		if (hero) hero.reveal(el)
		else el.scrollIntoView({ block: "nearest" })
	},
	{ flush: "post" },
)
</script>

<template>
	<div :class="$style.section">
		<span :class="$style.section_label">Backup File</span>
		<ItemsContainer flat>
			<SettingItem
				@click="emit('pickFile')"
				title="Choose a backup file"
				:description="selectedBackup ? selectedBackup.name : 'Select a .gz, .json or .txt file'"
				icon="package"
				:iconBgColor="error.type === 'full_backup' ? 'red' : selectedBackup ? 'blue' : 'gray'"
				chevron
				:disabled="restoreStatus === 'progress'"
				data-testid="import-full-backup-pick-file"
			/>
		</ItemsContainer>

		<Flex
			v-if="error.type === 'full_backup'"
			@click.stop="emit('copyError')"
			data-testid="import-full-backup-error"
			direction="column"
			gap="6"
			wide
			:class="$style.error_wrapper"
		>
			<Flex align="center" gap="8" :class="$style.error_title_wrapper">
				<span :class="$style.error_tag">Error</span>
				<Text variant="body" color="txt-danger" :class="$style.error_title" data-testid="import-full-backup-error-title">{{ error.title }}</Text>
				<Icon :name="isCopied ? 'check' : 'copy'" size="13" color="red" />
			</Flex>
			<Flex v-if="error.tooltip" align="start" :class="$style.error_description_wrapper" wide>
				<Text variant="body" height="120" color="txt-danger" :class="$style.error_description">{{ error.tooltip }}</Text>
			</Flex>
		</Flex>

		<Flex
			v-if="showWarning"
			ref="warningRef"
			role="alert"
			data-testid="import-full-backup-warning"
			direction="column"
			gap="4"
			:class="$style.warning_block"
			wide
		>
			<Flex align="center" gap="8">
				<span :class="[$style.error_tag, $style.error_tag_warning]">Warning</span>
				<Text variant="body" height="120" color="txt-warning">{{ shownWarning }}</Text>
			</Flex>
		</Flex>
	</div>

	<div v-if="showsDecryptCta({ selectedBackup })" :class="$style.section">
		<span :class="$style.section_label">Decryption Password</span>
		<Input
			v-model="decryptionPassword"
			:type="isDecryptionPasswordType ? 'password' : 'text'"
			placeholder="Enter the password used to encrypt this backup"
			autocomplete="current-password"
			autofocus
			data-testid="import-full-backup-decrypt-password-input"
		>
			<template #suffix>
				<PasswordVisibilityToggle
					:hidden="isDecryptionPasswordType"
					data-testid="import-full-backup-decrypt-password-input-visibility-toggle"
					@toggle="isDecryptionPasswordType = !isDecryptionPasswordType"
				/>
			</template>
		</Input>
	</div>

	<div v-if="askNewPassword && selectedBackup?.profileType && !restoreStatus" :class="$style.section">
		<UnlockMethodChoice
			v-model="unlockMethod"
			passwordTestid="import-full-backup-method-password"
			passkeyTestid="import-full-backup-method-passkey"
		>
			<Flex direction="column" gap="12">
				<Input
					v-model="password"
					:type="isPasswordType ? 'password' : 'text'"
					@input="emit('passwordInput')"
					:maxLength="maxPasswordLength"
					placeholder="Enter new password"
					autocomplete="new-password"
					data-testid="import-full-backup-password-input"
				>
					<template #suffix>
						<PasswordVisibilityToggle
							:hidden="isPasswordType"
							data-testid="import-full-backup-password-input-visibility-toggle"
							@toggle="isPasswordType = !isPasswordType"
						/>
					</template>
					<template #bottom>
						<Flex align="center" gap="6" :class="$style.hint_row">
							<Icon name="lock" :size="12" color="tertiary" />
							<Text variant="body" color="tertiary">{{ passwordHint }}</Text>
						</Flex>
					</template>
				</Input>
				<Input
					v-model="repeatedPassword"
					:type="isPasswordType ? 'password' : 'text'"
					@input="emit('passwordInput')"
					:maxLength="maxPasswordLength"
					placeholder="Repeat password"
					autocomplete="new-password"
					data-testid="import-full-backup-password-confirm-input"
				/>
				<Text variant="body" color="tertiary" height="150">
					Create a new password that will be used to log in to your profile in the future
				</Text>
				</Flex>
		</UnlockMethodChoice>
	</div>
</template>

<style module>
/* No section-level border-bottom: the SettingItem (file picker) and the
 * Input children already paint their own bottom borders, so the extra
 * divider stacked two 1px lines ~20px apart. */
.section {
	composes: section from "./import-shared.module.css";
}

.section_label {
	composes: section_label from "./import-shared.module.css";
}

.hint_row {
	margin-top: 4px;
}

.error_tag {
	composes: type--label-section from global;
	color: var(--txt-danger);
	border: 1px solid var(--red);
	padding: 2px 6px;
	flex-shrink: 0;
}

.error_tag_warning {
	color: var(--txt-warning);
	border-color: var(--yellow);
}

.error_wrapper {
	margin-top: -4px;
	padding: 8px;
}

.warning_block {
	padding: 8px;
	/* A name in the sentence is one word of any width. A row's flex item never shrinks below its
	 * min-content width, which `anywhere` lowers and `break-word` does not. */
	overflow-wrap: anywhere;
}

.error_title_wrapper {
	position: relative;

	.error_title {
		padding-right: 16px;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		word-break: break-word;
		-webkit-line-clamp: 1;
	}

	& svg:last-child {
		position: absolute;
		top: 0;
		right: 0;
		opacity: 0.7;
	}
}

.error_description_wrapper {
	position: relative;

	.error_description {
		padding-right: 16px;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		word-break: break-word;
		-webkit-line-clamp: 3;
	}
}
</style>
