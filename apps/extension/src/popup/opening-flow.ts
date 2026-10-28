import { createRunFence } from "@/composables/runFence"

const OPENING_ROUTES: ReadonlySet<string> = new Set(["popup-import", "popup-profile-new"])

/** Whether `name` is a page whose flow opens a profile's session. */
export const isOpeningRoute = (name: unknown) => typeof name === "string" && OPENING_ROUTES.has(name)

const flows = createRunFence()

/** Ends every opening flow in this document: the shell owns the window from now on. Runs before the
 *  lock it precedes, whose navigation is not awaited, so a completion that settles before that
 *  navigation commits still finds its flow ended. */
export const endOpeningFlows = (): void => flows.invalidate()

/** Taken when a page opens: false once the shell has ended the flows. */
export const openingFlowLive = (): (() => boolean) => flows.snapshot()
