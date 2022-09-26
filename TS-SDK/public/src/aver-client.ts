import axios from "axios"
import {
  ConfirmOptions,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
} from "@solana/web3.js"
import { Program, Provider, Wallet } from "@project-serum/anchor"
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet"
import {
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { AVER_PROGRAM_IDS, getQuoteToken } from "./ids"
import { SolanaNetwork } from "./types"
import { checkIdlHasSameInstructionsAsSdk } from "./checks"

export class AverClient {
  /**
   * Aver Client Class
   *
   * Use AverClient to interact with the Aver Program, Solana network and Aver API
   */

  /**
   * Solana Connection Client
   */
  private _connection: Connection

  /**
   * List of AnchorPy Programs
   */
  private _programs: Program[]

  /**
   * Provider
   */
  private _provider: Provider

  /**
   * Devnet or Mainnet - must correspond to the network provided in the connection object
   */
  private _solanaNetwork: SolanaNetwork

  /**
   * The token mint of the default quote token for markets on this network (i.e. USDC)
   */
  private _quoteTokenMint: PublicKey

   /**
   * The default payer for transactions on-chain, unless one is specified
   */
  private _keypair: Keypair

  /**
   * 
   */
  private _owner: PublicKey

  /**
   * Initialises AverClient object. Do not use this function; use AverClient.load() instead
   *
   * @param {Program} programs - List of Aver program AnchorPy
   * @param {SolanaNetwork} solanaNetwork - Solana network
   * @param {Keypair} keypair - Default keypair to use for paying transaction costs
   */
  private constructor(
    programs: Program[],
    solanaNetwork: SolanaNetwork,
    owner: PublicKey,
    keypair?: Keypair
  ) {
    this._connection = programs[0].provider.connection
    this._programs = programs
    this._provider = programs[0].provider
    this._solanaNetwork = solanaNetwork
    this._quoteTokenMint = getQuoteToken(solanaNetwork)
    this._keypair = keypair
    this._owner = owner
  }

  /**
   * Initialises an AverClient object
   *
   * @param {Connection} connection - Solana Client Object
   * @param {SolanaNetwork} solanaNetwork - Solana network
   * @param {PublicKey | null} owner - Default keypair to pay transaction costs (and rent costs) unless one is otherwise specified for a given transaction.
   * @param {ConfirmOptions} opts - Default options for sending transactions.
   * @param {PublicKey} programIds - Program public key. Defaults to AVER_PROGRAM_IDS.
   * @returns {AverClient} - The Aver Client object
   */
   static async loadAverClient(
    connection: Connection,
    solanaNetwork: SolanaNetwork = SolanaNetwork.Devnet,
    owner: null | PublicKey | Keypair,
    opts?: ConfirmOptions,
    programIds: PublicKey[] = AVER_PROGRAM_IDS
  ) {
    let wallet: NodeWallet;
    let keypair: Keypair
    let pubkey: PublicKey = null

    if (owner instanceof Keypair) {
      // create a wallet with the keypair
      wallet = new NodeWallet(owner);
      keypair = owner
      pubkey = owner.publicKey
    } else if (owner instanceof PublicKey) {
      // create a dummy wallet
      keypair = new Keypair()
      wallet = new NodeWallet(keypair);
      pubkey = owner
    } else {
      // create a dummy wallet
      keypair = new Keypair()
      wallet = new NodeWallet(keypair);
      pubkey = keypair.publicKey
    }

    const provider = new Provider(
      connection,
      wallet,
      opts || {
        commitment: connection.commitment,
        preflightCommitment: connection.commitment,
        skipPreflight: false,
      }
    );

    const programs = await Promise.all(programIds.map(programId => AverClient.loadProgram(provider, programId)))
    return new AverClient(programs, solanaNetwork, pubkey, keypair)
  }

  get connection() {
    return this._connection
  }

  get programs() {
    return this._programs
  }

  /**
   * DEPRECATE
   */
  get program() {
    return this._programs[0]
  }

  get solanaNetwork() {
    return this._solanaNetwork
  }

  get quoteTokenMint() {
    return this._quoteTokenMint
  }

  get keypair() {
    return this._keypair
  }

  get owner() {
    return this._owner
  }

  static async loadProgram(provider: Provider, programId: PublicKey) {
    const idl = await Program.fetchIdl(programId, provider)
    if (idl) {
      const program = new Program(idl, programId, provider)
      checkIdlHasSameInstructionsAsSdk(program)
      return program
    } else {
      throw new Error("Program IDL not loaded")
    }
  }

  async addProgram(programId: PublicKey){
    const program = await AverClient.loadProgram(this._provider, programId)
    this._programs.push(program)
    return program
  }

  async getProgramFromProgramId(programId: PublicKey){
    for (const program of this._programs) {
      if (program.programId.equals(programId)) {
        return program
      }
    }

    return await this.addProgram(programId)
  }

  /**
   * Formats the instruction to create an associated token account
   *
   * @param {PublicKey} mint - Associated token account mint
   * @param {PublicKey} owner - Owner of the assocaited token account
   * @param {PublicKey} payer - Fee payer for creating the associated token account
   *
   * @returns {Promise<TransactionInstruction>} - Instruction to create an associated token account
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
   * Attempts to load an Associate Token Account (ATA) or creates one if not found.
   *
   * @param {PublicKey} payer - Fee payer for creating the associated token account
   * @param {PublicKey} mint - Associated token account mint
   * @param {PublicKey} owner - Owner of the assocaited token account
   *
   * @returns {Promise<Account>} - ATA Account
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
   * Request an airdrop of lamports (SOL). This method is only supported on devnet.
   *
   * @param {number} amount - Lamports to airdrop. Note 1 lamport = 10^-9 SOL. Max of 1 SOL (10^9 lamports) applies.
   * @param {PublicKey} owner - Public key of account to be airdropped
   *
   * @returns {Promise<string>} - RPC Response Signature
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
   * Fetches the balance for an Associated Token Account (ATA).
   *
   * Note: the value returned is the integer representation of the balance, where a unit is the smallest possible increment of the token.
   * For example, USDC is a 6 decimal place token, so a value of 1,000,000 here = 1 USDC.
   *
   * @param {PublicKey} ata - ATA public key
   *
   * @returns {Promise<RpcResponseAndContext<TokenAmount>>} - Token balance
   */
  async requestAtaBalance(ata: PublicKey) {
    return await this.connection.getTokenAccountBalance(ata)
  }

  /**
   * Fetches a wallet's token balance, given the wallet's owner and the token mint's public key.
   *
   * Note: the value returned is the integer representation of the balance, where a unit is the smallest possible increment of the token.
   * For example, USDC is a 6 decimal place token, so a value of 1,000,000 here = 1 USDC.
   *
   * @param {PublicKey} mint The public key of the token mint
   * @param {PublicKey} owner The public key of the wallet
   *
   * @returns {Promise<RpcResponseAndContext<TokenAmount>>} - Token balance
   */
  async requestTokenBalance(
    mint: PublicKey = this.quoteTokenMint,
    owner: PublicKey = this.owner
  ) {
    const ata = await getAssociatedTokenAddress(mint, owner)
    return (await this.requestAtaBalance(ata))?.value
  }

  /**
   * Fetches Lamport (SOL) balance for a given wallet
   *
   * Note: the value returned is the integer representation of the balance, where a unit is one lamport (=10^-9 SOL)
   * For example, a value of 1,000,000,000 (lamports) = 1 SOL.
   *
   * @param {PublicKey} owner - The wallet owner
   *
   * @returns {Promise<number>} - Lamport balanace
   */
  async requestLamportBalance(owner: PublicKey) {
    return this.connection.getBalance(owner)
  }

  /**
   * Loads current solana system datetime
   *
   * @returns {Promise<number | null>} - Current Solana Clock time
   */
  async getSystemClockDatetime() {
    const slot = await this.connection.getSlot()
    const time = await this.connection.getBlockTime(slot)
    return time ? time * 1000 : null
  }

  /**
   * 
   * @returns DEPCREATED
   */
  async checkHealth() {
    const url = "https://dev.api.aver.exchange" + "/health" + "?format=json"
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
   * DEPCREATED
   */
  async requestTokenAirdrop(
    amount = 1_000_000_000,
    mint: PublicKey = this.quoteTokenMint,
    owner: PublicKey = this.owner
  ) {
    if (this.solanaNetwork == SolanaNetwork.Mainnet) {
      throw new Error("Cannot airdrop on mainnet")
    }

    const url = "https://dev.api.aver.exchange" + "/airdrop"

    const params = {
      wallet: owner.toBase58(),
      mint: mint,
      amount: amount,
    }

    return axios.post(url, params)
  }

}