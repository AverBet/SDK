import { Program } from "@project-serum/anchor"
import { Idl, IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl"
import {
  IdlTypes,
  TypeDef,
} from "@project-serum/anchor/dist/cjs/program/namespace/types"
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token"
import {
  AccountInfo,
  AccountMeta,
  Keypair,
  PublicKey,
  SendOptions,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js"
import { AverClient } from "./aver-client"
import { AVER_PROGRAM_IDS, getAverHostAccount } from "./ids"
import { AccountType, FeeTier, UserHostLifetimeState } from "./types"
import {
  chunkAndFetchMultiple,
  getBestDiscountToken,
  getVersionOfAccountTypeInProgram,
  parseWithVersion,
  signAndSendTransactionInstructions,
} from "./utils"

export class UserHostLifetime {
  /**
   * User data and statistics for a particular host
   *
   * Contains aggregated lifetime data on a user's trades for a particular host
   */

  /**
   * @private
   * UserHostLifetime public key
   */
  private _pubkey: PublicKey

  /**
   * @private
   * UserHostLifetimeState object
   */
  private _userHostLifetimeState: UserHostLifetimeState

  /**
   * @private
   * AverClient object
   */
  private _averClient: AverClient

  /**
   * @private
   * Program ID of the UHL
   */
  private _programId: PublicKey

  /**
   * Initialise an UserHostLifetime object. Do not use this function; use load() instead
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey} pubkey - UserHostLifetime public key
   * @param {UserHostLifetimeState} userHostLifetimeState - UserHostLifetimeState public key
   * @param {PublicKey} programId - Program ID of the UHL
   */
  constructor(
    averClient: AverClient,
    pubkey: PublicKey,
    userHostLifetimeState: UserHostLifetimeState,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    this._averClient = averClient
    this._pubkey = pubkey
    this._userHostLifetimeState = userHostLifetimeState
    this._programId = programId
  }

  /**
   * Initialises an UserHostLifetime Account (UHLA) object.
   *
   * A UHLA is an account which is initialized when a wallet interacts with Aver via a
   * particular Host for the first time. It is used to store values related to
   * a wallet's interactions with Aver Markets via this Host. It is required to be
   * initialized before a wallet can interact with any Markets via a given Host.
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey} pubkey - UserHostLifetime public key
   *
   * @returns {Promise<UserHostLifetime>} UserHostLifetime object
   */
  static async load(averClient: AverClient, pubkey: PublicKey) {
    return (await UserHostLifetime.loadMultiple(averClient, [pubkey]))[0]
  }

  /**
   * Initialised multiple UserHostLifetime objects
   *
   * A UHLA is an account which is initialized when a wallet interacts with Aver via a
   * particular Host for the first time. It is used to store values related to
   * a wallet's interactions with Aver Markets via this Host. It is required to be
   * initialized before a wallet can interact with any Markets via a given Host.
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey[]} pubkeys - UserHostLifetime public keys
   *
   * @returns {Promise<UserHostLifetime[] | undefined>} UserHostLifetime objects
   */
  static async loadMultiple(averClient: AverClient, pubkeys: PublicKey[]) {
    const program = averClient.programs[0]
    const uhld = await chunkAndFetchMultiple(averClient.connection, pubkeys)
    const programs = await Promise.all(
      uhld.map((d) => averClient.getProgramFromProgramId(d?.owner))
    )

    const userHostLifetimeStates =
      UserHostLifetime.deserializeMultipleUserHostLifetimesData(
        uhld,
        programs
      ).map((r) => (r ? UserHostLifetime.parseHostState(r) : null))

    return userHostLifetimeStates.map((s, i) => {
      if (!s) return undefined
      return new UserHostLifetime(averClient, pubkeys[i], s, program.programId)
    })
  }

  /**
   * Parses onchain data for multiple UserMarketState objects
   *
   * @param {AverClient} averClient - AverClient object
   * @param {AccountInfo<Buffer | null>[]} userMarketStoresData - Raw bytes coming from onchain
   *
   * @returns {(UserMarketState | null)[]} - UserMarketState objects
   */
  static deserializeMultipleUserHostLifetimesData(
    userHostLifetimeStateData: (AccountInfo<Buffer> | null)[],
    programs: Program[]
  ): (UserHostLifetimeState | null)[] {
    return userHostLifetimeStateData.map((uhld, i) =>
      uhld
        ? parseWithVersion(programs[i], AccountType.USER_HOST_LIFETIME, uhld)
        : null
    )
  }

  /**
   * Creates instruction for UserHostLifetime account creation
   *
   * Returns TransactionInstruction object only. Does not send transaction.
   *
   * @param {PublicKey} averClient - AverClient object
   * @param {PublicKey} userQuoteTokenAta - Quote token ATA public key (holds funds for this user)
   * @param {PublicKey} owner - Keypair of owner of UserHostLifetime account. Pays transaction and rent costs
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT.
   * @param {PublicKey} referrer - Referrer account public key. Defaults to SYS_PROGRAM_ID.
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   *
   * @returns {Promise<TransactionInstruction>} TransactionInstruction object
   */
  static async makeCreateUserHostLifetimeInstruction(
    averClient: AverClient,
    userQuoteTokenAta: PublicKey,
    owner?: PublicKey,
    host: PublicKey = getAverHostAccount(averClient.solanaNetwork),
    referrer: PublicKey = SystemProgram.programId,
    programId = AVER_PROGRAM_IDS[0]
  ) {
    const program = await averClient.getProgramFromProgramId(programId)
    const userHostLifetimeOwner = owner || averClient.owner
    const [userHostLifetime, bump] = await UserHostLifetime.derivePubkeyAndBump(
      userHostLifetimeOwner,
      host,
      programId
    )
    const getBestDiscountTokenAccount = await getBestDiscountToken(
      averClient,
      userHostLifetimeOwner
    )
    const discountTokenAccount = {
      isSigner: false,
      isWritable: false,
      pubkey: getBestDiscountTokenAccount,
    } as AccountMeta
    const referrerAccount = {
      isSigner: false,
      isWritable: true,
      pubkey: referrer,
    } as AccountMeta

    return program.instruction["initUserHostLifetime"]({
      accounts: {
        user: userHostLifetimeOwner,
        userHostLifetime: userHostLifetime,
        userQuoteTokenAta: userQuoteTokenAta,
        host: host,
        systemProgram: SystemProgram.programId,
      },
      remainingAccounts: [discountTokenAccount, referrerAccount],
    })
  }

  /**
   * Creates UserHostLifetime account
   *
   * Sends instructions on chain
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Keypair} owner - Keypair of owner of UserHostLifetime account. Pays transaction and rent costs
   * @param {PublicKey} userQuoteTokenAta - Quote token ATA public key (holds funds for this user)
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction
   * @param {number} manualMaxRetry - Maximum number of times to retry.
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT.
   * @param {PublicKey} referrer - Referrer account public key. Defaults to SYS_PROGRAM_ID.
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   *
   * @returns {Promise<UserHostLifetime>} Transaction signature
   */
  static async createUserHostLifetime(
    averClient: AverClient,
    owner: Keypair | undefined = averClient.keypair,
    userQuoteTokenAta: PublicKey,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    host: PublicKey = getAverHostAccount(averClient.solanaNetwork),
    referrer: PublicKey = SystemProgram.programId,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    if (!owner) throw new Error("Owner keypair not given")

    const ix = await UserHostLifetime.makeCreateUserHostLifetimeInstruction(
      averClient,
      userQuoteTokenAta,
      owner.publicKey,
      host,
      referrer,
      programId
    )

    return signAndSendTransactionInstructions(
      averClient,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Attempts to load a UserHostLifetime account and creates one if not found
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Keypair} owner - Owner of UserHostLifetime account. Pays transaction and rent costs
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction
   * @param {PublicKey} quoteTokenMint - Quote token mint public key. Defaults to Defaults to USDC token according to chosen solana network in AverClient.
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT
   * @param {PublicKey} referrer - Referrer account public key. Defaults to SYS_PROGRAM_ID
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID
   *
   * @returns {Promise<UserHostLifetime>} - UserHostLifetime object
   */
  static async getOrCreateUserHostLifetime(
    averClient: AverClient,
    owner: Keypair | undefined = averClient.keypair,
    sendOptions?: SendOptions,
    quoteTokenMint: PublicKey = averClient.quoteTokenMint,
    host: PublicKey = getAverHostAccount(averClient.solanaNetwork),
    referrer: PublicKey = SystemProgram.programId,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    if (!owner) throw new Error("Owner keypair not given")
    const userHostLifetime = (
      await UserHostLifetime.derivePubkeyAndBump(
        owner.publicKey,
        host,
        programId
      )
    )[0]

    // check if account exists first, and if so return it
    const userHostLifetimeResultUnparsed =
      await averClient.connection.getAccountInfo(userHostLifetime)

    const program = await averClient.getProgramFromProgramId(programId)

    const userHostLifetimeResult = userHostLifetimeResultUnparsed?.data
      ? parseWithVersion(
          program,
          AccountType.USER_HOST_LIFETIME,
          userHostLifetimeResultUnparsed
        )
      : null

    if (userHostLifetimeResult) {
      const userHostLifetimeState = UserHostLifetime.parseHostState(
        userHostLifetimeResult
      )
      return new UserHostLifetime(
        averClient,
        userHostLifetime,
        userHostLifetimeState,
        program.programId
      )
    }

    // otherwise create one and load and return it
    const ata = (
      await getOrCreateAssociatedTokenAccount(
        averClient.connection,
        owner,
        quoteTokenMint,
        owner.publicKey,
        undefined
      )
    ).address

    const sig = await UserHostLifetime.createUserHostLifetime(
      averClient,
      owner,
      ata,
      sendOptions,
      undefined,
      host,
      referrer,
      programId
    )

    await averClient.connection.confirmTransaction(
      sig,
      sendOptions?.preflightCommitment
    )

    return (await UserHostLifetime.load(
      averClient,
      userHostLifetime
    )) as UserHostLifetime
  }

  static parseHostState(
    hostResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>
  ): UserHostLifetimeState {
    return hostResult as UserHostLifetimeState
  }

  /**
   * Derives PDA for UserHostLifetime public key
   *
   * MarketStore account addresses are derived deterministically using the owner and host.
   *
   * @param owner - Owner of HostLifetime account
   * @param host - Public key of corresponding Host account. Defaults to AVER_HOST_ACCOUNT.
   * @param programId - Program public key. Defaults to AVER_PROGRAM_ID.
   *
   * @returns {Promise<[PublicKey, number]>} Public key and bump
   */
  static async derivePubkeyAndBump(
    owner: PublicKey,
    host: PublicKey,
    programId = AVER_PROGRAM_IDS[0]
  ) {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("user-host-lifetime", "utf-8"),
        owner.toBuffer(),
        host.toBuffer(),
      ],
      programId
    )
  }

  get pubkey() {
    return this._pubkey
  }

  get user() {
    return this._userHostLifetimeState.user
  }

  get host() {
    return this._userHostLifetimeState.host
  }

  get userQuoteTokenAta() {
    return this._userHostLifetimeState.userQuoteTokenAta
  }

  get referrer() {
    return this._userHostLifetimeState.referrer
  }

  get referrerRevenueShareUncollected() {
    return this._userHostLifetimeState.referrerRevenueShareUncollected
  }

  get referralRevenueShareTotalGenerated() {
    return this._userHostLifetimeState.referralRevenueShareTotalGenerated
  }

  get referrerFeeRateBps() {
    return this._userHostLifetimeState.referrerFeeRateBps
  }

  get lastFeeTierCheck() {
    return this._userHostLifetimeState.lastFeeTierCheck
  }

  get isSelfExcluded() {
    return this._userHostLifetimeState.isSelfExcluded
  }

  get selfExclusionDate() {
    return this._userHostLifetimeState.isSelfExcludedUntil
      ? new Date(
          this._userHostLifetimeState.isSelfExcludedUntil.toNumber() * 1000
        )
      : undefined
  }

  get creationDate() {
    return new Date(this._userHostLifetimeState.creationDate.toNumber() * 1000)
  }

  get lastBalanceUpdate() {
    return new Date(
      this._userHostLifetimeState.lastBalanceUpdate.toNumber() * 1000
    )
  }

  get totalMarketsTraded() {
    return this._userHostLifetimeState.totalMarketsTraded
  }

  get totalQuoteVolumeTraded() {
    return this._userHostLifetimeState.totalQuoteVolumeTraded
  }

  get totalBaseVolumeTraded() {
    return this._userHostLifetimeState.totalBaseVolumeTraded
  }

  get totalFeesPaid() {
    return this._userHostLifetimeState.totalFeesPaid
  }

  get cumulativePnl() {
    return this._userHostLifetimeState.cumulativePnl
  }

  get cumulativeInvest() {
    return this._userHostLifetimeState.cumulativeInvest
  }

  get displayName() {
    return this._userHostLifetimeState.displayName
  }

  get nftPfp() {
    return this._userHostLifetimeState.nftPfp
  }

  get version() {
    return this._userHostLifetimeState.version
  }

  /**
   * Function coming soon
   *
   */
  async makeUpdateUserHostLifetimeStateInstruction() {
    const program = await this._averClient.getProgramFromProgramId(
      this._programId
    )
    // TODO
    //@ts-ignore
    return new TransactionInstruction(undefined)
  }

  /**
   * Function coming soon
   *
   *
   * @param {Keypair | undefined} payer - Pays transaction fees. Defaults to AverClient wallet
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction
   * @param {number} manualMaxRetry - Max no. of times to retry a transaction incase it fails
   * @returns {Promise<string>} - Transaction Signature
   */
  async updateUserHostLifetimeState(
    payer: Keypair | undefined = this._averClient.keypair,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    if (!payer) throw new Error("Payer keypair not given")
    const ix = await this.makeUpdateUserHostLifetimeStateInstruction()

    return signAndSendTransactionInstructions(
      this._averClient,
      [],
      payer,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Returns true if UHL does not need to be updated (using update_user_host_lifetime_state)
   *
   * Returns false if update required
   *
   * @returns {Promise<boolean>} - Is update required
   */
  async checkIfUhlLatestVersion() {
    const program = await this._averClient.getProgramFromProgramId(
      this._programId
    )
    if (
      this.version <
      getVersionOfAccountTypeInProgram(AccountType.USER_HOST_LIFETIME, program)
    ) {
      console.log("UHL needs to be upgraded")
      return false
    }
    return true
  }

  /**
   * Gets user's fee tier position
   *
   * This determines the percentage fee taken by the host on winnings
   *
   * @returns {FeeTier} FeeTier for user
   */
  getFeeTierPosition() {
    switch (this.lastFeeTierCheck) {
      case FeeTier.Base:
        return 0
      case FeeTier.Aver1:
        return 1
      case FeeTier.Aver2:
        return 2
      case FeeTier.Aver3:
        return 3
      case FeeTier.Aver4:
        return 4
      case FeeTier.Aver5:
        return 5
      case FeeTier.Free:
        return 6
      default:
        return 0
    }
  }
}
