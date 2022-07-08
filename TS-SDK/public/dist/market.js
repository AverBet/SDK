"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCancelOrderInMarket = exports.isMarketTradable = exports.isMarketStatusClosed = exports.Market = void 0;
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const ids_1 = require("./ids");
const orderbook_1 = require("./orderbook");
const types_1 = require("./types");
const user_market_1 = require("./user-market");
const utils_1 = require("./utils");
class Market {
    constructor(averClient, pubkey, marketState, marketStoreState, orderbooks) {
        this._pubkey = pubkey;
        this._marketState = marketState;
        this._marketStoreState = marketStoreState;
        this._averClient = averClient;
        // store 2 orderbooks for binary markets
        this._orderbooks =
            marketState.numberOfOutcomes == 2 && (orderbooks === null || orderbooks === void 0 ? void 0 : orderbooks.length) == 1
                ? orderbooks === null || orderbooks === void 0 ? void 0 : orderbooks.concat(orderbook_1.Orderbook.invert(orderbooks[0]))
                : orderbooks;
    }
    /**
     * Load the Aver Market
     *
     * @param {AverClient} averClient The aver client instance
     * @param {PublicKey} pubkey The market public key
     *
     * @returns {Promise<Market>} the market once it has loaded
     */
    static async load(averClient, pubkey) {
        const program = averClient.program;
        const [marketStorePubkey, marketStoreBump] = await Market.deriveMarketStorePubkeyAndBump(pubkey);
        const marketResultAndMarketStoreResult = await Promise.all([
            program.account['market'].fetch(pubkey.toBase58()),
            program.account['marketStore'].fetch(marketStorePubkey.toBase58())
        ]);
        const marketState = Market.parseMarketState(marketResultAndMarketStoreResult[0]);
        // market store and orderbooks do not exist for closed markets
        const marketStoreResult = marketResultAndMarketStoreResult[1];
        if (!marketStoreResult) {
            return new Market(averClient, pubkey, marketState);
        }
        const marketStoreState = Market.parseMarketStoreState(marketStoreResult);
        const orderbooks = await Market.getOrderbooksFromOrderbookAccounts(program.provider.connection, marketStoreState.orderbookAccounts, marketState.decimals);
        return new Market(averClient, pubkey, marketState, marketStoreState, orderbooks);
    }
    /**
     * Load multiple Aver Markets
     *
     * @param {AverClient} averClient The aver client instance
     * @param {PublicKey[]} pubkeys The market public keys
     *
     * @returns {Promise<(Market |  null)[]>} the markets once they have loaded
     */
    static async loadMultiple(averClient, pubkeys) {
        const program = averClient.program;
        const marketStorePubkeys = await Market.deriveMarketStorePubkeysAndBump(pubkeys);
        const marketResultsAndMarketStoreResults = await Promise.all([
            program.account['market'].fetchMultiple(pubkeys),
            program.account['marketStore'].fetchMultiple(marketStorePubkeys.map(([pubkey, bump]) => {
                return pubkey;
            }))
        ]);
        const marketStates = marketResultsAndMarketStoreResults[0].map((marketResult) => marketResult ? Market.parseMarketState(marketResult) : null);
        const marketStoreStates = marketResultsAndMarketStoreResults[1].map((marketStoreResult) => marketStoreResult ? Market.parseMarketStoreState(marketStoreResult) : null);
        // TODO optimize to load all slabs for all orderbooks for all markets in one request
        const nestedOrderbooks = await Promise.all(marketStoreStates.map((mss, i) => {
            var _a;
            return mss && marketStates[i]
                ? Market.getOrderbooksFromOrderbookAccounts(program.provider.connection, mss.orderbookAccounts, ((_a = marketStates[i]) === null || _a === void 0 ? void 0 : _a.decimals) || 6)
                : null;
        }));
        return marketStates.map((marketState, i) => marketState
            ? new Market(averClient, pubkeys[i], marketState, marketStoreStates[i] || undefined, nestedOrderbooks[i] || undefined)
            : null);
    }
    /**
     * Refresh multiple markets
     *
     * @param {AverClient} averClient The aver client instance
     * @param {Market[]} markets The markets to be refreshed
     *
     * @returns {Promise<Market[]>} The refreshed markets
     */
    static async refreshMultipleMarkets(averClient, markets) {
        const orderbookAccounts = markets
            .filter((market) => !!market.orderbookAccounts)
            .map((market) => market.orderbookAccounts);
        const multipleAccountStates = await Market.loadMultipleAccountStates(averClient, markets.map((market) => market.pubkey), markets.map((market) => market.marketStore), orderbookAccounts.flatMap((ordAcc) => ordAcc === null || ordAcc === void 0 ? void 0 : ordAcc.flatMap((acc) => [acc.bids, acc.asks])));
        return Market.getMarketsFromAccountStates(averClient, markets.map((m) => m.pubkey), multipleAccountStates.marketStates, multipleAccountStates.marketStoreStates, multipleAccountStates.slabs);
    }
    static getMarketsFromAccountStates(averClient, marketPubkeys, marketStates, marketStoreStates, slabs) {
        // creates orderbooks for each market
        let slabPositionCounter = 0;
        const allOrderbooks = marketStoreStates.map((mss, j) => {
            var _a, _b;
            const newOrderbookList = (_a = mss === null || mss === void 0 ? void 0 : mss.orderbookAccounts) === null || _a === void 0 ? void 0 : _a.map((oa, i) => {
                var _a;
                const newOrderbook = new orderbook_1.Orderbook(oa.orderbook, slabs[slabPositionCounter + i * 2], slabs[slabPositionCounter + i * 2 + 1], oa.bids, oa.asks, ((_a = marketStates[j]) === null || _a === void 0 ? void 0 : _a.decimals) || 6);
                return newOrderbook;
            });
            slabPositionCounter +=
                ((_b = marketStoreStates[j]) === null || _b === void 0 ? void 0 : _b.orderbookAccounts.length) * 2 || 0;
            return newOrderbookList;
        });
        return marketPubkeys.map((m, i) => new Market(averClient, m, marketStates[i], marketStoreStates[i] || undefined, allOrderbooks[i]));
    }
    static async loadMultipleAccountStates(averClient, marketPubkeys = [], marketStorePubkeys = [], slabPubkeys = [], userMarketPubkeys = [], userPubkeys = []) {
        const connection = averClient.connection;
        const allAtaPubkeys = await Promise.all(userPubkeys.map((u) => (0, spl_token_1.getAssociatedTokenAddress)(averClient.quoteTokenMint, u)));
        const allPubkeys = marketPubkeys
            .concat(marketStorePubkeys)
            .concat(slabPubkeys)
            .concat(userMarketPubkeys)
            .concat(userPubkeys)
            .concat(allAtaPubkeys);
        const accountsData = await (0, utils_1.chunkAndFetchMultiple)(connection, allPubkeys);
        const deserializedMarketData = Market.deserializeMultipleMarketData(averClient, accountsData.slice(0, marketPubkeys.length));
        const deserializedMarketStoreData = Market.deserializeMultipleMarketStoreData(averClient, accountsData.slice(marketPubkeys.length, marketPubkeys.length + marketStorePubkeys.length));
        const deserializedSlabsData = orderbook_1.Orderbook.deserializeMultipleSlabData(accountsData.slice(marketPubkeys.length + marketStorePubkeys.length, marketPubkeys.length + marketStorePubkeys.length + slabPubkeys.length));
        const deserializedUserMarketData = user_market_1.UserMarket.deserializeMultipleUserMarketStoreData(averClient, accountsData.slice(marketPubkeys.length + marketStorePubkeys.length + slabPubkeys.length, marketPubkeys.length +
            marketStorePubkeys.length +
            slabPubkeys.length +
            userMarketPubkeys.length));
        const lamportBalances = accountsData
            .slice(-userPubkeys.length * 2, -userPubkeys.length)
            .map((info) => (info === null || info === void 0 ? void 0 : info.lamports) || 0);
        const tokenBalances = accountsData
            .slice(-userPubkeys.length)
            .map((info) => { var _a; return ((_a = info === null || info === void 0 ? void 0 : info.data) === null || _a === void 0 ? void 0 : _a.length) == spl_token_1.ACCOUNT_SIZE ? Number(spl_token_1.AccountLayout.decode(info.data).amount) : 0; });
        const userBalanceStates = lamportBalances.map((b, i) => ({
            lamportBalance: b,
            tokenBalance: tokenBalances[i],
        }));
        return {
            marketStates: deserializedMarketData,
            marketStoreStates: deserializedMarketStoreData,
            slabs: deserializedSlabsData,
            userMarketStates: deserializedUserMarketData,
            userBalanceStates,
        };
    }
    static deserializeMultipleMarketData(averClient, marketsData) {
        return marketsData.map((marketData) => (marketData === null || marketData === void 0 ? void 0 : marketData.data)
            ? averClient.program.account['market'].coder.accounts.decode('Market', marketData.data)
            : null);
    }
    static deserializeMultipleMarketStoreData(averClient, marketStoresData) {
        return marketStoresData.map((marketStoreData) => (marketStoreData === null || marketStoreData === void 0 ? void 0 : marketStoreData.data)
            ? averClient.program.account['marketStore'].coder.accounts.decode('MarketStore', marketStoreData.data)
            : null);
    }
    static parseMarketState(marketResult) {
        return marketResult;
    }
    static parseMarketStoreState(marketStoreResult) {
        return marketStoreResult;
    }
    static async deriveMarketStorePubkeyAndBump(marketPubkey, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([Buffer.from('market-store', 'utf-8'), marketPubkey.toBuffer()], programId);
    }
    static async deriveMarketStorePubkeysAndBump(marketPubkeys, programId = ids_1.AVER_PROGRAM_ID) {
        return await Promise.all(marketPubkeys.map((marketPubkey) => {
            return web3_js_1.PublicKey.findProgramAddress([Buffer.from('market-store', 'utf-8'), marketPubkey.toBuffer()], programId);
        }));
    }
    static async deriveQuoteVaultAuthorityPubkeyAndBump(marketPubkey, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([marketPubkey.toBuffer()], programId);
    }
    static async deriveQuoteVaultPubkey(marketPubkey, network, programId = ids_1.AVER_PROGRAM_ID) {
        const [vaultAuthority, _] = await Market.deriveQuoteVaultAuthorityPubkeyAndBump(marketPubkey, programId);
        const quoteToken = (0, ids_1.getQuoteToken)(network);
        return (0, spl_token_1.getAssociatedTokenAddress)(quoteToken, vaultAuthority, true);
    }
    get pubkey() {
        return this._pubkey;
    }
    get name() {
        return this._marketState.marketName;
    }
    get decimals() {
        return this._marketState.decimals;
    }
    get marketStore() {
        return this._marketState.marketStore;
    }
    get quoteTokenMint() {
        return this._marketState.quoteTokenMint;
    }
    get quoteVault() {
        return this._marketState.quoteVault;
    }
    get marketStatus() {
        return this._marketState.marketStatus;
    }
    get vaultAuthority() {
        return this._marketState.vaultAuthority;
    }
    get winningOutcome() {
        return this._marketState.winningOutcome;
    }
    get numberOfOutcomes() {
        return this._marketState.numberOfOutcomes;
    }
    get numberOfWinners() {
        return this._marketState.numberOfWinners;
    }
    get maxQuoteTokensIn() {
        return this._marketState.maxQuoteTokensIn;
    }
    get maxQuoteTokensInPermissionCapped() {
        return this._marketState.maxQuoteTokensInPermissionCapped;
    }
    get crankerReward() {
        return this._marketState.crankerReward;
    }
    get withdrawableQuoteTokenBalance() {
        return this._marketState.withdrawableQuoteTokenBalance;
    }
    get permissionedMarketFlag() {
        return this._marketState.permissionedMarketFlag;
    }
    get goingInPlayFlag() {
        return this._marketState.goingInPlayFlag;
    }
    get marketAuthority() {
        return this._marketState.marketAuthority;
    }
    get oracleFeed() {
        return this._marketState.oracleFeed;
    }
    get feeTierCollectionBpsRates() {
        return this._marketState.feeTierCollectionBpsRates;
    }
    get minNewOrderBaseSize() {
        var _a;
        return (_a = this._marketStoreState) === null || _a === void 0 ? void 0 : _a.minNewOrderBaseSize;
    }
    get minNewOrderQuoteSize() {
        var _a;
        return (_a = this._marketStoreState) === null || _a === void 0 ? void 0 : _a.minNewOrderQuoteSize;
    }
    get minOrderbookBaseSize() {
        var _a;
        return (_a = this._marketStoreState) === null || _a === void 0 ? void 0 : _a.minOrderbookBaseSize;
    }
    get orderbooks() {
        return this._orderbooks;
    }
    get orderbookAccounts() {
        var _a;
        return (_a = this._marketStoreState) === null || _a === void 0 ? void 0 : _a.orderbookAccounts;
    }
    get tradingCeaseTime() {
        return new Date(this._marketState.tradingCeaseTime.toNumber() * 1000);
    }
    get inplayStartTime() {
        return this._marketState.inplayStartTime
            ? new Date(this._marketState.inplayStartTime.toNumber() * 1000)
            : undefined;
    }
    /**
     * Refresh the Market instance
     */
    async refresh() {
        const market = (await Market.refreshMultipleMarkets(this._averClient, [this]))[0];
        this._marketState = market._marketState;
        this._marketStoreState = market._marketStoreState;
        this._orderbooks = market._orderbooks;
    }
    // NOT TESTED
    async loadMarketListener(callback) {
        const ee = this._averClient.program.account['market'].subscribe(this.pubkey);
        ee.on('change', callback);
        return ee;
    }
    // NOT TESTED
    async loadMarketStoreListener(callback) {
        const ee = this._averClient.program.account['marketStore'].subscribe(this.marketStore);
        ee.on('change', callback);
        return ee;
    }
    static async getOrderbooksFromOrderbookAccounts(connection, orderbookAccounts, decimals) {
        const allBidsAndAsksAccounts = orderbookAccounts.map((o) => [o.bids, o.asks]).flat();
        const allSlabs = await orderbook_1.Orderbook.loadMultipleSlabs(connection, allBidsAndAsksAccounts);
        return orderbookAccounts.map((o, i) => new orderbook_1.Orderbook(o.orderbook, 
        // @ts-expect-error
        allSlabs[i * 2], allSlabs[i * 2 + 1], allBidsAndAsksAccounts[i * 2], allBidsAndAsksAccounts[i * 2 + 1], decimals));
    }
}
exports.Market = Market;
const isMarketStatusClosed = (marketStatus) => [types_1.MarketStatus.CeasedCrankedClosed, types_1.MarketStatus.Resolved, types_1.MarketStatus.Voided].includes(marketStatus);
exports.isMarketStatusClosed = isMarketStatusClosed;
const isMarketTradable = (marketStatus) => [types_1.MarketStatus.ActiveInPlay, types_1.MarketStatus.ActivePreEvent].includes(marketStatus);
exports.isMarketTradable = isMarketTradable;
const canCancelOrderInMarket = (marketStatus) => [
    types_1.MarketStatus.ActiveInPlay,
    types_1.MarketStatus.ActivePreEvent,
    types_1.MarketStatus.HaltedInPlay,
    types_1.MarketStatus.HaltedPreEvent,
].includes(marketStatus);
exports.canCancelOrderInMarket = canCancelOrderInMarket;
//# sourceMappingURL=market.js.map