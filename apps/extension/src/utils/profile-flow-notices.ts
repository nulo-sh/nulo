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
