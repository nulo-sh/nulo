<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": true,
		"hideHeader": true,
		"showBottomNav": false
	}
}
</route>

<script setup>
/** Components */
import CollapsingHeroLayout from "@/components/composite/CollapsingHeroLayout.vue"
import SecretUnlockSection from "@/components/composite/SecretUnlockSection.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"

/** Services */
import { managers } from "@/utils/core"

/** Utils */
import { passkeyNeedsOwnWindow } from "@/utils/browser-surface"
import { OWN_WINDOW_ROUTES, moveToOwnWindow, ownWindowRoute } from "@/utils/own-window"
import { backupNotice } from "@/components/stale-network/copy"

/** Composables */
import { useFullBackupExport } from "@/composables/useFullBackupExport"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"
import { isPopupSubmitKey, refuseRepeatEnter } from "@/composables/usePopupEntity"

// Path A passkey ceremony — replaces the prior SW-driven popup window for
// passkey profile backup-export. Mounted as `<PasskeyCeremonyDialog>` in
// the template; driven imperatively from `handleBackup`.
const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const router = useRouter()

const {
	password,
	repeatedPassword,
	isAgreed,
	backupStatus,
	isBusy,
	isDownloading,
	showRecommendation,
	isWrongPassword,
	isPasswordMismatch,
	dekReplaced,
	chainStateOmitted,
	unopenedImportedKeys,
	isPasskeyProfile,
	canDownload,
	handleBackup,
	handleEncrypt,
	downloadBackup,
	handleDownloadClick,
	reset,
	dispose,
} = useFullBackupExport({ runCeremony, leaveAfterPasskeyFailure })

/** A reset in progress: its journal holds accounts a backup made now would miss. */
const pendingReset = ref(null)
let pendingReads = 0
const syncPendingReset = async () => {
	const read = ++pendingReads
	const pending = await managers.networkReset.getPendingReset()
	if (read !== pendingReads) return
	pendingReset.value = pending ? backupNotice(appStore.networks.find((n) => n.id === pending.networkId)?.name ?? "") : null
}
managers.networkReset.onStaleNetworkChanged.add(syncPendingReset)
void syncPendingReset()

const handleAgree = () => {
	if (pendingReset.value) return
	isAgreed.value = true
	if (isPasskeyProfile.value) handleBackup()
}

/** After a failed passkey step: back, or in an own window, which has no page behind it, the
 *  agreement step. */
function leaveAfterPasskeyFailure() {
	if (ownWindowRoute() === undefined) router.go(-1)
	else isAgreed.value = false
}

const onKeydown = (e) => {
	if (!isAgreed.value || e.defaultPrevented || !isPopupSubmitKey(e)) return
	switch (backupStatus.value) {
		case "":
			handleBackup()
			break
		case "finished":
			handleEncrypt()
			break
		case "encrypted":
			downloadBackup(true)
			break
		default:
			// "progress" / "encrypting": a run is in flight, so Enter starts nothing.
			break
	}
}

// A profile switch made elsewhere updates this page in place. A backup it holds is the previous
// profile's, and the download rule would read the new profile's type, so the page starts over.
watch(
	() => appStore.profile?.id,
	() => {
		reset()
		onCeremonyReject(new Error("The active profile changed"))
		pendingReset.value = null
		void syncPendingReset()
	},
	{ flush: "sync" },
)

// Firefox's toolbar panel closes under the passkey prompt this page runs, so a passkey export moves
// to its own window first. A failed move keeps the page where it is.
onBeforeMount(() => {
	if (isPasskeyProfile.value && passkeyNeedsOwnWindow()) void moveToOwnWindow(OWN_WINDOW_ROUTES.export)
})

onBeforeUnmount(() => {
	managers.networkReset.onStaleNetworkChanged.remove(syncPendingReset)
	dispose()
})
</script>

