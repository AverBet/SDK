"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Host = void 0;
const web3_js_1 = require("@solana/web3.js");
const ids_1 = require("./ids");
const utils_1 = require("./utils");
const bn_js_1 = __importDefault(require("bn.js"));
class Host {
    constructor(pubkey, hostState) {
        this._pubkey = pubkey;
        this._hostState = hostState;
    }
    /**
     * Load the host
     *
     * @param {AverClient} averClient The aver client instance
     * @param {PublicKey} pubkey The hosts pubkey
     *
     * @returns {Host}
     */
    static async load(averClient, pubkey) {
        const program = averClient.program;
        const hostResult = await program.account['host'].fetch(pubkey.toBase58());
        const hostState = Host.parseHostState(hostResult);
        return new Host(pubkey, hostState);
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
    static async makeCreateHostAccountInstruction(averClient, owner, feePayer, referrerFeeRateOfferedBps = new bn_js_1.default(0), programId = ids_1.AVER_PROGRAM_ID) {
        const program = averClient.program;
        const hostOwner = owner || averClient.owner;
        const hostFeePayer = feePayer || hostOwner;
        const [hostPubkey, bump] = await Host.derivePubkeyAndBump(hostOwner, programId);
        return program.instruction['initHost'](referrerFeeRateOfferedBps, bump, {
            accounts: {
                payer: hostFeePayer,
                owner: hostOwner,
                host: hostPubkey,
                systemProgram: web3_js_1.SystemProgram.programId,
            },
        });
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
    static async createHostAccount(averClient, owner, feePayer, referrerFeeRateOfferedBps = new bn_js_1.default(0), sendOptions, manualMaxRetry, programId = ids_1.AVER_PROGRAM_ID) {
        const ix = await Host.makeCreateHostAccountInstruction(averClient, owner.publicKey, feePayer.publicKey, referrerFeeRateOfferedBps, programId);
        return (0, utils_1.signAndSendTransactionInstructions)(averClient.connection, [owner, feePayer], feePayer, [ix], sendOptions, manualMaxRetry);
    }
    static parseHostState(hostResult) {
        return hostResult;
    }
    /**
     * Derive the host public key based on the owner and the program
     *
     * @param {PublicKey} owner The host owner
     * @param {PublicKey} programId The program Id
     *
     * @returns {PublicKey}
     */
    static async derivePubkeyAndBump(owner, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([Buffer.from('host', 'utf-8'), owner.toBuffer()], programId);
    }
    // TODO
    makeCollectRevenueShareInstruction() { }
    // TODO
    async collectRevenueShare() { }
    get pubkey() {
        return this._pubkey;
    }
    get owner() {
        return this._hostState.owner;
    }
    get creationDate() {
        return new Date(this._hostState.creationDate.toNumber() * 1000);
    }
    get lastWithdrawal() {
        return new Date(this._hostState.lastWithdrawal.toNumber() * 1000);
    }
    get lastBalanceUpdate() {
        return new Date(this._hostState.lastBalanceUpdate.toNumber() * 1000);
    }
    get hostRevenueShareUncollected() {
        return this._hostState.hostRevenueShareUncollected;
    }
    get hostRevenueShareCollected() {
        return this._hostState.hostRevenueShareCollected;
    }
    get hostFeeRateBps() {
        return this._hostState.hostFeeRateBps;
    }
    get referrerFeeRateOfferedBps() {
        return this._hostState.referrerFeeRateOfferedBps;
    }
    get lastReferrerTermsChange() {
        return this._hostState.lastReferrerTermsChange;
    }
}
exports.Host = Host;
//# sourceMappingURL=host.js.map