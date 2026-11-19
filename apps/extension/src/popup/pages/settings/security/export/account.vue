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
import FilePasswordSection from "@/components/composite/FilePasswordSection.vue"
import SecretUnlockSection from "@/components/composite/SecretUnlockSection.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"

/** Services */
import { managers } from "@/utils/core"

/** Utils */
import { downloadFile, profileFileNameSegment } from "@/utils"
import { trimAddress } from "@/utils/string"
import { isNewPasswordValid } from "@/utils/password"
import { isToolbarPopup } from "@/utils/browser-surface"
import { logCredentialFailure } from "@/utils/credential-refusal"
import { goBack } from "@/utils/page-back"
import { OWN_WINDOW_ROUTES, leavePanelFor } from "@/utils/own-window"
import { askProfilePasskey } from "@/utils/profile-passkey"
import { handleCancelOrUnconfirmed, PASSKEY_COPY, passkeyFailureCopy } from "@/utils/passkey-copy"
import { watchLockStart } from "@/popup/locked-state"

/** Composables */
import { createRunFence } from "@/composables/runFence"
import { useToast } from "@/composables/toast.js"
import { isPopupSubmitKey, refuseRepeatEnter } from "@/composables/usePopupEntity"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { AccountType } from "@/wallet/services/account/client"
const appStore = useAppStore()

const route = useRoute()
const router = useRouter()

/** A passkey profile's file is approved by its passkey and sealed under a file password of its own:
 *  nothing the passkey gives may open a file outside the wallet. */
const isPasskeyProfile = computed(() => appStore.profile?.type === "passkey")
const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()

/** The imported accounts a paused network reset holds in its journal, on whichever network: no
 *  picker lists their rows while the chain is quarantined or after the purge. */
const heldAccounts = ref([])
const readHeldAccounts = async () => {
	const pending = await managers.networkReset.getPendingReset()
	if (!pending || pending.running) return []
	const view = await managers.networkReset.getStaleNetwork(pending.networkId)
	return (view?.reset?.heldImported ?? []).map((a) => ({ ...a, type: AccountType.Imported, held: true }))
}
/** Another profile's held rows never show: a switch drops them at once, and a read it outlived is dropped. */
const loadHeldAccounts = async () => {
	heldAccounts.value = []
	const profileId = appStore.profile?.id
	const held = await readHeldAccounts().catch(() => [])
	if (appStore.profile?.id === profileId) heldAccounts.value = held
}

/** Live rows (and the preselect validation) are only ever CURRENT-chain rows: during a network
 *  switch `appStore.accounts` can transiently hold the previous chain's rows, and an export must
 *  never bind an address to the wrong chainId. A held row has no chain: the journal is read by address. */
const accounts = computed(() => {
	const live = (appStore.accounts ?? []).filter((a) => a.chainId === appStore.network?.chainId)
	return [...live, ...heldAccounts.value.filter((h) => !live.some((a) => a.address === h.address))]
})

const closeButton = useTemplateRef("closeButton")
const selectedAddress = ref("")
const isAgreed = ref(false)
const password = ref()
const isWrongPassword = ref(false)
const isBusy = ref(false)
const isDownloading = ref(false)
const filePassword = ref("")
const repeatedFilePassword = ref("")
/** Bumped by a Save that failed after its passkey, which drops the typed pair: the pair mounts again,
 *  and its first field takes the keyboard back. */
const pairRun = ref(0)
const canSaveFile = computed(() => isNewPasswordValid(filePassword.value ?? "", repeatedFilePassword.value ?? ""))

/** "" | "ready" | "protected" | "downloaded" — the file stages, mirroring Full Backup's status machine. */
const fileStatus = ref("")
const payload = ref("")

/** Async-result fence: invalidated by every flow reset and by unmount (runs only snapshot it), so an
 *  export RPC that resolves late can neither write a payload back after the scrub nor land in a
 *  different account's flow. */
const runs = createRunFence()

