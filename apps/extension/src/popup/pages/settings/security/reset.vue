<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": false,
		"hideHeader": true,
		"showBottomNav": false
	}
}
</route>

<script setup>
/** Services */
import { deleteProfileClient } from "@/wallet/services/profile/client"
import { managers, requireAccount, requireNetwork } from "@/utils/core"

/** Utils */
import { dashIfBlank, trimAddress } from "@/utils/string"
import { importedKey, readImportedAccounts } from "./imported-accounts"

/** Composables */
import { useToast } from "@/composables/toast"
import { useConfirm } from "@/composables/useConfirm"
import { isAnyActivating } from "@/composables/useProfileBootstrap"
import { readGetStarted } from "@/utils/get-started"
const { openToast } = useToast()
const { requestConfirm } = useConfirm()

/** Components */
import CollapsingHeroLayout from "@/components/composite/CollapsingHeroLayout.vue"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const router = useRouter()

const checks = reactive({
	permanent: false,
	undone: false,
	sure: false,
})

const confirmText = ref("")

/** Unlocked, the imported accounts the delete removes, which the recovery phrase cannot restore: null
 *  while the read runs or after it failed. Locked, nothing is read, so the page shows none of them. */
const imported = ref(null)
const importedReadFailed = ref(false)
let importedReads = 0
/** The list as it stands; it fails once the lock or a newer read overtakes it, and since `getAccounts`
 *  answers while locked, no account read starts after that. */
const fetchImported = (read) => {
	const live = () => read === importedReads && appStore.isLogined
	const reads = {
		getNetworks: () => requireNetwork().getNetworks(),
		getAccounts: (id, chainId, all) =>
			live() ? requireAccount().getAccounts(id, chainId, all) : Promise.reject(new Error("read overtaken")),
		getPendingReset: () => managers.networkReset.getPendingReset(),
		getStaleNetwork: (networkId) => managers.networkReset.getStaleNetwork(networkId),
	}
	return readImportedAccounts(reads, appStore.profile?.id)
		.then((result) => (live() ? result : null))
		.catch(() => null)
}
const readImported = async () => {
	const read = ++importedReads
	imported.value = null
	importedReadFailed.value = false
	if (!appStore.isLogined || !appStore.profile?.id) return
	const result = await fetchImported(read)
	if (read !== importedReads) return
	imported.value = result
	importedReadFailed.value = result === null
}
managers.networkReset.onStaleNetworkChanged.add(readImported)
const importedAccounts = computed(() => (appStore.isLogined ? (imported.value?.accounts ?? []) : []))
/** Full backup carries every imported account, but refuses while a reset is pending, whose journal-held
 *  accounts only the account export page reaches; that page takes password profiles only. */
const exportFirstTo = computed(() => {
	if (!imported.value?.resetPending) return "/popup/settings/security/export/full"
	return appStore.profile?.type === "password" ? "/popup/settings/security/export/account" : null
})
/** Unlocked, a delete never runs before the list is known: a pending read holds the button, and a
 *  failed one is refused at the press. */
const importedSettled = computed(() => !appStore.isLogined || imported.value !== null || importedReadFailed.value)

const isReadyToReset = computed(
	() => checks.permanent && checks.undone && checks.sure && confirmText.value === appStore.profile?.name && importedSettled.value,
)

const isResetting = ref(false)

// The purge drains the profile's in-flight PXE work before erasing — a running
// proof legitimately holds that drain for up to ~30 minutes. Surface the wait
// once the delete has clearly outlived the quick path, so the disabled button
// reads as "working", not wedged.
const SLOW_DELETE_HINT_DELAY_MS = 10_000
const isSlowDelete = ref(false)
let slowDeleteTimer = null

// Its own client: the shared one gives up at 60 s, well inside the wait the hint promises. It
// outlives the page while a call runs: deleting the open profile locks the wallet, whose route
// unmounts this page before the purge returns, and the rest of the reset must still run.
const deleteService = deleteProfileClient()
let isUnmounted = false

/** A press deletes only what the page lists: it reads the list again, and an import made since, in
 *  another window, refuses it until the page has shown that account. */
