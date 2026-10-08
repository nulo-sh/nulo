<script setup lang="ts">
/** Components */
import EmojiGrid from "@/components/composite/general/EmojiGrid.vue"
import ConnectStepBar from "../ConnectStepBar.vue"

/** Vendor */
import { onMounted, onUnmounted } from "vue"
import { hashToEmoji } from "@aztec-labs/wallet-sdk/crypto"

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { useDappHostname } from "@/composables/useDappHostname"
import { untilSessionChecked } from "@/composables/useDappApprovalWindow"

/** Services */
import {
	DappSessionServiceClient,
	type DappSession,
	type DappMetadata,
	type VerificationRefusal,
} from "@/wallet/services/dapp-session/client"
import { type Account, AccountServiceClient } from "@/wallet/services/account/client"
import { NetworkServiceClient, type Network } from "@/wallet/services/network/client"
import { parseCaipAccount, resolveNetworkByChainId } from "@/wallet/utils/caip"

/** Utils */
import { closeCurrentWindow } from "@/utils/close-current-window"
import { verifyHeaderLabels } from "./header-labels"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

type UIDappMetadata = DappMetadata & {
	loadingLogo?: boolean
	logoBlobUrl?: string
}

const router = useRouter()

const session = ref<DappSession>()
const dapp = ref<UIDappMetadata>()
const emojis = ref("")
const isReconnect = ref(false)
const alwaysTrust = ref(false)
/** One answer per window: either control locks both, released only when that answer fails. */
const isBusy = ref(false)
const refusalError = ref<"unremoved" | "failed">()

const signerAccounts = ref<Account[]>([])
const header = computed(() =>
	session.value
		? verifyHeaderLabels({
				sessionChainId: session.value.chainId,
				sharedAccounts: session.value.accounts ?? [],
				resolvedAccounts: signerAccounts.value,
				networks: appStore.networks,
			})
		: undefined,
)

const { hostname: dappHostname, isSuspicious: hostnameHasNonAscii } = useDappHostname(dapp)

const dappSessionService = new DappSessionServiceClient()

const handleConfirm = async () => {
	if (isBusy.value) return
	isBusy.value = true
	try {
		if (alwaysTrust.value && session.value) {
			await dappSessionService.setTrustedVerification(session.value.id, true)
		}
	} catch (err) {
		isBusy.value = false
		throw err
	}
	closeCurrentWindow()
}

/** The window closes only once the app's channels have ended and its rows are known to be gone. */
const handleRefuse = async () => {
	const row = session.value
	if (isBusy.value || !row) return
	isBusy.value = true
	refusalError.value = undefined
	let result: VerificationRefusal
	try {
		result = await dappSessionService.refuseVerification({
			origin: row.dappMetadata?.url ?? "",
			chainId: row.chainId,
			profileId: row.profileId,
		})
	} catch {
		refusalError.value = "failed"
		isBusy.value = false
		return
	}
	if (result === "unavailable") {
		refusalError.value = "unremoved"
		isBusy.value = false
		return
	}
	closeCurrentWindow()
}

async function resolveSigners() {
	if (!session.value?.accounts?.length || !appStore.profile) return
	const networkService = new NetworkServiceClient()
	const accountService = new AccountServiceClient()
	try {
		const resolved: Account[] = []
		for (const caip of session.value.accounts) {
			let parsed: { chainId: number; address: string }
			try {
				parsed = parseCaipAccount(caip)
			} catch {
				continue
			}
			let network: Network
			try {
				network = await resolveNetworkByChainId(networkService, parsed.chainId)
			} catch {
				continue
			}
			const account = await accountService.getAccount(appStore.profile.id, network.chainId, parsed.address)
			if (account) resolved.push(account)
		}
		signerAccounts.value = resolved
	} finally {
		networkService.disconnect()
		accountService.disconnect()
	}
}