<template>
	<CollapsingHeroLayout
		heroMain="Full"
		heroSub="Backup"
		collapsingLabel="Full Backup"
		backTo="/popup/settings/security/export"
		@keydown="onKeydown"
	>
		<!-- Agreement gate -->
		<template v-if="!isAgreed">
			<div v-if="pendingReset" :class="$style.reset_notice" data-testid="full-backup-reset-notice">
				<span :class="$style.reset_notice_label">{{ pendingReset.label }}</span>
				<span :class="$style.reset_notice_text">{{ pendingReset.text }}</span>
			</div>
			<div
				class="export_section_last"
				:class="pendingReset && $style.agreement_blocked"
				:data-blocked="pendingReset ? 'true' : 'false'"
				data-testid="full-backup-agreement"
			>
				<span class="export_section_label type--label-section">Before you continue</span>
				<Flex direction="column" gap="8">
					<Text variant="body" height="150" color="body">
						Backup provides direct, unrestricted access to your entire profile.
					</Text>
					<Text variant="body" height="150" color="body">
						Ensure that your backup is stored securely and never shared with anyone.
					</Text>
					<Text variant="body" height="150" color="body">
						By continuing you agree to all risks and responsibilities.
					</Text>
				</Flex>
			</div>
		</template>

		<!-- Password-profile unlock gate -->
		<template v-else-if="isAgreed">
			<SecretUnlockSection
				v-if="!isPasskeyProfile && !backupStatus"
				v-model="password"
				:error="isWrongPassword"
				@clearError="isWrongPassword = false"
			/>

			<!--
			Passkey-profile waiting state is now owned by the in-page modal
			(`PasskeyCeremonyDialog`, mounted below). No bespoke inline UI
			needed — the modal renders the spinner + "Waiting for passkey…"
			and dismisses itself when WebAuthn resolves.
			-->

			<template v-else-if="backupStatus">
				<!--
				Working states (progress = bundling the backup, encrypting =
				sealing it with a password). Previously this block rendered
				nothing while the button below ticked through "Creating
				Backup…" / "Encrypting…" — the page looked empty for ~1-3s.
				This inline status card mirrors the in-page-modal vibe
				without hijacking the screen (the modal is reserved for
				user-driven waits like the passkey ceremony).

				Wrapped in `export_section_last` so it participates in the
				page's existing 20px vertical rhythm (matches the agreement
				gate's section frame above).

				A11y: the wrapper is announced via `role="status"` +
				`aria-live="polite"` (same pattern as
				TransactionAwaitingCard.vue:37), the spinner is decorative
				(`aria-hidden`), and the heading is left as a plain span so
				the page's existing heading hierarchy isn't fractured
				(CollapsingHeroLayout.vue:63 uses spans for the hero, no h1).
				-->
				<div
					v-if="backupStatus === 'progress' || backupStatus === 'encrypting'"
					class="export_section_last"
				>
					<div
						:class="$style.status_card"
						data-testid="backup-status-card"
						role="status"
						aria-live="polite"
						aria-atomic="true"
					>
						<Spinner size="28" color="--nulo-accent" aria-hidden="true" />
						<span :class="$style.status_title">
							{{ backupStatus === "encrypting" ? "Encrypting your backup" : "Creating your backup" }}
						</span>
						<p :class="$style.status_subtitle">
							{{
								backupStatus === "encrypting"
									? "Sealing the file with your password. Only you can open it."
									: "Gathering your wallet data into your backup file."
							}}
						</p>
					</div>
				</div>

				<div v-else class="export_section">
					<span class="export_section_label type--label-section">Backup</span>
					<Banner v-if="dekReplaced" variant="warning" direction="vertical" data-testid="backup-keys-lost-banner">
						<template #title> Imported keys are not in this backup </template>
						<template #description>
							<Text color="secondary" height="140">
								This profile's imported-keys key could not be recovered, so the file carries a fresh one:
								any imported account must be imported again after the restore.
								<template v-if="isPasskeyProfile">
									To repair: keep this file and your passkey, delete this profile from the wallet, then
									restore the file with that passkey.
								</template>
								<template v-else>
									To repair: restore this file (or your recovery phrase) into a new profile, then delete
									this one.
								</template>
							</Text>
						</template>
					</Banner>
					<Banner
						v-if="unopenedImportedKeys > 0"
						variant="warning"
						direction="vertical"
						data-testid="backup-imported-unopened-banner"
					>
						<template #title> Some imported accounts are not in this backup </template>
						<template #description>
							<Text color="secondary" height="140">
								{{ unopenedImportedKeys === 1 ? "1 imported account" : `${unopenedImportedKeys} imported accounts` }}
								could not be opened, so {{ unopenedImportedKeys === 1 ? "it" : "they" }} will not be restored. Import
								their keys again after the restore.
							</Text>
						</template>
					</Banner>
					<Banner v-if="chainStateOmitted" variant="warning" direction="vertical" data-testid="backup-chain-state-omitted-banner">
						<template #title> Local chain data is not in this backup </template>
						<template #description>
							<Text color="secondary" height="140">
								This profile is in recovery mode, so its registered custom contracts and senders were
								left out. After the restore, register them again. Until then their private notes
								stay undiscovered, since a network sync cannot rebuild that material.
							</Text>
						</template>
					</Banner>
					<Banner v-if="showRecommendation" variant="info" direction="vertical" data-testid="backup-ready-banner">
						<template #title> {{ isPasskeyProfile ? "Backup is ready" : "Protect your backup" }} </template>
						<template #description>
							<Text v-if="isPasskeyProfile" height="140">
								Protect it with a password before you download it. Without a password, the file is saved in
								plain text.
							</Text>
							<Text v-else height="140">
								Encrypt the file with your profile password before you download it. Without a password, anyone
								who opens the file controls this profile.
							</Text>
						</template>
					</Banner>

					<Banner v-if="backupStatus === 'encrypted'" variant="done" direction="vertical">
						<template #title> Backup is successfully encrypted </template>
						<template #description>
							<Text color="secondary" height="140">
								Don't forget your
								<Text v-if="!isPasskeyProfile" color="primary">profile</Text>
								password, as it will be required to restore your backup.
							</Text>
						</template>
					</Banner>
				</div>

				<!-- Encryption password fields (passkey profiles) -->
				<div
					v-if="!showRecommendation && isPasskeyProfile && backupStatus === 'finished'"
					class="export_section_last"
				>
					<span class="export_section_label type--label-section">Encrypt with password</span>
					<Flex direction="column" gap="12">
						<div :class="[isPasswordMismatch && $style.shake]">
							<Input
								v-model="password"
								:error="isPasswordMismatch"
								:ariaInvalid="isPasswordMismatch"
								@click="isPasswordMismatch = false"
								@input="isPasswordMismatch = false"
								type="password"
								label="Password"
								placeholder="Enter password"
								autocomplete="new-password"
								autofocus
								:disabled="backupStatus === 'encrypting'"
								data-testid="backup-encrypt-password-input"
							/>
						</div>
						<Input
							v-model="repeatedPassword"
							:error="isPasswordMismatch"
							:ariaInvalid="isPasswordMismatch"
							@click="isPasswordMismatch = false"
							@input="isPasswordMismatch = false"
							type="password"
							placeholder="Repeat password"
							autocomplete="new-password"
							:disabled="backupStatus === 'encrypting'"
							data-testid="backup-encrypt-password-confirm-input"
						/>
						<Transition name="fade">
							<span
								v-if="isPasswordMismatch"
								:class="$style.error_text"
								role="alert"
								data-testid="backup-encrypt-error-text"
							>
								Passwords don't match
							</span>
						</Transition>
					</Flex>
				</div>
			</template>
		</template>

		<!-- Bottom CTAs -->
		<template #bottom>
			<Button v-if="!isAgreed" @click="handleAgree" variant="cta" :disabled="!!pendingReset" data-testid="agree-continue-btn">
				Agree &amp; Continue
			</Button>

			<Button
				v-else-if="isAgreed && !isPasskeyProfile && !backupStatus"
				@click="handleBackup"
				@keydown.enter="refuseRepeatEnter"
				:disabled="!password || isWrongPassword || isBusy"
				variant="cta"
				data-testid="unlock-submit-btn"
			>
				Create Backup
			</Button>

			<Flex
				v-else-if="backupStatus"
				direction="column"
				gap="8"
			>
				<Button
					v-if="backupStatus === 'finished' || backupStatus === 'encrypting'"
					@click="handleEncrypt()"
					@keydown.enter="refuseRepeatEnter"
					:disabled="backupStatus === 'encrypting' || isDownloading"
					variant="cta"
					data-testid="protect-password-btn"
				>
					{{ backupStatus === 'encrypting' ? 'Encrypting…' : 'Protect with Password' }}
				</Button>
				<Button
					@click="handleDownloadClick"
					@keydown.enter="refuseRepeatEnter"
					:disabled="!canDownload || isDownloading"
					:variant="backupStatus !== 'encrypted' ? 'cta_outline' : 'cta'"
					data-testid="download-backup-btn"
				>
					{{ backupStatus === 'progress' ? 'Creating Backup…' : 'Download Backup' }}
				</Button>
			</Flex>
		</template>
	</CollapsingHeroLayout>

	<!-- Path A: in-page passkey ceremony for backup-export. Mounts only
	     while a ceremony is in flight; emits resolve/reject back through
	     `usePasskeyCeremony`. Cancel resets `isAgreed` so the user can
	     re-confirm without bouncing off the page. -->
	<PasskeyCeremonyDialog
		v-if="ceremonyRequest"
		:request="ceremonyRequest"
		@resolve="onCeremonyResolve"
		@reject="onCeremonyReject"
	/>
