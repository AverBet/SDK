import { ConfirmOptions, Connection, Keypair, PublicKey, Signer } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { SolanaNetwork } from './types';
import { Wallet } from '@project-serum/anchor/dist/cjs/provider';
export declare class AverClient {
    private _connection;
    private _program;
    private _averApiEndpoint;
    private _solanaNetwork;
    private _quoteTokenMint;
    private constructor();
    /**
     * Initialises an AverClient object
     *
     * @param {Connection} connection Solana Client Object
     * @param {PublicKey | null} owner Public Key to pay transaction costs
     * @param {string} averApiEndpoint
     * @param {PublicKey} averProgramId Program public key. Defaults to AVER_PROGRAM_ID.
     * @returns {AverClient | null} The Aver Client object or null if unsuccesful
     */
    static loadAverClient(connection: Connection, solanaNetwork: SolanaNetwork, owner: null | Keypair | Wallet, opts?: ConfirmOptions, averProgramId?: PublicKey): Promise<AverClient | null>;
    get connection(): Connection;
    get program(): Program<import("@project-serum/anchor").Idl>;
    get solanaNetwork(): SolanaNetwork;
    get owner(): PublicKey;
    get quoteTokenMint(): PublicKey;
    checkHealth(): Promise<{
        api: boolean;
        solana: boolean;
    }>;
    /**
     * Formats the instruction to create an associated token account
     *
     * @param {PublicKey} mint Associated token account mint
     * @param {PublicKey} owner Owner of the assocaited token account
     * @param {PublicKey} payer Fee payer for creating the associated token account
     *
     * @returns {Promise<TransactionInstruction>} Instruction to create an associated token account
     */
    createTokenAtaInstruction(mint?: PublicKey, owner?: PublicKey, payer?: PublicKey): Promise<import("@solana/web3.js").TransactionInstruction>;
    /**
    * Returns the associated token account if present, or creates one if not
    *
    * @param {PublicKey} payer Fee payer for creating the associated token account
    * @param {PublicKey} mint Associated token account mint
    * @param {PublicKey} owner Owner of the assocaited token account
    *
    * @returns {Promise<Account>} The associated token account
    */
    getOrCreateTokenAta(payer: Signer, mint?: PublicKey, owner?: PublicKey): Promise<import("@solana/spl-token").Account>;
    /**
     * Requests a lamport airdrop. This is only available on DevNet
     *
     * @param {number} amount The number of lamports to airdrop
     * @param {PublicKey} owner Owner of the account to be airdropeed
     *
     * @returns {Promise<string>}
     */
    requestLamportAirdrop(amount?: number, owner?: PublicKey): Promise<string>;
    /**
     * Requests an airdrop of a specific token, or USDC by default
     *
     * @param {number} amount The amount of the token to be airdropped
     * @param {PublicKey} mint The token mint
     * @param {PublicKey} owner The owner of the wallet to be airdropped
     *
     * @returns
     */
    requestTokenAirdrop(amount?: number, mint?: PublicKey, owner?: PublicKey): Promise<import("axios").AxiosResponse<any, any>>;
    /**
    * Requests the associated token account balance
    *
    * @param {PublicKey} ata Associated token account
    *
    * @returns {Promise<RpcResponseAndContext<TokenAmount>>}
    */
    requestAtaBalance(ata: PublicKey): Promise<import("@solana/web3.js").RpcResponseAndContext<import("@solana/web3.js").TokenAmount>>;
    /**
     * Requests the token balance
     *
     * @param {PublicKey} mint Token mint
     * @param {PublicKey} owner Wallet owner
     *
     * @returns {Promise<RpcResponseAndContext<TokenAmount>>}
     */
    requestTokenBalance(mint?: PublicKey, owner?: PublicKey): Promise<import("@solana/web3.js").TokenAmount>;
    /**
     * Requests the lamport balance
     *
     * @param {PublicKey} owner The wallet owner
     *
     * @returns {Promise<number>}
     */
    requestLamportBalance(owner: PublicKey): Promise<number>;
}
