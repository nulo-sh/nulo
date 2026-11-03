import { describe, expect, test, vi } from "vitest"
import { commitFencedCreate } from "./create-fence"
import { ProfileDeletionState } from "./profile/profile-deletion-state"

function setup() {
	const deletion = new ProfileDeletionState()
	const fence = { profileId: "p", epoch: deletion.capture("p") }
	const order: string[] = []
	const remove = vi.fn(async () => {
		order.push("remove")
	})
	const admit = vi.fn(() => {
		order.push("admit")
	})
	return { deletion, fence, order, remove, admit }
}

describe("commitFencedCreate", () => {
	test("a write that lands removes nothing and runs landed before a deletion queued at the re-check", async () => {
		const { deletion, fence, order, remove, admit } = setup()
		let begun = false
		const isCurrent = deletion.isCurrent.bind(deletion)
		// A deletion queued by the re-check itself runs in the first gap after it.
		vi.spyOn(deletion, "isCurrent").mockImplementation((id, epoch) => {
			void Promise.resolve().then(() => {
				deletion.beginDeletion(id)
				begun = true
			})
			return isCurrent(id, epoch)
		})
		const write = {
			commit: async () => {
				order.push("commit")
			},
		}
		const landed = vi.fn(() => {
			order.push(begun ? "landed after a deletion" : "landed")
		})

		await commitFencedCreate(deletion, fence, write, remove, { admit, landed })

		expect(order).toEqual(["admit", "commit", "landed"])
		expect(begun).toBe(true)
	})

	test("a deletion that begins during the write removes the row and refuses, and nothing has landed", async () => {
		const { deletion, fence, order, remove, admit } = setup()
		const write = {
			commit: async () => {
				order.push("commit")
				deletion.beginDeletion("p")
			},
		}
		const landed = vi.fn()

		await expect(commitFencedCreate(deletion, fence, write, remove, { admit, landed })).rejects.toThrow(/^profile p deleted$/)
		expect(order).toEqual(["admit", "commit", "remove"])
		expect(landed).not.toHaveBeenCalled()
	})

	test("a deletion begun before the call admits, writes and removes nothing", async () => {
		const { deletion, fence, order, remove, admit } = setup()
		deletion.beginDeletion("p")
		const write = { commit: vi.fn(async () => {}) }

		await expect(commitFencedCreate(deletion, fence, write, remove, { admit })).rejects.toThrow(/being deleted/)
		expect(write.commit).not.toHaveBeenCalled()
		expect(order).toEqual([])
	})
})
