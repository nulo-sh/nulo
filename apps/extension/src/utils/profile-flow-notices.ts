import type { NotificationItem } from "@/stores/notification.store"

/** The notice a failed profile create shows, in onboarding and in the popup alike. */
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

/** The notice a failed passkey profile import shows, in onboarding and in the popup alike. */
export function importFailedNotice(): NotificationItem {
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
