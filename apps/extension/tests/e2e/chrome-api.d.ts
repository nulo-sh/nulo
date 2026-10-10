// Call forms Chrome and Firefox document that chrome-types 0.1.439 leaves out.

declare namespace chrome.storage {
	interface StorageArea {
		/** `null` reads every stored item. */
		get(keys: null): Promise<Record<string, unknown>>
		get(keys: null, callback: (items: Record<string, unknown>) => void): void
	}
}

declare namespace chrome.runtime {
	/** The extension id may be omitted: the port then connects within this extension. */
	function connect(connectInfo: { name?: string; includeTlsChannelId?: boolean }): Port
}
