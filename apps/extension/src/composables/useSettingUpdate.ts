import type { Ref } from "vue"
import { useToast } from "@/composables/toast"
import type { Config, ConfigKey, ConfigProp } from "@/wallet/config"
import type { ConfigServiceClient } from "@/wallet/services/config/client"

/**
 * A refused settings write's toast label. Each site keeps its literal `openToast` object, whose kind
 * `utils/toast-call-sites.test.ts` reads there.
 */
export const SETTING_UPDATE_FAILED = "Failed to update setting"

/**
 * A settings page's writes and reads of its rows. `updateSetting` writes one row: a key with no
 * row, or the value the row already shows, writes nothing; otherwise the row changes only once the
 * worker has stored the value, and a refused write toasts and leaves the row on the stored value.
 * `onSettingUpdate` applies a worker update to a row showing another value. `landSettings` copies
 * a read into the rows, except the keys `updatedSince` names, and applies nothing, so an apply's
 * effects (a toast, a closing window) never replay on a reread. `applySetting` is not awaited.
 */
export function useSettingUpdate(
	configService: Pick<ConfigServiceClient, "setValue">,
	settings: Record<string, { model: Ref<unknown> }>,
	applySetting: (key: ConfigKey, value: unknown) => unknown,
): {
	updateSetting: <K extends ConfigKey>(key: K, value: Config[K]) => Promise<void>
	onSettingUpdate: (setting: ConfigProp) => void
	landSettings: (stored: readonly ConfigProp[], updatedSince: (key: string) => boolean) => void
} {
	const { openToast } = useToast()

	async function updateSetting<K extends ConfigKey>(key: K, value: Config[K]): Promise<void> {
		if (!settings[key]) return
		if (settings[key].model.value === value) return

		try {
			await configService.setValue(key, value)
			applySetting(key, value)
		} catch {
			openToast({ kind: "error", label: SETTING_UPDATE_FAILED })
		}
	}

	function onSettingUpdate(setting: ConfigProp): void {
		if (settings[setting.key] && settings[setting.key].model.value !== setting.value) {
			applySetting(setting.key, setting.value)
		}
	}

	function landSettings(stored: readonly ConfigProp[], updatedSince: (key: string) => boolean): void {
		for (const s of stored) {
			if (settings[s.key] && !updatedSince(s.key)) settings[s.key].model.value = s.value
		}
	}

	return { updateSetting, onSettingUpdate, landSettings }
}
