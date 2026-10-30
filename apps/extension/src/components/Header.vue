<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import { defaultConfig as makeDefaultConfig } from "@/wallet/config"
import { LogLevel } from "@/wallet/logger"
import { LogViewerServiceClient } from "@/wallet/services/log-viewer/client"
import { ConfigServiceClient } from "@/wallet/services/config/client"

/** Composables */
import { useConfigRead } from "@/composables/useConfigRead"
import { useLockWallet } from "@/composables/useLockWallet"

/** Utils */
import { managers } from "@/utils/core"
import { copyAddressToClipboard } from "./header-copy-address"
import { endsSelection } from "@/utils/selection"
import { isCardWindow } from "@/utils/own-window"
import { accountStateOf } from "./header-account"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import { trimAddress } from "@/utils/string"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()

const { lock: handleLockWallet, dispose: disposeLockWallet } = useLockWallet(managers.profile)

const route = useRoute()
const router = useRouter()

const logViewerService = new LogViewerServiceClient()
logViewerService.onLog.add(onLogAdded)

const configService = new ConfigServiceClient()
configService.onUpdate.add(onSettingUpdate)

const defaultConfig = makeDefaultConfig()
const indicateFailures = ref(defaultConfig.indicateFailures)
const showNode = ref(defaultConfig.showNode)
const showNodeRead = useConfigRead(
	configService,
	() => configService.getValue("showNode"),
	(value, updatedSince) => {
		if (!updatedSince("showNode")) showNode.value = value
	},
)
const networkStatusKey = computed(() => appStore.networkStatus?.toLowerCase())
const accountState = computed(() => accountStateOf(appStore))

const HEADER_INDICATION_DURATION = 5_000
let headerIndicateFailureTimer = null

const MENU_INDICATION_DURATION = 60_000
let menuIndicateFailureTimer = null

const currentFailureType = ref("")
const highlightColor = computed(() => {
	if (currentFailureType.value === "error") {
		return "var(--red)"
	} else if (currentFailureType.value === "warning") {
		return "var(--yellow)"
	} else {
		return ""
	}
})

function handleWalletFailure(type, logId) {
	currentFailureType.value = type

	// Header
	if (headerIndicateFailureTimer) {
		clearTimeout(headerIndicateFailureTimer)
		headerIndicateFailureTimer = null
	}

	headerIndicateFailureTimer = setTimeout(() => {
		currentFailureType.value = ""
		headerIndicateFailureTimer = null
	}, HEADER_INDICATION_DURATION)

	// Menu
	if (menuIndicateFailureTimer) {
		clearTimeout(menuIndicateFailureTimer)
		menuIndicateFailureTimer = null
	}
	cacheStore.failureLog = {
		id: logId,
		color: highlightColor.value,
	}

	menuIndicateFailureTimer = setTimeout(() => {
		cacheStore.failureLog = null
		menuIndicateFailureTimer = null
	}, MENU_INDICATION_DURATION)
}

function onLogAdded(log) {
	switch (log.level) {
		case LogLevel.Warn:
			handleWalletFailure("warning", log.id)
			break
		case LogLevel.Error:
			handleWalletFailure("error", log.id)
			break

		default:
			break
	}
}

function onSettingUpdate(setting) {
	switch (setting.key) {
		case "indicateFailures":
			indicateFailures.value = setting.value
			break
		case "showNode":
			showNode.value = setting.value
			break

		default:
			break
	}
}

const handleOpenPopup = (target) => {
	if (!appStore.isLogined) return
	popupStore.open(target)
}

const { openToast } = useToast()
const handleCopyAddress = (e) => {
	if (endsSelection(e)) return
	copyAddressToClipboard(appStore.account?.address, openToast)
}

const handleOpenNetworks = () => {
	if (!appStore.isLogined) return
	router.push("/popup/settings/networks")
}

watch(
	() => indicateFailures.value,
	() => {
		if (!indicateFailures.value) {
			logViewerService.disconnect()
		} else {
			logViewerService.connect()
		}
	},
)

onMounted(async () => {
	void showNodeRead.read()
	indicateFailures.value = await configService.getValue("indicateFailures")

	if (indicateFailures.value) {
		logViewerService.connect()
	}
})

