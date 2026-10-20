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
			title: "Passkey already in use",
			description:
				typeof name === "string" && name !== ""
					? `“${name}” already uses this passkey in this wallet. Click the profile name on the lock screen and choose “${name}”.`
					: "This passkey already has a profile in this wallet. Click the profile name on the lock screen and choose it.",
			confirmText: "OK",
			onConfirm: () => {},
		},
	}
}
