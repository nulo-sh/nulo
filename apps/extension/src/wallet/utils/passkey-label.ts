/**
 * The WebAuthn `user.name` / `user.displayName` a new passkey registers under: the label a password
 * manager shows for it and syncs to its cloud. It names the profile the passkey was made for, as the
 * person typed it; a later rename of the profile does not reach it, since WebAuthn cannot rename a
 * credential, and a passkey reused for another profile keeps it. Not part of any key derivation.
 */
export function passkeyUserName(profileName: string): string {
	return `Nulo wallet · ${profileName}`
}
