import type { StorageArea } from "@nulo/wallet-core/ports"
import { profileUiKeys } from "@/utils/profile-ui-keys"
import type { ILogger } from "@/wallet/logger"
import type { IService, ServiceCollection } from "@/wallet/base"
import type { AccountService } from "@/wallet/services/account/service"
import { ACCOUNT_SERVICE_NAME } from "@/wallet/services/account/spec"
import type { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { AUTH_REGISTRY_SERVICE_NAME } from "@/wallet/services/auth-registry/spec"
import type { ContactService } from "@/wallet/services/contact/service"
import { CONTACT_SERVICE_NAME } from "@/wallet/services/contact/spec"
import type { DappSessionService } from "@/wallet/services/dapp-session/service"
import { DAPP_SESSION_SERVICE_NAME } from "@/wallet/services/dapp-session/spec"
import type { FpcService } from "@/wallet/services/fpc/service"
import { FPC_SERVICE_NAME } from "@/wallet/services/fpc/spec"
import type { IncomingTransferService } from "@/wallet/services/incoming-transfer/service"
import { INCOMING_TRANSFER_SERVICE_NAME } from "@/wallet/services/incoming-transfer/spec"
import type { NetworkService } from "@/wallet/services/network/service"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import type { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { OPERATION_JOURNAL_SERVICE_NAME } from "@/wallet/services/operation-journal/spec"
import type { ProfileService } from "@/wallet/services/profile/service"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { PxeServiceClient } from "@/wallet/services/pxe/client"
import type { TokenBalanceService } from "@/wallet/services/token-balance/service"
import { TOKEN_BALANCE_SERVICE_NAME } from "@/wallet/services/token-balance/spec"
import type { TokenService } from "@/wallet/services/token/service"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import type { TransactionService } from "@/wallet/services/transaction/service"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import type { UiPreferenceService } from "@/wallet/services/ui-preference/service"
import { UI_PREFERENCE_SERVICE_NAME } from "@/wallet/services/ui-preference/spec"
import { purgeSealedRowsOf } from "@/wallet/storage/sealed-roots"
import type { ProfileDeletionDelegate, ProfileDeletionRows, ProfileDeletionSnapshot } from "./types"

export const PROFILE_DELETION_COORDINATOR_NAME = "profile-deletion-coordinator"
export type { ProfileDeletionDelegate, ProfileDeletionRows, ProfileDeletionSnapshot } from "./types"

/**
 * ProfileDeletionCoordinator — the awaited, idempotent purge of EVERY
 * profile-bearing root. Started LAST (declares dependencies on all
 * the services it drives), then registers itself as ProfileService's deletion
 * delegate. It owns no rows: ProfileService owns the tombstone lifecycle and
 * calls `snapshot`/`runFor`; the coordinator only executes the purge.
 */
export class ProfileDeletionCoordinator implements IService, ProfileDeletionDelegate {
	public static readonly name = PROFILE_DELETION_COORDINATOR_NAME
	public readonly name = PROFILE_DELETION_COORDINATOR_NAME
	public readonly dependencies = [
		PROFILE_SERVICE_NAME,
		ACCOUNT_SERVICE_NAME,
		TOKEN_SERVICE_NAME,
		NETWORK_SERVICE_NAME,
		TRANSACTION_SERVICE_NAME,
		AUTH_REGISTRY_SERVICE_NAME,
		TOKEN_BALANCE_SERVICE_NAME,
		INCOMING_TRANSFER_SERVICE_NAME,
		CONTACT_SERVICE_NAME,
		DAPP_SESSION_SERVICE_NAME,
		FPC_SERVICE_NAME,
		OPERATION_JOURNAL_SERVICE_NAME,
		UI_PREFERENCE_SERVICE_NAME,
	] as const

	private profiles!: ProfileService
	private accounts!: AccountService
	private tokens!: TokenService
	private networks!: NetworkService
	private txs!: TransactionService
	private auth!: AuthRegistryService
	private balances!: TokenBalanceService
	private incoming!: IncomingTransferService
	private contacts!: ContactService
	private sessions!: DappSessionService
	private fpcs!: FpcService
	private journal!: OperationJournalService
	private preferences!: UiPreferenceService
	private readonly pxe: PxeServiceClient
	/** Single-flight per profile so a resume + a live delete can't run twice. */
	private readonly inflight = new Map<string, Promise<void>>()

	public constructor(
		private readonly logger: ILogger,
		private readonly storage: StorageArea,
	) {
		this.pxe = new PxeServiceClient(logger)
	}

	public async start(services: ServiceCollection): Promise<void> {
		this.profiles = services.get(PROFILE_SERVICE_NAME)
		this.accounts = services.get(ACCOUNT_SERVICE_NAME)
		this.tokens = services.get(TOKEN_SERVICE_NAME)
		this.networks = services.get(NETWORK_SERVICE_NAME)
		this.txs = services.get(TRANSACTION_SERVICE_NAME)
		this.auth = services.get(AUTH_REGISTRY_SERVICE_NAME)
		this.balances = services.get(TOKEN_BALANCE_SERVICE_NAME)
		this.incoming = services.get(INCOMING_TRANSFER_SERVICE_NAME)
		this.contacts = services.get(CONTACT_SERVICE_NAME)
		this.sessions = services.get(DAPP_SESSION_SERVICE_NAME)
		this.fpcs = services.get(FPC_SERVICE_NAME)
		this.journal = services.get(OPERATION_JOURNAL_SERVICE_NAME)
		this.preferences = services.get(UI_PREFERENCE_SERVICE_NAME)
		this.profiles.setDeletionDelegate(this)
	}

	/** Lock-free profileId reads only (safe under ProfileService's facade lock).
	 *  The typed reads are codec-filtered, so a MALFORMED parent row's
	 *  address/token id would be omitted and its dependent tx/authwit/balance
	 *  rows would survive the cascade — the raw harvests close that gap. */
	public async snapshot(profileId: string): Promise<ProfileDeletionRows> {
		const [accounts, tokens, networks, rawAddresses, rawTokenIds] = await Promise.all([
			this.accounts.getAccountsRaw(profileId),
			this.tokens.getTokensRaw(profileId),
			this.networks.getNetworksRaw(profileId),
			this.accounts.rawAddressesForProfile(profileId),
			this.tokens.rawTokenIdsForProfile(profileId),
		])
		return {
			addresses: [...new Set([...accounts.map((a) => a.address), ...rawAddresses])],
			tokenIds: [...new Set([...tokens.map((t) => t.id), ...rawTokenIds])],
			networkIds: networks.map((n) => n.id),
		}
	}

	public runFor(profileId: string, snapshot: ProfileDeletionSnapshot): Promise<void> {
		const existing = this.inflight.get(profileId)
		if (existing) return existing
		const p = this.purge(profileId, snapshot).finally(() => this.inflight.delete(profileId))
		this.inflight.set(profileId, p)
		return p
	}

	/**
	 * Awaited, fail-fast, idempotent. ORDER matters: the address-derived purges
	 * (tx/auth/balance) run BEFORE the network tail, so the tail's re-emitted
	 * `onAccountDeleted`/`onTokenDeleted` find their rows already gone (harmless
	 * no-op). Each step is idempotent (delete-of-gone is a no-op), so a resumed or
	 * re-run purge converges. Any throw propagates → the caller keeps the tombstone.
	 */
	private async purge(profileId: string, s: ProfileDeletionSnapshot): Promise<void> {
		// Scoped to the profile being deleted: another profile can share these
		// addresses, and its history must survive.
		await this.txs.purgeForAccounts(s.addresses, profileId)
		await this.auth.purgeForProfile(profileId)
		await this.balances.purgeForTokens(s.tokenIds, profileId)
		await this.incoming.clearProfile(profileId)
		await this.contacts.purgeForProfile(profileId)
		await this.sessions.purgeForProfile(profileId)
		await this.fpcs.purgeForProfile(profileId)
		await this.journal.purgeForProfile(profileId)
		await this.accounts.purgeForProfile(profileId)
		await this.tokens.purgeForProfile(profileId)
		await this.networks.purgeForProfile(profileId)
		// Another profile may overwrite the device's one selection row at any moment, and the sweep's
		// read-then-remove would take that write: the row leaves under the lock its writers hold.
		await this.preferences.purgeForProfile(profileId)
		// The typed purges above ran with the row keys, so they could read the rows they purge
		// and clear what those rows armed. Dropped next, so no sealed write for the profile can
		// land behind the keyless sweep, which removes every row naming it, opened or not.
		this.profiles.dropRowKeys(profileId)
		await purgeSealedRowsOf(this.storage, profileId)
		await this.storage.remove(profileUiKeys(profileId))
		await this.pxe.clearProfileState(profileId, s.pxeGeneration)
	}

	/** Resume any tombstoned deletion after a restart. Called AFTER `services.start()`
	 *  so it never blocks unrelated startup. Delegates to ProfileService (which owns
	 *  the tombstone lifecycle); invalid tombstones stay reserved ("deletion pending"). */
	public async resumePending(bootCutoff?: number): Promise<void> {
		await this.profiles.resumePendingDeletions(bootCutoff)
	}
}
