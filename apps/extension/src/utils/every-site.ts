/**
 * The confirm that turns the every-site switch on, asked by Settings → Connected Apps and by the
 * connect window's "Allow every site": one object, so the two cannot drift. Its button is the
 * accent one, as strict mode's.
 */
export const EVERY_SITE_CONFIRM = {
	title: "Let every site see Nulo?",
	description:
		"Any site you open, and the scripts it runs, will learn that Nulo is installed and its version, without asking. Connecting and sharing an account still ask you.",
	confirm_text: "Turn on",
} as const
