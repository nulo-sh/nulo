/**
 * A full backup's file content, sealed as the import checks it. A leaf: no page, no fixture, so the
 * unit layer reaches it without the e2e graph.
 */
import { createHash } from "node:crypto"

/** A full backup's content: the plain file's JSON, or an encrypted file's once opened. */
export type PlainBackup = { checksum?: string; data: Record<string, unknown> } & Record<string, unknown>

/** The file content of `backup` with its checksum recomputed over the doctored body: a plain
 *  backup's checksum detects corruption and authenticates nothing. */
export function sealPlainBackup(backup: PlainBackup): string {
	const { checksum: _stale, ...body } = backup
	const checksum = createHash("sha256").update(JSON.stringify(body)).digest("hex")
	return JSON.stringify({ ...body, checksum })
}