const listsEveryImport = async () => {
	if (!appStore.isLogined) return true
	const shown = imported.value
	if (shown === null) return false
	const fresh = await fetchImported(importedReads)
	const listed = new Set(shown.accounts.map(importedKey))
	return fresh?.accounts.every((account) => listed.has(importedKey(account))) ?? false
}

/** Neither revealed on this device nor brought in by an import, so the person may hold no copy of it.
 *  A flag read that fails counts as never revealed; a retired profile has no phrase to reveal. */
const phraseNeverRevealed = async (profile) => {
	if (profile.retired) return false
	const flags = await readGetStarted(profile.id).catch(() => undefined)
	return !flags?.phraseSaved && !flags?.imported
}

/** Whether the page still offers to delete `profileId`: an unlock elsewhere moves the profile, and a
 *  page left meanwhile asks and deletes nothing. */
const stillOffers = (profileId) => !isUnmounted && isReadyToReset.value && !isResetting.value && appStore.profile?.id === profileId

let isReadingFlags = false
const handleReset = async () => {
	if (!isReadyToReset.value || isResetting.value || isReadingFlags) return
	const profileId = appStore.profile.id
	isReadingFlags = true
	const warn = await phraseNeverRevealed(appStore.profile).finally(() => {
		isReadingFlags = false
	})
	if (!stillOffers(profileId)) return
	if (!warn) return runDeletion(profileId)
	requestConfirm({
		title: "Delete this profile?",
		description: "Its recovery phrase was never saved. Without it, or a backup, its accounts are gone for good.",
		confirm_text: "Yes, delete profile",
		confirm_color: "red",
		irreversible: true,
		callback: () => void runDeletion(profileId),
	})
}

const runDeletion = async (deletedId) => {
	if (!stillOffers(deletedId)) return

	isResetting.value = true
	if (!(await listsEveryImport())) {
		isResetting.value = false
		openToast({ kind: "error", label: "Couldn't delete profile. Try again" })
		void readImported()
		return
	}

	// AWAIT the deletion: deleteProfile now drives the coordinator's full awaited
	// purge internally. If it REJECTS (e.g. the coordinator isn't ready, or a
	// purge failed and the tombstone was retained), we must NOT clear local state
	// or show success — the profile still exists and its data is mid-erase.
	slowDeleteTimer = setTimeout(() => {
		isSlowDelete.value = true
	}, SLOW_DELETE_HINT_DELAY_MS)
	try {
		await deleteService.deleteProfile(deletedId)
	} catch (_err) {
		if (isUnmounted) deleteService.disconnect()
		isResetting.value = false
		clearTimeout(slowDeleteTimer)
		isSlowDelete.value = false
		openToast({ kind: "error", label: "Couldn't delete profile. Try again" })
		return
	}
	if (isUnmounted) deleteService.disconnect()
	isResetting.value = false
	clearTimeout(slowDeleteTimer)
	isSlowDelete.value = false

	appStore.profiles = appStore.profiles.filter((p) => p.id !== deletedId)
	// The lock this deletion causes lets another profile be unlocked before a long purge returns;
	// that profile's session and route stand. One the lock screen only selected has neither.
	if (appStore.profile && appStore.profile.id !== deletedId && (appStore.isLogined || isAnyActivating())) {
		openToast({ kind: "success", label: "Profile deleted" })
		return
	}
	// The lock screen picks the profile it opens on, never a list position, and may have already.
	if (appStore.profile?.id === deletedId) appStore.profile = undefined
	appStore.networks = []
	appStore.network = null
	appStore.accounts = []
	appStore.account = null
	appStore.clearActivity()

	appStore.isLogined = false
	appStore.isSessionChecked = false

	// Note: onboardingCompleted intentionally persists across profile resets.
	// A user who has gone through onboarding once already knows about Aztec
	// and Presto; making them re-learn after a reset would be
	// patronizing. To restart onboarding, the user uninstalls + reinstalls
	// the extension (which wipes chrome.storage.local).

	openToast({ kind: "success", label: "Profile deleted" })

	if (!appStore.profiles.length) {
		router.push("/popup/register")
	} else {
		router.push("/popup/auth")
	}
}

