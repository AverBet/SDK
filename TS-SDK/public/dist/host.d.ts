import { Keypair, PublicKey, SendOptions } from '@solana/web3.js';
import { AverClient } from './aver-client';
import BN from 'bn.js';
export declare class Host {
    private _pubkey;
    private _hostState;
    private constructor();
    /**
     * Load the host
     *
     * @param {AverClient} averClient The aver client instance
     * @param {PublicKey} pubkey The hosts pubkey
     *
     * @returns {Host}
     */
    static load(averClient: AverClient, pubkey: PublicKey): Promise<Host>;
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
    static makeCreateHostAccountInstruction(averClient: AverClient, owner?: PublicKey, feePayer?: PublicKey, referrerFeeRateOfferedBps?: BN, programId?: PublicKey): Promise<import("@solana/web3.js").TransactionInstruction>;
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
    static createHostAccount(averClient: AverClient, owner: Keypair, feePayer: Keypair, referrerFeeRateOfferedBps?: BN, sendOptions?: SendOptions, manualMaxRetry?: number, programId?: PublicKey): Promise<string>;
    private static parseHostState;
    /**
     * Derive the host public key based on the owner and the program
     *
     * @param {PublicKey} owner The host owner
     * @param {PublicKey} programId The program Id
     *
     * @returns {PublicKey}
     */
    static derivePubkeyAndBump(owner: PublicKey, programId?: PublicKey): Promise<[PublicKey, number]>;
    makeCollectRevenueShareInstruction(): void;
    collectRevenueShare(): Promise<void>;
    get pubkey(): PublicKey;
    get owner(): PublicKey;
    get creationDate(): Date;
    get lastWithdrawal(): Date;
    get lastBalanceUpdate(): Date;
    get hostRevenueShareUncollected(): BN;
    get hostRevenueShareCollected(): BN;
    get hostFeeRateBps(): BN;
    get referrerFeeRateOfferedBps(): BN;
    get lastReferrerTermsChange(): BN;
}