onMounted(async () => {
	dappSessionService.connect()

	// Wait for app to establish session before resolving signer names.
	if (!appStore.isSessionChecked) await untilSessionChecked(() => appStore.isSessionChecked)

	const sessionId = router.currentRoute.value.query.sessionId as string
	// Per-session snapshot the SW passes when opening this window. A concurrent
	// session for the same (origin,chain) can overwrite the shared DappSession row's
	// hash, so the trust-decision emojis MUST derive from THIS session's own hash, not
	// the row's. The row hash is only a legacy fallback for opens without the param.
	const snapshotHash = router.currentRoute.value.query.verificationHash as string | undefined
	isReconnect.value = router.currentRoute.value.query.isReconnect === "true"

	if (!sessionId) {
		closeCurrentWindow()
		return
	}

	try {
		session.value = await dappSessionService.getDappSession(sessionId)
		if (!session.value) {
			closeCurrentWindow()
			return
		}

		const displayHash = snapshotHash || session.value.verificationHash
		if (displayHash) {
			emojis.value = hashToEmoji(displayHash)
		}

		dapp.value = session.value.dappMetadata
		if (dapp.value?.logo) {
			dapp.value.logoBlobUrl = dapp.value.logo
		}

		await resolveSigners()
	} catch {
		closeCurrentWindow()
	}
})

onUnmounted(() => {
	dappSessionService.disconnect()
})
</script>

<template>
	<Flex v-if="session" direction="column" :class="$style.wrapper">
		<!-- Identity strip: anti-phishing trust anchor. Status is always ready on verify. -->
		<IdentityStrip v-if="header" :accountLabel="header.account" :networkLabel="header.network" :warn="header.warn" />
		<ConnectStepBar v-if="!isReconnect" :step="2" />

		<Flex direction="column" :class="$style.scroll_area">
			<DappIdentityBlock
				:dapp="dapp"
				:hostname="dappHostname"
				:hostnameSuspicious="hostnameHasNonAscii"
				:actionLabel="isReconnect ? 'Reconnected' : 'Connection established'"
			/>
			<Flex v-if="emojis" direction="column" gap="12" :class="$style.verification">
				<SectionLabel label="Connection check" />

				<Flex direction="column" align="center" gap="12">
					<div data-testid="verify-emoji-grid"><EmojiGrid :emojis="emojis" /></div>
					<Text size="12" color="secondary" :style="{ textAlign: 'center', lineHeight: '1.4' }">
						Check that the app shows these same emojis in the same order. If they differ, the connection may not be
						safe. Choose They don't match.
					</Text>
				</Flex>
			</Flex>
		</Flex>

		<Flex v-snack-footer direction="column" gap="12" :class="$style.footer">
			<Flex align="center" justify="between" gap="12" wide>
				<Flex direction="column" gap="4">
					<Text size="13" weight="600" color="primary">Skip this check next time</Text>
					<Text size="12" weight="500" color="tertiary">Only for this app on this network.</Text>
				</Flex>
				<div data-testid="verify-always-trust-toggle"><Toggle :modelValue="alwaysTrust" @update:modelValue="(v: boolean) => (alwaysTrust = v)" /></div>
			</Flex>

			<Flex align="center" justify="between" gap="12" wide>
				<Button
					data-testid="verify-mismatch-btn"
					@click="handleRefuse"
					@keydown.enter="refuseRepeatEnter"
					wide
					variant="primary_outline"
					size="medium"
					:disabled="!session || isBusy"
				>
					They don't match
				</Button>
				<Button
					data-testid="verify-confirm-btn"
					@click="handleConfirm"
					@keydown.enter="refuseRepeatEnter"
					wide
					variant="primary"
					size="medium"
					:disabled="!session || isBusy"
				>
					They match
				</Button>
			</Flex>
			<Text v-if="refusalError" size="12" color="red" role="alert" data-testid="verify-mismatch-error">
				{{
					refusalError === "unremoved"
						? "The connection ended, but this app could not be removed. Remove it in Settings, Connected apps."
						: "Couldn't disconnect this app. Disconnect it in Settings, Connected apps."
				}}
			</Text>
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	composes: approval_wrapper from "../window-shell.module.css";
}

.scroll_area {
	composes: scroll_area from "../window-shell.module.css";
}

/* ── Verification section ──────────────────────────────────────── */

.verification {
	padding: 16px;
}

/* ── Footer ────────────────────────────────────────────────────── */

.footer {
	composes: footer from "../window-shell.module.css";
}
</style>
