export function restoreWarningText(networkNames: readonly string[], hasOtherErrors: boolean): string {
	if (networkNames.length === 0) return "Profile import completed with some errors. You can review the details or continue."
	const choices = hasOtherErrors ? "You can retry, review the details, or continue." : "You can retry or continue."
	return `${joinNames(networkNames)} didn't answer in time, so what was saved for ${pronoun(networkNames)} may not be restored. ${choices}`
}

/** Home's reminder of the networks a restore left behind. */
export function restoreReminderText(networkNames: readonly string[]): string {
	return `${joinNames(networkNames)} didn't finish restoring. Restore the backup again to bring ${pronoun(networkNames)} back.`
}

function pronoun(networkNames: readonly string[]): "it" | "them" {
	return networkNames.length === 1 ? "it" : "them"
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

/** Restore again's line above its file picker. */
export function restoreAgainIntroText(networkNames: readonly string[]): string {
	return `Choose the backup file you restored this profile from. Only ${joinNames(networkNames)} will be restored, into this profile.`
}

/** Restore again's toast once every network it named is restored. */
export function restoreAgainDoneText(networkNames: readonly string[]): string {
	return `${joinNames(networkNames)} restored`
}

/** Restore again's warning for networks no Retry would restore. */
export function restoreAgainFailedText(networkNames: readonly string[]): string {
	return `${joinNames(networkNames)} couldn't be restored from this backup. You can review the details or continue.`
}

/** Restore again's refusal of a valid backup that is not the one the profile was restored from. */
export const RESTORE_AGAIN_OTHER_BACKUP = {
	title: "This isn't the backup you restored",
	message: "Choose the file you restored this profile from.",
} as const

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

/** Network names as every restore surface lists them: "A and B", "A, B, and C". */
export function joinNames(names: readonly string[]): string {
	if (names.length <= 2) return names.join(" and ")
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}
