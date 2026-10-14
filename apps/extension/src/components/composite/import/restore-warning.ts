export function restoreWarningText(networkNames: readonly string[], hasOtherErrors: boolean): string {
	if (networkNames.length === 0) return "Profile import completed with some errors. You can review the details or continue."
	const pronoun = networkNames.length === 1 ? "it" : "them"
	const choices = hasOtherErrors ? "You can retry, review the details, or continue." : "You can retry or continue."
	return `${joinNames(networkNames)} didn't answer in time, so what was saved for ${pronoun} may not be restored. ${choices}`
}

/** The line above Retry once a Retry left networks unrestored. */
export function retryResultText(networkNames: readonly string[]): string {
	return `Retry didn't work · ${joinNames(networkNames)} still not restored`
}

/** The onboarding notice behind View Errors. */
export function restoreNoticeText(networkNames: readonly string[]): string {
	const base = "Some entries from the backup couldn't be restored."
	return networkNames.length ? `${base} ${joinNames(networkNames)} didn't finish restoring.` : base
}

/**
 * A copy of the error log in which each row naming a known network carries its name just before
 * its id. The log's own rows are never touched: a Retry finds the rows it replaces by identity.
 */
export function withNetworkNames(log: Record<string, unknown[]>, namesById: ReadonlyMap<string, string>): Record<string, unknown[]> {
	return Object.fromEntries(Object.entries(log).map(([serviceName, rows]) => [serviceName, rows.map((row) => namedRow(row, namesById))]))
}

function namedRow(row: unknown, namesById: ReadonlyMap<string, string>): unknown {
	const networkId = (row as { networkId?: unknown } | null)?.networkId
	const name = typeof networkId === "string" ? namesById.get(networkId) : undefined
	if (name === undefined) return row
	const named: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
		if (key === "networkId") named.network = name
		named[key] = value
	}
	return named
}

function joinNames(names: readonly string[]): string {
	if (names.length <= 2) return names.join(" and ")
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}
