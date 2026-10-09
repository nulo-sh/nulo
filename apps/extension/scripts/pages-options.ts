import type { UserOptions } from "vite-plugin-pages"

/**
 * Setting `exclude` REPLACES the plugin's defaults rather than extending them, so they are
 * restated. Test and spec modules sit beside the pages they cover; without the globs below each
 * one becomes a route and pulls its test libraries into the production bundle. The dev watcher
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
	exclude: ["node_modules", ".git", "**/__*__/**", "**/*.test.*", "**/*.spec.*", "**/.*/**/*.test.*", "**/.*/**/*.spec.*"],
} satisfies UserOptions
