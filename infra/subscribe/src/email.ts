// RFC 5322 atext without the characters a URL path reserves or percent-encodes (`/ ? # % ^ | ` { }`):
// the address is the path of Resend's lookup, so it must reach Resend byte for byte.
const LOCAL = /^[A-Za-z0-9!$&'*+=_~-]+(?:\.[A-Za-z0-9!$&'*+=_~-]+)*$/
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Trims, lowercases the domain only (a local part may be case-sensitive), and keeps a conservative
 * syntax: one `@`, a dotted ASCII domain whose last label holds a letter, at most 254 characters.
 * `null` for anything else, an internationalized domain not in punycode included.
 */
export function normalizeEmail(raw: string): string | null {
	const trimmed = raw.trim()
	const at = trimmed.indexOf("@")
	if (at < 1 || at !== trimmed.lastIndexOf("@")) return null
	const local = trimmed.slice(0, at)
	const domain = trimmed.slice(at + 1).toLowerCase()
	const email = `${local}@${domain}`
	if (email.length > 254 || local.length > 64 || !LOCAL.test(local)) return null
	const labels = domain.split(".")
	if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null
	return /[a-z]/.test(labels[labels.length - 1]) ? email : null
}
