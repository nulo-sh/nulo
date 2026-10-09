import { existsSync, readFileSync, statSync } from "node:fs"
import { join, posix } from "node:path"
import ts from "typescript"
import { PageContext } from "vite-plugin-pages"
import { NULO_DESIGN_COMPONENTS } from "../design-resolver"
import { PAGES_OPTIONS } from "../pages-options"
import {
	boundAttr,
	componentName,
	type ParsedSource,
	parseSource,
	REPO_ROOT,
	sourceFiles,
	type TemplateNode,
	walkElements,
} from "./source-scan"

/**
 * Lists every surface the wallet renders, with the files each one draws from, so every board shoots
 * every surface and each later arc reshoots the ones it changes. A surface is:
 *
 * 1. a route `PageContext` builds from `PAGES_OPTIONS`, with its `<route>` meta;
 * 2. a popup `PopupManager.vue` mounts, with its `isOpened` key and the files that open it;
 * 3. a component `popup/app.vue` mounts outside `RouterView` (`PopupManager` aside, whose popups are
 *    item 2), and any other component that renders a `<Teleport>`.
 *
 * `renders` is the closure of what it draws: components through local imports, the auto-import map
 * and the design resolver, slot content included; their `.module.css`, imported or composed; every
 * script module they import, transitively; the entry's shell (`app.vue`, `index.ts` and its
 * stylesheet); the global styles and fonts; for a route, the Header unless its name or meta hides
 * it and `Navigation` under `showBottomNav`; for a popup, the shell of every route that opens it,
 * through any chain of popups. A component that teleports is shot in the base shell of the entries
 * that host it, without their Header.
 *
 * `arcs` are those among 3 and 4 whose `ARC_GLOBS` match a file in `renders`, or `[2]`. A shell file
 * counts only for the surface it is the source of: arc 3 edits `popup/app.vue`'s boot retry alone.
 *
 * Blind spots: a computed `<component :is>`, a popup key built at run time, and a component reached
 * only through another entry (`src/setup/`). The review of the output covers them.
 */

export type Surface = {
	id: string
	kind: "route" | "popup" | "overlay"
	source: string
	renders: string[]
	arcs: number[]
	/** A route's path and `<route>` meta. */
	path?: string
	meta?: Record<string, unknown>
	/** A popup's openers: the files that pass its key to an `open…(` call. */
	openers?: string[]
}

const SRC = "apps/extension/src"
const DESIGN = "packages/design/src"
const POPUP_APP = `${SRC}/popup/app.vue`
const ONBOARDING_APP = `${SRC}/onboarding/app.vue`
const POPUP_MANAGER = `${SRC}/popup/components/popups/PopupManager.vue`
const HEADER = `${SRC}/components/Header.vue`
const NAVIGATION = `${SRC}/popup/components/Navigation.vue`
const SHELLS = {
	popup: [POPUP_APP, `${SRC}/popup/index.ts`, `${SRC}/popup/index.scss`],
	onboarding: [ONBOARDING_APP, `${SRC}/onboarding/index.ts`, `${SRC}/onboarding/onboarding.scss`],
} as const
type ShellName = keyof typeof SHELLS
const SHELL_FILES = new Set<string>(Object.values(SHELLS).flat())

/** Arc 2's shared modules: they sit under arc 3 and 4 globs, but arc 2 migrates them whole. */
const SHARED_MODULES = [
	`${SRC}/popup/pages/tab-hero.module.css`,
	`${SRC}/popup/components/popups/popup-shared.module.css`,
	`${SRC}/components/composite/{list-empty.module.css,import/import-shared.module.css,activity/activity-card.module.css}`,
	`${SRC}/popup/components/modules/{send/fee-shared.module.css,settings/record-card.module.css}`,
	`${SRC}/components/composite/capabilities/capability-shared.module.css`,
]

