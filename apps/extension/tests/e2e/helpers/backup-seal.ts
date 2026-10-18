/**
 * A full backup's file content, sealed as the import checks it. A leaf: no page, no fixture, so the
 * unit layer reaches it without the e2e graph.
 */
import { createHash } from "node:crypto"
import { asBase64CredentialId, asBase64SecretPrf, EncryptionKey, PasskeyCredential, verifyBackupMac } from "@nulo/wallet-crypto"
import { assembleFullBackup, BACKUP_MAC_FIELD, passkeyBackupAuthenticator } from "@/utils/full-backup-helpers"

/** A full backup's content: the plain file's JSON, or an encrypted file's once opened. */
export type PlainBackup = { checksum?: string; data: Record<string, unknown> } & Record<string, unknown>

/** The file content of `backup` with its checksum recomputed over the doctored body: a plain
 *  backup's checksum detects corruption and authenticates nothing. Refuses a passkey backup, whose
 *  MAC signs the checksum it came with. */
export function sealPlainBackup(backup: PlainBackup): string {
	if (BACKUP_MAC_FIELD in backup) throw new Error("a passkey backup carries a MAC over its checksum: seal it with sealPasskeyBackup")
	const { checksum: _stale, ...body } = backup
	const checksum = createHash("sha256").update(JSON.stringify(body)).digest("hex")
	return JSON.stringify({ ...body, checksum })
}

/** A passkey as its ceremony answers: the credential id and the PRF output, both base64. */
export type PasskeyAnswer = { id: string; prf: string }

/** The file content of `backup` sealed by the wallet's own assembler: a checksum over the doctored
 *  body and that checksum's MAC under `passkey`, the one the import's ceremony answers with. */
export async function sealPasskeyBackup(backup: PlainBackup, passkey: PasskeyAnswer): Promise<string> {
	const { checksum: _stale, [BACKUP_MAC_FIELD]: _mac, data, ...envelope } = backup
	const slices = Object.entries(data).map(([name, slice]) => ({ name, backup: async () => slice }))
	const authenticate = passkeyBackupAuthenticator({ id: asBase64CredentialId(passkey.id), prf: asBase64SecretPrf(passkey.prf) })
	return (await assembleFullBackup(envelope, slices, undefined, authenticate)).compact
}

/** Whether `backup` passes the import's checks before its restore writes anything: the checksum
 *  over the body without it and its MAC, then the MAC over that checksum under `passkey`. */
export async function passkeyBackupVerifies(backup: PlainBackup, passkey: PasskeyAnswer): Promise<boolean> {
	const { checksum, [BACKUP_MAC_FIELD]: mac, ...body } = backup
	if (typeof checksum !== "string" || typeof mac !== "string") return false
	if ((await EncryptionKey.getHashHex(JSON.stringify(body))) !== checksum) return false
	return verifyBackupMac(await PasskeyCredential.create(passkey), checksum, mac)
}
