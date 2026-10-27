/**
 * Capture a download IN-PAGE, without the filesystem: the stub replaces `chrome.downloads.download`
 * and fetches the blob URL INSIDE the stub, before `downloadFile`'s `finally` revokes it.
 *
 * Two-phase on purpose: arm BEFORE pressing the download CTA, read after. `gzip` says how the
 * wallet wrote the file: a full backup is gzipped and is read through the page's own
 * `DecompressionStream`, so the capture is its decompressed content (parsed JSON for a plain
 * backup, the base64 ciphertext for an encrypted one); an account file or a contacts export is
 * read as written. `readCapturedFile` returns the file itself.
 */
import type { Page } from "puppeteer"

type CaptureWindow = { __downloadCapture?: Promise<string>; __downloadFile?: { name: string; base64: string } }

export async function armDownloadCapture(page: Page, { gzip }: { gzip: boolean }): Promise<void> {
	await page.evaluate((gunzip: boolean) => {
		const w = window as unknown as CaptureWindow
		w.__downloadCapture = new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("download was not captured within 30s")), 30_000)
			const c = chrome as unknown as {
				downloads: { download: (opts: { url: string; filename: string }, cb: (id: number) => void) => void }
			}
			c.downloads = {
				download: (opts, cb) => {
					fetch(opts.url)
						.then((r) => r.blob())
						.then(async (blob) => {
							const bytes = new Uint8Array(await blob.arrayBuffer())
							w.__downloadFile = {
								name: opts.filename,
								base64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")),
							}
							const text = gunzip
								? await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text()
								: await blob.text()
							clearTimeout(timer)
							resolve(text)
							cb(1)
						})
						.catch((err) => {
							clearTimeout(timer)
							reject(err instanceof Error ? err : new Error(String(err)))
						})
				},
			}
		})
		// Swallow the (test-only) unhandled rejection if the click never fires.
		w.__downloadCapture.catch(() => {})
	}, gzip)
}

export async function readCapturedDownload(page: Page): Promise<string> {
	return await page.evaluate(() => (window as unknown as Required<CaptureWindow>).__downloadCapture)
}

/** The captured file as the wallet wrote it: its name and its bytes, still compressed if it was. */
export async function readCapturedFile(page: Page): Promise<{ name: string; bytes: Buffer }> {
	await readCapturedDownload(page)
	const file = await page.evaluate(() => (window as unknown as Required<CaptureWindow>).__downloadFile)
	return { name: file.name, bytes: Buffer.from(file.base64, "base64") }
}
