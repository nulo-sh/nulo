<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Utils */
import { onMounted } from "vue"
import { managers } from "@/utils/core"
import { trimAddress } from "@/utils/string"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const emit = defineEmits(["onAddressClick"])
const props = defineProps({
	address: {
		type: String,
		required: false,
	},
	full: {
		type: Boolean,
		default: false,
	},
	formatter: {
		type: Function,
		default: null,
	},
	lead: {
		type: Boolean,
		default: false,
	},
	height: {
		type: String,
		default: "100",
	},
	color: {
		type: String,
		default: "primary",
	},
	static: {
		type: Boolean,
		default: false,
	},
})

const contactName = ref("")
const displayedAddress = ref("")

const showName = ref(false)
const showsName = computed(() => Boolean(showName.value && contactName.value))

const handleClick = () => {
	if (props.static) {
		emit("onAddressClick")
		return
	}

	showName.value = !showName.value

	if (contactName.value) {
		event.stopPropagation()
	}

	emit("onAddressClick")
}

onMounted(async () => {
	if (props.address) {
		const contact = await managers.contact.getContactByAddress(props.address)
		if (contact?.name) {
			contactName.value = `@${contact.name}`
			showName.value = true
		} else {
			const _acc = appStore.accounts.find((acc) => acc.address === props.address)
			if (_acc?.name) {
				contactName.value = _acc.name
				showName.value = true
			}
		}

		if (props.full) {
			displayedAddress.value = props.address
		} else {
			if (typeof props.formatter === "function") {
				displayedAddress.value = props.formatter(props.address)
			} else {
				displayedAddress.value = trimAddress(props.address)
			}
		}
	}
})
</script>

<template>
	<Text
		v-if="showsName"
		variant="name"
		data-testid="address-display"
		data-address-shows="name"
		@click="handleClick"
		:color="color"
		:height="height"
		:class="[$style.name, $style.clickable]"
	>
		{{ contactName }}
	</Text>
	<Text
		v-else
		:variant="lead ? 'data-lead' : 'meta'"
		data-testid="address-display"
		data-address-shows="address"
		@click="handleClick"
		:color="color"
		:height="height"
		:class="contactName && $style.clickable"
	>
		{{ displayedAddress }}
	</Text>
</template>

<style module>
.clickable {
	cursor: pointer;
}

.name {
	font-size: 13px;
}
</style>