/** The files arcs 3 and 4 migrate, as globs over repo-relative paths. */
export const ARC_GLOBS = {
	3: {
		include: [
			`${SRC}/components/{Header,LegalAcceptanceSheet,GlobalLoader,MigrationBarrier,NotificationManager}.vue`,
			`${SRC}/popup/components/Navigation.vue`,
			`${SRC}/popup/components/modules/{general,holdings,activity,send,tx,auth}/**`,
			`${SRC}/components/composite/{activity,send,import}/**`,
			`${SRC}/popup/pages/{general,holdings,activity,send,import,auth,register}.vue`,
			`${SRC}/popup/pages/{tx,received,journal,profile,legal}/**`,
			`${SRC}/popup/pages/detail-page.module.css`,
			`${SRC}/popup/components/popups/**`,
			POPUP_APP,
			`${SRC}/onboarding/**`,
			`${SRC}/components/composite/{FormPopup,ProcessingErrorNote,PasskeyScreen,SecretCountdownClose,SecretRevealCard,SecretUnlockSection}.vue`,
			`${SRC}/components/composite/{BarrierOverlay,LegalConsent,ProfileNameField,ListStatusMessage,CollapsingHeroLayout,SearchField,DottedTerm}.vue`,
		],
		exclude: [`${SRC}/popup/components/popups/IncomingTrustPopup.vue`, ...SHARED_MODULES],
	},
	4: {
		include: [
			`${SRC}/popup/pages/settings/**`,
			`${SRC}/popup/components/modules/settings/**`,
			`${SRC}/popup/windows/**`,
			`${SRC}/components/composite/capabilities/**`,
			`${SRC}/components/composite/{DappIdentityBlock,IdentityStrip,DappApprovalFooter,DappCancelledOverlay}.vue`,
			`${SRC}/components/{ScopeAddress,ScopeClassId,PrestoStatusCard}.vue`,
			`${SRC}/components/composite/general/EmojiGrid.vue`,
			`${SRC}/components/JsonViewer/LogsToolbar.vue`,
			`${SRC}/popup/components/popups/IncomingTrustPopup.vue`,
		],
		exclude: SHARED_MODULES,
	},
} as const
export type LaterArc = keyof typeof ARC_GLOBS

const GLOB_TOKENS: Record<string, string> = { "**/": "(?:.*/)?", "**": ".*", "*": "[^/]*", "{": "(?:", "}": ")", ",": "|" }

export function globToRegExp(glob: string): RegExp {
	const body = glob.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*\*\/|\*\*|\*|\{|\}|,/g, (token) => GLOB_TOKENS[token])
	return new RegExp(`^${body}$`)
}

const ARC_MATCHERS = Object.fromEntries(
	Object.entries(ARC_GLOBS).map(([arc, { include, exclude }]) => [
		arc,
		{ include: include.map(globToRegExp), exclude: exclude.map(globToRegExp) },
	]),
) as Record<string, { include: RegExp[]; exclude: RegExp[] }>

export function inArc(arc: LaterArc, file: string): boolean {
	const { include, exclude } = ARC_MATCHERS[arc]
	return include.some((re) => re.test(file)) && !exclude.some((re) => re.test(file))
}

export function arcsOf(renders: Iterable<string>, source: string): number[] {
	const counted = [...renders].filter((file) => !SHELL_FILES.has(file) || file === source)
	const arcs = ([3, 4] as const).filter((arc) => counted.some((file) => inArc(arc, file)))
	return arcs.length ? arcs : [2]
}

const exists = (file: string): boolean => existsSync(join(REPO_ROOT, file)) && statSync(join(REPO_ROOT, file)).isFile()
const read = (file: string): string => readFileSync(join(REPO_ROOT, file), "utf8")

function designExports(): Map<string, string> {
	const out = new Map<string, string>()
	for (const m of read(`${DESIGN}/index.ts`).matchAll(/export \{ default as (\w+) \} from "\.\/(.+?)"/g))
		out.set(m[1], `${DESIGN}/${m[2]}`)
	return out
}

/** `src/types/components.d.ts`: every auto-imported tag and the file it resolves to. */
function autoImports(design: Map<string, string>): Map<string, string> {
	const out = new Map<string, string>()
	for (const m of read(`${SRC}/types/components.d.ts`).matchAll(/(\w+): typeof import\('(.+?)'\)\['(\w+)'\]/g)) {
		const [, name, from, key] = m
		const file = from === "@nulo/design" ? design.get(key) : from.startsWith(".") ? posix.join(`${SRC}/types`, from) : undefined
		if (file) out.set(name, file)
	}
	return out
}

