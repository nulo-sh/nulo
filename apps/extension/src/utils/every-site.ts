/** The one confirm both places that turn the every-site switch on ask, so they cannot drift. */
export const EVERY_SITE_CONFIRM = {
	title: "Let every site see Nulo?",
	description:
		"Any site you open, and the scripts it runs, will learn that Nulo is installed and its version, without asking. Connecting and sharing an account still ask you.",
	confirm_text: "Turn on",
} as const
