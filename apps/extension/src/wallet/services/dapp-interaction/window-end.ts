import { UserRejectedError } from "@nulo/extension-messaging/errors"

/** How an approval window ended its request before any approval: its Reject button, its own close
 *  (the X, or an overlay dismissed), a lock, a switch to another profile, or the app's disconnect. */
export const WINDOW_ENDS = ["reject", "close", "lock", "switch", "disconnect"] as const
export type WindowEnd = (typeof WINDOW_ENDS)[number]

export function isWindowEnd(value: unknown): value is WindowEnd {
	return typeof value === "string" && (WINDOW_ENDS as readonly string[]).includes(value)
}

/** A Reject that names the window's end. A `UserRejectedError`, so the dApp reads the same 4001; the
 *  end only decides how the person's record reads. */
export class WindowEndedError extends UserRejectedError {
	public constructor(
		message: string,
		public readonly end: WindowEnd,
	) {
		super(message)
		this.name = "WindowEndedError"
	}
}