function fonts(): string[] {
	return [...read(`${DESIGN}/base.css`).matchAll(/url\("\.\/(fonts\/[^"]+)"\)/g)].map((m) => `${DESIGN}/${m[1]}`)
}

const GLOBAL = (): string[] => [`${DESIGN}/base.css`, `${DESIGN}/utilities.css`, `${DESIGN}/tokens.ts`, ...fonts()]

type ImportRef = { specifier: string; names: { imported: string; local: string }[]; defaultName?: string }

function namedImports(clause: ts.ImportClause): { imported: string; local: string }[] {
	const bindings = clause.namedBindings
	if (!bindings || !ts.isNamedImports(bindings)) return []
	return bindings.elements.filter((e) => !e.isTypeOnly).map((e) => ({ imported: (e.propertyName ?? e.name).text, local: e.name.text }))
}

function importRef(statement: ts.Statement): ImportRef | undefined {
	if (
		ts.isExportDeclaration(statement) &&
		statement.moduleSpecifier &&
		ts.isStringLiteral(statement.moduleSpecifier) &&
		!statement.isTypeOnly
	) {
		return { specifier: statement.moduleSpecifier.text, names: [] }
	}
	if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return undefined
	const clause = statement.importClause
	if (!clause) return { specifier: statement.moduleSpecifier.text, names: [] }
	const names = namedImports(clause)
	const namespace = clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)
	if (clause.isTypeOnly || (!clause.name && !names.length && !namespace)) return undefined
	return { specifier: statement.moduleSpecifier.text, names, defaultName: clause.name?.text }
}

/** Value imports, re-exports and literal dynamic imports of one script. */
function scriptImports(content: string): ImportRef[] {
	const sf = ts.createSourceFile("scan.ts", content, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
	const refs = sf.statements.flatMap((statement) => importRef(statement) ?? [])
	for (const m of content.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) refs.push({ specifier: m[1], names: [] })
	return refs
}

const CANDIDATE_SUFFIXES = ["", ".ts", ".js", ".vue", "/index.ts", "/index.js"]

/** A specifier inside the scanned roots, as a repo-relative file; undefined for a package or a miss. */
function resolveSpecifier(from: string, specifier: string): string | undefined {
	const clean = specifier.replace(/\?.*$/, "")
	let base: string | undefined
	if (clean.startsWith("@/")) base = `${SRC}/${clean.slice(2)}`
	else if (clean.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), clean))
	else if (clean.startsWith("@nulo/design/")) base = `${DESIGN}/${clean.slice("@nulo/design/".length)}`
	if (!base) return undefined
	return CANDIDATE_SUFFIXES.map((suffix) => base + suffix).find(exists)
}

const SKIPPED_TAGS = new Set([
	"RouterView",
	"RouterLink",
	"Component",
	"Transition",
	"TransitionGroup",
	"KeepAlive",
	"Teleport",
	"Suspense",
	"Slot",
	"Template",
])

/** Every file one source pulls in, memoized: rendered components, script imports, composed and imported CSS. */
export class SourceGraph {
	private readonly edgeCache = new Map<string, string[]>()
	private readonly parsedCache = new Map<string, ParsedSource>()
	readonly design = designExports()
	readonly auto = autoImports(this.design)

	parsed(file: string): ParsedSource {
		let parsed = this.parsedCache.get(file)
		if (!parsed) {
			parsed = parseSource(file)
			this.parsedCache.set(file, parsed)
		}
		return parsed
	}

	/** The component file a tag renders in `file`, through its imports, the auto-import map or the design resolver. */
	resolveTag(tag: string, locals: ReadonlyMap<string, string>): string | undefined {
		if (!/^[A-Z]/.test(tag) && !tag.includes("-")) return undefined
		const name = componentName(tag)
		if (SKIPPED_TAGS.has(name)) return undefined
		return locals.get(name) ?? this.auto.get(name) ?? (NULO_DESIGN_COMPONENTS.has(name) ? this.design.get(name) : undefined)
	}

