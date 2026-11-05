// The one email a signup sends. It loads no remote image or font, so opening it reaches no server,
// and it carries no unsubscribe link: the address is not on the list until the press on /confirm.

export const CONFIRM_URL = "https://nulo.sh/confirm"
const PRIVACY_URL = "https://nulo.sh/website-privacy"

export type Message = { from: string; reply_to: string; subject: string; html: string; text: string }

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c] as string)

const SUBJECT = "Confirm your email for Nulo updates"
const PREVIEW = "Press the button to join the list. The link works for 24 hours."
const HEADING = "One more step."
const BODY = "Someone asked for Nulo updates at this address. If it was you, confirm below. The link works for 24 hours."
const BUTTON = "Confirm my email"
const FALLBACK = "If the button doesn't work, open this link:"
const IGNORE = "If you didn't ask, ignore this email. Your address is not added."

const INK = "#0A0908"
const PAPER = "#F5F0E6"
const MUTED = "#6B655C"
const TEXT = "#4A463F"
const DISPLAY = "'Space Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif"
const SANS = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"

const row = (content: string, padding = "0 32px") => `<tr><td style="padding:${padding};">${content}</td></tr>`
const gap = (px: number) => `<tr><td height="${px}" style="height:${px}px;font-size:0;line-height:0;">&nbsp;</td></tr>`
const rule = row(`<div style="border-top:2px solid ${INK};font-size:0;line-height:0;">&nbsp;</div>`)

function html(link: string): string {
	const href = escapeHtml(link)
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${PAPER};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(PREVIEW)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};">
<tr><td align="center" style="padding:24px 0 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin:0 auto;">
${row(`<p style="margin:0;font-family:${DISPLAY};font-size:17px;line-height:22px;font-weight:700;letter-spacing:0.06em;color:${INK};">NULO</p>`, "0 32px 18px 32px")}
${rule}
${gap(18)}
${row(`<p style="margin:0;font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};">Nulo · Confirm your email</p>`)}
${gap(14)}
${row(`<h1 style="margin:0;font-family:${DISPLAY};font-size:44px;line-height:44px;font-weight:700;letter-spacing:-0.03em;text-transform:uppercase;color:${INK};">${escapeHtml(HEADING)}</h1>`)}
${gap(20)}
${row(`<p style="margin:0;font-family:${SANS};font-size:17px;line-height:27px;color:${TEXT};">${escapeHtml(BODY)}</p>`)}
${gap(24)}
${row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${INK}" style="background-color:${INK};border:1px solid ${INK};"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 22px;font-family:${DISPLAY};font-size:15px;line-height:18px;font-weight:700;letter-spacing:0.02em;color:${PAPER};text-decoration:none;">${escapeHtml(BUTTON)}</a></td></tr></table>`)}
${gap(24)}
${row(`<p style="margin:0;font-family:${SANS};font-size:13px;line-height:20px;color:${TEXT};">${escapeHtml(FALLBACK)}</p><p style="margin:6px 0 0 0;font-family:${MONO};font-size:11px;line-height:16px;word-break:break-all;"><a href="${href}" target="_blank" style="color:${INK};text-decoration:underline;">${href}</a></p>`)}
${gap(28)}
${rule}
${row(`${escapeHtml(IGNORE)}<br><a href="${PRIVACY_URL}" target="_blank" style="color:${INK};text-decoration:underline;">Website privacy notice</a>`, `18px 32px 0 32px;font-family:${MONO};font-size:11px;line-height:20px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED}`)}
</table>
</td></tr>
</table>
</body>
</html>
`
}

function text(link: string): string {
	return [HEADING, "", BODY, "", link, "", IGNORE, "", `Website privacy notice: ${PRIVACY_URL}`, ""].join("\n")
}

/** The confirmation email for `token`; the caller adds the recipient. */
export function confirmationEmail(token: string): Message {
	const link = `${CONFIRM_URL}#${token}`
	return { from: "Nulo <hello@news.nulo.sh>", reply_to: "hello@nulo.sh", subject: SUBJECT, html: html(link), text: text(link) }
}