</template>

<style module>
/* In-page status card for the working states (progress / encrypting).
   Visual language echoes PasskeyCeremonyDialog (centered, padded, light
   border, spinner + title + subtitle) so the wallet feels cohesive
   across waiting moments — but inline, not as a screen-blocking modal.

   Outer spacing intentionally NOT defined here — the `export_section_last`
   wrapper class supplies the page's standard 20px vertical rhythm. We
   only style the card interior (centered column, padded surface, border). */
.status_card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 14px;

	padding: 32px 24px;

	border: 1px solid var(--nulo-border);
	background: var(--nulo-surface-low);

	text-align: center;
}

.status_title {
	composes: type--row-title from global;
	font-size: 16px;
	color: var(--txt-primary);
}

.status_subtitle {
	composes: type--body from global;
	line-height: 1.5;
	color: var(--nulo-secondary);
	margin: 0;
	max-width: 280px;
}

.error_text {
	composes: type--body from global;
	color: var(--red);
	margin-top: 4px;
	display: block;
}

.shake {
	composes: shake_password from "../../../../../components/composite/shake.module.css";
}

.agreement_blocked {
	opacity: 0.38;
}

.reset_notice {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-bottom: 20px;
	padding: 14px 12px;
	background: color-mix(in srgb, var(--yellow) 7%, transparent);
	border: 1px solid color-mix(in srgb, var(--yellow) 45%, transparent);
}

.reset_notice_label {
	composes: type--meta from global;
	color: var(--txt-warning);
}

.reset_notice_text {
	composes: type--body from global;
	line-height: 1.5;
	color: var(--txt-primary);
}
</style>
