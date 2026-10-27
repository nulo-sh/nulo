// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are code samples fed to the scanner as plain strings; their `${` is what it looks for.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { PACKAGE_SRC_ROOTS, parseSource, REPO_ROOT, sourceFiles } from "../../../scripts/type-roles/source-scan"
import { STORED_SHAPES, type StoredShape } from "./stored-shapes"

/**
 * The registry is closed-world: every `nulo:` key the sources name is a registered stored shape or
 * a key that never reaches `chrome.storage.local`, so a new key cannot ship without an entry, and
 * every local store is built from `stores.ts`, so a service cannot read with a codec the snapshot
 * never saw.
 *
 * Limits: a key assembled from parts that do not start with `nulo:` (a variable prefix) and a key
 * written only in a Vue template get past the scan.
 */

type NotLocalKind = "session" | "local-storage" | "lock" | "alarm" | "message" | "label" | "file-tag" | "module" | "prefix" | "e2e"

/**
 * Every `nulo:` literal that is not a `chrome.storage.local` key. A trailing `*` matches a prefix. An
 * entry a template can extend (ending `:`, `@` or `*`) names the files that own it, so the same head
 * elsewhere still needs registering; a path ending `/` names a directory.
 */
const NOT_LOCAL_STORAGE: Record<string, { kind: NotLocalKind; reason: string; files?: readonly string[] }> = {
	"nulo:core:session": { kind: "session", reason: "the unlocked session, chrome.storage.session" },
	"nulo:logs": { kind: "session", reason: "the log buffer, chrome.storage.session" },
	"nulo:liveness": { kind: "session", reason: "the background heartbeat, chrome.storage.session" },
	"nulo:incoming:scan-episodes": { kind: "session", reason: "receive-scan episodes, chrome.storage.session" },
	"nulo:onboarding:tab-id": { kind: "session", reason: "the onboarding tab, chrome.storage.session" },
	"nulo:legal:dismissed": { kind: "session", reason: "a dismissed acceptance sheet, chrome.storage.session" },
	"nulo:own-window:": {
		kind: "session",
		reason: "prefix of the own-window ids, chrome.storage.session",
		files: ["apps/extension/src/utils/own-window.ts"],
	},
	"nulo:own-window:handback": { kind: "session", reason: "the hand-back to the toolbar panel, chrome.storage.session" },
	"nulo:theme": { kind: "local-storage", reason: "the pre-paint theme hint, window.localStorage" },
	"nulo:scope-follow": { kind: "lock", reason: "a Web Lock name" },
	"nulo:restoreOutcome@": {
		kind: "lock",
		reason: "prefix of the restore-outcome Web Lock names",
		files: ["apps/extension/src/utils/restore-outcome.ts"],
	},
	"nulo:core:session:ttl": { kind: "alarm", reason: "the session-expiry alarm" },
	"nulo:journal:gc": { kind: "alarm", reason: "the journal sweep alarm" },
	"nulo:journal:reap": { kind: "alarm", reason: "the journal reaper alarm" },
	"nulo:price:refresh": { kind: "alarm", reason: "the price refresh alarm" },
	"nulo:token-list:refresh": { kind: "alarm", reason: "the token-list refresh alarm" },
	"nulo:open-toolbar-popup": { kind: "message", reason: "a runtime message type" },
	"nulo:return-to-panel": { kind: "message", reason: "a runtime message type" },
	"nulo:full-backup:": {
		kind: "file-tag",
		reason: "the full-backup file tag family",
		files: ["apps/extension/src/utils/full-backup-helpers.ts"],
	},
	"nulo:full-backup:v2": { kind: "file-tag", reason: "the full-backup file tag" },
	"nulo:third-party-notices*": {
		kind: "module",
		reason: "the notices plugin's Rollup names",
		files: ["packages/third-party-notices/src/plugin.ts"],
	},
	"nulo:ui:": {
		kind: "prefix",
		reason: "the prefix useSyncedRef builds its keys from; its keys are checked below",
		files: ["apps/extension/src/composables/syncedRef.js"],
	},
	"nulo:schema:": {
		kind: "prefix",
		reason: "the engine's reserved prefix; its keys are registered",
		files: ["packages/wallet-core/src/migration/migrator.ts"],
	},
	"nulo:e2e:*": {
		kind: "e2e",
		reason: "test gates and fixtures, compiled into armed e2e builds only",
		files: ["apps/extension/src/e2e/"],
	},
	"nulo:account-export:v1": { kind: "label", reason: "a domain separator" },
	"nulo:account-seed:v2": { kind: "label", reason: "a domain separator" },
	"nulo:dappsession-mac:salt:v2": { kind: "label", reason: "a domain separator" },
	"nulo:dappsession-mac:v2": { kind: "label", reason: "a domain separator" },
	"nulo:dek-wrap:v1": { kind: "label", reason: "a domain separator" },
	"nulo:envelope-mac:v3": { kind: "label", reason: "a domain separator" },
	"nulo:imported-account-key:v2": { kind: "label", reason: "a domain separator" },
	"nulo:kdf:v1": { kind: "label", reason: "a domain separator" },
	"nulo:master:v1": { kind: "label", reason: "a domain separator" },
	"nulo:passkey-unlock:v1": { kind: "label", reason: "a domain separator" },
	"nulo:row:v1": { kind: "label", reason: "a domain separator" },
	"nulo:row-seal:v1": { kind: "label", reason: "a domain separator" },
	"nulo:row-seal:aead:v1": { kind: "label", reason: "a domain separator" },
	"nulo:row-seal:index:v1": { kind: "label", reason: "a domain separator" },
	"nulo:profile-entropy:v1": { kind: "label", reason: "a domain separator" },
	"nulo:profile-guard:v2": { kind: "label", reason: "a domain separator" },
	"nulo:profile-imported-dek:v1": { kind: "label", reason: "a domain separator" },
	"nulo:profile-master:v2": { kind: "label", reason: "a domain separator" },
	"nulo:pxe-store-salt:": { kind: "label", reason: "a domain separator", files: ["packages/wallet-crypto/src/pxe-store-key.ts"] },
	"nulo:pxe-store:v2": { kind: "label", reason: "a domain separator" },
	"nulo:session-wrap:v1": { kind: "label", reason: "a domain separator" },
	"nulo:signing-root:v2": { kind: "label", reason: "a domain separator" },
	"nulo:wallet-fingerprint:v1": { kind: "label", reason: "a domain separator" },
}

