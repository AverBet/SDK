import { Idl, IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl"
import {
  IdlTypes,
  TypeDef,
} from "@project-serum/anchor/dist/cjs/program/namespace/types"
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token"
import {
  AccountMeta,
  Keypair,
  PublicKey,
  SendOptions,
  SystemProgram,
} from "@solana/web3.js"
import { AverClient } from "./aver-client"
import { AVER_PROGRAM_ID, AVER_HOST_ACCOUNT } from "./ids"
import { FeeTier, UserHostLifetimeState } from "./types"
import {
  getBestDiscountToken,
  signAndSendTransactionInstructions,
} from "./utils"

export class UserHostLifetime {
  private _pubkey: PublicKey

  private _userHostLifetimeState: UserHostLifetimeState

  private _averClient: AverClient

  constructor(
    averClient: AverClient,
    pubkey: PublicKey,
    userHostLifetimeState: UserHostLifetimeState
  ) {
    this._averClient = averClient
    this._pubkey = pubkey
    this._userHostLifetimeState = userHostLifetimeState
  }

  /**
   * Load the User Host Lifetime Account
   *
   * @param averClient
   * @param pubkey
   *
   * @returns {Promise<UserHostLifetime>}
   */
  static async load(averClient: AverClient, pubkey: PublicKey) {
    const program = averClient.program
    const userHostLifetimeResult = await program.account[
      "userHostLifetime"
    ].fetch(pubkey.toBase58())
    const userHostLifetimeState = UserHostLifetime.parseHostState(
      userHostLifetimeResult
    )

    return new UserHostLifetime(averClient, pubkey, userHostLifetimeState)
  }

  /**
   * Load the User Host Lifetime Account
   *
   * @param averClient
   * @param pubkeys
   *
   * @returns {Promise<UserHostLifetime[]>}
   */
  static async loadMultiple(averClient: AverClient, pubkeys: PublicKey[]) {
    const program = averClient.program
    const userHostLifetimeResult = await program.account[
      "userHostLifetime"
    ].fetchMultiple(pubkeys.map((p) => p.toBase58()))

    const userHostLifetimeStates = userHostLifetimeResult.map((r) =>
      r ? UserHostLifetime.parseHostState(r) : null
    )

    return userHostLifetimeStates.map((s, i) => {
      if (!s) throw new Error("User Host Lifetime account is null")
      return new UserHostLifetime(averClient, pubkeys[i], s)
    })
  }

  /**
   * Formats the instruction to create the User Host Lifetime Account
   *
   * @param averClient
   * @param userQuoteTokenAta
   * @param owner
   * @param host
   * @param referrer
   * @param programId
   *
   * @returns {Promise<UserHostLifetime>}
   */
  static async makeCreateUserHostLifetimeInstruction(
    averClient: AverClient,
    userQuoteTokenAta: PublicKey,
    owner?: PublicKey,
    host: PublicKey = AVER_HOST_ACCOUNT,
    referrer: PublicKey = SystemProgram.programId,
    programId = AVER_PROGRAM_ID
  ) {
    const program = averClient.program
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

    return program.instruction["initUserHostLifetime"](bump, {
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
   * Create the User Host Lifetime Account
   *
   * @param averClient
   * @param owner
   * @param userQuoteTokenAta
   * @param sendOptions
   * @param manualMaxRetry
   * @param host
   * @param referrer
   * @param programId
   *
   * @returns {Promise<UserHostLifetime>}
   */
  static async createUserHostLifetime(
    averClient: AverClient,
    owner: Keypair = averClient.keypair,
    userQuoteTokenAta: PublicKey,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    host: PublicKey = AVER_HOST_ACCOUNT,
    referrer: PublicKey = SystemProgram.programId,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
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
   * Gets the User Host Lifetime account if present, or creates one if not
   *
   * @param averClient
   * @param owner
   * @param sendOptions
   * @param quoteTokenMint
   * @param host
   * @param referrer
   * @param programId
   *
   * @returns {Promise<UserHostLifetime>}
   */
  static async getOrCreateUserHostLifetime(
    averClient: AverClient,
    owner: Keypair = averClient.keypair,
    sendOptions?: SendOptions,
    quoteTokenMint: PublicKey = averClient.quoteTokenMint,
    host: PublicKey = AVER_HOST_ACCOUNT,
    referrer: PublicKey = SystemProgram.programId,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    const userHostLifetime = (
      await UserHostLifetime.derivePubkeyAndBump(
        owner.publicKey,
        host,
        programId
      )
    )[0]

    // check if account exists first, and if so return it
    const userHostLifetimeResult = await averClient.program.account[
      "userHostLifetime"
    ].fetchNullable(userHostLifetime)

    if (userHostLifetimeResult) {
      const userHostLifetimeState = UserHostLifetime.parseHostState(
        userHostLifetimeResult
      )
      return new UserHostLifetime(
        averClient,
        userHostLifetime,
        userHostLifetimeState
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
   * Derive the User Host Lifetime Public Key based on the owner, host and program
   *
   * @param owner
   * @param host
   * @param programId
   *
   * @returns {Promise<PublicKey>}
   */
  static async derivePubkeyAndBump(
    owner: PublicKey,
    host: PublicKey,
    programId = AVER_PROGRAM_ID
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

  /**
   * Get the Fee Tier Position
   *
   * @returns
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
