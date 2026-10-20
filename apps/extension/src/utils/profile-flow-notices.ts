import { PasskeyProfileExistsError } from "@nulo/extension-messaging/errors"
import type { NotificationItem } from "@/stores/notification.store"

export function createFailedNotice(isPasskey: boolean): NotificationItem {
	return {
		type: "warning",
		payload: {
			title: "Profile creation failed",
			description: isPasskey
				? "An error occurred while creating the profile. This authenticator may not be supported or encountered an issue. Try again or use another one."
				: "An error occurred while creating the profile. Please try again.",
			note: isPasskey ? "Windows Hello may not work correctly with some versions of Windows." : undefined,
			confirmText: "OK",
			onConfirm: () => {},
		},
	}
}

/** The notice for a failed passkey import: its own words when the passkey's profile is already here. */
export function passkeyImportFailedNotice(err: unknown): NotificationItem {
	if (err instanceof PasskeyProfileExistsError) return passkeyProfileExistsNotice(err)
	return {
		type: "warning",
		payload: {
			title: "Profile import failed",
			description:
				"An error occurred while importing the profile. This authenticator may not be supported or encountered an issue. Try again or use another one.",
			note: "Windows Hello may not work correctly with some versions of Windows.",
			confirmText: "OK",
			onConfirm: () => {},
		},
	}
}

function passkeyProfileExistsNotice(err: PasskeyProfileExistsError): NotificationItem {
	// The wire does not validate `details`; anything but a name reads as the nameless form.
	const name = (err.details as { existingProfileName?: unknown } | undefined)?.existingProfileName
	return {
		type: "warning",
		payload: {
			title: "Profile already added",
			description:
				typeof name === "string" && name !== ""
					? `“${name}” already uses this passkey in this wallet. Choose “${name}” from your profiles instead of importing it again.`
					: "This passkey already has a profile in this wallet. Choose it from your profiles instead of importing it again.",
			confirmText: "OK",
			onConfirm: () => {},
		},
	}
}
