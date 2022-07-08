import { Keypair, PublicKey, SendOptions } from '@solana/web3.js';
import { AverClient } from './aver-client';
import { FeeTier } from './types';
export declare class UserHostLifetime {
    private _pubkey;
    private _userHostLifetimeState;
    private _averClient;
    private constructor();
    /**
     * Load the User Host Lifetime Account
     *
     * @param averClient
     * @param pubkey
     *
     * @returns {Promise<UserHostLifetime>}
     */
    static load(averClient: AverClient, pubkey: PublicKey): Promise<UserHostLifetime>;
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
    static makeCreateUserHostLifetimeInstruction(averClient: AverClient, userQuoteTokenAta: PublicKey, owner?: PublicKey, host?: PublicKey, referrer?: PublicKey, programId?: PublicKey): Promise<import("@solana/web3.js").TransactionInstruction>;
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
    static createUserHostLifetime(averClient: AverClient, owner: Keypair, userQuoteTokenAta: PublicKey, sendOptions?: SendOptions, manualMaxRetry?: number, host?: PublicKey, referrer?: PublicKey, programId?: PublicKey): Promise<string>;
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
    static getOrCreateUserHostLifetime(averClient: AverClient, owner: Keypair, sendOptions?: SendOptions, quoteTokenMint?: PublicKey, host?: PublicKey, referrer?: PublicKey, programId?: PublicKey): Promise<UserHostLifetime>;
    private static parseHostState;
    /**
     * Derive the User Host Lifetime Public Key based on the owner, host and program
     *
     * @param owner
     * @param host
     * @param programId
     *
     * @returns {Promise<PublicKey>}
     */
    static derivePubkeyAndBump(owner: PublicKey, host: PublicKey, programId?: PublicKey): Promise<[PublicKey, number]>;
    get pubkey(): PublicKey;
    get user(): PublicKey;
    get host(): PublicKey;
    get userQuoteTokenAta(): PublicKey;
    get referrer(): PublicKey | undefined;
    get referrerRevenueShareUncollected(): BN;
    get referralRevenueShareTotalGenerated(): BN;
    get referrerFeeRateBps(): BN;
    get lastFeeTierCheck(): FeeTier;
    get isSelfExcluded(): boolean | undefined;
    get creationDate(): Date;
    get lastBalanceUpdate(): Date;
    get totalMarketsTraded(): BN;
    get totalQuoteVolumeTraded(): BN;
    get totalBaseVolumeTraded(): BN;
    get totalFeesPaid(): BN;
    get cumulativePnl(): BN;
    get cumulativeInvest(): BN;
    get displayName(): string | undefined;
    get nftPfp(): PublicKey | undefined;
    /**
     * Get the Fee Tier Position
     *
     * @returns
     */
    getFeeTierPosition(): 0 | 1 | 2 | 3 | 4 | 5 | 6;
}
