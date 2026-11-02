/** The noun beside `count`: one takes `singular`; zero and every other count take `plural`. */
export function pluralize(count: number, singular: string, plural: string): string {
	return count === 1 ? singular : plural
}
