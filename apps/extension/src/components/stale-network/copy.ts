/**
 * Every string the stale-network screens show. `name` is the network row's name, shown as the user
 * named it; `n` counts the accounts the reset re-creates.
 */

const upper = (name: string) => name.toUpperCase()

/** The account line: what happens to the accounts, in the mockups' singular and plural forms. */
export function accountLine(name: string, n: number, addressesMoved: boolean): string {
	if (addressesMoved) {
		return n === 1
			? "Create your account again, with the same name, at a new address."
			: `Create your ${n} accounts again, with the same names, at new addresses.`
	}
	return n === 1
		? `Move your account to the new ${name}. Its address stays the same.`
		: `Move your ${n} accounts to the new ${name}. Their addresses stay the same.`
}

export const KEEP_LINE = "Keep your profile, contacts and other networks."
export const removeLine = (name: string) => `Remove old ${name} tokens and history from this device.`
export const nodeLine = (name: string) => `Switch ${name} to Nulo’s node, because yours is not serving the new ${name}.`
export const willLabel = (name: string) => `RESETTING ${upper(name)} IN NULO WILL`
export const NO_PHRASE_NOTE = "You do not need your recovery phrase."
export const SWITCH_NETWORK = "SWITCH NETWORK"
export const resetButton = (name: string) => `RESET ${upper(name)}`
export const chipLabel = (name: string) => upper(name)

export const networkReset = (name: string) => ({
	eyebrow: "NETWORK RESET",
	title: `${name} was reset`,
	body: `Aztec restarted ${name}. Tokens and history from before the restart no longer exist on it.`,
})

export const newAddresses = (name: string) => ({
	eyebrow: "WALLET UPDATE",
	title: "New account addresses",
	body: `This version of Nulo gives ${name} accounts new addresses. Your current ${name} accounts do not work with it.`,
	notice: "Tokens at your old addresses stay there. This version cannot reach them.",
})

export const mainnetBlocked = (name: string) => ({
	eyebrow: "WALLET UPDATE",
	title: `${name} accounts unavailable`,
	body: `This version of Nulo gives ${name} accounts new addresses, so it cannot open your current ones.`,
	lines: [
		"Your funds stay at your current addresses.",
		`Nulo does not reset ${name} and changes nothing on this device.`,
		"Your other networks keep working.",
	],
	note: "Never enter your recovery phrase anywhere in response to this message.",
})

export const paused = (name: string) => ({
	eyebrow: "RESET PAUSED",
	title: `${name} reset did not finish`,
	body: "Something stopped the reset part-way. Nulo saved your accounts before it removed anything, so nothing is lost.",
	label: "TRYING AGAIN WILL",
	pickUp: "Pick up where the reset stopped.",
	note: "Nulo also tries again each time you open it.",
	primary: "TRY AGAIN",
})

export const alreadyAdded = (name: string, holder: string) => ({
	eyebrow: "NETWORK RESET",
	title: `${name} cannot be reset yet`,
	body: `Aztec restarted ${name}, and you already added the new one as “${holder}”. Two networks cannot use the same chain.`,
	label: `TO RESET ${upper(name)}`,
	steps: [`Open Networks and delete “${holder}”.`, `Come back here and reset ${name}. Your accounts move to the new ${name}.`],
	note: "Deleting it removes its data from this device. Funds on the chain stay where they are.",
	primary: "OPEN NETWORKS",
})

export const oneAtATime = (name: string, pending: string) => ({
	title: `Finish the ${pending} reset first`,
	body: `Nulo resets one network at a time, and the ${pending} reset has not finished.`,
	lines: [`Nothing on ${name} has changed.`, `Open ${pending} to finish its reset. Then come back here to reset ${name}.`],
	primary: `GO TO ${upper(pending)}`,
})

export const nodeDown = (name: string) => ({
	eyebrow: "WALLET UPDATE",
	title: `Cannot reach ${name}`,
	body: "Nulo checks the network’s node before it removes anything. The node did not answer, so nothing was removed.",
	note: "Check that the node is running, then try again.",
	primary: "TRY AGAIN",
})

function confirmThen(name: string, n: number, addressesMoved: boolean): string {
	if (addressesMoved)
		return n === 1 ? "Then it creates this account again at a new address." : "Then it creates these accounts again at new addresses."
	return n === 1 ? `Then it moves this account to the new ${name}.` : `Then it moves these accounts to the new ${name}.`
}

export const confirm = (name: string, n: number, addressesMoved: boolean) => ({
	preTitle: upper(name),
	title: `Reset ${name}?`,
	body: `Nulo removes your ${name} tokens and history from this device. ${confirmThen(name, n, addressesMoved)} You cannot undo this.`,
	cancel: "CANCEL",
	submit: "RESET",
})

/** The notice under A3's list for imported accounts whose stored key does not open. */
export function unmovableNotice(names: readonly string[], addressesMoved: boolean): string {
	const one = names.length === 1
	const head = one
		? `“${names[0]}” cannot be moved because its stored key does not open. The reset removes it from this device.`
		: `${names.length} imported accounts cannot be moved because their stored keys do not open. The reset removes them from this device.`
	if (addressesMoved) return head
	return `${head} ${one ? "You can import it again from its key file." : "You can import them again from their key files."}`
}

export const progress = (name: string) => ({
	preTitle: upper(name),
	title: `Resetting ${name}`,
	body: "Keep this window open. This takes a few seconds.",
	footer: "If you close the window, Nulo finishes the reset the next time you open it.",
	removing: "Removing old data",
	removed: "Removed old data",
})

export const accountStep = (account: string, done: boolean, addressesMoved: boolean) =>
	addressesMoved ? `${done ? "Created" : "Creating"} ${account}` : `${done ? "Moved" : "Moving"} ${account}`

export const readyToast = (name: string, addressesMoved: boolean) => ({
	label: `${name} is ready`,
	sub: addressesMoved ? "Your accounts have new addresses." : "Your accounts kept their addresses.",
})

export const backupNotice = (name: string) => ({
	label: `FINISH THE ${upper(name)} RESET FIRST`,
	text: `A backup made now would miss the accounts the reset is moving. Open ${name} to finish the reset, then come back.`,
})

export const IMPORTED_UNUSABLE_TOAST = {
	label: "Cannot send from this account",
	sub: "Nulo cannot use this imported account’s key. Send from another account.",
}