const resetFlow = () => {
	runs.invalidate()
	selectedAddress.value = ""
	isAgreed.value = false
	password.value = null
	isWrongPassword.value = false
	isBusy.value = false
	isDownloading.value = false
	fileStatus.value = ""
	payload.value = ""
	clearFilePassword()
	onCeremonyReject(new Error("The account file flow started over"))
}

function clearFilePassword() {
	filePassword.value = ""
	repeatedFilePassword.value = ""
}

/** Preselect via the Manage Accounts deep-link (`?address=`); the picker is skipped when it
 *  lists the address. Watched, not read once: a query-only
 *  navigation reuses this component instance, so entering with a different (or no) address must
 *  scrub the previous flow's stage and payload rather than inherit them. */
const applyQueryPreselect = () => {
	const queryAddress = typeof route.query.address === "string" ? route.query.address : ""
	if (queryAddress && accounts.value.some((a) => a.address === queryAddress)) {
		selectedAddress.value = queryAddress
	}
}
applyQueryPreselect()
watch(
	() => route.query.address,
	() => {
		if (route.path !== "/popup/settings/security/export/account") return
		resetFlow()
		applyQueryPreselect()
	},
)
// A deep-link can land while the activation bootstrap is still refilling the store (a fresh
// unlock re-runs it): at setup the account list is momentarily empty, so the one-shot preselect
// above finds nothing and the page strands on the picker. Re-apply when the rows arrive — only
// while nothing is selected, so a manual pick is never overridden.
watch(accounts, () => {
	if (route.path !== "/popup/settings/security/export/account") return
	if (selectedAddress.value) return
	applyQueryPreselect()
})
// A profile switched from another window leaves this page mounted: its flow, payload included,
// belongs to the previous profile.
watch(
	() => appStore.profile?.id,
	() => {
		resetFlow()
		loadHeldAccounts()
	},
)
// So does its unlock changed from another window: the flow's steps and its file's copy follow it.
watch(
	() => appStore.profile?.type,
	() => {
		resetFlow()
		applyQueryPreselect()
	},
)
// A lock can leave this page mounted (an unlock from another window supersedes it before the
// landing): what was typed or asked belongs to the session that ended.
watchLockStart(
	() => appStore.isLogined,
	() => {
		resetFlow()
		applyQueryPreselect()
	},
)
// A passkey profile's file not made yet ends when this window's chain id changes or clears (its own
// bootstrap clears it; another window's network switch never reaches it): its typed pair and any
// pending Save belong to the session or network before. A made file is kept.
watch(
	() => appStore.network?.chainId,
	() => {
		if (!isPasskeyProfile.value || fileStatus.value) return
		resetFlow()
		applyQueryPreselect()
	},
)

const selectedAccount = computed(() => accounts.value.find((a) => a.address === selectedAddress.value))

const collapsingLabel = computed(() => {
	if (!selectedAddress.value) return "Account"
	return selectedAccount.value?.name ?? "Account"
})

const handleSelect = (account) => {
	selectedAddress.value = account.address
}

const handleAgree = () => {
	isAgreed.value = true
}

const exportSelected = (encrypt) =>
	selectedAccount.value?.held
		? managers.account.exportResetHeldAccount(appStore.profile.id, selectedAddress.value, password.value, encrypt)
		: managers.account.exportAccount(appStore.profile.id, appStore.network.chainId, selectedAddress.value, password.value, encrypt)

/** What a Save is for: its answer and its file never reach another profile, network or account. */
const exportScope = () =>
	`${appStore.profile?.id}|${appStore.network?.chainId}|${selectedAddress.value}|${selectedAccount.value?.held ? "held" : "live"}`

/** The passkey's answer for one Save, asked at the profile's own input; `undefined` when the Save
 *  stops there (cancelled, superseded or out of scope), its failure already told and the pair kept. */
async function askFilePasskey(profileId, name, inScope, isCurrent) {
	try {
		const answer = await askProfilePasskey(
			runCeremony,
			managers.profile,
			{ profileId, step: "accountFile", profileName: () => name },
			inScope,
		)
		return inScope() ? answer : undefined
	} catch (error) {
		if (isCurrent() && !handleCancelOrUnconfirmed(error, openToast))
			openToast({ kind: "error", label: passkeyFailureCopy(error, PASSKEY_COPY.unlockFailed) })
		return undefined
	}
}

