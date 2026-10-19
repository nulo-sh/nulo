<script setup lang="ts">
/** Services */
import { managers } from "@/utils/core"

/** Composables */
import { useToast } from "@/composables/toast"
import { vSnackFooter, vSnackSheet } from "@/composables/snackInset"

/** Utils */
import { type LegalAcceptanceRecord, RISK_POINTS, currentVersion, pendingTermsVersions } from "@nulo/legal"
import { openLegalDocument } from "@/utils/legal-links"
import { LEGAL_DECLINED_PATH, LEGAL_DISMISSED_KEY, shouldShowLegalSheet } from "@/utils/legal-sheet"
import { useLegalAcceptance } from "@/composables/useLegalAcceptance"

/** `undefined` until the first status read lands, and once the sheet unmounts: no verdict. */
const emit = defineEmits<{ visibility: [shown: boolean | undefined] }>()

const { openToast } = useToast()

const route = useRoute()
const router = useRouter()

const termsVersion = currentVersion("terms").version
/** Above any Popup's `displaceIdx`: while the sheet shows, only its own footers place the snack. */
const SNACK_SHEET_ORDER = Number.MAX_SAFE_INTEGER
const dismissedVersion = ref<unknown>(undefined)
const record = ref<LegalAcceptanceRecord | null>(null)
const busy = ref(false)

const legal = useLegalAcceptance(managers.legal)

const visible = computed(() =>
	shouldShowLegalSheet({
		status: legal.status.value,
		routeName: route.name,
		routePath: route.path,
		isAuthRequired: route.meta.isAuthRequired === true,
		dismissedVersion: dismissedVersion.value,
		termsVersion,
	}),
)
/** With a prior record the sheet says what changed; without one it is the first-run text. */
const changes = computed(() => (record.value ? pendingTermsVersions(record.value).flatMap((version) => version.changes) : []))
const isReacceptance = computed(() => legal.status.value === "stale" && changes.value.length > 0)
const acceptedOn = computed(() =>
	record.value
		? new Date(record.value.acceptedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
		: "",
)

const handleAccept = async () => {
	busy.value = true
	try {
		await legal.accept("popup")
	} catch {
		openToast({ kind: "error", label: "Could not record your acceptance. Try again." })
	} finally {
		busy.value = false
	}
}

const handleNotNow = async () => {
	dismissedVersion.value = termsVersion
	await chrome.storage.session.set({ [LEGAL_DISMISSED_KEY]: termsVersion })
	await router.push(LEGAL_DECLINED_PATH)
}

/** The declined screen and the Send banner reopen the sheet by clearing the dismissal. */
const onSessionChanged = (changed: Record<string, chrome.storage.StorageChange>, area: string) => {
	if (area === "session" && LEGAL_DISMISSED_KEY in changed) dismissedVersion.value = changed[LEGAL_DISMISSED_KEY]?.newValue
}

// Synchronous, so the shell never renders a frame with a verdict this sheet has already changed.
watch(
	() => (legal.status.value === "loading" ? undefined : visible.value),
	(shown) => emit("visibility", shown),
	{ immediate: true, flush: "sync" },
)

onBeforeMount(async () => {
	chrome.storage.onChanged.addListener(onSessionChanged)
	dismissedVersion.value = (await chrome.storage.session.get(LEGAL_DISMISSED_KEY))[LEGAL_DISMISSED_KEY]
	await legal.refresh()
	record.value = await managers.legal.getRecord().catch(() => null)
})

onBeforeUnmount(() => {
	emit("visibility", undefined)
	legal.dispose()
	chrome.storage.onChanged.removeListener(onSessionChanged)
})
</script>

<template>
	<div
		v-if="visible"
		v-snack-sheet="SNACK_SHEET_ORDER"
		:class="$style.backdrop"
		data-testid="legal-sheet"
		:data-variant="isReacceptance ? 'changed' : 'review'"
	>
		<Flex direction="column" :class="$style.sheet" role="dialog" aria-modal="true" aria-labelledby="legal-sheet-title">
			<!-- Everything to read, then the control that agrees to it, in one scroll. -->
			<Flex direction="column" gap="16" :class="$style.body" data-testid="legal-sheet-body">
				<Flex direction="column" gap="8">
					<Text variant="label-section" color="secondary" data-testid="legal-sheet-version">Terms v{{ termsVersion }}</Text>
					<Text id="legal-sheet-title" variant="title-page" color="primary" data-testid="legal-sheet-title">
						{{ isReacceptance ? "The terms have changed" : "Review the terms" }}
					</Text>
					<Text v-if="isReacceptance" variant="body" color="secondary" height="150" data-testid="legal-sheet-since">
						Here is what changed since the version you accepted on {{ acceptedOn }}.
					</Text>
				</Flex>

				<LegalConsent
					:points="isReacceptance ? undefined : RISK_POINTS"
					:changes="isReacceptance ? changes : undefined"
					:terms-version="termsVersion"
					:busy="busy"
					@accept="handleAccept"
					@open="openLegalDocument"
				/>
			</Flex>

			<!-- Outside the scroll: declining is always one visible tap away. -->
			<Flex v-snack-footer justify="center" :class="$style.footer">
				<button type="button" :class="$style.later" :disabled="busy" data-testid="legal-sheet-not-now" @click="handleNotNow">Not now</button>
			</Flex>
		</Flex>
	</div>
</template>

<style module>
/* Below the start-up bar (9999) and the barriers (10000): a migration or integrity block outranks this. */
.backdrop {
	position: fixed;
	inset: 0;
	z-index: 9000;

	display: flex;
	align-items: flex-end;

	background-color: var(--scrim-sheet);
}

.sheet {
	width: 100%;
	max-height: 100%;

	background: var(--app-bg, var(--nulo-surface-low));
	border-top: 1px solid var(--nulo-border);
}

.body {
	min-height: 0;
	overflow-y: auto;
	padding: 20px 16px 16px;
}

.footer {
	flex-shrink: 0;
	padding: 8px 16px 12px;
	border-top: 1px solid var(--nulo-border);
}

.later {
	composes: type--label-section from global;
	padding: 6px 12px;

	color: var(--txt-secondary);

	background: transparent;
	border: none;
	cursor: pointer;
}

.later:hover {
	color: var(--txt-primary);
}

.later:focus-visible {
	outline: 2px dotted var(--nulo-accent);
	outline-offset: 2px;
}
</style>
