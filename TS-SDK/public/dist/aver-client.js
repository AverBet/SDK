"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AverClient = void 0;
const axios_1 = __importDefault(require("axios"));
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@project-serum/anchor");
const spl_token_1 = require("@solana/spl-token");
const ids_1 = require("./ids");
const types_1 = require("./types");
const nodewallet_1 = __importDefault(require("@project-serum/anchor/dist/cjs/nodewallet"));
class AverClient {
    constructor(program, averApiEndpoint, solanaNetwork) {
        this._connection = program.provider.connection;
        this._program = program;
        this._averApiEndpoint = averApiEndpoint;
        this._solanaNetwork = solanaNetwork;
        this._quoteTokenMint = (0, ids_1.getQuoteToken)(solanaNetwork);
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
    static async loadAverClient(connection, solanaNetwork, owner, opts, averProgramId) {
        let wallet;
        if (owner == null) {
            // create a dummy wallet
            wallet = new nodewallet_1.default(new web3_js_1.Keypair());
        }
        else if (owner instanceof web3_js_1.Keypair) {
            // create a node wallet with the keypair
            wallet = new nodewallet_1.default(owner);
        }
        else if (owner.publicKey) {
            wallet = owner;
        }
        else {
            wallet = new nodewallet_1.default(new web3_js_1.Keypair());
        }
        const provider = new anchor_1.Provider(connection, wallet, opts || {
            commitment: connection.commitment,
            preflightCommitment: connection.commitment,
        });
        const averApiEndpoint = (0, ids_1.getAverApiEndpoint)(solanaNetwork);
        averProgramId = averProgramId || ids_1.AVER_PROGRAM_ID;
        // Read the generated IDL.
        const idl = await anchor_1.Program.fetchIdl(averProgramId, provider);
        if (idl) {
            const program = new anchor_1.Program(idl, averProgramId, provider);
            return new AverClient(program, averApiEndpoint, solanaNetwork);
        }
        return null;
    }
    get connection() {
        return this._connection;
    }
    get program() {
        return this._program;
    }
    get solanaNetwork() {
        return this._solanaNetwork;
    }
    get owner() {
        return this._program.provider.wallet.publicKey;
    }
    get quoteTokenMint() {
        return this._quoteTokenMint;
    }
    async checkHealth() {
        const url = this._averApiEndpoint + '/health' + '?format=json';
        let averHealthResponse = await axios_1.default
            .get(url)
            .then((res) => res.status.toString().startsWith('2'))
            .catch((_e) => false);
        let solanaHealthResponse = await this.connection
            .getVersion()
            .then((res) => !!res['solana-core'])
            .catch((_e) => false);
        return {
            api: averHealthResponse,
            solana: solanaHealthResponse,
        };
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
    async createTokenAtaInstruction(mint = this.quoteTokenMint, owner = this.owner, payer = this.owner) {
        const ataAddress = await (0, spl_token_1.getAssociatedTokenAddress)(mint, owner, undefined, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
        return (0, spl_token_1.createAssociatedTokenAccountInstruction)(payer, ataAddress, owner, mint, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
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
    async getOrCreateTokenAta(payer, mint = this.quoteTokenMint, owner = this.owner) {
        return (0, spl_token_1.getOrCreateAssociatedTokenAccount)(this._connection, payer, mint, owner);
    }
    /**
     * Requests a lamport airdrop. This is only available on DevNet
     *
     * @param {number} amount The number of lamports to airdrop
     * @param {PublicKey} owner Owner of the account to be airdropeed
     *
     * @returns {Promise<string>}
     */
    async requestLamportAirdrop(amount = web3_js_1.LAMPORTS_PER_SOL, owner = this.owner) {
        if (this.solanaNetwork == types_1.SolanaNetwork.Mainnet) {
            throw new Error('Cannot airdrop on mainnet');
        }
        return this._connection.requestAirdrop(owner, amount);
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
    async requestTokenAirdrop(amount = 1000000000, mint = this.quoteTokenMint, owner = this.owner) {
        if (this.solanaNetwork == types_1.SolanaNetwork.Mainnet) {
            throw new Error('Cannot airdrop on mainnet');
        }
        const url = this._averApiEndpoint + '/airdrop';
        const params = {
            wallet: owner.toBase58(),
            mint: mint,
            amount: amount,
        };
        return axios_1.default.post(url, params);
    }
    /**
    * Requests the associated token account balance
    *
    * @param {PublicKey} ata Associated token account
    *
    * @returns {Promise<RpcResponseAndContext<TokenAmount>>}
    */
    async requestAtaBalance(ata) {
        return await this.connection.getTokenAccountBalance(ata);
    }
    /**
     * Requests the token balance
     *
     * @param {PublicKey} mint Token mint
     * @param {PublicKey} owner Wallet owner
     *
     * @returns {Promise<RpcResponseAndContext<TokenAmount>>}
     */
    async requestTokenBalance(mint = this.quoteTokenMint, owner = this.owner) {
        const ata = await (0, spl_token_1.getAssociatedTokenAddress)(mint, owner);
        return (await this.requestAtaBalance(ata)).value;
    }
    /**
     * Requests the lamport balance
     *
     * @param {PublicKey} owner The wallet owner
     *
     * @returns {Promise<number>}
     */
    async requestLamportBalance(owner) {
        return this.connection.getBalance(owner);
    }
}
exports.AverClient = AverClient;
//# sourceMappingURL=aver-client.js.map