/** The answer checked, then one sealed export under the pair read at the press. A failure here drops
 *  the pair, and the next Save asks the passkey again. */
async function sealAccountFile(save, answer, inScope, isCurrent) {
	const { profileId, chainId, address, held, password } = save
	try {
		await managers.profile.verifyExportCredential(profileId, { passkey: answer })
		if (!inScope()) return
		const body = held
			? await managers.account.exportResetHeldAccount(profileId, address, password, true, answer)
			: await managers.account.exportAccount(profileId, chainId, address, password, true, answer)
		if (!isCurrent()) return
		payload.value = body
		fileStatus.value = "protected"
		clearFilePassword()
	} catch (error) {
		if (!isCurrent()) return
		logCredentialFailure("[export/account] passkey file failed:", error)
		clearFilePassword()
		pairRun.value++
		openToast({ kind: "error", label: "Failed to create the file" })
	}
}

/** Save, passkey profile: the pair and the scope are read at the press, before the passkey is asked,
 *  and the file it seals is downloaded in the same press. */
const handleSaveFile = async () => {
	if (!appStore.isLogined || !canSaveFile.value || isBusy.value) return
	isBusy.value = true
	const isCurrent = runs.snapshot()
	const scope = exportScope()
	const inScope = () => isCurrent() && scope === exportScope()
	const { id: profileId, name } = appStore.profile
	const save = {
		profileId,
		chainId: appStore.network?.chainId,
		address: selectedAddress.value,
		held: !!selectedAccount.value?.held,
		password: filePassword.value,
	}
	try {
		const answer = await askFilePasskey(profileId, name, inScope, isCurrent)
		if (answer !== undefined) await sealAccountFile(save, answer, inScope, isCurrent)
	} finally {
		if (isCurrent()) isBusy.value = false
	}
	if (isCurrent() && fileStatus.value === "protected") await handleDownload()
}

const handleCreate = async () => {
	if (!password.value || isBusy.value) return
	isBusy.value = true
	const isCurrent = runs.snapshot()
	try {
		const body = await exportSelected(false)
		if (!isCurrent()) return
		payload.value = body
		fileStatus.value = "ready"
	} catch (error) {
		if (!isCurrent()) return
		// Only an authentication failure belongs on the password field; anything else (a deleted
		// account, a disconnect) shaking the input as "Wrong password" would send the user
		// retyping a password that was never the problem.
		if (/password/i.test(error?.message ?? "")) {
			isWrongPassword.value = true
		} else {
			console.error("[export/account] create failed:", error)
			openToast({ kind: "error", label: "Failed to create the file" })
		}
	} finally {
		if (isCurrent()) isBusy.value = false
	}
}

const handleProtect = async () => {
	if (isBusy.value || isDownloading.value) return
	isBusy.value = true
	const isCurrent = runs.snapshot()
	try {
		const body = await exportSelected(true)
		if (!isCurrent()) return
		payload.value = body
		fileStatus.value = "protected"
		// The password's job is done once the protected payload exists.
		password.value = null
	} catch (error) {
		if (!isCurrent()) return
		openToast({ kind: "error", label: "Failed to protect the file" })
	} finally {
		if (isCurrent()) isBusy.value = false
	}
}

const fileName = computed(() => {
	const profile = profileFileNameSegment(appStore.profile?.name)
	const addr = selectedAddress.value.slice(0, 10)
	return `NuloEncryptedAccount_${profile}_${addr}.txt`
})

/** Only the password-protected file leaves the page: the plain body Create fetched is spendable. */
const canDownload = computed(() => fileStatus.value === "protected")

