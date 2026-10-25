<script setup>
import EmojiGrid from "@/components/composite/general/EmojiGrid.vue"

const props = defineProps({
	emojis: { type: String, required: true },
})
</script>

<template>
	<Flex direction="column" gap="10" wide data-testid="connected-app-verification">
		<SectionLabel label="Connection check" />
		<Flex direction="column" align="center" wide>
			<EmojiGrid :emojis="emojis" />
		</Flex>
		<Text variant="body" color="tertiary" :style="{ lineHeight: '1.4' }">
			Emojis from the most recent connection. They should have matched what the app showed then.
		</Text>
	</Flex>
</template>
