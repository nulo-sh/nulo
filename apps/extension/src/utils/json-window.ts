export function openJsonWindow(requestId: string): void {
	const url = new URL(chrome.runtime.getURL("src/popup/index.html#/windows/json"))
	url.searchParams.set("requestId", requestId)
	void chrome.windows.create({ type: "popup", url: url.toString(), height: 700, width: 900 })
}
