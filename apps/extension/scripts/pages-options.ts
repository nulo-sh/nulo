import type { UserOptions } from "vite-plugin-pages"

/**
 * Only `.vue` files are pages, so the helper modules beside them are not routes. Setting `exclude`
 * REPLACES the plugin's defaults rather than extending them, so they are restated; the test and
 * spec globs keep a `.test.vue` out of the routes and so out of the production bundle. The dev watcher
 * matches absolute paths with micromatch and no `dot`, where `**` never crosses a dot-directory, so
 * the `.*` variants cover a checkout under exactly one, as an agent worktree's `.claude/` is.
 */
export const PAGES_OPTIONS = {
	dirs: [
		{ dir: "src/pages", baseRoute: "common" },
		{ dir: "src/setup/pages", baseRoute: "setup" },
		{ dir: "src/popup/pages", baseRoute: "popup" },
		{ dir: "src/popup/windows", baseRoute: "windows" },
		{ dir: "src/onboarding/pages", baseRoute: "onboarding" },
	],
	extensions: ["vue"],
	exclude: ["node_modules", ".git", "**/__*__/**", "**/*.test.*", "**/*.spec.*", "**/.*/**/*.test.*", "**/.*/**/*.spec.*"],
} satisfies UserOptions
