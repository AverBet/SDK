import { Keypair, PublicKey, SendOptions, TransactionInstruction } from "@solana/web3.js";
import { AverClient } from "./aver-client";
export declare class Referrer {
    private _pubkey;
    private _referrerState;
    private constructor();
    /**
     * Load the Referrer Object
     *
     * @param averClient
     * @param pubkey
     *
     * @returns {Referrer}
     */
    static load(averClient: AverClient, pubkey: PublicKey): Promise<Referrer>;
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
    static makeCreateReferrerAccountInstruction(averClient: AverClient, host: PublicKey, owner: PublicKey, feePayer: PublicKey, programId?: PublicKey): Promise<TransactionInstruction>;
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
    static createReferrerAccount(averClient: AverClient, host: PublicKey, owner: Keypair, feePayer: Keypair, sendOptions?: SendOptions, manualMaxRetry?: number, programId?: PublicKey): Promise<string>;
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
    static makeCollectRevenueShareInstruction(averClient: AverClient, referrer: PublicKey, thirdPartyTokenVault: PublicKey, thirdPartyVaultAuthority: Keypair, referrerTokenAccount: PublicKey): TransactionInstruction;
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
    static collectRevenueShare(averClient: AverClient, referrer: PublicKey, thirdPartyTokenVault: PublicKey, thirdPartyVaultAuthority: Keypair, referrerTokenAccount: PublicKey, feePayer: Keypair, sendOptions?: SendOptions, manualMaxRetry?: number): Promise<string>;
    private static parseReferrerState;
    /**
     * Derive the referrer pubkey based on the owner, host and the program
     *
     * @param owner
     * @param host
     * @param programId
     *
     * @returns {Promise<[PublicKey, number]>} The Referrer Public Key
     */
    static derivePubkeyAndBump(owner: PublicKey, host?: PublicKey, programId?: PublicKey): Promise<[PublicKey, number]>;
    get pubkey(): PublicKey;
    get host(): PublicKey;
    get creationDate(): Date;
    get lastBalanceUpdate(): Date;
    get lastWithdrawal(): Date;
    get lastReferral(): Date;
    get numberUsersReferred(): BN;
    get referrerRevenueShareCollected(): BN;
    get referrerFeeRateBps(): BN;
}