const handleDownload = async () => {
	if (!canDownload.value || isDownloading.value || isBusy.value) return
	isDownloading.value = true
	const isCurrent = runs.snapshot()
	try {
		await downloadFile({ data: payload.value, filename: fileName.value })
		if (!isCurrent()) return
		fileStatus.value = "downloaded"
		openToast({ kind: "success", label: "Account file downloaded" })
	} catch (err) {
		if (!isCurrent()) return
		console.error("Download failed:", { error: err })
		openToast({ kind: "error", label: "Failed to download the file" })
	} finally {
		if (isCurrent()) isDownloading.value = false
	}
}

const handleClose = () => {
	if (isToolbarPopup()) window.close()
	else void goBack(router, "/popup/settings/security/export")
}

/** Enter advances the active stage, matching the flow's CTA (the popup this page replaced
 *  submitted on Enter). Download stages stay click-only: Enter re-firing a download is noise. */
const onKeydown = (e) => {
	if (e.key !== "Enter" || e.defaultPrevented) return
	if (!selectedAddress.value || fileStatus.value) return
	if (!isAgreed.value) handleAgree()
	else if (!isPasskeyProfile.value) handleCreate()
	else if (isPopupSubmitKey(e)) handleSaveFile()
}
watch(selectedAddress, clearFilePassword)
watch(fileStatus, async (status) => {
	if (status !== "downloaded") return
	await nextTick()
	closeButton.value?.$el?.focus()
})

// Firefox's toolbar panel closes under the passkey prompt this page runs, so a passkey profile's
// account file moves to its own window first. A failed move keeps the page where it is.
onBeforeMount(() => {
	if (!isPasskeyProfile.value) return
	const address = typeof route.query.address === "string" ? `?address=${encodeURIComponent(route.query.address)}` : ""
	void leavePanelFor(`${OWN_WINDOW_ROUTES.accountExport}${address}`)
})
onMounted(() => {
	document.addEventListener("keydown", onKeydown)
	loadHeldAccounts()
})

onBeforeUnmount(() => {
	document.removeEventListener("keydown", onKeydown)
	// The plain payload is spendable material; drop both secrets with the page and fence out any
	// export RPC still in flight.
	runs.invalidate()
	payload.value = ""
	password.value = null
	clearFilePassword()
})
</script>

