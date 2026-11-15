<script setup lang="ts">
/** Every way out emits `choose` with the address and the candidate it names, if any; the page owns
 *  what follows. */
import { computed } from "vue"
import AccountAvatar from "@/components/composite/general/AccountAvatar.vue"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { trimAddress } from "@/utils/string"
import RecipientField from "./RecipientField.vue"

type Candidate = { id?: string | number; name: string; address: string }
export type RecentRow = { address: string; name: string | null; words: string; ago: string }

const props = defineProps<{
	candidates: Candidate[]
	recents: RecentRow[]
	accounts: Candidate[]
}>()
const emit = defineEmits<{ choose: [address: string, candidate: Candidate | null] }>()
const searchTerm = defineModel<string>("searchTerm", { default: "" })
const selectedContact = defineModel<Candidate | null>("selectedContact", { default: null })

/** Kept while a held press defers the field's own match, so nothing moves under the press. */
const pasted = computed(() => (isValidAztecAddress(searchTerm.value) ? searchTerm.value : null))
const candidateFor = (address: string): Candidate | null =>
	props.candidates.find((c) => c.address.toLowerCase() === address.toLowerCase()) ?? null

function choose(address: string) {
	emit("choose", address, candidateFor(address))
}

/** The field names a candidate once its pick may be shown: that is the choice, unless its address is
 *  no point, which stays in the field that says so. */
const chooseCandidate = (c: Candidate) => {
	if (isValidAztecAddress(c.address)) emit("choose", c.address, c)
}

/** Enter in the field takes a pasted address, as the button does; a suggestion's Enter is the field's. */
function onEnter(e: KeyboardEvent) {
	if (e.defaultPrevented || e.repeat || e.isComposing || !(e.target instanceof HTMLInputElement)) return
	if (!pasted.value) return
	e.preventDefault()
	choose(pasted.value)
}
</script>

<template>
	<div :class="$style.step" data-testid="send-person-step" @keydown.enter="onEnter">
		<h2 :class="$style.ask">Who are you paying?</h2>
		<RecipientField v-model:searchTerm="searchTerm" v-model:selectedContact="selectedContact" :candidates="candidates" @choose="chooseCandidate" />
		<Button v-if="pasted" variant="primary_outline" wide data-testid="send-pay-address" @click="choose(pasted)">Pay this address</Button>

		<template v-if="recents.length">
			<span :class="$style.label">Recent</span>
			<div :class="$style.list">
				<button v-for="r in recents" :key="r.address" type="button" :class="$style.person" data-testid="send-recent" :data-address="r.address" @click="choose(r.address)">
					<AccountAvatar :name="r.name ?? undefined" :address="r.address" :size="28" aria-hidden="true" />
					<span :class="$style.who">
						<span v-if="r.name" :class="$style.name">{{ r.name }}</span>
						<span v-else :class="$style.address" data-testid="send-recent-address">{{ trimAddress(r.address, 6, 4, "…") }}</span>
						<span :class="$style.meta">Last: {{ r.words }}</span>
					</span>
					<span :class="$style.when">{{ r.ago }}</span>
				</button>
			</div>
		</template>

		<template v-if="accounts.length">
			<span :class="$style.label">Your accounts</span>
			<div :class="$style.list">
				<button v-for="a in accounts" :key="a.address" type="button" :class="$style.person" data-testid="send-own-account" :data-address="a.address" @click="choose(a.address)">
					<AccountAvatar :name="a.name" :address="a.address" :size="28" aria-hidden="true" />
					<span :class="$style.who">
						<span :class="$style.name">{{ a.name }}</span>
						<span :class="$style.address" data-testid="send-own-account-address">{{ trimAddress(a.address, 6, 4, "…") }}</span>
					</span>
					<Icon name="forward" size="16" color="secondary" aria-hidden="true" />
				</button>
			</div>
		</template>
	</div>
</template>

<style module>
.step {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 4px 0 20px;
}

.ask {
	composes: type--row-title from global;
	margin: 0;
	font-size: 20px;
	color: var(--txt-primary);
}

.label {
	composes: type--label-section from global;
	margin-top: 4px;
	color: var(--nulo-secondary);
}

.list {
	display: flex;
	flex-direction: column;
	container: people / inline-size;
}

.person {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 8px 4px;
	background: none;
	color: var(--txt-primary);
	text-align: left;
	cursor: pointer;
	border-bottom: 1px solid var(--nulo-border);

	&:hover {
		background: var(--nulo-surface-low);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

.who {
	display: flex;
	flex-direction: column;
	gap: 2px;
	flex: 1;
	min-width: 0;
}

.name {
	composes: type--name from global;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.meta {
	composes: type--body from global;
	color: var(--txt-secondary);
}

.address {
	composes: type--meta from global;
	color: var(--nulo-secondary);
}

.when {
	composes: type--time from global;
	flex: none;
	color: var(--nulo-secondary);
}

/* Too narrow for the age beside the address: it takes a line of its own under them. */
@container people (width < 260px) {
	.person {
		flex-wrap: wrap;
		row-gap: 2px;
	}

	.when {
		flex-basis: 100%;
		padding-left: 38px;
	}
}
</style>
