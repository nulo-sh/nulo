/** "Keep in mind" under every recovery phrase the wallet shows: Settings' screen and the tab's step. */
export const RECOVERY_PHRASE_WARNINGS: readonly string[] = [
	"Some applications on your PC can have access to your clipboard and read a recovery phrase",
	"Storing a text file with sensitive information like a recovery phrase can be dangerous",
	"Paper keeps the phrase off every computer; keep it somewhere safe from loss, water and fire.",
]

/** Settings' reveal and the tab's step close the phrase on this one bound. */
export const RECOVERY_PHRASE_AUTO_CLOSE_MS = 5 * 60_000
