import { Idl, IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl"
import {
  IdlTypes,
  TypeDef,
} from "@project-serum/anchor/dist/cjs/program/namespace/types"
import { Keypair, PublicKey, SendOptions, SystemProgram } from "@solana/web3.js"
import { AverClient } from "../../public/src/aver-client"
import { AVER_PROGRAM_ID } from "../../public/src/ids"
import { HostState } from "../../public/src/types"
import { signAndSendTransactionInstructions } from "../../public/src/utils"
import BN from "bn.js"

export class Host {
  private _pubkey: PublicKey

  private _hostState: HostState

  private constructor(pubkey: PublicKey, hostState: HostState) {
    this._pubkey = pubkey
    this._hostState = hostState
  }

  /**
   * Load the host
   *
   * @param {AverClient} averClient The aver client instance
   * @param {PublicKey} pubkey The hosts pubkey
   *
   * @returns {Host}
   */
  static async load(averClient: AverClient, pubkey: PublicKey) {
    const program = averClient.program
    const hostResult = await program.account["host"].fetch(pubkey.toBase58())
    const hostState = Host.parseHostState(hostResult)

    return new Host(pubkey, hostState)
  }

  /**
   * Function to format the instruction to create a host account
   *
   * @param {AverClient} averClient The aver client instance
   * @param {PublicKey} owner The host owner
   * @param {PublicKey} feePayer The fee payer
   * @param {BN} referrerFeeRateOfferedBps Referrer fee rate
   * @param {PublicKey} programId The program Id
   *
   * @returns {Promise<TransactionInstruction>}
   */
  static async makeCreateHostAccountInstruction(
    averClient: AverClient,
    owner?: PublicKey,
    feePayer?: PublicKey,
    referrerFeeRateOfferedBps: BN = new BN(0),
    programId = AVER_PROGRAM_ID
  ) {
    const program = averClient.program
    const hostOwner = owner || averClient.owner
    const hostFeePayer = feePayer || hostOwner
    const [hostPubkey, bump] = await Host.derivePubkeyAndBump(
      hostOwner,
      programId
    )

    return program.instruction["initHost"](referrerFeeRateOfferedBps, bump, {
      accounts: {
        payer: hostFeePayer,
        owner: hostOwner,
        host: hostPubkey,
        systemProgram: SystemProgram.programId,
      },
    })
  }

  /**
   * Signs and sends the instruction to create a host account
   *
   * @param {AverClient} averClient The aver client instance
   * @param {PublicKey} owner The host owner
   * @param {PublicKey} feePayer The fee payer
   * @param {BN} referrerFeeRateOfferedBps Referrer fee rate
   * @param {SendOptions} sendOptions Options for sending the transaction
   * @param {number} manualMaxRetry The number of times to retry the transaction before failure
   * @param {PublicKey} programId The program Id
   *
   * @returns {Promise<string>}
   */
  static async createHostAccount(
    averClient: AverClient,
    owner: Keypair = averClient.keypair,
    feePayer: Keypair,
    referrerFeeRateOfferedBps: BN = new BN(0),
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    programId = AVER_PROGRAM_ID
  ) {
    const ix = await Host.makeCreateHostAccountInstruction(
      averClient,
      owner.publicKey,
      feePayer.publicKey,
      referrerFeeRateOfferedBps,
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

  private static parseHostState(
    hostResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>
  ): HostState {
    return hostResult as HostState
  }

  /**
   * Derive the host public key based on the owner and the program
   *
   * @param {PublicKey} owner The host owner
   * @param {PublicKey} programId The program Id
   *
   * @returns {PublicKey}
   */
  static async derivePubkeyAndBump(
    owner: PublicKey,
    programId = AVER_PROGRAM_ID
  ) {
    return PublicKey.findProgramAddress(
      [Buffer.from("host", "utf-8"), owner.toBuffer()],
      programId
    )
  }

  // TODO
  makeCollectRevenueShareInstruction() {}

  // TODO
  async collectRevenueShare() {}

  get pubkey() {
    return this._pubkey
  }

  get owner() {
    return this._hostState.owner
  }

  get creationDate() {
    return new Date(this._hostState.creationDate.toNumber() * 1000)
  }

  get lastWithdrawal() {
    return new Date(this._hostState.lastWithdrawal.toNumber() * 1000)
  }

  get lastBalanceUpdate() {
    return new Date(this._hostState.lastBalanceUpdate.toNumber() * 1000)
  }

  get hostRevenueShareUncollected() {
    return this._hostState.hostRevenueShareUncollected
  }

  get hostRevenueShareCollected() {
    return this._hostState.hostRevenueShareCollected
  }

  get hostFeeRateBps() {
    return this._hostState.hostFeeRateBps
  }

  get referrerFeeRateOfferedBps() {
    return this._hostState.referrerFeeRateOfferedBps
  }

  get lastReferrerTermsChange() {
    return this._hostState.lastReferrerTermsChange
  }
}
