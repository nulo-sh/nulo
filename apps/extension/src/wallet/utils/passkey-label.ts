/**
 * The WebAuthn `user.name` / `user.displayName` every passkey registers under: the label a
 * password manager shows for it and syncs to its cloud. One fixed label, so nothing about a
 * profile (its name, its id) leaves the device. Not part of any key derivation.
 */
export const PASSKEY_USER_NAME = "Nulo wallet"
