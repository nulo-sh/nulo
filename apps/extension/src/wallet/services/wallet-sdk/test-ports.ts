/** Inert window + real-timer clock ports for tests that boot the SDK handler without opening windows. */
import type { ClockPort, WindowPort } from "@nulo/wallet-core/ports"
import { type TrackedWindowPort, trackOpenWindows } from "@/wallet/services/window-manager/restart-ended-windows"

export function fakeSdkPorts(over: Partial<WindowPort> = {}): { windows: TrackedWindowPort; clock: ClockPort } {
	return {
		windows: trackOpenWindows(
			{
				create: async () => ({ id: 1 }),
				onRemoved: () => () => {},
				remove: async () => {},
				closeTab: async () => {},
				isPopup: async () => false,
				update: async () => {},
				getLastFocused: async () => undefined,
				...over,
			},
			{ onConnect: () => () => {} },
			"chrome-extension://test/src/popup/index.html",
		),
		clock: {
			now: () => Date.now(),
			sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
			setTimeout: (fn, ms) => setTimeout(fn, ms),
			clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
			setInterval: (fn, ms) => setInterval(fn, ms),
			clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
		},
	}
}
