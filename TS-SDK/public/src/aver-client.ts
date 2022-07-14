import axios from "axios"
import {
  ConfirmOptions,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
} from "@solana/web3.js"
import { Program, Provider } from "@project-serum/anchor"
import {
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { AVER_PROGRAM_ID, getQuoteToken, getAverApiEndpoint } from "./ids"
import { SolanaNetwork } from "./types"
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet"
import { Wallet } from "@project-serum/anchor/dist/cjs/provider"
import { SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js"

export class AverClient {
  private _connection: Connection

  private _program: Program

  private _averApiEndpoint: string

  private _solanaNetwork: SolanaNetwork

  private _quoteTokenMint: PublicKey

  private constructor(
    program: Program,
    averApiEndpoint: string,
    solanaNetwork: SolanaNetwork
  ) {
    this._connection = program.provider.connection
    this._program = program
    this._averApiEndpoint = averApiEndpoint
    this._solanaNetwork = solanaNetwork
    this._quoteTokenMint = getQuoteToken(solanaNetwork)
  }

  /**
   * Initialises an AverClient object
   *
   * @param {Connection} connection Solana Client Object
   * @param {PublicKey | null} owner Public Key to pay transaction costs
   * @param {string} averApiEndpoint
   * @param {PublicKey} averProgramId Program public key. Defaults to AVER_PROGRAM_ID.
   * @returns {AverClient | null} The Aver Client object or null if unsuccesful
   */
  static async loadAverClient(
    connection: Connection,
    solanaNetwork: SolanaNetwork,
    owner: null | Keypair | Wallet,
    opts?: ConfirmOptions,
    averProgramId?: PublicKey
  ) {
    let wallet: Wallet
    if (owner == null) {
      // create a dummy wallet
      wallet = new NodeWallet(new Keypair())
    } else if (owner instanceof Keypair) {
      // create a node wallet with the keypair
      wallet = new NodeWallet(owner)
    } else if (owner.publicKey) {
      wallet = owner
    } else {
      wallet = new NodeWallet(new Keypair())
    }

    const provider = new Provider(
      connection,
      wallet,
      opts || {
        commitment: connection.commitment,
        preflightCommitment: connection.commitment,
      }
    )
    const averApiEndpoint = getAverApiEndpoint(solanaNetwork)
    averProgramId = averProgramId || AVER_PROGRAM_ID

    // Read the generated IDL.
    const idl = await Program.fetchIdl(averProgramId, provider)

    if (idl) {
      const program = new Program(idl, averProgramId, provider)
      return new AverClient(program, averApiEndpoint, solanaNetwork)
    }

    return null
  }

  get connection() {
    return this._connection
  }

  get program() {
    return this._program
  }

  get solanaNetwork() {
    return this._solanaNetwork
  }

  get owner() {
    return this._program.provider.wallet.publicKey
  }

  get quoteTokenMint() {
    return this._quoteTokenMint
  }

  async checkHealth() {
    const url = this._averApiEndpoint + "/health" + "?format=json"
    let averHealthResponse = await axios
      .get(url)
      .then((res) => res.status.toString().startsWith("2"))
      .catch((_e) => false)
    let solanaHealthResponse = await this.connection
      .getVersion()
      .then((res) => !!res["solana-core"])
      .catch((_e) => false)

    return {
      api: averHealthResponse,
      solana: solanaHealthResponse,
    }
  }

  /**
   * Formats the instruction to create an associated token account
   *
   * @param {PublicKey} mint Associated token account mint
   * @param {PublicKey} owner Owner of the assocaited token account
   * @param {PublicKey} payer Fee payer for creating the associated token account
   *
   * @returns {Promise<TransactionInstruction>} Instruction to create an associated token account
   */
  async createTokenAtaInstruction(
    mint: PublicKey = this.quoteTokenMint,
    owner: PublicKey = this.owner,
    payer: PublicKey = this.owner
  ) {
    const ataAddress = await getAssociatedTokenAddress(
      mint,
      owner,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    return createAssociatedTokenAccountInstruction(
      payer,
      ataAddress,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  }

  /**
   * Returns the associated token account if present, or creates one if not
   *
   * @param {PublicKey} payer Fee payer for creating the associated token account
   * @param {PublicKey} mint Associated token account mint
   * @param {PublicKey} owner Owner of the assocaited token account
   *
   * @returns {Promise<Account>} The associated token account
   */
  async getOrCreateTokenAta(
    payer: Signer,
    mint: PublicKey = this.quoteTokenMint,
    owner: PublicKey = this.owner
  ) {
    return getOrCreateAssociatedTokenAccount(
      this._connection,
      payer,
      mint,
      owner
    )
  }

  /**
   * Requests a lamport airdrop. This is only available on DevNet
   *
   * @param {number} amount The number of lamports to airdrop
   * @param {PublicKey} owner Owner of the account to be airdropeed
   *
   * @returns {Promise<string>}
   */
  async requestLamportAirdrop(
    amount: number = LAMPORTS_PER_SOL,
    owner = this.owner
  ) {
    if (this.solanaNetwork == SolanaNetwork.Mainnet) {
      throw new Error("Cannot airdrop on mainnet")
    }

    return this._connection.requestAirdrop(owner, amount)
  }

  /**
   * Requests an airdrop of a specific token, or USDC by default
   *
   * @param {number} amount The amount of the token to be airdropped
   * @param {PublicKey} mint The token mint
   * @param {PublicKey} owner The owner of the wallet to be airdropped
   *
   * @returns
   */
  async requestTokenAirdrop(
    amount: number = 1_000_000_000,
    mint: PublicKey = this.quoteTokenMint,
    owner: PublicKey = this.owner
  ) {
    if (this.solanaNetwork == SolanaNetwork.Mainnet) {
      throw new Error("Cannot airdrop on mainnet")
    }

    const url = this._averApiEndpoint + "/airdrop"

    const params = {
      wallet: owner.toBase58(),
      mint: mint,
      amount: amount,
    }

    return axios.post(url, params)
  }

  /**
   * Requests the associated token account balance
   *
   * @param {PublicKey} ata Associated token account
   *
   * @returns {Promise<RpcResponseAndContext<TokenAmount>>}
   */
  async requestAtaBalance(ata: PublicKey) {
    return await this.connection.getTokenAccountBalance(ata)
  }

  /**
   * Requests the token balance
   *
   * @param {PublicKey} mint Token mint
   * @param {PublicKey} owner Wallet owner
   *
   * @returns {Promise<RpcResponseAndContext<TokenAmount>>}
   */
  async requestTokenBalance(
    mint: PublicKey = this.quoteTokenMint,
    owner: PublicKey = this.owner
  ) {
    const ata = await getAssociatedTokenAddress(mint, owner)
    return (await this.requestAtaBalance(ata)).value
  }

  /**
   * Requests the lamport balance
   *
   * @param {PublicKey} owner The wallet owner
   *
   * @returns {Promise<number>}
   */
  async requestLamportBalance(owner: PublicKey) {
    return this.connection.getBalance(owner)
  }

  async getSystemClockDatetime() {
    const slot = await this.connection.getSlot()
    const time = await this.connection.getBlockTime(slot)
    return time ? time * 1000 : null
  }
}
