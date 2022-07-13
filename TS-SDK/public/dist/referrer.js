"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Referrer = void 0;
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const ids_1 = require("./ids");
const utils_1 = require("./utils");
class Referrer {
    constructor(pubkey, referrerState) {
        this._pubkey = pubkey;
        this._referrerState = referrerState;
    }
    /**
     * Load the Referrer Object
     *
     * @param averClient
     * @param pubkey
     *
     * @returns {Referrer}
     */
    static async load(averClient, pubkey) {
        const program = averClient.program;
        const referrerResult = await program.account['referrer'].fetch(pubkey.toBase58());
        const referrerState = Referrer.parseReferrerState(referrerResult);
        return new Referrer(pubkey, referrerState);
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
    static async makeCreateReferrerAccountInstruction(averClient, host, owner, feePayer, programId = ids_1.AVER_PROGRAM_ID) {
        const program = averClient.program;
        const [referrer, bump] = await Referrer.derivePubkeyAndBump(owner, host, programId);
        return program.instruction['initReferrer'](bump, {
            accounts: {
                payer: feePayer,
                owner: owner,
                referrer: referrer,
                host: host,
                systemProgram: web3_js_1.SystemProgram.programId,
            },
        });
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
    static async createReferrerAccount(averClient, host, owner, feePayer, sendOptions, manualMaxRetry, programId = ids_1.AVER_PROGRAM_ID) {
        const ix = await Referrer.makeCreateReferrerAccountInstruction(averClient, host, owner.publicKey, feePayer.publicKey, programId);
        return (0, utils_1.signAndSendTransactionInstructions)(averClient.connection, [owner, feePayer], feePayer, [ix], sendOptions, manualMaxRetry);
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
    static makeCollectRevenueShareInstruction(averClient, referrer, thirdPartyTokenVault, thirdPartyVaultAuthority, referrerTokenAccount) {
        const program = averClient.program;
        return program.instruction['referrerCollectRevenueShare']({
            accounts: {
                referrer: referrer,
                thirdPartyTokenVault: thirdPartyTokenVault,
                thirdPartyVaultAuthority: thirdPartyVaultAuthority.publicKey,
                referrerTokenAccount: referrerTokenAccount,
                splTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            },
        });
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
    static async collectRevenueShare(averClient, referrer, thirdPartyTokenVault, thirdPartyVaultAuthority, referrerTokenAccount, feePayer, sendOptions, manualMaxRetry) {
        const ix = Referrer.makeCollectRevenueShareInstruction(averClient, referrer, thirdPartyTokenVault, thirdPartyVaultAuthority, referrerTokenAccount);
        return (0, utils_1.signAndSendTransactionInstructions)(averClient.connection, [], feePayer, [ix], sendOptions, manualMaxRetry);
    }
    static parseReferrerState(referrerResult) {
        return referrerResult;
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
    static async derivePubkeyAndBump(owner, host = ids_1.AVER_HOST_ACCOUNT, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([Buffer.from('referrer', 'utf-8'), host.toBuffer(), owner.toBuffer()], programId);
    }
    get pubkey() {
        return this._pubkey;
    }
    get host() {
        return this._referrerState.host;
    }
    get creationDate() {
        return new Date(this._referrerState.creationDate.toNumber() * 1000);
    }
    get lastBalanceUpdate() {
        return new Date(this._referrerState.lastBalanceUpdate.toNumber() * 1000);
    }
    get lastWithdrawal() {
        return new Date(this._referrerState.lastWithdrawal.toNumber() * 1000);
    }
    get lastReferral() {
        return new Date(this._referrerState.lastReferral.toNumber() * 1000);
    }
    get numberUsersReferred() {
        return this._referrerState.numberUsersReferred;
    }
    get referrerRevenueShareCollected() {
        return this._referrerState.referrerRevenueShareCollected;
    }
    get referrerFeeRateBps() {
        return this._referrerState.referrerFeeRateBps;
    }
}
exports.Referrer = Referrer;
//# sourceMappingURL=referrer.js.map