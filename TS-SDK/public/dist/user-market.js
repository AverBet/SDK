"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserMarket = void 0;
const web3_js_1 = require("@solana/web3.js");
const aaob_1 = require("@bonfida/aaob");
const spl_token_1 = require("@solana/spl-token");
const types_1 = require("./types");
const utils_1 = require("./utils");
const market_1 = require("./market");
const bn_js_1 = __importDefault(require("bn.js"));
const ids_1 = require("./ids");
const user_host_lifetime_1 = require("./user-host-lifetime");
const lodash_1 = require("lodash");
class UserMarket {
    constructor(averClient, pubkey, userMarketState, market, userBalanceState) {
        this._userMarketState = userMarketState;
        this._pubkey = pubkey;
        this._averClient = averClient;
        this._market = market;
        this._userBalanceState = userBalanceState;
    }
    /**
     * Load the User Market object
     *
     * @param averClient
     * @param market
     * @param owner
     * @param host
     * @param programId
     *
     * @returns {Promise<UserMarket>}
     */
    static async load(averClient, market, owner, host = ids_1.AVER_HOST_ACCOUNT, programId = ids_1.AVER_PROGRAM_ID) {
        const umaOwner = owner || averClient.owner;
        const [uma, _bump] = await UserMarket.derivePubkeyAndBump(umaOwner, market.pubkey, host, programId);
        return UserMarket.loadByUma(averClient, uma, market);
    }
    /**
     * Load the User Market object when the Public Key is known
     *
     * @param averClient
     * @param pubkey
     * @param market
     *
     * @returns {Promise<UserMarket>}
     */
    static async loadByUma(averClient, pubkey, market) {
        const program = averClient.program;
        const userMarketResult = await program.account["userMarket"].fetch(pubkey);
        const userMarketState = UserMarket.parseUserMarketState(userMarketResult);
        const lamportBalance = await averClient.requestLamportBalance(userMarketState.user);
        const tokenBalance = await averClient.requestTokenBalance(averClient.quoteTokenMint, userMarketState.user);
        const userBalanceState = {
            lamportBalance: lamportBalance,
            tokenBalance: parseInt(tokenBalance.amount),
        };
        return new UserMarket(averClient, pubkey, userMarketState, market, userBalanceState);
    }
    /**
     * Load Multiple User Markets
     *
     * @param averClient
     * @param markets
     * @param owner
     * @param host
     * @param programId
     * @returns
     */
    static async loadMultiple(averClient, markets, owner, host = ids_1.AVER_HOST_ACCOUNT, programId = ids_1.AVER_PROGRAM_ID) {
        const umaOwner = owner || averClient.owner;
        const umasAndBumps = await Promise.all(markets.map((m) => UserMarket.derivePubkeyAndBump(umaOwner, m.pubkey, host, programId)));
        const umasPubkeys = umasAndBumps.map((u) => u[0]);
        return UserMarket.loadMultipleByUma(averClient, umasPubkeys, markets);
    }
    /**
     * Load Multiple User Markets when Public Keys are known
     *
     * @param averClient
     * @param pubkeys
     * @param markets
     * @returns
     */
    static async loadMultipleByUma(averClient, pubkeys, markets) {
        const program = averClient.program;
        const userMarketResult = await program.account["userMarket"].fetchMultiple(pubkeys);
        const userMarketStates = userMarketResult.map((umr) => umr ? UserMarket.parseUserMarketState(umr) : null);
        const userPubkeys = userMarketStates.map((umr) => (umr === null || umr === void 0 ? void 0 : umr.user) || new web3_js_1.Keypair().publicKey);
        const userBalances = (await market_1.Market.loadMultipleAccountStates(averClient, [], [], [], [], userPubkeys)).userBalanceStates;
        return userMarketStates.map((ums, i) => ums
            ? new UserMarket(averClient, pubkeys[i], ums, markets[i], userBalances[i])
            : undefined);
    }
    static parseUserMarketState(marketResult) {
        return marketResult;
    }
    /**
     * Format the instruction to create a User Market Account
     *
     * @param averClient
     * @param market
     * @param owner
     * @param host
     * @param numberOfOrders
     * @param programId
     *
     * @returns {Promise<TransactionInstruction>}
     */
    static async makeCreateUserMarketAccountInstruction(averClient, market, owner, host = ids_1.AVER_HOST_ACCOUNT, numberOfOrders = market.numberOfOutcomes * 5, programId = ids_1.AVER_PROGRAM_ID) {
        const umaOwner = owner || averClient.owner;
        const program = averClient.program;
        const [userMarket, umaBump] = await UserMarket.derivePubkeyAndBump(umaOwner, market.pubkey, host, programId);
        const [userHostLifetime, _uhlBump] = await user_host_lifetime_1.UserHostLifetime.derivePubkeyAndBump(umaOwner, host, programId);
        const getBestDiscountTokenAccount = await (0, utils_1.getBestDiscountToken)(averClient, umaOwner);
        const discountTokenAccount = {
            isSigner: false,
            isWritable: false,
            pubkey: getBestDiscountTokenAccount,
        };
        console.log("Creating a User Market");
        console.log("user:", umaOwner.toString(), "userHostLifetime:", userHostLifetime.toString(), "userMarket:", userMarket.toString(), "market:", market.pubkey.toString(), "host:", host.toString());
        return program.instruction["initUserMarket"](numberOfOrders, umaBump, {
            accounts: {
                user: umaOwner,
                userHostLifetime: userHostLifetime,
                userMarket: userMarket,
                market: market.pubkey,
                host: host,
                systemProgram: web3_js_1.SystemProgram.programId,
            },
            remainingAccounts: getBestDiscountTokenAccount.equals(web3_js_1.SystemProgram.programId)
                ? []
                : [discountTokenAccount],
        });
    }
    /**
     * Create a User Market Account
     *
     * @param averClient
     * @param market
     * @param owner
     * @param sendOptions
     * @param manualMaxRetry
     * @param host
     * @param numberOfOrders
     * @param programId
     * @returns
     */
    static async createUserMarketAccount(averClient, market, owner, sendOptions, manualMaxRetry, host = ids_1.AVER_HOST_ACCOUNT, numberOfOrders = market.numberOfOutcomes * 5, programId = ids_1.AVER_PROGRAM_ID) {
        const createUserMarketAccountIx = await this.makeCreateUserMarketAccountInstruction(averClient, market, owner.publicKey, host, numberOfOrders, programId);
        return (0, utils_1.signAndSendTransactionInstructions)(averClient, [], owner, [createUserMarketAccountIx], sendOptions, manualMaxRetry);
    }
    /**
     * Get a User Market Account, or create one if not present
     *
     * @param averClient
     * @param owner
     * @param market
     * @param sendOptions
     * @param quoteTokenMint
     * @param host
     * @param numberOfOrders
     * @param referrer
     * @param programId
     *
     * @returns {Promise<UserMarket>}
     */
    static async getOrCreateUserMarketAccount(averClient, owner, market, sendOptions, quoteTokenMint = averClient.quoteTokenMint, host = ids_1.AVER_HOST_ACCOUNT, numberOfOrders = market.numberOfOutcomes * 5, referrer = web3_js_1.SystemProgram.programId, programId = ids_1.AVER_PROGRAM_ID) {
        // check if account already exists for user
        const userMarket = (await UserMarket.derivePubkeyAndBump(owner.publicKey, market.pubkey, host, programId))[0];
        const userMarketResult = await averClient.program.account["userMarket"].fetchNullable(userMarket);
        if (userMarketResult) {
            const userMarketState = UserMarket.parseUserMarketState(userMarketResult);
            const lamportBalance = await averClient.requestLamportBalance(userMarketState.user);
            const tokenBalance = await averClient.requestTokenBalance(averClient.quoteTokenMint, userMarketState.user);
            const userBalanceState = {
                lamportBalance: lamportBalance,
                tokenBalance: parseInt(tokenBalance.amount),
            };
            return new UserMarket(averClient, userMarket, userMarketState, market, userBalanceState);
        }
        await user_host_lifetime_1.UserHostLifetime.getOrCreateUserHostLifetime(averClient, owner, sendOptions, quoteTokenMint, host, referrer, programId);
        const sig = await UserMarket.createUserMarketAccount(averClient, market, owner, sendOptions, undefined, host, numberOfOrders, programId);
        await averClient.connection.confirmTransaction(sig, sendOptions === null || sendOptions === void 0 ? void 0 : sendOptions.preflightCommitment);
        const userMarketAccount = await UserMarket.loadByUma(averClient, userMarket, market);
        return userMarketAccount;
    }
    /**
     * Desearealise multiple User Market Stores Data
     *
     * @param averClient
     * @param userMarketStoresData
     *
     * @returns {(UserMarketState | null)[]}
     */
    static deserializeMultipleUserMarketStoreData(averClient, userMarketStoresData) {
        return userMarketStoresData.map((marketStoreData) => (marketStoreData === null || marketStoreData === void 0 ? void 0 : marketStoreData.data)
            ? averClient.program.account["userMarket"].coder.accounts.decode("UserMarket", marketStoreData.data)
            : null);
    }
    /**
     * Refresh Multiple User Markets
     *
     * @param averClient
     * @param userMarkets
     *
     * @returns {Promise<(UserMarket | null)[]>}
     */
    static async refreshMultipleUserMarkets(averClient, userMarkets) {
        const markets = userMarkets.map((um) => um.market);
        const orderbookAccounts = markets
            .filter((market) => !!market.orderbookAccounts)
            .map((market) => market.orderbookAccounts);
        const multipleAccountStates = await market_1.Market.loadMultipleAccountStates(averClient, markets.map((market) => market.pubkey), markets.map((market) => market.marketStore), orderbookAccounts.flatMap((ordAcc) => ordAcc === null || ordAcc === void 0 ? void 0 : ordAcc.flatMap((acc) => [acc.bids, acc.asks])), userMarkets.map((u) => u.pubkey), userMarkets.map((u) => u.user));
        const newMarkets = market_1.Market.getMarketsFromAccountStates(averClient, markets.map((m) => m.pubkey), multipleAccountStates.marketStates, multipleAccountStates.marketStoreStates, multipleAccountStates.slabs);
        return multipleAccountStates.userMarketStates.map((userMarketState, i) => userMarketState
            ? new UserMarket(averClient, userMarkets[i].pubkey, userMarketState, newMarkets[i], multipleAccountStates.userBalanceStates[i])
            : undefined);
    }
    /**
     * Derive the User Market Pubkey based on the Owner, Market, Host and program
     *
     * @param owner
     * @param market
     * @param host
     * @param programId
     * @returns
     */
    static async derivePubkeyAndBump(owner, market, host = ids_1.AVER_HOST_ACCOUNT, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([
            Buffer.from("user-market", "utf-8"),
            owner.toBuffer(),
            market.toBuffer(),
            host.toBuffer(),
        ], programId);
    }
    get pubkey() {
        return this._pubkey;
    }
    get market() {
        return this._market;
    }
    get user() {
        return this._userMarketState.user;
    }
    get numberOfOutcomes() {
        return this._userMarketState.numberOfOutcomes;
    }
    get numberOfOrders() {
        return this._userMarketState.numberOfOrders;
    }
    get maxNumberOfOrders() {
        return this._userMarketState.maxNumberOfOrders;
    }
    get netQuoteTokensIn() {
        return this._userMarketState.netQuoteTokensIn;
    }
    get accumulatedMakerQuoteVolume() {
        return this._userMarketState.accumulatedMakerQuoteVolume;
    }
    get accumulatedMakerBaseVolume() {
        return this._userMarketState.accumulatedMakerBaseVolume;
    }
    get accumulatedTakerQuoteVolume() {
        return this._userMarketState.accumulatedTakerQuoteVolume;
    }
    get accumulatedTakerBaseVolume() {
        return this._userMarketState.accumulatedTakerBaseVolume;
    }
    get outcomePositions() {
        return this._userMarketState.outcomePositions;
    }
    get orders() {
        return this._userMarketState.orders;
    }
    get userHostLifetime() {
        return this._userMarketState.userHostLifetime;
    }
    get lamportBalance() {
        return this._userBalanceState.lamportBalance;
    }
    get lamportBalanceUi() {
        return this._userBalanceState.lamportBalance / Math.pow(10, 9);
    }
    get tokenBalance() {
        return this._userBalanceState.tokenBalance;
    }
    get tokenBalanceUi() {
        return (this._userBalanceState.tokenBalance / Math.pow(10, this.market.decimals));
    }
    /**
     * Refresh the User Market object
     */
    async refresh() {
        const refreshedUserMarket = (await UserMarket.refreshMultipleUserMarkets(this._averClient, [
            this,
        ]))[0];
        this._market = refreshedUserMarket._market;
        this._userMarketState = refreshedUserMarket._userMarketState;
    }
    /**
     * Format the instruction to place an order
     *
     * @param outcomeIndex
     * @param side
     * @param limitPrice
     * @param size
     * @param sizeFormat
     * @param orderType
     * @param selfTradeBehavior
     * @param averPreFlightCheck
     *
     * @returns {Promise<TransactionInstruction>}
     */
    async makePlaceOrderInstruction(outcomeIndex, side, limitPrice, size, sizeFormat, orderType = types_1.OrderType.Limit, selfTradeBehavior = aaob_1.SelfTradeBehavior.CancelProvide, averPreFlightCheck = false) {
        if (averPreFlightCheck) {
            this.isOrderValid(outcomeIndex, side, limitPrice, size, sizeFormat);
        }
        const sizeU64 = new bn_js_1.default(Math.floor(size * Math.pow(10, this.market.decimals)));
        const limitPriceU64 = new bn_js_1.default(Math.ceil(limitPrice * Math.pow(10, this.market.decimals)));
        // consider when binary markets where there is only one order book
        const orderbookAccountIndex = this.market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex;
        // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
        const orderbookAccount = this.market.orderbookAccounts[orderbookAccountIndex];
        const userQuoteTokenAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.market.quoteTokenMint, this.user);
        return this._averClient.program.instruction["placeOrder"]({
            size: sizeU64,
            sizeFormat,
            limitPrice: limitPriceU64,
            side: side,
            orderType: orderType,
            selfTradeBehaviour: selfTradeBehavior,
            outcomeId: outcomeIndex,
        }, {
            accounts: {
                user: this.user,
                userHostLifetime: this.userHostLifetime,
                userMarket: this.pubkey,
                userQuoteTokenAta: userQuoteTokenAta,
                market: this.market.pubkey,
                marketStore: this.market.marketStore,
                quoteVault: this.market.quoteVault,
                orderbook: orderbookAccount.orderbook,
                bids: orderbookAccount.bids,
                asks: orderbookAccount.asks,
                eventQueue: orderbookAccount.eventQueue,
                splTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
            },
        });
    }
    // need a static method to use for first place order
    /**
     *
     * @param outcomeIndex
     * @param side
     * @param limitPrice
     * @param size
     * @param sizeFormat
     * @param market
     * @param user
     * @param averClient
     * @param userHostLifetime
     * @param umaPubkey
     * @param orderType
     * @param selfTradeBehavior
     * @returns
     */
    static async makePlaceOrderInstruction(outcomeIndex, side, limitPrice, size, sizeFormat, market, user, averClient, userHostLifetime, umaPubkey, orderType = types_1.OrderType.Limit, selfTradeBehavior = aaob_1.SelfTradeBehavior.CancelProvide) {
        const sizeU64 = new bn_js_1.default(Math.floor(size * Math.pow(10, market.decimals)));
        const limitPriceU64 = new bn_js_1.default(Math.ceil(limitPrice * Math.pow(10, market.decimals)));
        // consider when binary markets where there is only one order book
        const orderbookAccountIndex = market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex;
        // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
        const orderbookAccount = market.orderbookAccounts[orderbookAccountIndex];
        const userQuoteTokenAta = await (0, spl_token_1.getAssociatedTokenAddress)(market.quoteTokenMint, user);
        console.log("Placing the order");
        console.log("user:", user.toString(), "userHostLifetime:", userHostLifetime.toString(), "userMarket:", umaPubkey.toString(), "userQuoteTokenAta:", userQuoteTokenAta.toString(), "market:", market.pubkey.toString(), "marketStore:", market.marketStore.toString(), "quoteVault:", market.quoteVault.toString(), "orderbook:", orderbookAccount.orderbook.toString(), "bids:", orderbookAccount.bids.toString(), "asks:", orderbookAccount.asks.toString(), "eventQueue:", orderbookAccount.eventQueue.toString());
        return averClient.program.instruction["placeOrder"]({
            size: sizeU64,
            sizeFormat,
            limitPrice: limitPriceU64,
            side: side,
            orderType: orderType,
            selfTradeBehaviour: selfTradeBehavior,
            outcomeId: outcomeIndex,
        }, {
            accounts: {
                user: user,
                userHostLifetime: userHostLifetime,
                userMarket: umaPubkey,
                userQuoteTokenAta: userQuoteTokenAta,
                market: market.pubkey,
                marketStore: market.marketStore,
                quoteVault: market.quoteVault,
                orderbook: orderbookAccount.orderbook,
                bids: orderbookAccount.bids,
                asks: orderbookAccount.asks,
                eventQueue: orderbookAccount.eventQueue,
                splTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
            },
        });
    }
    /**
     * Place an order
     *
     * @param owner
     * @param outcomeIndex
     * @param side
     * @param limitPrice
     * @param size
     * @param sizeFormat
     * @param sendOptions
     * @param manualMaxRetry
     * @param orderType
     * @param selfTradeBehavior
     * @param averPreFlightCheck
     *
     * @returns {Promise<string>}
     */
    async placeOrder(owner, outcomeIndex, side, limitPrice, size, sizeFormat, sendOptions, manualMaxRetry, orderType = types_1.OrderType.Limit, selfTradeBehavior = aaob_1.SelfTradeBehavior.CancelProvide, averPreFlightCheck = true) {
        if (!owner.publicKey.equals(this.user))
            throw new Error("Owner must be same as user market owner");
        const ix = await this.makePlaceOrderInstruction(outcomeIndex, side, limitPrice, size, sizeFormat, orderType, selfTradeBehavior, averPreFlightCheck);
        return (0, utils_1.signAndSendTransactionInstructions)(this._averClient, [], owner, [ix], sendOptions, manualMaxRetry);
    }
    /**
     * Format the instruction to cancel an order
     *
     * @param orderId
     * @param outcomeIndex
     * @param averPreFlightCheck
     *
     * @returns {Promise<TransactionInstruction>}
     */
    makeCancelOrderInstruction(orderId, outcomeIndex, averPreFlightCheck = false) {
        if (averPreFlightCheck) {
            if (this.lamportBalance < 5000)
                throw new Error("Insufficient lamport balance");
            if (!(0, market_1.canCancelOrderInMarket)(this.market.marketStatus))
                throw new Error("Cannot cancel orders in current market status");
            if (!this.orders
                .map((o) => o.orderId.toString())
                .includes(orderId.toString())) {
                throw new Error("Order ID does not exist in list of open orders");
            }
        }
        // account for binary markets where there is only one order book
        outcomeIndex =
            this.market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex;
        // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
        const orderbookAccount = this.market.orderbookAccounts[outcomeIndex];
        return this._averClient.program.instruction["cancelOrder"](orderId, outcomeIndex, {
            accounts: {
                orderbook: orderbookAccount.orderbook,
                eventQueue: orderbookAccount.eventQueue,
                bids: orderbookAccount.bids,
                asks: orderbookAccount.asks,
                market: this.market.pubkey,
                userMarket: this.pubkey,
                user: this.user,
                marketStore: this.market.marketStore,
            },
        });
    }
    /**
     * Cancel an order
     *
     * @param feePayer
     * @param orderId
     * @param outcomeIndex
     * @param sendOptions
     * @param manualMaxRetry
     * @param averPreFlightCheck
     *
     * @returns {Promise<string>}
     */
    cancelOrder(feePayer, orderId, outcomeIndex, sendOptions, manualMaxRetry, averPreFlightCheck = true) {
        const ix = this.makeCancelOrderInstruction(orderId, outcomeIndex, averPreFlightCheck);
        return (0, utils_1.signAndSendTransactionInstructions)(this._averClient, [], feePayer, [ix], sendOptions, manualMaxRetry);
    }
    /**
     * Format instruction to cancel all orders on given outcomes
     *
     * @param outcomeIdsToCancel
     * @param averPreFlightCheck
     *
     * @returns {Promise<TransactionInstruction>}
     */
    makeCancelAllOrdersInstructions(outcomeIdsToCancel, averPreFlightCheck = false) {
        if (averPreFlightCheck) {
            if (this.lamportBalance < 5000)
                throw new Error("Insufficient lamport balance");
            if (!(0, market_1.canCancelOrderInMarket)(this.market.marketStatus))
                throw new Error("Cannot cancel orders in current market status");
        }
        // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
        const remainingAccounts = this.market.orderbookAccounts
            .filter((_oa, i) => outcomeIdsToCancel.includes(i))
            .flatMap((oa) => [oa.orderbook, oa.eventQueue, oa.bids, oa.asks])
            .map((account) => ({
            pubkey: account,
            isSigner: false,
            isWritable: true,
        }));
        const chunkSize = 5;
        const chunkedOutcomeIds = (0, lodash_1.chunk)(outcomeIdsToCancel, chunkSize);
        const chunkedRemainingAccounts = (0, lodash_1.chunk)(remainingAccounts, 4 * chunkSize);
        return chunkedOutcomeIds.map((ids, i) => this._averClient.program.instruction["cancelAllOrders"](ids, {
            accounts: {
                market: this.market.pubkey,
                userMarket: this.pubkey,
                user: this.user,
                marketStore: this.market.marketStore,
            },
            remainingAccounts: chunkedRemainingAccounts[i],
        }));
    }
    /**
     * Cancel all order on given outcomes
     *
     * @param feePayer
     * @param outcomeIdsToCancel
     * @param sendOptions
     * @param manualMaxRetry
     * @param averPreFlightCheck
     *
     * @returns {Promise<string>}
     */
    cancelAllOrders(feePayer, outcomeIdsToCancel, sendOptions, manualMaxRetry, averPreFlightCheck = true) {
        const ixs = this.makeCancelAllOrdersInstructions(outcomeIdsToCancel, averPreFlightCheck);
        return Promise.all(ixs.map((ix) => (0, utils_1.signAndSendTransactionInstructions)(this._averClient, [], feePayer, [ix], sendOptions, manualMaxRetry)));
    }
    /**
     * Format instruction to deposit tokens
     *
     * @param amount
     *
     * @returns {Promise<TransactionInstruction>}
     */
    async makeDepositTokensInstruction(amount) {
        const userQuoteTokenAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.market.quoteTokenMint, this.user);
        return this._averClient.program.instruction["depositTokens"](amount, {
            accounts: {
                user: this.user,
                userMarket: this.pubkey,
                userQuoteTokenAta,
                market: this.market.pubkey,
                quoteVault: this.market.quoteVault,
                splTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            },
        });
    }
    /**
     * Deposit tokens
     *
     * @param owner
     * @param amount
     * @param sendOptions
     * @param manualMaxRetry
     *
     * @returns {Promise<string>}
     */
    async depositTokens(owner, amount, sendOptions, manualMaxRetry) {
        if (!owner.publicKey.equals(this.user))
            throw new Error("Owner must be same as user market owner");
        const ix = await this.makeDepositTokensInstruction(amount);
        return (0, utils_1.signAndSendTransactionInstructions)(this._averClient, [], owner, [ix], sendOptions, manualMaxRetry);
    }
    /**
     * Format instruction to withdraw idle funds
     *
     * @param amount
     *
     * @returns {Promise<TransactionInstruction>}
     */
    async makeWithdrawIdleFundsInstruction(amount) {
        const userQuoteTokenAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.market.quoteTokenMint, this.user);
        const amountToWithdraw = new bn_js_1.default(amount || this.calculateFundsAvailableToWithdraw());
        return this._averClient.program.instruction["withdrawTokens"](amountToWithdraw, {
            accounts: {
                market: this.market.pubkey,
                userMarket: this.pubkey,
                user: this.user,
                userQuoteTokenAta,
                quoteVault: this.market.quoteVault,
                vaultAuthority: this.market.vaultAuthority,
                splTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            },
        });
    }
    /**
     * Withdraw idle funds from the User Market
     * @param owner
     * @param amount
     * @param sendOptions
     * @param manualMaxRetry
     *
     * @returns {Promise<string>}
     */
    async withdrawIdleFunds(owner, amount, sendOptions, manualMaxRetry) {
        if (!owner.publicKey.equals(this.user))
            throw new Error("Owner must be same as user market owner");
        const ix = await this.makeWithdrawIdleFundsInstruction(amount);
        return (0, utils_1.signAndSendTransactionInstructions)(this._averClient, [], owner, [ix], sendOptions, manualMaxRetry);
    }
    /**
     * Format instruction to neutralise the outcome position
     *
     * @param outcomeId
     *
     * @returns {Promise<TransactionInstruction>}
     */
    async makeNeutralizePositionInstruction(outcomeId) {
        var _a, _b, _c, _d;
        const quoteTokenAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.market.quoteTokenMint, this.user);
        return this._averClient.program.instruction["neutralizeOutcomePosition"](outcomeId, {
            accounts: {
                user: this.user,
                userHostLifetime: this.userHostLifetime,
                userMarket: this.pubkey,
                userQuoteTokenAta: quoteTokenAta,
                market: this.market.pubkey,
                quoteVault: this.market.quoteVault,
                marketStore: this.market.marketStore,
                orderbook: (_a = this.market.orderbookAccounts) === null || _a === void 0 ? void 0 : _a[outcomeId].orderbook,
                bids: (_b = this.market.orderbookAccounts) === null || _b === void 0 ? void 0 : _b[outcomeId].bids,
                asks: (_c = this.market.orderbookAccounts) === null || _c === void 0 ? void 0 : _c[outcomeId].asks,
                eventQueue: (_d = this.market.orderbookAccounts) === null || _d === void 0 ? void 0 : _d[outcomeId].eventQueue,
                splTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
            },
        });
    }
    /**
     * Neutralise the outcome position
     *
     * @param owner
     * @param outcomeId
     * @param sendOptions
     * @param manualMaxRetry
     *
     * @returns {Promise<string>}
     */
    async neutralizePosition(owner, outcomeId, sendOptions, manualMaxRetry) {
        if (!owner.publicKey.equals(this.user))
            throw new Error("Owner must be same as user market owner");
        const ix = await this.makeNeutralizePositionInstruction(outcomeId);
        return (0, utils_1.signAndSendTransactionInstructions)(this._averClient, [], owner, [ix], sendOptions, manualMaxRetry);
    }
    // NOT TESTED
    /**
     * Format instruction to collect funds from the User Market
     *
     * @returns {Promise<string>}
     */
    async makeCollectInstruction() {
        const userQuoteTokenAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.market.quoteTokenMint, this.user);
        return this._averClient.program.instruction["collect"](true, {
            accounts: {
                market: this.market.pubkey,
                userMarket: this.pubkey,
                user: this.user,
                userQuoteTokenAta,
                quoteVault: this.market.quoteVault,
                vaultAuthority: this.market.vaultAuthority,
                splTokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            },
        });
    }
    // NOT TESTED
    /**
     * Collect funds from the User Market
     *
     * @param owner
     * @param sendOptions
     * @param manualMaxRetry
     *
     * @returns {Promise<string>}
     */
    async collect(owner, sendOptions, manualMaxRetry) {
        if (!owner.publicKey.equals(this.user))
            throw new Error("Owner must be same as user market owner");
        const ix = await this.makeCollectInstruction();
        return (0, utils_1.signAndSendTransactionInstructions)(this._averClient, [], owner, [ix], sendOptions, manualMaxRetry);
    }
    // NOT TESTED
    async loadUserMarketListener(callback) {
        const ee = this._averClient.program.account["userMarket"].subscribe(this.pubkey);
        ee.on("change", callback);
        return ee;
    }
    /**
     * Calculate funds available to withdraw from the User Market
     *
     * @returns {number}
     */
    calculateFundsAvailableToWithdraw() {
        return Math.min(...this.outcomePositions.map((op) => op.free.toNumber()), this.netQuoteTokensIn.toNumber());
    }
    /**
     * Calculate exposures to each outcome
     *
     * @returns {BN[]}
     */
    calculateExposures() {
        return this.outcomePositions.map((op) => op.free.add(op.locked).sub(this.netQuoteTokensIn));
    }
    // NOT TESTED
    /**
     * Calculate funds available to collect based on the winning outcome
     *
     * @param winningOutcome
     *
     * @returns {number}
     */
    calculateFundsAvailableToCollect(winningOutcome) {
        return (this.outcomePositions[winningOutcome].free.toNumber() +
            this.outcomePositions[winningOutcome].locked.toNumber());
    }
    /**
     * Calculates the tokens available to sell on an outcome
     * @param outcomeIndex
     * @param price
     *
     * @returns {number}
     */
    calculateTokensAvailableToSell(outcomeIndex, price) {
        return (this.outcomePositions[outcomeIndex].free.toNumber() +
            price * this.tokenBalance);
    }
    /**
     * Calculates the tokens available to buy on an outcome
     *
     * @param outcomeIndex
     * @param price
     *
     * @returns {number}
     */
    calculateTokensAvailableToBuy(outcomeIndex, price) {
        const minFreeTokensExceptOutcomeIndex = Math.min(...this.outcomePositions
            .filter((op, i) => i != outcomeIndex)
            .map((op) => op.free.toNumber()));
        return minFreeTokensExceptOutcomeIndex + price * this.tokenBalance;
    }
    /**
     * Checks if an order is valid
     *
     * @param outcomeIndex
     * @param side
     * @param limitPrice
     * @param size
     * @param sizeFormat
     *
     * @returns {boolean}
     */
    isOrderValid(outcomeIndex, side, limitPrice, size, sizeFormat) {
        if (this.lamportBalance < 5000) {
            throw new Error("Insufficient lamport balance");
        }
        const balanceRequired = sizeFormat == types_1.SizeFormat.Payout ? size * limitPrice : size;
        const currentBalance = side == types_1.Side.Ask
            ? this.calculateTokensAvailableToSell(outcomeIndex, limitPrice)
            : this.calculateTokensAvailableToBuy(outcomeIndex, limitPrice);
        if (currentBalance < balanceRequired) {
            throw new Error("Insufficient token balance");
        }
        if (this.orders.length == this.maxNumberOfOrders) {
            throw new Error("Max number of orders reached");
        }
        (0, utils_1.roundPriceToNearestTickSize)(limitPrice, this.market.numberOfOutcomes == 2);
        if (!(0, market_1.isMarketTradable)(this.market.marketStatus)) {
            throw new Error("Market currently not in a tradeable status");
        }
        return true;
    }
}
exports.UserMarket = UserMarket;
//# sourceMappingURL=user-market.js.map