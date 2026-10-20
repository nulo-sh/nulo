/**
 * Every string the arrival of a new default network shows. `name` is the arrived network's row
 * name and `current` the active network's, each as the person sees it in their list. Nothing here
 * may read as if a button creates something on a network or sends a transaction: switching only
 * changes which network the wallet shows.
 */

const upper = (name: string) => name.toUpperCase()

export const arrival = (name: string, current: string) => ({
	eyebrow: "NEW NETWORK",
	title: `${name} is in your wallet`,
	body: `This version of Nulo adds ${name} to your networks. You are still on ${current}.`,
	label: `SWITCHING TO ${upper(name)}`,
	lines: [
		"Sends nothing and costs nothing. It only changes the network you see.",
		`Shows your ${name} account, at its own address.`,
		`Keeps ${current} as it is. You can switch back at any time.`,
	],
	switchTo: `SWITCH TO ${upper(name)}`,
	stay: `STAY ON ${upper(current)}`,
})

export const chipLabel = (name: string) => upper(name)
