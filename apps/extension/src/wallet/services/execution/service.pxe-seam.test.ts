/**
 * Pins the ExecutionService PXE construction seam.
 *
 * The existing execution suite bypasses construction via private-field
 * injection, so nothing else covers "with no factory supplied, production
 * builds the REAL PxeServiceClient". This pins exactly that: the default
 * factory (which `ExecutionService`'s constructor uses as its `pxeClientFactory`
 * default) produces the real RPC-backed client, so the new seam can't silently
 * make production run a fake. (`chrome.*` is stubbed by tests/vitest.setup.ts,
 * so constructing the real client here is safe — we never make an RPC call.)
 */

import { describe, expect, test, vi } from "vitest"
import { PxeServiceClientBase } from "@nulo/aztec-runtime/pxe"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { PxeServiceClient } from "@/wallet/services/pxe/client"
import { offscreenEpoch, onOffscreenRetired } from "@/wallet/utils/offscreen"
import { ESTIMATE_JOB_TTL_MS } from "./estimate-cancel-registry"
import { DEFAULT_PXE_CLIENT_FACTORY } from "./service"

vi.mock("@/wallet/utils/offscreen", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	onOffscreenRetired: vi.fn(),
}))

describe("ExecutionService PXE construction seam", () => {
	test("DEFAULT_PXE_CLIENT_FACTORY (the production default) builds the real PxeServiceClient", () => {
		const client = DEFAULT_PXE_CLIENT_FACTORY(new LoggerStore(new ConfigStore()))
		expect(client).toBeInstanceOf(PxeServiceClient)
	})

	test("its timed-out simulation records last as long as an estimate entry and end when their document retires", () => {
		const provider = vi.spyOn(PxeServiceClientBase.prototype, "setDocumentEpochProvider")
		const retire = vi.spyOn(PxeServiceClientBase.prototype, "retireEpochsThrough")
		const client = DEFAULT_PXE_CLIENT_FACTORY(new LoggerStore(new ConfigStore()))
		expect(provider).toHaveBeenCalledWith(offscreenEpoch, ESTIMATE_JOB_TTL_MS)
		vi.mocked(onOffscreenRetired).mock.calls.at(-1)?.[0](3)
		expect(retire.mock.contexts.at(-1)).toBe(client)
		expect(retire).toHaveBeenLastCalledWith(3)
	})
})
