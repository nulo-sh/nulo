import type { ProfileType } from "@/wallet/services/profile/spec"

export type HubConfig = Partial<Record<"sessionTtl" | "showFiatValues" | "theme" | "developerMode", unknown>>
export type HubValues = Partial<Record<"lock" | "privacy" | "display" | "developer", string>>

/**
 * The auto-lock time as the hub shows it. A fractional minute, which only storage written outside
 * the app can hold, shows the Lock page's minutes field text unrounded, so the two still agree.
 */
function autoLockLabel(ms: unknown): string | undefined {
	if (ms === 0) return "Never"
	if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return undefined
	const minutes = ms / 1_000 / 60
	if (!Number.isInteger(minutes) || minutes < 60) return `${minutes} min`
	const rest = minutes % 60
	return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${rest} min`
}

function themeLabel(theme: unknown): string | undefined {
	switch (theme) {
		case "system":
			return "System"
		case "dark":
			return "Dark"
		case "light":
			return "Light"
		default:
			return undefined
	}
}

function onOffLabel(value: unknown, on: string, off: string): string | undefined {
	if (value === true) return on
	if (value === false) return off
	return undefined
}

/** Each hub row's trailing value; a key not read yet, or of an unexpected shape, has none. */
export function hubValues(config: HubConfig): HubValues {
	return {
		lock: autoLockLabel(config.sessionTtl),
		privacy: onOffLabel(config.showFiatValues, "Prices on", "Prices off"),
		display: themeLabel(config.theme),
		developer: onOffLabel(config.developerMode, "On", "Off"),
	}
}

export function profileTypeLabel(type: ProfileType | undefined): "Password" | "Passkey" | undefined {
	if (type === "password") return "Password"
	if (type === "passkey") return "Passkey"
	return undefined
}
