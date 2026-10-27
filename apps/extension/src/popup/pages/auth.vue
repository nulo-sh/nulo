<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": false
	}
}
</route>

<script setup>
/** Components */
import AuthProfilePill from "@/popup/components/modules/auth/AuthProfilePill.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"
import PasswordVisibilityToggle from "@/components/composite/PasswordVisibilityToggle.vue"

/** Composables */
import { awaitProfileActivation, BootstrapFailedError, UnlockTimeoutError } from "@/composables/unlockWait"
import { isAnyActivating } from "@/composables/useProfileBootstrap"
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"

/** Utils */
import { AccountServiceClient } from "@/wallet/services/account/client"
import { isInvalidProfileIdError } from "@/wallet/services/profile/client"
import { InvalidPasswordError, RestoreTornError, UserRejectedError } from "@nulo/extension-messaging/errors"
import { getLastActiveProfileId, onLastActiveProfileChanged, setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { lockScreenProfile } from "@/popup/lock-screen-profile"
import { closesOnFocusLoss } from "@/utils/browser-surface"
import { postAuthRoute } from "@/utils/own-window"
import { PASSKEY_COPY, passkeyFailureCopy } from "@/utils/passkey-copy"
import { initTransactionService, managers, refreshBalances } from "@/utils/core"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store.ts"
const appStore = useAppStore()
const popupStore = usePopupStore()

const { openToast, toast, closeToast } = useToast()

const router = useRouter()

// 30 s matches the e2e suite's dominant post-unlock envelope; the transport
// RPC bound is 60 s and the analogous import handshake allows 30 s.
const UNLOCK_WAIT_MS = 30_000

if (appStore.isLogined) {
	router.go(-1)
}

const passwordInput = ref(null)
const password = ref("")
const isWrongPassword = ref(false)
// The profile's backup import never finished (typed RestoreTornError from the
// unlock chokepoint): unlock is withheld — explain, and point at the existing
// delete + re-import path on this screen. Cleared on profile switch.
const isTornImport = ref(false)
const isPasswordType = ref(true)
const isAwaitingResponse = ref(false)
let isUnmounted = false

const isPasskeyProfile = computed(() => appStore.profile?.type === "passkey")
// A passkey profile made before 1.1, which no unlock opens: the screen offers only its deletion.
const isRetired = computed(() => appStore.profile?.retired === true)
// Opened before the service answered: the heading, its line and the form depend on the profile's
// kind, so they keep their place hidden until it is known rather than show the wrong form.
const isProfileKnown = computed(() => !!appStore.profile)

// The shell's boot outcome. "failed" = an OPEN session whose activation bootstrap threw: the
// banner's RETRY is the only true recovery, and a password typed here would unlock an already-
// open session and repair nothing — so the form is withheld, not merely disabled, and stays
// withheld while that retry runs (the outcome clears at retry start; the flag bridges the gap).
// An "unreachable" boot keeps the form: the password path IS its recovery.
const bootOutcome = inject("bootOutcome", ref(""))
const bootRetrying = inject("bootRetrying", ref(false))
const isBootWithheld = computed(() => bootOutcome.value === "failed" || bootRetrying.value)
const checkSelection = inject("checkSelection", async () => "unread")

// Path A: in-page passkey ceremony. The dialog is mounted via `v-if="ceremonyRequest"`
// in the template; we drive it imperatively via `runCeremony` to keep the
// existing handleUnlockWallet flow shape intact.
const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()

const handlePasswordInput = () => {
	if (isWrongPassword.value) isWrongPassword.value = false
}

const isAllowedToContinue = computed(() => {
	if (isRetired.value) return false
	if (isPasskeyProfile.value) return true
	if (!password.value.length) return false
	if (isWrongPassword.value) return false
	return true
})

/** The single post-unlock advance. Two sites want to leave this screen — the submit handler
 *  when its isLogined poll releases, and the isLogined watcher (which also covers unlocks this
 *  handler never sees, e.g. a silent restore landing here) — and both used to push blindly:
 *  the loser's late push yanked the user from wherever they had navigated to in the gap. The
 *  claim flag elects one winner atomically (a hash comparison alone cannot — the winner's
 *  navigation moves the hash only after async route resolution). The exact-path check keeps
 *  the advance on THIS screen only: a substring test also matched off-screen routes carrying
 *  `?from=/popup/auth` (profile import / new-profile from the select-profile popup). A failed
 *  navigation releases the claim so a later attempt isn't locked out. */
let postAuthNavClaimed = false
const advancePastAuth = async () => {
	if (postAuthNavClaimed) return
	if (window.location.hash.split("?")[0] !== "#/popup/auth") return
	postAuthNavClaimed = true
	const failure = await router.push(postAuthRoute(appStore.pageAwaitingAuth))
	if (failure) postAuthNavClaimed = false
}

/** Path A pulls the credential and its PRF input so the ceremony targets THIS profile's credential
 *  (not a discovery picker that would let the user choose any of their passkeys); Path B's
 *  background reads both from its own snapshot. The attempt belongs to the profile selected when it
 *  started: once the selection moves (a pick, or a deletion followed), it unlocks nothing and
 *  answers `undefined`. */
const unlockActiveProfile = async (attemptId) => {
	const moved = () => appStore.profile?.id !== attemptId
	if (isPasskeyProfile.value) {
		if (closesOnFocusLoss()) return managers.profile.unlockPasskeyProfile(attemptId)
		const { credentialId, prfSalt } = await managers.profile.getPasskeyUnlockParams(attemptId)
		if (moved()) return
		const credData = await runCeremony({ mode: "get", credentialId, prfSalt, step: "unlock", profileName: appStore.profile.name })
		if (moved()) return
		return managers.profile.unlockPasskeyProfile(attemptId, credData)
	}
	return managers.profile.unlockProfile(attemptId, password.value)
}

/** The unlock failure ladder — one synchronous pass, in this order, on the original error. */
const handleUnlockError = (error, activeProfileId, isPasskeyAttempt) => {
	// Service throws `InvalidPasswordError` (a WalletError subclass).
	// Client reconstructs the instance across the RPC boundary so the
	// instanceof check holds. Legacy-message fallback covers the
	// short window where the service has been redeployed but the
	// popup hasn't reloaded yet.
	const isInvalid =
		error instanceof InvalidPasswordError || (error instanceof Error && error.message === InvalidPasswordError.LEGACY_MESSAGE)
	if (isInvalid) {
		isWrongPassword.value = true
		return
	}
	if (error instanceof RestoreTornError) {
		isTornImport.value = true
		return
	}
	// Path A user cancel surfaces here; silent return matches the
	// existing profile/new.vue behavior (no error toast on Escape /
	// "user closed").
	if (error instanceof UserRejectedError) return
	if (error instanceof UnlockTimeoutError) {
		// Silent yield when a DIFFERENT profile won the race — its UI is
		// live and a "try again" toast would race a successful
		// navigation. Otherwise the wait genuinely expired: say so.
		if (appStore.isLogined && appStore.profile?.id !== activeProfileId) return
		openToast({ kind: "error", label: "Unlock timed out. Please try again" })
		return
	}
	if (error instanceof BootstrapFailedError) {
		// The shell already toasted the failure (with stale-suppression);
		// the join's job here is only to release the spinner immediately.
		return
	}
	if (isPasskeyAttempt) {
		openToast({ kind: "error", label: passkeyFailureCopy(error, PASSKEY_COPY.unlockFailed) })
		return
	}
	// The error's text never reaches the toast: it can name internals.
	openToast({ kind: "error", label: "Something went wrong", sub: "Try unlocking again." })
}

/** An unknown-id refusal: the profile may be gone, and a screen that follows its deletion has nothing
 *  to retry. */
const followedMissingProfile = async (error) => {
	if (!isInvalidProfileIdError(error)) return false
	const check = await checkSelection()
	return check === "followed" || check === "superseded"
}

const handleUnlockWallet = async () => {
	if (!isAllowedToContinue.value) return
	// Reentry guard: two programmatic submits while the first unlock awaits
	// must not mint duplicate same-profile continuations.
	if (isAwaitingResponse.value) return
	const isPasskeyAttempt = isPasskeyProfile.value
	const attemptId = appStore.profile?.id
	// Closed before the attempt, so one that unlocks lands on a clean Home and a second failure shows
	// its toast afresh.
	if (toast.value?.kind === "error") closeToast()

	try {
		let activeProfile
		try {
			isAwaitingResponse.value = true
			// A stale failure record from a PRIOR attempt must not insta-reject
			// this attempt's activation wait.
			appStore.bootstrapFailure = null
			activeProfile = await unlockActiveProfile(attemptId)
			if (!activeProfile?.id) return
			// Bounded, identity-aware, failure-joined wait — replaces an
			// unbounded isLogined poll whose finally was unreachable when
			// bootstrap starved it (bricked spinner). 30 s matches the e2e
			// suite's dominant post-unlock envelope (transport bound is 60 s;
			// the analogous import handshake allows 30 s).
			// Started: the profile is selected, so the wait ends as soon as the selection moves off it.
			await awaitProfileActivation(appStore, activeProfile.id, UNLOCK_WAIT_MS, { deadlineCovers: "start", limitMs: UNLOCK_WAIT_MS })
		} catch (error) {
			// A failure belongs to the profile the attempt started on; a screen that moved off it says nothing.
			if (appStore.profile?.id !== attemptId || (await followedMissingProfile(error))) return
			handleUnlockError(error, activeProfile?.id, isPasskeyAttempt)
			return
		} finally {
			isAwaitingResponse.value = false
		}

		// IMMEDIATE post-wait identity check — the wait can resolve for this
		// profile and a different unlock can win before this continuation runs;
		// a stale continuation must have nothing to write (the redundant
		// `appStore.profile = activeProfile` assignment is gone for the same
		// reason: bootstrap already established identity).
		if (!appStore.isLogined || appStore.profile?.id !== activeProfile.id) return

		password.value = ""

		await setLastActiveProfileId(activeProfile.id)
		// Second identity check: the await above is its own drift window — a
		// resumed continuation must not replace the winner's managers.
		if (!appStore.isLogined || appStore.profile?.id !== activeProfile.id) return
		// Keep an existing client: replacing it abandoned a connected port, and disconnecting it
		// would reject the calls of any flow still holding it (the network-switch handler does).
		managers.account ??= new AccountServiceClient()

		initTransactionService(appStore.onTxAdded, appStore.onTxUpdated)

		void advancePastAuth()

		void appStore.syncTransactions().catch((err) => console.error(err))
		void refreshBalances(appStore.accounts).catch((err) => console.error(err))
	} catch (err) {
		console.error(err)
	}
}

/** Selects the profile this screen opens on (`lockScreenProfile`); with no last active profile in
 *  the list, a selection the list still holds stays. The lookup waits for the service, so it can
 *  outlast this page or lose to an activation: a profile selected or opened meanwhile stands, as in
 *  the route guard. */
const settleProfile = async () => {
	const selectedAtStart = appStore.profile?.id
	const lastActiveProfileId = await getLastActiveProfileId().catch(() => undefined)
	const profiles = await managers.profile.getProfiles().catch(() => undefined)
	if (!profiles || isUnmounted || appStore.isLogined || appStore.profile?.id !== selectedAtStart || heldBack()) return
	if (!profiles.some((p) => p.id === lastActiveProfileId) && profiles.some((p) => p.id === selectedAtStart)) return
	const profile = lockScreenProfile(profiles, lastActiveProfileId)
	appStore.profile = profile
	settles++
	if (!profile) router.push("/popup/register")
}

/** An unlock here, or any profile's activation, holds the selection: the unlock's steps read it, and
 *  an activation opens its session beside whatever is selected when it ends. A pick, a deletion or a
 *  settle meanwhile replays once neither runs, unless the selection moved since. */
const selectionHeld = () => isAwaitingResponse.value || isAnyActivating()
let missedWhileHeld = false
let selectedWhenMissed
const heldBack = () => {
	if (!selectionHeld()) return false
	if (!missedWhileHeld) selectedWhenMissed = appStore.profile?.id
	missedWhileHeld = true
	return true
}

/** Another window's pick moves this screen too, so every window shows the profile an unlock opens.
 *  A person's selection here during the lookup stands; the screen's automatic one (`settleProfile`)
 *  gives way, as its storage read may have answered the pointer this pick replaced. */
let follows = 0
let settles = 0
const followPick = async (id) => {
	const follow = ++follows
	const settlesAtStart = settles
	const selectedAtStart = appStore.profile?.id
	if (!id || id === selectedAtStart || appStore.isLogined || heldBack()) return
	const profile = (await managers.profile.getProfiles().catch(() => undefined))?.find((p) => p.id === id)
	const selectedHere = appStore.profile?.id !== selectedAtStart && settles === settlesAtStart
	if (!profile || follow !== follows || isUnmounted || appStore.isLogined || selectedHere || heldBack()) return
	appStore.profile = profile
}
const stopFollowingPicks = onLastActiveProfileChanged(followPick)

const onProfileDeleted = (deleted) => {
	if (deleted?.id === appStore.profile?.id && !heldBack()) void settleProfile()
}
managers.profile.onProfileDeleted.add(onProfileDeleted)

onMounted(async () => {
	if (isProfileKnown.value && !isPasskeyProfile.value) {
		passwordInput.value?.focus()
	}
	await settleProfile()
})
onUnmounted(() => {
	isUnmounted = true
	stopFollowingPicks()
	managers.profile.onProfileDeleted.remove(onProfileDeleted)
})
// Delete Profile clears the selection when its purge returns, which can be after this screen
// settled, so a cleared selection settles again.
watch(
	() => appStore.profile,
	(profile) => {
		if (!profile && !appStore.isLogined && !heldBack()) void settleProfile()
	},
)
watch(selectionHeld, (held) => {
	if (held || !missedWhileHeld) return
	missedWhileHeld = false
	if (!appStore.isLogined && appStore.profile?.id === selectedWhenMissed) void settleProfile()
})
watch(
	() => appStore.profile?.id,
	() => {
		isTornImport.value = false
	},
)
// The mount's focus for a profile that became known later; never taken from a control the person
// already moved to.
watch(
	() => appStore.profile?.type,
	async (type, previous) => {
		if (previous || !type || type === "passkey") return
		await nextTick()
		if (document.activeElement === document.body) passwordInput.value?.focus()
	},
)
watch(
	() => appStore.isLogined,
	async () => {
		if (appStore.isLogined) await advancePastAuth()
	},
)
</script>

<template>
	<Flex direction="column" :class="$style.wrapper">
		<Flex align="center" justify="center" :class="$style.top_row">
			<span :class="$style.wordmark">NULO</span>
		</Flex>

		<Flex direction="column" align="center" gap="32" :class="$style.main">
			<Icon name="lock" :size="48" color="primary" :class="$style.lock_icon" />

			<AuthProfilePill :name="appStore.profile?.name ?? ''" @click="popupStore.open('select_profile')" />

			<Flex direction="column" align="center" gap="8" :class="!isProfileKnown && $style.unknown" data-testid="auth-heading">
				<h1 v-if="isRetired && !isBootWithheld" :class="[$style.heading, $style.centered]" data-testid="auth-setup-again">
					Set up<br />again
				</h1>
				<h1 v-else :class="$style.heading">
					{{ isBootWithheld ? 'Wallet not ready' : isPasskeyProfile ? 'Passkey required' : 'Password required' }}
				</h1>
				<p v-if="isBootWithheld" :class="$style.subheading" role="status" data-testid="auth-boot-failed">
					{{ bootRetrying ? 'Retrying the wallet start-up…' : 'Your session is open, but the wallet could not finish starting up. Use RETRY above.' }}
				</p>
				<p v-else-if="isRetired" :class="$style.subheading" data-testid="auth-setup-again-text">
					This profile was made with an earlier version of Nulo and can't be opened in this version. Delete it,
					then create or import a profile. What it held stays on the network, out of this version's reach.
				</p>
				<p v-else :class="$style.subheading">
					{{ isPasskeyProfile ? 'Use your passkey to continue' : 'Enter your profile password to continue' }}
				</p>
			</Flex>

			<div v-if="!isBootWithheld && isRetired" :class="$style.form">
				<Button variant="cta" wide data-testid="auth-delete-retired" @click="router.push('/popup/settings/security/reset')">
					Delete profile
				</Button>
			</div>
			<form
				v-else-if="!isBootWithheld"
				@submit.prevent="handleUnlockWallet"
				:class="[$style.form, !isProfileKnown && $style.unknown]"
				data-testid="auth-form"
			>
				<template v-if="!isPasskeyProfile">
					<div :class="[isWrongPassword && $style.shake]">
						<Input
							ref="passwordInput"
							v-model="password"
							@input="handlePasswordInput"
							:type="isPasswordType ? 'password' : 'text'"
							:error="isWrongPassword"
							:ariaInvalid="isWrongPassword"
							placeholder="Enter password"
							data-testid="auth-password-input"
							autocomplete="current-password"
							autocapitalize="none"
							autocorrect="off"
						>
							<template #suffix>
								<PasswordVisibilityToggle
									:hidden="isPasswordType"
									data-testid="auth-password-input-visibility-toggle"
									@toggle="isPasswordType = !isPasswordType"
								/>
							</template>
						</Input>
					</div>
					<Transition name="fade">
						<span v-if="isWrongPassword" :class="$style.error_text" role="alert" data-testid="error-text">
							Wrong password
						</span>
					</Transition>
				</template>

				<Transition name="fade">
					<span v-if="isTornImport" :class="$style.error_text" role="alert" data-testid="auth-restore-torn">
						This profile's import didn't finish. Delete it below and re-import your backup.
					</span>
				</Transition>

				<Button
					type="submit"
					data-testid="auth-submit"
					variant="cta"
					wide
					:disabled="!isAllowedToContinue || isAwaitingResponse"
					:loading="isAwaitingResponse"
				>
					Continue
				</Button>
			</form>
		</Flex>

		<Flex v-if="!isRetired" v-snack-footer justify="center" :class="$style.footer">
			<Tooltip side="top" position="center" textAlign="center" maxWidth="220px">
				<button
					@click="popupStore.open('forgot_password')"
					type="button"
					data-testid="auth-reset"
					:class="$style.reset_link"
				>
					Delete profile
				</button>
				<template #content>
					{{ isPasskeyProfile ? "Lost your passkey?" : "Forgot your password?" }} Delete this profile and re-import it
					with your recovery phrase.
				</template>
			</Tooltip>
		</Flex>

		<!-- Path A: in-page passkey ceremony. Mounts only while a ceremony is in
		     flight; emits resolve/reject back through `usePasskeyCeremony`. -->
		<PasskeyCeremonyDialog
			v-if="ceremonyRequest"
			:request="ceremonyRequest"
			@resolve="onCeremonyResolve"
			@reject="onCeremonyReject"
		/>
	</Flex>
</template>

<style module>
.wrapper {
	flex: 1;
	overflow: auto;
	background: var(--app-bg);
	padding: 24px;
}

.top_row {
	margin-bottom: 24px;
}

.wordmark {
	composes: type--title-hero from global;
	font-size: 20px;
	color: var(--txt-primary);
}

.main {
	flex: 1;
	justify-content: center;
	padding: 0 8px;
}

.lock_icon {
	color: var(--txt-primary);
}

.heading {
	composes: type--title-hero from global;
	font-size: 24px;
	color: var(--txt-primary);
	margin: 0;
	line-height: 1.2;
}

.centered {
	text-align: center;
}

.subheading {
	composes: type--body from global;
	color: var(--nulo-secondary);
	text-align: center;
	margin: 0;
	line-height: 1.4;
}

/* Hidden in place: no layout shift, no Tab stop, nothing read out. */
.unknown {
	visibility: hidden;
}

.form {
	display: flex;
	flex-direction: column;
	gap: 16px;
	width: 100%;
	max-width: 320px;
}

.error_text {
	composes: type--body from global;
	color: var(--txt-danger);
	margin-top: -8px;
}

.footer {
	margin-top: 24px;
	padding: 8px;
}

.reset_link {
	composes: type--label-section from global;
	color: var(--nulo-secondary);

	background: transparent;
	border: none;
	cursor: pointer;

	padding: 4px 0;
	border-bottom: 1px solid transparent;

	transition: all 0.2s var(--bezier);

	&:hover {
		color: var(--nulo-accent);
		border-bottom-color: var(--nulo-accent);
	}
}

.shake {
	composes: shake_password from "../../components/composite/shake.module.css";
}
</style>