	/** The local names a file binds to component files: default `.vue` imports and `@nulo/design` named imports. */
	locals(file: string): Map<string, string> {
		const out = new Map<string, string>()
		for (const ref of this.parsed(file).scripts.flatMap((s) => scriptImports(s.content))) {
			for (const { imported, local } of ref.names) {
				const target = ref.specifier === "@nulo/design" ? this.design.get(imported) : undefined
				if (target) out.set(local, target)
			}
			const target = ref.defaultName ? resolveSpecifier(file, ref.specifier) : undefined
			if (ref.defaultName && target?.endsWith(".vue")) out.set(ref.defaultName, target)
		}
		return out
	}

	/** Component files the template renders: every tag, plus a static `<component :is="Name">`. */
	components(file: string, root: TemplateNode | undefined = this.parsed(file).template): string[] {
		if (!root) return []
		const locals = this.locals(file)
		const out = new Set<string>()
		walkElements(root, (node) => {
			const is = node.tag === "component" ? boundAttr(node, "is") : undefined
			const target = is && /^[\w$]+$/.test(is) ? locals.get(is) : this.resolveTag(node.tag ?? "", locals)
			if (target) out.add(target)
		})
		return [...out]
	}

	private scriptEdges(file: string): string[] {
		return this.parsed(file).scripts.flatMap((script) =>
			scriptImports(script.content).flatMap((ref) => {
				if (ref.specifier !== "@nulo/design") return resolveSpecifier(file, ref.specifier) ?? []
				return ref.names.map(({ imported }) => this.design.get(imported) ?? `${DESIGN}/tokens.ts`)
			}),
		)
	}

