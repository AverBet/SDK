import { Idl, IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl"
import {
  IdlTypes,
  TypeDef,
} from "@project-serum/anchor/dist/cjs/program/namespace/types"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Keypair, PublicKey, SendOptions, SystemProgram } from "@solana/web3.js"
import { AverClient } from "./aver-client"
import { AVER_HOST_ACCOUNT, AVER_PROGRAM_ID } from "./ids"
import { ReferrerState } from "./types"
import { signAndSendTransactionInstructions } from "./utils"

export class Referrer {
  private _pubkey: PublicKey

  private _referrerState: ReferrerState

  private constructor(pubkey: PublicKey, referrerState: ReferrerState) {
    this._pubkey = pubkey
    this._referrerState = referrerState
  }

  /**
   * Load the Referrer Object
   *
   * @param averClient
   * @param pubkey
   *
   * @returns {Referrer}
   */
  static async load(averClient: AverClient, pubkey: PublicKey) {
    const program = averClient.program
    const referrerResult = await program.account["referrer"].fetch(
      pubkey.toBase58()
    )
    const referrerState = Referrer.parseReferrerState(referrerResult)

    return new Referrer(pubkey, referrerState)
  }

  /**
   * Format the instruction to create a Referrer account
   *
   * @param averClient
   * @param host
   * @param owner
   * @param feePayer
   * @param programId
   *
   * @returns {Promise<TransactionInstruction>}
   */
  static async makeCreateReferrerAccountInstruction(
    averClient: AverClient,
    host: PublicKey,
    owner: PublicKey,
    feePayer: PublicKey,
    programId = AVER_PROGRAM_ID
  ) {
    const program = averClient.program
    const [referrer, bump] = await Referrer.derivePubkeyAndBump(
      owner,
      host,
      programId
    )

    return program.instruction["initReferrer"](bump, {
      accounts: {
        payer: feePayer,
        owner: owner,
        referrer: referrer,
        host: host,
        systemProgram: SystemProgram.programId,
      },
    })
  }

  /**
   * Create the Referrer Account
   *
   * @param averClient
   * @param host
   * @param owner
   * @param feePayer
   * @param sendOptions
   * @param manualMaxRetry
   * @param programId
   *
   * @returns {Promise<string>}
   */
  static async createReferrerAccount(
    averClient: AverClient,
    host: PublicKey,
    owner: Keypair = averClient.keypair,
    feePayer: Keypair,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    programId = AVER_PROGRAM_ID
  ) {
    const ix = await Referrer.makeCreateReferrerAccountInstruction(
      averClient,
      host,
      owner.publicKey,
      feePayer.publicKey,
      programId
    )

    return signAndSendTransactionInstructions(
      averClient,
      [owner, feePayer],
      feePayer,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  // TODO
  /**
   * Format the instruction to collect the revenue share
   *
   * @param averClient
   * @param referrer
   * @param thirdPartyTokenVault
   * @param thirdPartyVaultAuthority
   * @param referrerTokenAccount
   * @returns
   */
  static makeCollectRevenueShareInstruction(
    averClient: AverClient,
    referrer: PublicKey,
    thirdPartyTokenVault: PublicKey,
    thirdPartyVaultAuthority: Keypair,
    referrerTokenAccount: PublicKey
  ) {
    const program = averClient.program

    return program.instruction["referrerCollectRevenueShare"]({
      accounts: {
        referrer: referrer,
        thirdPartyTokenVault: thirdPartyTokenVault,
        thirdPartyVaultAuthority: thirdPartyVaultAuthority.publicKey,
        referrerTokenAccount: referrerTokenAccount,
        splTokenProgram: TOKEN_PROGRAM_ID,
      },
    })
  }

  // TODO
  /**
   * Collect the revenue share
   *
   * @param averClient
   * @param referrer
   * @param thirdPartyTokenVault
   * @param thirdPartyVaultAuthority
   * @param referrerTokenAccount
   * @param feePayer
   * @param sendOptions
   * @param manualMaxRetry
   *
   * @returns {Promise<string>}
   */
  static async collectRevenueShare(
    averClient: AverClient,
    referrer: PublicKey,
    thirdPartyTokenVault: PublicKey,
    thirdPartyVaultAuthority: Keypair,
    referrerTokenAccount: PublicKey,
    feePayer: Keypair,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    const ix = Referrer.makeCollectRevenueShareInstruction(
      averClient,
      referrer,
      thirdPartyTokenVault,
      thirdPartyVaultAuthority,
      referrerTokenAccount
    )

    return signAndSendTransactionInstructions(
      averClient,
      [],
      feePayer,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  private static parseReferrerState(
    referrerResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>
  ): ReferrerState {
    return referrerResult as ReferrerState
  }

  /**
   * Derive the referrer pubkey based on the owner, host and the program
   *
   * @param owner
   * @param host
   * @param programId
   *
   * @returns {Promise<[PublicKey, number]>} The Referrer Public Key
   */
  static async derivePubkeyAndBump(
    owner: PublicKey,
    host = AVER_HOST_ACCOUNT,
    programId = AVER_PROGRAM_ID
  ) {
    return PublicKey.findProgramAddress(
      [Buffer.from("referrer", "utf-8"), host.toBuffer(), owner.toBuffer()],
      programId
    )
  }

  get pubkey() {
    return this._pubkey
  }

  get host() {
    return this._referrerState.host
  }

  get creationDate() {
    return new Date(this._referrerState.creationDate.toNumber() * 1000)
  }

  get lastBalanceUpdate() {
    return new Date(this._referrerState.lastBalanceUpdate.toNumber() * 1000)
  }

  get lastWithdrawal() {
    return new Date(this._referrerState.lastWithdrawal.toNumber() * 1000)
  }

  get lastReferral() {
    return new Date(this._referrerState.lastReferral.toNumber() * 1000)
  }

  get numberUsersReferred() {
    return this._referrerState.numberUsersReferred
  }

  get referrerRevenueShareCollected() {
    return this._referrerState.referrerRevenueShareCollected
  }

  get referrerFeeRateBps() {
    return this._referrerState.referrerFeeRateBps
  }
}
