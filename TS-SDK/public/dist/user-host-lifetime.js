"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserHostLifetime = void 0;
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const ids_1 = require("./ids");
const types_1 = require("./types");
const utils_1 = require("./utils");
class UserHostLifetime {
    constructor(averClient, pubkey, userHostLifetimeState) {
        this._averClient = averClient;
        this._pubkey = pubkey;
        this._userHostLifetimeState = userHostLifetimeState;
    }
    /**
     * Load the User Host Lifetime Account
     *
     * @param averClient
     * @param pubkey
     *
     * @returns {Promise<UserHostLifetime>}
     */
    static async load(averClient, pubkey) {
        const program = averClient.program;
        const userHostLifetimeResult = await program.account["userHostLifetime"].fetch(pubkey.toBase58());
        const userHostLifetimeState = UserHostLifetime.parseHostState(userHostLifetimeResult);
        return new UserHostLifetime(averClient, pubkey, userHostLifetimeState);
    }
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
    static async makeCreateUserHostLifetimeInstruction(averClient, userQuoteTokenAta, owner, host = ids_1.AVER_HOST_ACCOUNT, referrer = web3_js_1.SystemProgram.programId, programId = ids_1.AVER_PROGRAM_ID) {
        const program = averClient.program;
        const userHostLifetimeOwner = owner || averClient.owner;
        const [userHostLifetime, bump] = await UserHostLifetime.derivePubkeyAndBump(userHostLifetimeOwner, host, programId);
        const getBestDiscountTokenAccount = await (0, utils_1.getBestDiscountToken)(averClient, userHostLifetimeOwner);
        const discountTokenAccount = {
            isSigner: false,
            isWritable: false,
            pubkey: getBestDiscountTokenAccount,
        };
        const referrerAccount = {
            isSigner: false,
            isWritable: true,
            pubkey: referrer,
        };
        return program.instruction["initUserHostLifetime"](bump, {
            accounts: {
                user: userHostLifetimeOwner,
                userHostLifetime: userHostLifetime,
                userQuoteTokenAta: userQuoteTokenAta,
                host: host,
                systemProgram: web3_js_1.SystemProgram.programId,
            },
            remainingAccounts: [discountTokenAccount, referrerAccount],
        });
    }
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
    static async createUserHostLifetime(averClient, owner, userQuoteTokenAta, sendOptions, manualMaxRetry, host = ids_1.AVER_HOST_ACCOUNT, referrer = web3_js_1.SystemProgram.programId, programId = ids_1.AVER_PROGRAM_ID) {
        const ix = await UserHostLifetime.makeCreateUserHostLifetimeInstruction(averClient, userQuoteTokenAta, owner.publicKey, host, referrer, programId);
        return (0, utils_1.signAndSendTransactionInstructions)(averClient, [], owner, [ix], sendOptions, manualMaxRetry);
    }
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
    static async getOrCreateUserHostLifetime(averClient, owner, sendOptions, quoteTokenMint = averClient.quoteTokenMint, host = ids_1.AVER_HOST_ACCOUNT, referrer = web3_js_1.SystemProgram.programId, programId = ids_1.AVER_PROGRAM_ID) {
        const userHostLifetime = (await UserHostLifetime.derivePubkeyAndBump(owner.publicKey, host, programId))[0];
        // check if account exists first, and if so return it
        const userHostLifetimeResult = await averClient.program.account["userHostLifetime"].fetchNullable(userHostLifetime);
        if (userHostLifetimeResult) {
            const userHostLifetimeState = UserHostLifetime.parseHostState(userHostLifetimeResult);
            return new UserHostLifetime(averClient, userHostLifetime, userHostLifetimeState);
        }
        // otherwise create one and load and return it
        const ata = (await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(averClient.connection, owner, quoteTokenMint, owner.publicKey, undefined)).address;
        const sig = await UserHostLifetime.createUserHostLifetime(averClient, owner, ata, sendOptions, undefined, host, referrer, programId);
        await averClient.connection.confirmTransaction(sig, sendOptions === null || sendOptions === void 0 ? void 0 : sendOptions.preflightCommitment);
        return (await UserHostLifetime.load(averClient, userHostLifetime));
    }
    static parseHostState(hostResult) {
        return hostResult;
    }
    /**
     * Derive the User Host Lifetime Public Key based on the owner, host and program
     *
     * @param owner
     * @param host
     * @param programId
     *
     * @returns {Promise<PublicKey>}
     */
    static async derivePubkeyAndBump(owner, host, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([
            Buffer.from("user-host-lifetime", "utf-8"),
            owner.toBuffer(),
            host.toBuffer(),
        ], programId);
    }
    get pubkey() {
        return this._pubkey;
    }
    get user() {
        return this._userHostLifetimeState.user;
    }
    get host() {
        return this._userHostLifetimeState.host;
    }
    get userQuoteTokenAta() {
        return this._userHostLifetimeState.userQuoteTokenAta;
    }
    get referrer() {
        return this._userHostLifetimeState.referrer;
    }
    get referrerRevenueShareUncollected() {
        return this._userHostLifetimeState.referrerRevenueShareUncollected;
    }
    get referralRevenueShareTotalGenerated() {
        return this._userHostLifetimeState.referralRevenueShareTotalGenerated;
    }
    get referrerFeeRateBps() {
        return this._userHostLifetimeState.referrerFeeRateBps;
    }
    get lastFeeTierCheck() {
        return this._userHostLifetimeState.lastFeeTierCheck;
    }
    get isSelfExcluded() {
        return this._userHostLifetimeState.isSelfExcluded;
    }
    get selfExclusionDate() {
        return this._userHostLifetimeState.isSelfExcludedUntil
            ? new Date(this._userHostLifetimeState.isSelfExcludedUntil.toNumber() * 1000)
            : undefined;
    }
    get creationDate() {
        return new Date(this._userHostLifetimeState.creationDate.toNumber() * 1000);
    }
    get lastBalanceUpdate() {
        return new Date(this._userHostLifetimeState.lastBalanceUpdate.toNumber() * 1000);
    }
    get totalMarketsTraded() {
        return this._userHostLifetimeState.totalMarketsTraded;
    }
    get totalQuoteVolumeTraded() {
        return this._userHostLifetimeState.totalQuoteVolumeTraded;
    }
    get totalBaseVolumeTraded() {
        return this._userHostLifetimeState.totalBaseVolumeTraded;
    }
    get totalFeesPaid() {
        return this._userHostLifetimeState.totalFeesPaid;
    }
    get cumulativePnl() {
        return this._userHostLifetimeState.cumulativePnl;
    }
    get cumulativeInvest() {
        return this._userHostLifetimeState.cumulativeInvest;
    }
    get displayName() {
        return this._userHostLifetimeState.displayName;
    }
    get nftPfp() {
        return this._userHostLifetimeState.nftPfp;
    }
    /**
     * Get the Fee Tier Position
     *
     * @returns
     */
    getFeeTierPosition() {
        switch (this.lastFeeTierCheck) {
            case types_1.FeeTier.Base:
                return 0;
            case types_1.FeeTier.Aver1:
                return 1;
            case types_1.FeeTier.Aver2:
                return 2;
            case types_1.FeeTier.Aver3:
                return 3;
            case types_1.FeeTier.Aver4:
                return 4;
            case types_1.FeeTier.Aver5:
                return 5;
            case types_1.FeeTier.Free:
                return 6;
            default:
                return 0;
        }
    }
}
exports.UserHostLifetime = UserHostLifetime;
//# sourceMappingURL=user-host-lifetime.js.map