const SYNCED_REF_PREFIX = "nulo:ui:"
const REGISTRY_FILE = "apps/extension/src/wallet/storage/stored-shapes.ts"
const STORE_FACTORY = "apps/extension/src/wallet/storage/stores.ts"
/** The only files that may hold the store classes as values: their definitions, the barrel that
 *  re-exports them, the factories, and the session store, which is over `storage.session`. */
const STORE_CLASS_HOLDERS = [
	"packages/wallet-core/src/storage/",
	"apps/extension/src/wallet/storage/sealed-entity-storage.ts",
	"apps/extension/src/wallet/storage/index.ts",
	STORE_FACTORY,
	"apps/extension/src/wallet/services/profile/session-manager.ts",
]
const STORE_CLASSES = new Set(["EntityStorage", "ValueStorage", "SealedEntityStorage"])
const STORE_CLASS_MODULES = new Set(["@nulo/wallet-core/storage", "@/wallet/storage", "@/wallet/storage/sealed-entity-storage"])
const SHAPES: readonly StoredShape[] = Object.values(STORED_SHAPES)

type Source = { file: string; source: string }
/** `extended`: a template piece a substitution follows, so the key is longer than `text`. */
type Literal = { file: string; line: number; text: string; extended: boolean }

/** The shape a stored key or key prefix belongs to: a value key exactly, or a root, alone or followed
 *  by `@`. A template piece a substitution extends is a longer key: it claims only a root's `@` rows. */
function claimingShape(text: string, extended = false): StoredShape | undefined {
	return SHAPES.find(({ ref }) => {
		if (ref.kind === "value") return !extended && text === ref.key
		return (!extended && text === ref.root) || text.startsWith(`${ref.root}@`)
	})
}

const ownedBy = (files: readonly string[] | undefined, file: string) =>
	!files || files.some((owner) => (owner.endsWith("/") ? file.startsWith(owner) : file === owner))

function notLocal({ text, file, extended }: Literal): boolean {
	return Object.entries(NOT_LOCAL_STORAGE).some(
		([key, { files }]) =>
			(key.endsWith("*") ? text.startsWith(key.slice(0, -1)) : text === key) && ownedBy(files, file) && (!extended || !!files),
	)
}

