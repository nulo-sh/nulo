import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import type { IncomingTransferRecord } from "@/wallet/services/incoming-transfer/spec"
import { type ReceiptFeeService, useReceiptFee } from "./useReceiptFee"

type Fee = { feeJuice: string } | null

const publicRecord = (id = "pub:p1|n1|0x01|0") => ({ id, kind: "public-event" }) as IncomingTransferRecord
const noteRecord = { id: "note:p1|n1|0x02", kind: "note" } as IncomingTransferRecord

function makeService(lookup: Fee = { feeJuice: "100" }, cached: Fee = null) {
	return {
		getReceiptFee: vi.fn(async (_id: string): Promise<Fee> => lookup),
		getCachedReceiptFee: vi.fn(async (_id: string): Promise<Fee> => cached),
	} satisfies ReceiptFeeService
}

describe("useReceiptFee", () => {
	test("starts loading, before any load", () => {
		expect(useReceiptFee(makeService()).state.value).toBe("loading")
	})

	test("automatic: the lookup's fee is shown and the cache is not consulted", async () => {
		const service = makeService({ feeJuice: "100" })
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), false)
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["shown", "100"])
		expect(service.getReceiptFee).toHaveBeenCalledExactlyOnceWith(publicRecord().id)
		expect(service.getCachedReceiptFee).not.toHaveBeenCalled()
	})

	test.each<[string, () => Promise<Fee>]>([
		["finds no fee", async () => null],
		["rejects", async () => Promise.reject(new Error("port closed"))],
	])("automatic: a lookup that %s shows no fee", async (_name, answer) => {
		const service = makeService()
		service.getReceiptFee.mockImplementationOnce(answer)
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), false)
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["none", null])
	})

	test("tap only: a fee this session already holds is shown at once, with no lookup", async () => {
		const service = makeService({ feeJuice: "100" }, { feeJuice: "77" })
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), true)
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["shown", "77"])
		expect(service.getReceiptFee).not.toHaveBeenCalled()
	})

	test("tap only: with nothing held the row waits for a tap, with no lookup", async () => {
		const service = makeService()
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), true)
		expect(fee.state.value).toBe("tap")
		expect(service.getReceiptFee).not.toHaveBeenCalled()
	})

	test("a tap looks the fee up once and shows it", async () => {
		const service = makeService({ feeJuice: "100" })
		const lookup = deferred<Fee>()
		service.getReceiptFee.mockReturnValueOnce(lookup.promise)
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), true)
		const pressed = fee.show()
		expect(fee.state.value).toBe("loading")
		lookup.resolve({ feeJuice: "100" })
		await pressed
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["shown", "100"])
		expect(service.getReceiptFee).toHaveBeenCalledTimes(1)
	})

	test("a tap whose lookup fails returns to the tap, and a second tap looks again", async () => {
		const service = makeService(null)
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), true)
		await fee.show()
		expect(fee.state.value).toBe("tap")
		service.getReceiptFee.mockResolvedValueOnce({ feeJuice: "9" })
		await fee.show()
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["shown", "9"])
	})

	test("a tap outside the tap state looks nothing up", async () => {
		const service = makeService({ feeJuice: "100" })
		const fee = useReceiptFee(service)
		await fee.show()
		await fee.load(publicRecord(), false)
		await fee.show()
		const noLookup = useReceiptFee(makeService(null))
		await noLookup.load(publicRecord(), false)
		await noLookup.show()
		expect(service.getReceiptFee).toHaveBeenCalledTimes(1)
		expect(noLookup.state.value).toBe("none")
	})

	test("a note receipt has no fee row and makes no call", async () => {
		const service = makeService()
		const fee = useReceiptFee(service)
		await fee.load(noteRecord, false)
		await fee.load(noteRecord, true)
		expect(fee.state.value).toBe("none")
		expect(service.getReceiptFee).not.toHaveBeenCalled()
		expect(service.getCachedReceiptFee).not.toHaveBeenCalled()
	})

	test("a later load drops an earlier lookup's answer and clears the old fee", async () => {
		const service = makeService()
		const first = deferred<Fee>()
		service.getReceiptFee.mockReturnValueOnce(first.promise)
		const fee = useReceiptFee(service)
		const stale = fee.load(publicRecord("old"), false)
		await fee.load(publicRecord("new"), true)
		first.resolve({ feeJuice: "1" })
		await stale
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["tap", null])
	})

	test("a load during a tap's lookup drops the tap's answer", async () => {
		const service = makeService()
		const pressed = deferred<Fee>()
		service.getReceiptFee.mockReturnValueOnce(pressed.promise)
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), true)
		const press = fee.show()
		await fee.load(publicRecord("remined"), true)
		pressed.resolve({ feeJuice: "1" })
		await press
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["tap", null])
	})

	test("dispose drops a lookup still in flight", async () => {
		const service = makeService()
		const lookup = deferred<Fee>()
		service.getReceiptFee.mockReturnValueOnce(lookup.promise)
		const fee = useReceiptFee(service)
		const loading = fee.load(publicRecord(), false)
		fee.dispose()
		lookup.resolve({ feeJuice: "1" })
		await loading
		expect([fee.state.value, fee.feeJuice.value]).toEqual(["loading", null])
	})

	test("after dispose neither load nor a press calls the service", async () => {
		const service = makeService()
		const fee = useReceiptFee(service)
		await fee.load(publicRecord(), true)
		fee.dispose()
		await fee.show()
		await fee.load(publicRecord("remined"), false)
		expect(service.getReceiptFee).not.toHaveBeenCalled()
		expect(service.getCachedReceiptFee).toHaveBeenCalledTimes(1)
		expect(fee.state.value).toBe("tap")
	})
})
