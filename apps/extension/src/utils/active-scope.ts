/** The profile, network and account the wallet is showing, as the activity reads scope them. */
export type ActiveAccountScope = { profileId: string; networkId: string; account: string }

type ScopeSource = {
	readonly profile?: { readonly id: string } | null
	readonly network?: { readonly id: string } | null
	readonly account?: { readonly address: string } | null
}

/** The active account's scope, or `undefined` until the profile, network and account are all set. */
export function activeAccountScope(app: ScopeSource): ActiveAccountScope | undefined {
	const profileId = app.profile?.id
	const networkId = profileId ? app.network?.id : undefined
	const account = networkId ? app.account?.address : undefined
	return profileId && networkId && account ? { profileId, networkId, account } : undefined
}