/** A file holds no finding unless it spells `nulo:`, `useSyncedRef`, a store class or module, or an escape (`\`) that a
 *  literal or a name decodes. Only `<script>` is read, and Vue decodes nothing there. */
const MAY_HOLD = ["nulo:", "useSyncedRef", "\\", ...STORE_CLASSES, ...STORE_CLASS_MODULES]

/** Each script of a file, with the line its content starts on, so a hit is reported at its file line. */
function scriptsOf({ file, source }: Source): Array<{ sf: ts.SourceFile; startLine: number }> {
	if (!MAY_HOLD.some((text) => source.includes(text))) return []
	return parseSource(file, source).scripts.map((block) => ({
		sf: ts.createSourceFile(file, block.content, ts.ScriptTarget.Latest, true),
		startLine: block.startLine,
	}))
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
	visit(node)
	ts.forEachChild(node, (child) => walk(child, visit))
}

const lineOf = (node: ts.Node, startLine: number) => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + startLine
const isLiteralText = (node: ts.Node): node is ts.LiteralLikeNode =>
	ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)

/** Every string or template-literal piece starting `nulo:`. */
function nuloLiterals(sources: readonly Source[]): Literal[] {
	const literals: Literal[] = []
	for (const src of sources) {
		for (const { sf, startLine } of scriptsOf(src)) {
			walk(sf, (node) => {
				if (isLiteralText(node) && node.text.startsWith("nulo:")) {
					const extended = ts.isTemplateHead(node) || ts.isTemplateMiddle(node)
					literals.push({ file: src.file, line: lineOf(node, startLine), text: node.text, extended })
				}
			})
		}
	}
	return literals
}

/** `useSyncedRef(<key>, …)` calls: the key, or `null` when it is not a plain string. */
function syncedRefKeys(sources: readonly Source[]): Array<{ file: string; line: number; key: string | null }> {
	const keys: Array<{ file: string; line: number; key: string | null }> = []
	for (const src of sources) {
		for (const { sf, startLine } of scriptsOf(src)) {
			walk(sf, (node) => {
				if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "useSyncedRef") return
				const [arg] = node.arguments
				keys.push({ file: src.file, line: lineOf(node, startLine), key: arg && ts.isStringLiteralLike(arg) ? arg.text : null })
			})
		}
	}
	return keys
}

function unregisteredLiterals(sources: readonly Source[]): string[] {
	return nuloLiterals(sources)
		.filter((literal) => !claimingShape(literal.text, literal.extended) && !notLocal(literal))
		.map(({ file, line, text }) => `${file}:${line} "${text}"`)
}

function unregisteredSyncedRefs(sources: readonly Source[]): string[] {
	return syncedRefKeys(sources)
		.filter(({ key }) => key === null || claimingShape(`${SYNCED_REF_PREFIX}${key}`)?.ref.kind !== "value")
		.map(({ file, line, key }) => `${file}:${line} useSyncedRef(${key ?? "<not a string literal>"})`)
}

/** `<anything>.storage.session`, as written: a conditional or a variable could be the local area. */
const isSessionArea = (node: ts.Node | undefined) =>
	!!node &&
	ts.isPropertyAccessExpression(node) &&
	node.name.text === "session" &&
	ts.isPropertyAccessExpression(node.expression) &&
	node.expression.name.text === "storage"

/** A `new EntityStorage(` / `new ValueStorage(` outside the store factories, unless its area is `storage.session`. */
function strayConstructions(sources: readonly Source[]): string[] {
	const stray: string[] = []
	for (const src of sources) {
		if (src.file === STORE_FACTORY) continue
		for (const { sf, startLine } of scriptsOf(src)) {
			walk(sf, (node) => {
				if (!ts.isNewExpression(node) || !ts.isIdentifier(node.expression) || !STORE_CLASSES.has(node.expression.text)) return
				if (!isSessionArea(node.arguments?.[1])) stray.push(`${src.file}:${lineOf(node, startLine)} new ${node.expression.text}(…)`)
			})
		}
	}
	return stray
}

const moduleOf = (specifier: ts.Expression | undefined) => (specifier && ts.isStringLiteral(specifier) ? specifier.text : "")
const storeClassNames = (elements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[]) =>
	elements
		.filter((el) => !el.isTypeOnly && STORE_CLASSES.has((el.propertyName ?? el.name).text))
		.map((el) => (el.propertyName ?? el.name).text)