onBeforeUnmount(() => {
	configService.disconnect()
	showNodeRead.dispose()
	logViewerService.disconnect()
	disposeLockWallet()
})
</script>

<template>
	<header v-if="!appStore._isHomeScreenOpened && route.name !== 'popup-auth' && !route.meta.hideHeader && !isCardWindow()" :class="$style.wrapper">
		<!-- The switcher owns TWO explicit affordances (avatar + name) while the address is a
		     one-click copy target — no popup detour. `account-selector` stays on the name button so
		     every existing e2e switching flow passes unchanged (testid-preservation contract). -->
		<Flex v-if="appStore.isLogined && accountState === 'shown'" align="center" gap="10" :class="$style.account_group">
			<button
				type="button"
				@click="handleOpenPopup('accounts')"
				data-testid="account-avatar-btn"
				aria-label="Switch account"
				:class="$style.avatar_btn"
			>
				<AccountAvatar :name="appStore.account?.name || 'Primary Account'" :address="appStore.account?.address" :size="32" />
			</button>
			<Flex direction="column" gap="2" :class="$style.account_col">
				<div :class="$style.name_slot">
					<button
						type="button"
						@click="handleOpenPopup('accounts')"
						data-testid="account-selector"
						aria-label="Switch account"
						:class="$style.account_label"
					>
						{{ appStore.account?.name?.toUpperCase() || "PRIMARY ACCOUNT" }}
					</button>
				</div>
				<button
					type="button"
					@click="handleCopyAddress"
					data-testid="account-address-copy"
					aria-label="Copy address"
					:class="$style.account_address"
				>
					<span :class="$style.address_text" data-testid="account-address-text">
						{{ appStore.account?.address ? trimAddress(appStore.account.address, 6, 4, "...") : "" }}
						<span :class="$style.copy_reveal"><Icon name="copy" size="12" /></span>
					</span>
				</button>
			</Flex>
		</Flex>
		<Flex
			v-else-if="appStore.isLogined && accountState === 'loading'"
			align="center"
			gap="10"
			:class="$style.account_group"
			data-testid="header-account-loading"
		>
			<Skeleton :width="32" :height="32" />
			<Flex direction="column" gap="6">
				<Skeleton :width="90" :height="12" />
				<Skeleton :width="110" :height="12" />
			</Flex>
		</Flex>
		<div v-else-if="appStore.isLogined" :class="$style.account_group" />

		<Flex align="center" gap="8" :class="$style.actions">
			<button
				v-if="appStore.isLogined && appStore.network?.name"
				type="button"
				@click="handleOpenNetworks"
				data-testid="network-button"
				:data-status="networkStatusKey"
				:aria-label="`Manage networks (currently ${appStore.network.name})`"
				:class="$style.network_chip"
			>
				<span v-if="showNode" data-testid="network-name" :class="$style.network_label">{{ appStore.network.name }}</span>
				<div data-testid="network-status-dot" :class="[$style.status_dot, $style[networkStatusKey]]" />
			</button>

			<button
				v-if="appStore.isLogined"
				type="button"
				@click="handleLockWallet"
				data-testid="header-lock"
				aria-label="Lock wallet"
				:disabled="appStore.lockHeldByImport"
				:class="$style.lock_chip"
			>
				<Icon name="lock" :size="15" color="primary" />
			</button>

		</Flex>
	</header>
</template>

<style module>
.wrapper {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;

	height: 64px;
	min-height: 64px;

	padding: 0 16px 0 24px;
	background: var(--app-bg);
}

/* The name claims no width of its own, so the group's minimum is the avatar and the address: when
 * the row runs short, the network chip truncates before the address can slide under it. */
.account_group {
	flex-grow: 1;
}

.account_col {
	flex-grow: 1;
	align-items: flex-start;
}

.name_slot {
	display: flex;
	align-self: stretch;
	contain: inline-size;
}

.actions {
	min-width: 0;
}

.avatar_btn {
	display: flex;
	flex-shrink: 0;

	padding: 0;
	background: transparent;
	border: 1px solid var(--nulo-border);
	cursor: pointer;

	transition: border-color 0.2s var(--bezier);
}

