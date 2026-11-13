import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const SEND = resolve(__dirname, "../../src/popup/components/modules/send")

/**
 * Whether `file`'s module class `cls` draws a fee whole: it composes the shared `.whole`, and that
 * rule keeps `white-space: nowrap`. jsdom computes no layout, so the source is the only witness here.
 */
export function drawsFeeWhole(file: string, cls: string): boolean {
	const read = (name: string) => readFileSync(resolve(SEND, name), "utf8")
	const rule = (css: string, name: string) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ""
	const shared = /white-space:\s*nowrap/.test(rule(read("fee-shared.module.css"), "whole"))
	const own = /<style module>([\s\S]*)<\/style>/.exec(read(file))?.[1] ?? ""
	return shared && /composes:\s*whole from "\.\/fee-shared\.module\.css"/.test(rule(own, cls))
}