watch(() => [appStore.isLogined, appStore.profile?.id], readImported, { immediate: true })

onBeforeUnmount(() => {
	isUnmounted = true
	managers.networkReset.onStaleNetworkChanged.remove(readImported)
	if (!isResetting.value) deleteService.disconnect()
	if (slowDeleteTimer) clearTimeout(slowDeleteTimer)
})
</script>

<template>
	<CollapsingHeroLayout
		heroMain="Delete"
		heroSub="Profile"
		collapsingLabel="Delete Profile"
		backTo="/popup/settings"
		tone="destructive"
		:data-profile-name="appStore.profile?.name ?? ''"
	>
		<!-- Profile -->
		<div :class="$style.section">
			<span :class="$style.section_label">Profile to delete</span>
			<ItemsContainer flat>
				<SettingItem :title="appStore.profile?.name ?? ''" titleVariant="name" raw />
			</ItemsContainer>
		</div>

		<div v-if="importedAccounts.length" :class="$style.section" data-testid="reset-imported">
			<span :class="$style.section_label">Imported accounts</span>
			<ItemsContainer flat>
				<SettingItem
					v-for="account in importedAccounts"
					:key="`${account.chainId}:${account.address}`"
					:title="dashIfBlank(account.name)"
					titleVariant="name"
					:description="trimAddress(account.address, 6, 4, '…')"
					descriptionVariant="meta"
					raw
					data-testid="reset-imported-account"
				/>
			</ItemsContainer>
			<Text variant="body" color="tertiary" height="150">Your recovery phrase can't bring these back.</Text>
			<Button v-if="exportFirstTo" variant="primary_outline" size="compact" :link="exportFirstTo" data-testid="reset-export-first">Export first</Button>
		</div>

		<!-- Agreements -->
		<div :class="$style.section">
			<span :class="$style.section_label">Agreements required</span>
			<Flex direction="column" gap="12">
				<Checkbox v-model="checks.permanent" data-testid="reset-checkbox-permanent">
					<Text variant="body" color="secondary" height="140">I understand this action is permanent</Text>
				</Checkbox>
				<Checkbox v-model="checks.undone" data-testid="reset-checkbox-undone">
					<Text variant="body" color="secondary" height="140">I understand this action cannot be undone</Text>
				</Checkbox>
				<Checkbox v-model="checks.sure" data-testid="reset-checkbox-sure">
					<Text variant="body" color="secondary" height="140">I'm sure there's no assets left in my profile</Text>
				</Checkbox>
			</Flex>
		</div>

		<!-- Confirmation -->
		<div :class="$style.section_last">
			<span :class="$style.section_label">Confirm deletion</span>
			<Input
				v-model="confirmText"

				type="text"
				label="Profile name"
				:placeholder="`Type &quot;${appStore.profile?.name}&quot; to confirm`"
				data-testid="reset-confirm-input"
			/>
			<Text variant="body" color="tertiary" height="150" data-testid="reset-recovery-note">
				{{
					appStore.profile?.retired
						? "This profile has no recovery phrase. Deleting it can't be undone."
						: "You will be able to recover the accounts created from your recovery phrase later if you have saved it"
				}}
			</Text>
		</div>

		<template #bottom>
			<Text v-if="isSlowDelete" variant="body" color="secondary" data-testid="reset-wait-hint">
				Waiting for an in-flight operation to finish. This can take up to ~30 minutes while a
				transaction is proving. Keep this window open.
			</Text>
			<Button @click="handleReset" :disabled="!isReadyToReset || isResetting" variant="cta_destructive" data-testid="reset-submit-btn">
				{{ isResetting ? "Deleting…" : "Delete Profile" }}
			</Button>
		</template>
	</CollapsingHeroLayout>
</template>

<style module>

.section {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 20px 0;
	border-bottom: 1px solid rgba(35, 31, 28, 1);
}

.section:last-child {
	border-bottom: none;
}

.section_last {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 20px 0;
}

.section_label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}
</style>