function importedStoreClasses(node: ts.ImportDeclaration): string[] {
	const bindings = node.importClause?.namedBindings
	if (node.importClause?.isTypeOnly || !bindings) return []
	if (ts.isNamespaceImport(bindings)) return STORE_CLASS_MODULES.has(moduleOf(node.moduleSpecifier)) ? [`* as ${bindings.name.text}`] : []
	return storeClassNames(bindings.elements)
}

function exportedStoreClasses(node: ts.ExportDeclaration): string[] {
	if (node.isTypeOnly) return []
	if (!node.exportClause) return STORE_CLASS_MODULES.has(moduleOf(node.moduleSpecifier)) ? ["*"] : []
	return ts.isNamedExports(node.exportClause) ? storeClassNames(node.exportClause.elements) : []
}

/** The store classes a declaration brings in as values, aliased or not, or its module when whole. */
function storeClassesOf(node: ts.Node): string[] {
	if (ts.isImportDeclaration(node)) return importedStoreClasses(node)
	if (ts.isExportDeclaration(node)) return exportedStoreClasses(node)
	return []
}

/** A value import or re-export of the store classes outside {@link STORE_CLASS_HOLDERS}: a subclass or
 *  an alias would build a store the constructor rule cannot see. */
function strayStoreImports(sources: readonly Source[]): string[] {
	const stray: string[] = []
	for (const src of sources) {
		if (STORE_CLASS_HOLDERS.some((holder) => (holder.endsWith("/") ? src.file.startsWith(holder) : src.file === holder))) continue
		for (const { sf, startLine } of scriptsOf(src)) {
			walk(sf, (node) => {
				for (const name of storeClassesOf(node)) stray.push(`${src.file}:${lineOf(node, startLine)} ${name}`)
			})
		}
	}
	return stray
}

