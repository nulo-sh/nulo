import type { Ref } from "vue"
import { useToast } from "@/composables/toast"
import type { Config, ConfigKey } from "@/wallet/config"
import type { ConfigServiceClient } from "@/wallet/services/config/client"

/**
 * A settings page's write of one row. A key with no row, or the value the row already shows,
 * writes nothing; otherwise the row changes only once the worker has stored the value, and a
 * refused write toasts and leaves the row on the stored value. `applySetting` is not awaited.
 */
export function useSettingUpdate(
	configService: Pick<ConfigServiceClient, "setValue">,
	settings: Record<string, { model: Ref<unknown> }>,
	applySetting: (key: ConfigKey, value: unknown) => unknown,
): { updateSetting: <K extends ConfigKey>(key: K, value: Config[K]) => Promise<void> } {
	const { openToast } = useToast()

	async function updateSetting<K extends ConfigKey>(key: K, value: Config[K]): Promise<void> {
		if (!settings[key]) return
		if (settings[key].model.value === value) return

		try {
			await configService.setValue(key, value)
			applySetting(key, value)
		} catch {
			openToast({ kind: "error", label: "Failed to update setting" })
		}
	}

	return { updateSetting }
}
