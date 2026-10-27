import { type DeepReadonly, type Ref, readonly, ref } from "vue"
import type { ProfileNameField } from "@/composables/useProfileNameField"
import { availableName, defaultProfileName } from "@/utils/profile-name"

/** Whether the page renders its Profile-name field. `pending` until the profile list is read. */
export type NameFieldState = "pending" | "hidden" | "shown"

/**
 * The automatic Profile name. A first profile gets no field and is named "Main"; a later one
 * shows the field prefilled "Profile N". A failed read shows the field empty, never a guess.
 *
 * The field is untouched while it holds the last value written here (the default, or a
 * backup's name passed to `offer`, suffixed as the restore would save it when taken); anything
 * else is the user's and is never overwritten. The submitted name is resolved at submit time from
 * a fresh read, so a profile added or deleted elsewhere since the page opened cannot make an
 * automatic name stale or duplicate, and is written into the field first: the field shows the
 * name the profile is saved under.
 *
 * C1: receives the flow's name field and its profile-list getter; connects nothing and
 * registers no lifecycle hook.
 */
export function useProfileNameDefault(
	field: Pick<ProfileNameField, "profileName" | "trimmedName" | "validate">,
	listNames: () => Promise<readonly string[]>,
): {
	nameFieldState: DeepReadonly<Ref<NameFieldState>>
	offer: (backupName: string | null) => void
	resolveName: (backupName?: string | null) => Promise<string | null>
	holdsOwnName: () => boolean
} {
	const nameFieldState = ref<NameFieldState>("pending")
	let lastAuto = ""
	/** The setup read's list, `null` until it lands or when it failed. */
	let known: readonly string[] | null = null
	let offered: string | null = null
	let submitting = false

	function writeAuto(value: string): void {
		if (field.profileName.value !== lastAuto) return
		lastAuto = value
		field.profileName.value = value
	}

	const autoName = (backupName: string | null, names: readonly string[]) =>
		backupName ? availableName(backupName, names) : defaultProfileName(names)

	listNames().then(
		(names) => {
			// A read that lands after submit started must not rewrite the field under it.
			if (!submitting) {
				known = names
				writeAuto(autoName(offered, names))
			}
			nameFieldState.value = names.length === 0 ? "hidden" : "shown"
		},
		() => {
			nameFieldState.value = "shown"
		},
	)

	/** A backup's name (`null`: the backup has none) becomes the automatic value. */
	function offer(backupName: string | null): void {
		offered = backupName
		writeAuto(known ? autoName(backupName, known) : (backupName ?? ""))
	}

	/**
	 * The name to submit: the user's own, validated against a fresh list (`null` when it fails
	 * validation), else `backupName` made free against that list, else a default unique against
	 * it, written into the field. Rejects when the list cannot be read. Call it once per submit,
	 * inside the flow's latch.
	 */
	async function resolveName(backupName?: string | null): Promise<string | null> {
		submitting = true
		const names = await listNames()
		if (field.profileName.value !== lastAuto) {
			return field.validate({ existingNames: names }) ? field.trimmedName.value : null
		}
		const name = autoName(backupName ?? null, names)
		writeAuto(name)
		return name
	}

	/** Whether the field holds the user's own name rather than the last one written here. */
	function holdsOwnName(): boolean {
		return field.profileName.value !== lastAuto
	}

	return { nameFieldState: readonly(nameFieldState), offer, resolveName, holdsOwnName }
}