	private styleEdges(file: string): string[] {
		const out: string[] = []
		for (const sheet of this.parsed(file).styles) {
			sheet.root.walkDecls("composes", (decl) => {
				const from = /from\s+["']([^"']+)["']/.exec(decl.value)?.[1]
				const target = from && resolveSpecifier(file, from)
				if (target) out.push(target)
			})
			sheet.root.walkAtRules("import", (rule) => {
				const target = resolveSpecifier(file, rule.params.replace(/^url\(|\)$|["']/g, ""))
				if (target) out.push(target)
			})
		}
		return out
	}

	edges(file: string): string[] {
		const cached = this.edgeCache.get(file)
		if (cached) return cached
		const scanned = /\.(vue|ts|js|css|scss)$/.test(file) && file !== `${DESIGN}/index.ts`
		const edges = scanned ? [...new Set([...this.components(file), ...this.scriptEdges(file), ...this.styleEdges(file)])] : []
		this.edgeCache.set(file, edges)
		return edges
	}

	closure(starts: Iterable<string>): Set<string> {
		const seen = new Set<string>()
		const queue = [...starts]
		for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
			if (seen.has(file)) continue
			seen.add(file)
			queue.push(...this.edges(file))
		}
		return seen
	}
}

type Chrome = { shells: Set<ShellName>; header: boolean; nav: boolean }

function routeChrome(name: string, meta: Record<string, unknown>): Chrome {
	if (name.startsWith("onboarding-")) return { shells: new Set(["onboarding"]), header: false, nav: false }
	const header = name !== "popup-register" && name !== "popup-auth" && !name.includes("windows-") && !meta.hideHeader
	return { shells: new Set(["popup"]), header, nav: meta.showBottomNav === true }
}

type Placed = { node: TemplateNode; ancestors: readonly TemplateNode[] }
type AppOverlay = { name: string; file: string; node: TemplateNode }

const isRouterView = (node: TemplateNode): boolean => componentName(node.tag ?? "") === "RouterView"

/** A shell template's elements outside `RouterView`, and the subset `RouterView` sits in. */
function shellLayout(root: TemplateNode): { outside: Placed[]; around: Set<TemplateNode> } {
	const around = new Set<TemplateNode>()
	const outside: Placed[] = []
	walkElements(root, (node, ancestors) => {
		if (isRouterView(node)) for (const a of ancestors) around.add(a)
	})
	walkElements(root, (node, ancestors) => {
		if (!isRouterView(node) && !ancestors.some(isRouterView)) outside.push({ node, ancestors })
	})
	return { outside, around }
}

class SurfaceBuilder {
	readonly graph = new SourceGraph()
	readonly overlays = this.appOverlays()
	private readonly overlayNames = new Set(["PopupManager", ...this.overlays.map((o) => o.name)])
	private readonly global = GLOBAL()
	private readonly chromeCache = new Map<ShellName, string[]>()

	/** The top component elements `popup/app.vue` mounts beside `RouterView`, `PopupManager` aside. */
	private appOverlays(): AppOverlay[] {
		const root = this.graph.parsed(POPUP_APP).template
		if (!root) return []
		const locals = this.graph.locals(POPUP_APP)
		const { outside, around } = shellLayout(root)
		const out: AppOverlay[] = []
		for (const { node, ancestors } of outside) {
			const file = around.has(node) ? undefined : this.graph.resolveTag(node.tag ?? "", locals)
			if (!file || file === POPUP_MANAGER || ancestors.some((a) => out.some((o) => o.node === a))) continue
			out.push({ name: componentName(node.tag ?? ""), file, node })
		}
		return out
	}

	/** A shell's own drawing: its files, and the closure of its components outside `RouterView` that are no overlay. */
	chrome(shell: ShellName): string[] {
		const cached = this.chromeCache.get(shell)
		if (cached) return cached
		const app = SHELLS[shell][0]
		const root = this.graph.parsed(app).template
		const locals = this.graph.locals(app)
		const skipped = new Set<TemplateNode>()
		const owned: string[] = []
		for (const { node, ancestors } of root ? shellLayout(root).outside : []) {
			if (this.overlayNames.has(componentName(node.tag ?? "")) || ancestors.some((a) => skipped.has(a))) {
				skipped.add(node)
				continue
			}
			const file = this.graph.resolveTag(node.tag ?? "", locals)
			if (file) owned.push(file)
		}
		const files = [...SHELLS[shell], ...this.graph.closure(owned)]
		this.chromeCache.set(shell, files)
		return files
	}

	renders(starts: Iterable<string>, chrome: Chrome): string[] {
		const files = new Set([...this.graph.closure(starts), ...this.global])
		for (const shell of chrome.shells) for (const file of this.chrome(shell)) files.add(file)
		if (chrome.header) for (const file of this.graph.closure([HEADER])) files.add(file)
		if (chrome.nav) for (const file of this.graph.closure([NAVIGATION])) files.add(file)
		return [...files].sort()
	}
}

type RouteRecord = { name?: string; path: string; component: string; meta?: Record<string, unknown> }

async function routeRecords(): Promise<RouteRecord[]> {
	const context = new PageContext(PAGES_OPTIONS, join(REPO_ROOT, "apps/extension"))
	await context.searchGlob()
	return (await context.options.resolver.getComputedRoutes(context)) as RouteRecord[]
}

type Built = Surface & { chrome: Chrome }

function routeSurfaces(builder: SurfaceBuilder, records: readonly RouteRecord[]): Built[] {
	return records.map((record) => {
		const name = record.name ?? record.component
		const meta = record.meta ?? {}
		const source = `apps/extension${record.component}`
		const chrome = routeChrome(name, meta)
		const renders = builder.renders([source], chrome)
		return { id: name, kind: "route", source, renders, arcs: arcsOf(renders, source), path: record.path, meta, chrome }
	})
}

type PopupMount = { key: string; file: string }

function popupMounts(graph: SourceGraph): PopupMount[] {
	const root = graph.parsed(POPUP_MANAGER).template
	const locals = graph.locals(POPUP_MANAGER)
	const out: PopupMount[] = []
	if (!root) return out
	walkElements(root, (node) => {
		const key = /isOpened\(\s*["']([^"']+)["']\s*\)/.exec(boundAttr(node, "show") ?? "")?.[1]
		const file = key ? graph.resolveTag(node.tag ?? "", locals) : undefined
		if (key && file) out.push({ key, file })
	})
	return out
}

function openersOf(key: string, own: string, files: readonly string[]): string[] {
	const opens = new RegExp(String.raw`\b(?!isOpened\b)\w*[oO]pen\w*\(\s*["']${key}["']`)
	return files.filter((file) => file !== own && file !== POPUP_MANAGER && opens.test(read(file)))
}

type Mount = { own: Set<string>; openers: string[] }

/**
 * The routes each popup shows over: those that render one of its openers, directly or through other
 * popups. An opener `PopupManager` itself runs (a prompt it raises over any page) hosts it on every
 * popup-shell route.
 */
function popupHosts(popups: readonly Mount[], routes: readonly Built[], ambient: ReadonlySet<string>): Set<Built>[] {
	const everywhere = routes.filter((r) => r.chrome.shells.has("popup"))
	const hosts = popups.map(({ openers }) =>
		openers.some((o) => ambient.has(o))
			? new Set(everywhere)
			: new Set(routes.filter((r) => openers.some((o) => r.renders.includes(o)))),
	)
	for (let grew = true; grew; ) {
		grew = false
		popups.forEach(({ openers }, i) => {
			popups.forEach((other, j) => {
				if (i === j || !openers.some((o) => other.own.has(o))) return
				for (const host of hosts[j]) {
					if (hosts[i].has(host)) continue
					hosts[i].add(host)
					grew = true
				}
			})
		})
	}
	return hosts
}

function unionChrome(hosts: Iterable<Chrome>, withHeader: boolean): Chrome {
	const chrome: Chrome = { shells: new Set(), header: false, nav: false }
	for (const host of hosts) {
		for (const shell of host.shells) chrome.shells.add(shell)
		chrome.header ||= withHeader && host.header
		chrome.nav ||= withHeader && host.nav
	}
	if (!chrome.shells.size) chrome.shells.add("popup")
	return chrome
}

function popupSurfaces(builder: SurfaceBuilder, routes: readonly Built[], files: readonly string[]): Built[] {
	const mounts = popupMounts(builder.graph).map((mount) => ({
		...mount,
		own: builder.graph.closure([mount.file]),
		openers: openersOf(mount.key, mount.file, files),
	}))
	const managerScripts = builder.graph.edges(POPUP_MANAGER).filter((file) => !file.endsWith(".vue"))
	const hosts = popupHosts(mounts, routes, builder.graph.closure(managerScripts))
	return mounts.map((mount, i) => {
		const chrome = unionChrome(
			[...hosts[i]].map((h) => h.chrome),
			true,
		)
		const renders = builder.renders([mount.file], chrome)
		return {
			id: `popup:${mount.key}`,
			kind: "popup",
			source: mount.file,
			renders,
			arcs: arcsOf(renders, mount.file),
			openers: mount.openers,
			chrome,
		}
	})
}

const BASE_CHROME = (): Chrome => ({ shells: new Set(["popup"]), header: false, nav: false })

/** `popup/app.vue`'s overlays, then every other component that teleports, in the base shells of what hosts it. */
function overlaySurfaces(builder: SurfaceBuilder, hostsFrom: readonly Built[], files: readonly string[]): Built[] {
	const out: Built[] = builder.overlays.map(({ name, file, node }) => {
		const source = (node.children ?? []).some((c) => typeof c === "object") ? POPUP_APP : file
		const chrome = BASE_CHROME()
		const renders = builder.renders([file, ...builder.graph.components(POPUP_APP, node)], chrome)
		return { id: `overlay:${name}`, kind: "overlay", source, renders, arcs: arcsOf(renders, source), chrome }
	})
	const taken = new Set(builder.overlays.map((o) => o.file))
	for (const file of files.filter((f) => f.endsWith(".vue") && !taken.has(f) && /<[Tt]eleport\b/.test(read(f)))) {
		const chrome = unionChrome(
			[...hostsFrom, ...out].filter((s) => s.renders.includes(file)).map((s) => s.chrome),
			false,
		)
		const renders = builder.renders([file], chrome)
		const id = `overlay:${posix.basename(file, ".vue")}`
		out.push({ id, kind: "overlay", source: file, renders, arcs: arcsOf(renders, file), chrome })
	}
	return out
}

/** Every surface: routes, then popups, then overlays. */
export async function surfaces(): Promise<Surface[]> {
	const builder = new SurfaceBuilder()
	const files = sourceFiles()
	const routes = routeSurfaces(builder, await routeRecords())
	const popups = popupSurfaces(builder, routes, files)
	const overlays = overlaySurfaces(builder, [...routes, ...popups], files)
	return [...routes, ...popups, ...overlays].map(({ chrome: _chrome, ...surface }) => surface)
}

export function formatSurface(surface: Surface): string {
	return `${surface.id}  ${surface.kind}  ${surface.source}  arcs ${surface.arcs.join(",")}  ${surface.renders.length} files`
}

if (import.meta.main) for (const surface of await surfaces()) console.log(formatSurface(surface))
