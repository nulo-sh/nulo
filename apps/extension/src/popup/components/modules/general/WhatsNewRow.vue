<script setup>
/** Utils */
import { storageLocalGet, storageLocalSet } from "@/utils/storage"
import { changelogUrl, isWhatsNewDue, minorOf, WHATS_NEW_SEEN_KEY } from "@/utils/whats-new"

const version = __VERSION__
const due = ref(false)

/** The wallet reaches nulo.sh only on this tap, never by itself. */
function openChangelog() {
	window.open(changelogUrl(version), "_blank", "noopener,noreferrer")
}

async function dismiss() {
	due.value = false
	const seen = minorOf(version)
	if (seen === undefined) return
	try {
		await storageLocalSet({ [WHATS_NEW_SEEN_KEY]: seen })
	} catch (error) {
		console.debug("whats-new dismissal not stored", { error })
	}
}

onMounted(async () => {
	try {
		const stored = await storageLocalGet(WHATS_NEW_SEEN_KEY)
		due.value = isWhatsNewDue(version, stored[WHATS_NEW_SEEN_KEY])
	} catch (error) {
		console.debug("whats-new marker unread", { error })
	}
})
</script>

<template>
	<ItemsContainer v-if="due" data-testid="whats-new-row">
		<SettingItem :title="`Nulo ${version}. See what changed`" external data-testid="whats-new-open" @click="openChangelog">
			<template #right>
				<Icon name="open" :size="18" color="secondary" aria-hidden="true" />
				<RowAction label="Dismiss" data-testid="whats-new-dismiss" @click="dismiss">
					<Icon name="close" :size="16" color="secondary" aria-hidden="true" />
				</RowAction>
			</template>
		</SettingItem>
	</ItemsContainer>
</template>
