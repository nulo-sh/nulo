import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { EXEMPT, PACKAGE_SRC_ROOTS, REPO_ROOT, SCAN_ROOTS, sourceFiles, TEST_FILE } from "./source-scan"

describe("sourceFiles", () => {
	test("reads every file under its roots with one of its extensions, minus what a skip matches", () => {
		const scripts = sourceFiles({ roots: ["packages/design/src"], exts: ["ts"] })
		expect(scripts).toContain("packages/design/src/tokens.ts")
		expect(scripts.every((file) => file.startsWith("packages/design/src/") && file.endsWith(".ts"))).toBe(true)

		const kept = sourceFiles({ roots: ["packages/design/src"], exts: ["ts"], skip: [EXEMPT] })
		expect(scripts.filter((file) => !kept.includes(file))).toEqual(scripts.filter((file) => EXEMPT.test(file)))
		expect(kept).not.toContain("packages/design/src/tokens.ts")

		const all = sourceFiles({ roots: ["packages/wallet-core/src"], exts: ["ts"] })
		const sources = sourceFiles({ roots: ["packages/wallet-core/src"], exts: ["ts"], skip: [TEST_FILE] })
		expect(all.some((file) => TEST_FILE.test(file))).toBe(true)
		expect(sources).toEqual(all.filter((file) => !TEST_FILE.test(file)))
	})

	test("returns repo-relative `/` paths, sorted across roots, each named file once", () => {
		const named = "packages/aztec-runtime/src/pxe/opfs-store.ts"
		const files = sourceFiles({ roots: [...SCAN_ROOTS].reverse(), files: [named, named], exts: ["ts"] })
		expect(files).toEqual([...files].sort())
		expect(files.filter((file) => file === named)).toHaveLength(1)
		expect(files.every((file) => !file.startsWith("/") && !file.includes("\\") && existsSync(join(REPO_ROOT, file)))).toBe(true)
	})

	test("lists every package that has a `src`", () => {
		const expected = readdirSync(join(REPO_ROOT, "packages"))
			.filter((name) => existsSync(join(REPO_ROOT, "packages", name, "src")))
			.map((name) => `packages/${name}/src`)
		expect(PACKAGE_SRC_ROOTS).toEqual(expected.sort())
		expect(PACKAGE_SRC_ROOTS).toContain("packages/wallet-core/src")
	})

	test("throws on a missing root, a root with no file it reads, or a missing named file", () => {
		expect(() => sourceFiles({ roots: ["packages/no-such-package/src"], exts: ["ts"] })).toThrow(/not a directory/)
		expect(() => sourceFiles({ roots: ["packages/design/src"], exts: ["no-such-ext"] })).toThrow(/holds no file/)
		expect(() => sourceFiles({ roots: ["packages/design/src"], exts: ["ts"], skip: [/./] })).toThrow(/holds no file/)
		expect(() => sourceFiles({ roots: [], files: ["packages/design/src/no-such-file.ts"], exts: ["ts"] })).toThrow(/does not exist/)
	})
})