.account_label {
	composes: type--label-section from global;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 100%;

	padding: 0;
	background: transparent;
	border: none;
	cursor: pointer;
	text-align: left;

	color: var(--nulo-secondary);

	transition: color 0.2s var(--bezier);
}

/* The avatar and the name are ONE switcher — hovering (or keyboard-focusing) either lights both,
 * so they read as a single component. The address button below keeps its own independent
 * copy-affordance hover and never participates. */
.account_group:has(:is(.avatar_btn, .account_label):hover) .avatar_btn,
.account_group:has(:is(.avatar_btn, .account_label):focus-visible) .avatar_btn {
	border-color: var(--nulo-outline);
}

.account_group:has(:is(.avatar_btn, .account_label):hover) .account_label,
.account_group:has(:is(.avatar_btn, .account_label):focus-visible) .account_label {
	color: var(--txt-primary);
}

.account_address {
	/* Room for the copy icon revealed past the address, so it never lands on the chip. */
	padding: 0 6px 0 0;
	background: transparent;
	border: none;
	cursor: pointer;
	text-align: left;

	color: var(--txt-primary);
}

/* Hover/focus underlines the address and reveals the copy icon — the icon is absolutely
 * positioned in the free space to its right, so nothing shifts and no target shrinks. */
.address_text {
	composes: type--data-lead from global;
	position: relative;
	display: inline-flex;
	align-items: center;
	user-select: text;

	text-decoration: underline transparent;
	text-underline-offset: 3px;

	transition: text-decoration-color 0.2s var(--bezier);
}

.copy_reveal {
	position: absolute;
	left: calc(100% + 6px);
	top: 50%;
	transform: translateY(-50%);

	display: inline-flex;
	color: var(--txt-tertiary);

	opacity: 0;
	transition: opacity 0.15s var(--bezier);
}

.account_address:hover .address_text,
.account_address:focus-visible .address_text {
	text-decoration-color: var(--nulo-outline);
}

.account_address:hover .copy_reveal,
.account_address:focus-visible .copy_reveal {
	opacity: 1;
}

.account_address:hover .copy_reveal {
	color: var(--nulo-accent);
}

/* With the label's role, `1lh` is the label's line while the label sets no line-height of its own, so
 * the chip keeps its height when the name is hidden; 14px is the padding and border. */
.network_chip {
	composes: type--label-section from global;
	display: inline-flex;
	align-items: center;
	gap: 6px;

	max-width: 120px;
	flex-shrink: 1;
	min-width: 0;
	min-height: calc(1lh + 14px);

	padding: 6px 8px;
	background: transparent;
	border: 1px solid var(--nulo-border);
	cursor: pointer;

	transition: background 0.2s var(--bezier);

	&:hover {
		background: var(--nulo-surface-low);
	}
}

.network_label {
	composes: type--label-section from global;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	color: var(--nulo-secondary);
}

/* Drawn as the network chip beside it; the two change together. */
.lock_chip {
	composes: type--label-section from global;
	display: inline-flex;
	align-items: center;
	flex-shrink: 0;

	min-height: calc(1lh + 14px);
	padding: 0 6px;

	background: transparent;
	border: 1px solid var(--nulo-border);
	cursor: pointer;

	transition: background 0.2s var(--bezier);

	&:hover:not(:disabled) {
		background: var(--nulo-surface-low);
	}

	&:active:not(:disabled) {
		opacity: 0.8;
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

/* Below the popup's width the row tightens, so the address stays whole and both chips stay inside it. */
@media (width < 359px) {
	.wrapper {
		gap: 8px;
		padding: 0 12px 0 16px;
	}
}

.status_dot {
	width: 6px;
	height: 6px;
	flex-shrink: 0;
	background: var(--gray);

	&.active {
		background: var(--green);
	}
	&.inactive {
		background: var(--red);
	}
	&.invalidchain {
		background: var(--red);
	}
	&.sync {
		background: var(--gray);
		animation: loading 1.5s infinite linear;
	}
}

@keyframes loading {
	0% { opacity: 1; }
	50% { opacity: 0.4; }
	100% { opacity: 1; }
}
</style>
