"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orderbook = void 0;
const aaob_1 = require("@bonfida/aaob");
const web3_js_1 = require("@solana/web3.js");
const bn_js_1 = __importDefault(require("bn.js"));
const ids_1 = require("./ids");
const utils_1 = require("./utils");
/**
 * Orderbook class
 */
class Orderbook {
    /**
     * Orderbook constructor. This can be used if the slab bids and asks are already known, otherwise use the load method.
     *
     * @param pubkey
     * @param slabBids
     * @param slabAsks
     * @param slabBidsPubkey
     * @param slabAsksPubkey
     * @param decimals
     * @param isInverted
     */
    constructor(pubkey, slabBids, slabAsks, slabBidsPubkey, slabAsksPubkey, decimals, isInverted = false) {
        this._pubkey = pubkey;
        this._decimals = decimals;
        this._slabBids = slabBids;
        this._slabAsks = slabAsks;
        this._slabBidsPubkey = slabBidsPubkey;
        this._slabAsksPubkey = slabAsksPubkey;
        this._isInverted = isInverted;
    }
    /**
     * Returns the market object associated to the orderbook
     */
    get pubkey() {
        return this._pubkey;
    }
    /**
     * Returns the market object associated to the orderbook
     */
    get decimals() {
        return this._decimals;
    }
    /**
     * Returns the asks slab of the orderbook
     */
    get slabAsks() {
        return this._slabAsks;
    }
    /**
     * Returns the bids slab of the orderbook
     */
    get slabBids() {
        return this._slabBids;
    }
    /**
     * Function to invert the orderbook, this switches around the bids and asks
     *
     * @param orderbook
     * @returns
     */
    static invert(orderbook) {
        // switch bids and asks around to invert
        return new Orderbook(orderbook.pubkey, orderbook.slabAsks, orderbook.slabBids, orderbook._slabAsksPubkey, orderbook._slabBidsPubkey, orderbook.decimals, true);
    }
    /**
     *
     * @param connection The solana connection object to the RPC node
     * @param slabAddress The address of the Slab
     * @returns A deserialized Slab object
     */
    static async loadSlab(connection, slabAddress) {
        const { data } = (0, utils_1.throwIfNull)(await connection.getAccountInfo(slabAddress));
        const slab = aaob_1.Slab.deserialize(data, new bn_js_1.default(ids_1.CALLBACK_INFO_LEN));
        return slab;
    }
    /**
     *
     * @param connection The solana connection object to the RPC node
     * @param slabAddress The address of the Slab
     * @returns Multiple deserialized Slab object
     */
    static async loadMultipleSlabs(connection, slabAddresses) {
        try {
            const data = await (0, utils_1.chunkAndFetchMultiple)(connection, slabAddresses);
            return Orderbook.deserializeMultipleSlabData(data);
        }
        catch (error) {
            console.error('There was an error loading multiple slabs. ', error);
            return slabAddresses.map(() => null);
        }
    }
    static deserializeMultipleSlabData(slabsData) {
        return slabsData.map((d) => !!(d === null || d === void 0 ? void 0 : d.data) ? aaob_1.Slab.deserialize(d.data, new bn_js_1.default(ids_1.CALLBACK_INFO_LEN)) : null);
    }
    /**
     * Load the Orderbook
     *
     * @param connection
     * @param orderbook
     * @param bids
     * @param asks
     * @param decimals
     * @param isInverted
     *
     * @returns {Promise<Orderbook>} The Orderbook object
     */
    static async load(connection, orderbook, bids, asks, decimals, isInverted = false) {
        const slabBids = await Orderbook.loadSlab(connection, bids);
        const slabAsks = await Orderbook.loadSlab(connection, asks);
        return new Orderbook(orderbook, slabBids, slabAsks, bids, asks, decimals, isInverted);
    }
    static convertPrice(p, decimals) {
        const exp = Math.pow(10, decimals);
        return {
            price: Math.round((p.price / Math.pow(2, 32)) * exp) / exp,
            size: p.size / exp,
        };
    }
    /**
     *
     * @param slab
     * @param depth
     * @param increasing
     * @param decimals
     * @param uiAmount
     * @param isInverted
     * @returns
     */
    static getL2ForSlab(slab, depth, increasing, decimals, uiAmount, isInverted) {
        const l2Depth = isInverted
            ? slab.getL2DepthJS(depth, increasing).map((p) => Orderbook.invertPrice(p))
            : slab.getL2DepthJS(depth, increasing);
        return uiAmount ? l2Depth.map((p) => Orderbook.convertPrice(p, decimals)) : l2Depth;
    }
    /**
     * Derive the Orderbook pubkey based off the Market, OutcomeId and program
     *
     * @param market
     * @param outcomeId
     * @param programId
     *
     * @returns {Promise<[PublicKey, number]>} The Orderbook pubkey
     */
    static async deriveOrderbookPubkeyAndBump(market, outcomeId, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([Buffer.from('orderbook', 'utf-8'), market.toBuffer(), Buffer.of(outcomeId)], programId);
    }
    /**
     *
     * @param market
     * @param outcomeId
     * @param programId
     * @returns
     */
    static async deriveEventQueuePubkeyAndBump(market, outcomeId, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([Buffer.from('event-queue', 'utf-8'), market.toBuffer(), Buffer.of(outcomeId)], programId);
    }
    /**
     *
     * @param market
     * @param outcomeId
     * @param programId
     * @returns
     */
    static async deriveBidsPubkeyAndBump(market, outcomeId, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([Buffer.from('bids', 'utf-8'), market.toBuffer(), Buffer.of(outcomeId)], programId);
    }
    /**
     *
     * @param market
     * @param outcomeId
     * @param programId
     * @returns
     */
    static async deriveAsksPubkeyAndBump(market, outcomeId, programId = ids_1.AVER_PROGRAM_ID) {
        return web3_js_1.PublicKey.findProgramAddress([Buffer.from('asks', 'utf-8'), market.toBuffer(), Buffer.of(outcomeId)], programId);
    }
    /**
     *
     * @param price
     * @param uiAmount
     * @returns
     */
    static invertPrice(price, uiAmount) {
        return {
            size: price.size,
            price: uiAmount ? 1 - price.price : Math.pow(2, 32) - price.price,
        };
    }
    // NOT TESTED
    /**
     *
     * @param depth
     * @param uiAmount
     * @returns
     */
    getBidsL2(depth, uiAmount) {
        const isIncreasing = this._isInverted ? true : false;
        return Orderbook.getL2ForSlab(this._slabBids, depth, isIncreasing, this.decimals, uiAmount, this._isInverted);
    }
    // NOT TESTED
    /**
     *
     * @param depth
     * @param uiAmount
     * @returns
     */
    getAsksL2(depth, uiAmount) {
        const isIncreasing = this._isInverted ? false : true;
        return Orderbook.getL2ForSlab(this._slabAsks, depth, isIncreasing, this.decimals, uiAmount, this._isInverted);
    }
    // NOT TESTED
    /**
     *
     * @param uiAmount
     * @returns
     */
    getBestBidPrice(uiAmount) {
        const bids = this.getBidsL2(1, uiAmount);
        return bids.length ? bids[0] : undefined;
    }
    // NOT TESTED
    /**
     *
     * @param uiAmount
     * @returns
     */
    getBestAskPrice(uiAmount) {
        const asks = this.getAsksL2(1, uiAmount);
        return asks.length ? asks[0] : undefined;
    }
    // NOT TESTED
    /**
     *
     * @param orderId
     * @returns
     */
    getBidPriceByOrderId(orderId) {
        const bid = this.slabBids.getNodeByKey(orderId);
        if (!bid)
            return undefined;
        const bidPrice = {
            price: bid.getPrice().toNumber(),
            size: bid.baseQuantity.toNumber(),
        };
        return this._isInverted ? Orderbook.invertPrice(bidPrice) : bidPrice;
    }
    // NOT TESTED
    /**
     *
     * @param orderId
     * @returns
     */
    getAskPriceByOrderId(orderId) {
        const ask = this.slabAsks.getNodeByKey(orderId);
        if (!ask)
            return undefined;
        const askPrice = {
            price: ask.getPrice().toNumber(),
            size: ask.baseQuantity.toNumber(),
        };
        return this._isInverted ? Orderbook.invertPrice(askPrice) : askPrice;
    }
    // NOT TESTED
    /**
     *
     * @param connection
     * @param callback
     * @returns
     */
    loadOrderbookListener(connection, callback) {
        const onSlabChange = (slab, bids) => callback(new Orderbook(this.pubkey, bids ? slab : this.slabBids, !bids ? slab : this.slabAsks, this._slabBidsPubkey, this._slabAsksPubkey, this.decimals, this._isInverted));
        const bidsListener = this.loadSlabListener(connection, aaob_1.Side.Bid, (slab) => onSlabChange(slab, true));
        const asksListener = this.loadSlabListener(connection, aaob_1.Side.Ask, (slab) => onSlabChange(slab, false));
        return [bidsListener, asksListener];
    }
    // NOT TESTED
    /**
     *
     * @param baseQty
     * @param side
     * @param uiAmount
     */
    estimateAvgFillForBaseQty(baseQty, side, uiAmount) {
        this.estimateFillForQty(baseQty, side, false, uiAmount);
    }
    // NOT TESTED
    /**
     *
     * @param quoteQty
     * @param side
     * @param uiAmount
     */
    estimateAvgFillForQuoteQty(quoteQty, side, uiAmount) {
        this.estimateFillForQty(quoteQty, side, true, uiAmount);
    }
    estimateFillForQty(qty, side, quote, uiAmount) {
        const prices = side == aaob_1.Side.Bid ? this.getBidsL2(100, uiAmount) : this.getAsksL2(100, uiAmount);
        const accumulator = quote
            ? (price) => price.size
            : (price) => price.size * price.price;
        let newPrices = [];
        let cumulativeQty = 0;
        for (const price of prices) {
            const remainingQty = qty - cumulativeQty;
            if (remainingQty <= accumulator(price)) {
                cumulativeQty += remainingQty;
                const newSize = quote ? remainingQty : remainingQty / price.price;
                newPrices.push({ price: price.price, size: newSize });
                break;
            }
            else {
                cumulativeQty += accumulator(price);
                newPrices.push(price);
            }
        }
        return {
            avgPrice: weightedAverage(newPrices.map((p) => p.price), newPrices.map((p) => p.size)),
            worstPrice: newPrices.slice(-1)[0],
            filled: cumulativeQty,
        };
    }
    loadSlabListener(connection, side, callback, errorCallback) {
        const account = side == aaob_1.Side.Ask ? this._slabAsksPubkey : this._slabBidsPubkey;
        return connection.onAccountChange(account, (accountInfo) => {
            try {
                const slab = aaob_1.Slab.deserialize(accountInfo.data, new bn_js_1.default(ids_1.CALLBACK_INFO_LEN));
                callback(slab);
            }
            catch (error) {
                if (errorCallback)
                    errorCallback(error);
            }
        });
    }
}
exports.Orderbook = Orderbook;
/**
 *
 * @param nums
 * @param weights
 * @returns
 */
const weightedAverage = (nums, weights) => {
    const [sum, weightSum] = weights.reduce((acc, w, i) => {
        acc[0] = acc[0] + nums[i] * w;
        acc[1] = acc[1] + w;
        return acc;
    }, [0, 0]);
    return sum / weightSum;
};
//# sourceMappingURL=orderbook.js.map