const files = sourceFiles({
	roots: ["apps/extension/src", ...PACKAGE_SRC_ROOTS],
	exts: ["ts", "js", "vue"],
	skip: [/\.test\.[jt]s$/, /\.d\.ts$/, /^apps\/extension\/src\/types\//, new RegExp(`^${REGISTRY_FILE}$`)],
})
const sources: Source[] = files.map((file) => ({ file, source: readFileSync(join(REPO_ROOT, file), "utf8") }))

describe("every nulo: key is registered", () => {
	test("every nulo: literal is a registered stored key or a key outside chrome.storage.local", () => {
		expect(
			unregisteredLiterals(sources),
			"register the key in wallet/storage/stored-shapes.ts, or list it in NOT_LOCAL_STORAGE with its kind",
		).toEqual([])
	})

	test("every useSyncedRef key is a registered nulo:ui: value key", () => {
		expect(unregisteredSyncedRefs(sources)).toEqual([])
	})

	test("every local EntityStorage and ValueStorage is built by the factories in wallet/storage/stores.ts", () => {
		expect(strayConstructions(sources), "build it with entityStorage / valueStorage from @/wallet/storage/stores").toEqual([])
		expect(strayStoreImports(sources), "import the store classes as types only; build stores with the factories").toEqual([])
	})

	test("every registry entry is named by the sources, so none is dead", () => {
		const named = new Set<StoredShape>()
		for (const { text } of nuloLiterals(sources)) {
			const shape = claimingShape(text)
			if (shape) named.add(shape)
		}
		for (const { key } of syncedRefKeys(sources)) {
			const shape = key === null ? undefined : claimingShape(`${SYNCED_REF_PREFIX}${key}`)
			if (shape) named.add(shape)
		}
		const dead = Object.entries(STORED_SHAPES)
			.filter(([, shape]) => !named.has(shape))
			.map(([name]) => name)
		expect(dead).toEqual([])
	})

	test("the scan reads the wallet: it is not vacuous", () => {
		expect(files.length).toBeGreaterThan(500)
		expect(files).toContain("apps/extension/src/wallet/services/profile/repository.ts")
		expect(files.some((file) => file.startsWith("packages/wallet-core/src/"))).toBe(true)
		// The SFCs are read; that a literal in one is found is the fixture test below.
		expect(files.some((file) => file.endsWith(".vue"))).toBe(true)
		expect(nuloLiterals(sources).filter(({ text }) => claimingShape(text)).length).toBeGreaterThan(40)
	})
})

describe("the scan's own rules", () => {
	const fixture = (file: string, source: string): Source[] => [{ file, source }]

	test("an unregistered key fails; a registered root, a key under it and a listed non-local key pass", () => {
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", 'const k = "nulo:core:unregistered"'))).toHaveLength(1)
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", "const k = `nulo:core:planted@${id}`"))).toHaveLength(1)
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", 'const k = "\\x6eulo:core:unregistered"'))).toHaveLength(1)
		const passing = 'const a = "nulo:core:accounts"; const b = `nulo:core:token-seeded@${id}`; const c = "nulo:journal:gc"'
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", passing))).toEqual([])
	})

	test("an unregistered or computed useSyncedRef key fails; a registered one passes", () => {
		expect(unregisteredSyncedRefs(fixture("apps/extension/src/x.ts", 'useSyncedRef("nope", null)'))).toHaveLength(1)
		expect(unregisteredSyncedRefs(fixture("apps/extension/src/x.ts", "useSyncedRef(key, null)"))).toHaveLength(1)
		expect(unregisteredSyncedRefs(fixture("apps/extension/src/x.ts", 'useSyncedRef("loggerWindowId", null)'))).toEqual([])
	})

	test("a store built outside the factories fails unless it is over session storage", () => {
		const local = 'new EntityStorage("nulo:core:accounts", browserApi.storage.local, (raw) => raw)'
		expect(strayConstructions(fixture("apps/extension/src/wallet/services/x.ts", local))).toHaveLength(1)
		expect(strayConstructions(fixture("packages/wallet-core/src/x.ts", "new ValueStorage(KEY, area)"))).toHaveLength(1)
		expect(
			strayConstructions(fixture("apps/extension/src/wallet/services/x.ts", "new ValueStorage(KEY, browserApi.storage.session)")),
		).toEqual([])
		expect(strayConstructions(fixture("apps/extension/src/wallet/storage/stores.ts", local))).toEqual([])
		const either = "new ValueStorage(KEY, c ? browserApi.storage.session : browserApi.storage.local)"
		expect(strayConstructions(fixture("apps/extension/src/wallet/services/x.ts", either))).toHaveLength(1)
		expect(strayConstructions(fixture("apps/extension/src/wallet/storage/other.ts", local))).toHaveLength(1)
	})

	test("a value import of a store class outside its holders fails, aliased, whole or re-exported; a type import passes", () => {
		const at = (source: string) => strayStoreImports(fixture("apps/extension/src/wallet/services/x.ts", source))
		expect(at('import { EntityStorage as Store } from "@nulo/wallet-core/storage"')).toEqual([
			"apps/extension/src/wallet/services/x.ts:1 EntityStorage",
		])
		expect(at('import * as storage from "@/wallet/storage"')).toHaveLength(1)
		expect(at('export { ValueStorage } from "@/wallet/storage"')).toHaveLength(1)
		expect(at('import type { EntityStorage } from "@/wallet/storage"; import { type ValueStorage } from "@/wallet/storage"')).toEqual(
			[],
		)
		expect(strayStoreImports(fixture(STORE_FACTORY, 'import { EntityStorage } from "@nulo/wallet-core/storage"'))).toEqual([])
	})

	test("a key head a template extends passes only in a file that owns it", () => {
		const head = "const k = `nulo:ui:${name}`"
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", head))).toHaveLength(1)
		expect(unregisteredLiterals(fixture("apps/extension/src/composables/syncedRef.js", head))).toEqual([])
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", "const k = `nulo:journal:gc${n}`"))).toHaveLength(1)
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", "const k = `nulo:ui:activeAccount${n}`"))).toHaveLength(1)
		expect(unregisteredLiterals(fixture("apps/extension/src/x.ts", "const k = `nulo:core:accounts${suffix}`"))).toHaveLength(1)
	})

	test("every entry a template can extend names its owning files, and each file exists", () => {
		for (const [key, { files }] of Object.entries(NOT_LOCAL_STORAGE)) {
			if (/[:@*]$/.test(key)) expect(files?.length, key).toBeGreaterThan(0)
			for (const file of files ?? []) expect(existsSync(join(REPO_ROOT, file)), `${key}: ${file}`).toBe(true)
		}
	})

	test("a literal in a Vue SFC script is read", () => {
		const sfc = '<script setup lang="ts">\nconst k = "nulo:core:unregistered"\n</script>\n<template><div /></template>\n'
		expect(unregisteredLiterals(fixture("apps/extension/src/x.vue", sfc))).toHaveLength(1)
	})
})