<template>
	<CollapsingHeroLayout heroMain="Account" heroSub="Backup" :collapsingLabel="collapsingLabel" backTo="/popup/settings/security/export" moreBelow>
		<!-- Step 1: account picker (skipped when deep-linked with a preselected address) -->
		<template v-if="!selectedAddress">
			<div class="export_section_last" data-scroll-section>
				<span class="export_section_label type--label-section">Select account</span>
				<ItemsContainer flat>
					<SettingItem
						v-for="account in accounts"
						:key="account.address"
						@click="handleSelect(account)"
						size="large"
						:title="account.name"
						titleVariant="name"
						:description="trimAddress(account.address, 6, 4, '...')"
						descriptionVariant="meta"
						chevron
						data-testid="export-account-row"
						:data-account-address="account.address"
						:data-account-name="account.name"
					/>
				</ItemsContainer>
			</div>
		</template>

		<!-- Step 2: agree gate -->
		<template v-else-if="!isAgreed">
			<div class="export_section_last" data-scroll-section>
				<span class="export_section_label type--label-section">Before you continue</span>
				<Flex direction="column" gap="8">
					<Text variant="body" height="150" color="body"> This file gives full control of one account. </Text>
					<Text variant="body" height="150" color="body">
						Anyone holding the plain file can spend from this account. Store it as carefully as your recovery phrase.
					</Text>
					<Text variant="body" height="150" color="body"> By continuing you accept these risks. </Text>
				</Flex>
			</div>
		</template>

		<!-- Step 3, passkey profile: the file's own password; Save asks the passkey -->
		<FilePasswordSection
			v-else-if="isPasskeyProfile && !fileStatus"
			:key="pairRun"
			v-model:password="filePassword"
			v-model:repeatedPassword="repeatedFilePassword"
			testid="account-file-password"
		/>

		<!-- Step 3: unlock -->
		<SecretUnlockSection
			v-else-if="!fileStatus"
			v-model="password"
			:error="isWrongPassword"
			@clearError="isWrongPassword = false"
		/>

		<!-- Steps 4-6: file ready / protected / saved -->
		<template v-else>
			<div class="export_section_last" data-scroll-section>
				<span class="export_section_label type--label-section">File</span>
				<Flex direction="column" gap="12">
					<Banner v-if="fileStatus === 'ready'" variant="info" direction="vertical" data-testid="account-file-ready-banner">
						<template #title> Protect your account file </template>
						<template #description>
							<Text height="140">
								Encrypt the file with your profile password before you download it. Without a password, anyone who opens the
								file controls this account.
							</Text>
						</template>
					</Banner>

					<Banner v-else variant="done" direction="vertical" data-testid="account-file-protected-banner">
						<template #title>
							{{ fileStatus === "downloaded" ? "Saved to your downloads" : "Account file is protected" }}
						</template>
						<template #description>
							<Text color="secondary" height="140">
								{{
									isPasskeyProfile
										? "This password will be required to import this account."
										: "This file opens with the profile password you have now. Changing your password later does not change that."
								}}
							</Text>
						</template>
					</Banner>

					<Flex v-if="selectedAccount?.type === AccountType.Imported" gap="8">
						<Icon name="warning" size="12" color="tertiary" style="height: 18px; flex-shrink: 0" />
						<Text variant="body" height="150" color="tertiary">
							This account is not covered by your recovery phrase. This file is its only backup.
						</Text>
					</Flex>
				</Flex>
			</div>
		</template>

		<!-- Bottom CTA per stage. CONDITIONAL template: the picker stage has no CTA, and an empty
		     slot would still make the layout render its bottom container as a bare border. -->
		<template v-if="selectedAddress" #bottom>
			<Button v-if="selectedAddress && !isAgreed" @click="handleAgree" variant="cta" data-testid="agree-continue-btn">
				Agree &amp; Continue
			</Button>

			<Flex v-else-if="isPasskeyProfile && !fileStatus" direction="column" gap="12" wide>
				<Button
					@click="handleSaveFile"
					@keydown.enter="refuseRepeatEnter"
					:disabled="!canSaveFile || isBusy"
					variant="cta"
					data-testid="account-file-save-btn"
				>
					Save account file
				</Button>
				<Text variant="body" height="150" color="tertiary">This password will be required to import this account.</Text>
			</Flex>

			<Button
				v-else-if="selectedAddress && isAgreed && !fileStatus"
				@click="handleCreate"
				:disabled="!password || isBusy"
				variant="cta"
				data-testid="unlock-submit-btn"
			>
				{{ isBusy ? "Creating File" : "Create Account File" }}
			</Button>

			<Flex v-else-if="fileStatus === 'ready'" direction="column" gap="8" wide>
				<Button @click="handleProtect" :disabled="isBusy || isDownloading" variant="cta" data-testid="account-protect-btn">
					{{ isBusy ? "Protecting" : "Protect with Password" }}
				</Button>
				<Button
					@click="handleDownload"
					:disabled="!canDownload || isBusy || isDownloading"
					variant="cta_outline"
					data-testid="account-download-btn"
				>
					Download File
				</Button>
			</Flex>

			<Button
				v-else-if="fileStatus === 'protected'"
				@click="handleDownload"
				@keydown.enter="refuseRepeatEnter"
				:disabled="isDownloading"
				variant="cta"
				data-testid="account-download-btn"
			>
				Download File
			</Button>

			<Button
				v-else-if="fileStatus === 'downloaded'"
				ref="closeButton"
				@click="handleClose"
				@keydown.enter="refuseRepeatEnter"
				variant="cta"
				data-testid="account-close-btn"
			>
				Close
			</Button>
		</template>
	</CollapsingHeroLayout>

	<PasskeyCeremonyDialog v-if="ceremonyRequest" :request="ceremonyRequest" @resolve="onCeremonyResolve" @reject="onCeremonyReject" />
</template>
