<script setup>
/** Utils */
import { restoreReminderText } from "@/components/composite/import/restore-warning"
import { restoreOutcomeKey } from "@/utils/profile-ui-keys"
import { clearRestoreOutcome, readRestoreOutcome } from "@/utils/restore-outcome"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Router */
const router = useRouter()

/** The last read of the active profile's record; `leased` while a restore run holds it. */
const snapshot = shallowRef(undefined)

/** Empty while activation reloads the network list: a read then neither hides the banner for
 *  good nor prunes the record. */
const names = computed(() => {
	const profileId = appStore.profile?.id
	const read = snapshot.value
	if (!read || read.leased || read.profileId !== profileId) return []
	const networks = appStore.networks
	if (networks.length === 0 || networks.some((network) => network.profileId !== profileId)) return []
	const unrestored = new Set(read.outcome.networkIds)
	return networks.filter((network) => unrestored.has(network.id)).map((network) => network.name)
})

const reminderText = computed(() => restoreReminderText(names.value))

let readSeq = 0
let leaseTimer

/** Reads the active profile's record; a read that resolves after the profile changed is dropped. */
async function reread() {
	const seq = ++readSeq
	clearTimeout(leaseTimer)
	const profileId = appStore.profile?.id
	if (!profileId) {
		snapshot.value = undefined
		return
	}
	let outcome
	try {
		outcome = await readRestoreOutcome(profileId)
	} catch (error) {
		console.warn("[restore-outcome] the reminder could not be read", { error })
	}
	if (seq !== readSeq || appStore.profile?.id !== profileId) return
	const leaseLeft = outcome ? outcome.leaseUntil - Date.now() : 0
	snapshot.value = outcome ? { profileId, outcome, leased: leaseLeft > 0 } : undefined
	if (leaseLeft > 0) leaseTimer = setTimeout(reread, leaseLeft)
}

/** Another page armed, settled or dismissed this profile's reminder. */
function onStorageChanged(changes, area) {
	const profileId = appStore.profile?.id
	if (area === "local" && profileId && restoreOutcomeKey(profileId) in changes) void reread()
}
chrome.storage.onChanged.addListener(onStorageChanged)

const restoreAgain = () => router.push("/popup/restore-again")

async function dismiss() {
	const profileId = snapshot.value?.profileId
	snapshot.value = undefined
	if (!profileId) return
	try {
		await clearRestoreOutcome(profileId)
	} catch (error) {
		console.warn("[restore-outcome] the reminder could not be dismissed", { error })
		void reread()
	}
}

watch(
	() => appStore.profile?.id,
	() => void reread(),
)

onMounted(() => void reread())
onBeforeUnmount(() => {
	readSeq++
	clearTimeout(leaseTimer)
	chrome.storage.onChanged.removeListener(onStorageChanged)
})
</script>

<template>
	<Banner v-if="names.length" variant="warning" direction="vertical" data-testid="restore-outcome-banner">
		<template #title> Some networks weren't restored </template>
		<template #description>
			<Flex direction="column" gap="8">
				<Text color="secondary" height="140" :class="$style.reminder" data-testid="restore-outcome-reminder">{{ reminderText }}</Text>
				<Flex align="center" gap="16">
					<button type="button" :class="$style.action" data-testid="restore-outcome-restore" @click="restoreAgain">
						Restore again
					</button>
					<button type="button" :class="$style.action" data-testid="restore-outcome-dismiss" @click="dismiss">
						Dismiss
					</button>
				</Flex>
			</Flex>
		</template>
	</Banner>
</template>

<style module>
/* On the sentence, not its column: the actions below must keep their words whole. */
.reminder {
	overflow-wrap: anywhere;
}

/* Banner's own action, for the second action its single `action` prop cannot carry. */
.action {
	composes: type--label-section from global;
	color: var(--nulo-accent);
	background: transparent;
	border: none;
	cursor: pointer;
	padding: 0;
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 4px;
	transition: color 0.2s var(--bezier);

	&:hover {
		color: var(--txt-primary);
	}
}

:global([theme="light"]) {
	.action {
		color: var(--txt-primary);
	}
	.action:hover {
		color: var(--txt-secondary);
	}
}
</style>
