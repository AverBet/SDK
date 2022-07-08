/// <reference types="node" />
import { Slab, Price, Side } from '@bonfida/aaob';
import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
/**
 * Orderbook class
 */
export declare class Orderbook {
    /** Pubkey of the orderbook
     * @private
     */
    private _pubkey;
    /** Market of the orderbook
     * @private
     */
    private _decimals;
    /** Slab that contains asks
     * @private
     */
    private _slabAsks;
    /** Slab that contains bids
     * @private
     */
    private _slabBids;
    /** Asks slab public key
     * @private
     */
    private _slabAsksPubkey;
    /** Bids slab public key
     * @private
     */
    private _slabBidsPubkey;
    private _isInverted;
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
    constructor(pubkey: PublicKey, slabBids: Slab, slabAsks: Slab, slabBidsPubkey: PublicKey, slabAsksPubkey: PublicKey, decimals: number, isInverted?: boolean);
    /**
     * Returns the market object associated to the orderbook
     */
    get pubkey(): PublicKey;
    /**
     * Returns the market object associated to the orderbook
     */
    get decimals(): number;
    /**
     * Returns the asks slab of the orderbook
     */
    get slabAsks(): Slab;
    /**
     * Returns the bids slab of the orderbook
     */
    get slabBids(): Slab;
    /**
     * Function to invert the orderbook, this switches around the bids and asks
     *
     * @param orderbook
     * @returns
     */
    static invert(orderbook: Orderbook): Orderbook;
    /**
     *
     * @param connection The solana connection object to the RPC node
     * @param slabAddress The address of the Slab
     * @returns A deserialized Slab object
     */
    static loadSlab(connection: Connection, slabAddress: PublicKey): Promise<Slab>;
    /**
     *
     * @param connection The solana connection object to the RPC node
     * @param slabAddress The address of the Slab
     * @returns Multiple deserialized Slab object
     */
    static loadMultipleSlabs(connection: Connection, slabAddresses: PublicKey[]): Promise<(Slab | null)[]>;
    static deserializeMultipleSlabData(slabsData: AccountInfo<Buffer | null>[]): (Slab | null)[];
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
    static load(connection: Connection, orderbook: PublicKey, bids: PublicKey, asks: PublicKey, decimals: number, isInverted?: boolean): Promise<Orderbook>;
    private static convertPrice;
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
    static getL2ForSlab(slab: Slab, depth: number, increasing: boolean, decimals: number, uiAmount?: boolean, isInverted?: boolean): Price[];
    /**
     * Derive the Orderbook pubkey based off the Market, OutcomeId and program
     *
     * @param market
     * @param outcomeId
     * @param programId
     *
     * @returns {Promise<[PublicKey, number]>} The Orderbook pubkey
     */
    static deriveOrderbookPubkeyAndBump(market: PublicKey, outcomeId: number, programId?: PublicKey): Promise<[PublicKey, number]>;
    /**
     *
     * @param market
     * @param outcomeId
     * @param programId
     * @returns
     */
    static deriveEventQueuePubkeyAndBump(market: PublicKey, outcomeId: number, programId?: PublicKey): Promise<[PublicKey, number]>;
    /**
     *
     * @param market
     * @param outcomeId
     * @param programId
     * @returns
     */
    static deriveBidsPubkeyAndBump(market: PublicKey, outcomeId: number, programId?: PublicKey): Promise<[PublicKey, number]>;
    /**
     *
     * @param market
     * @param outcomeId
     * @param programId
     * @returns
     */
    static deriveAsksPubkeyAndBump(market: PublicKey, outcomeId: number, programId?: PublicKey): Promise<[PublicKey, number]>;
    /**
     *
     * @param price
     * @param uiAmount
     * @returns
     */
    private static invertPrice;
    /**
     *
     * @param depth
     * @param uiAmount
     * @returns
     */
    getBidsL2(depth: number, uiAmount?: boolean): Price[];
    /**
     *
     * @param depth
     * @param uiAmount
     * @returns
     */
    getAsksL2(depth: number, uiAmount?: boolean): Price[];
    /**
     *
     * @param uiAmount
     * @returns
     */
    getBestBidPrice(uiAmount?: any): Price | undefined;
    /**
     *
     * @param uiAmount
     * @returns
     */
    getBestAskPrice(uiAmount?: any): Price | undefined;
    /**
     *
     * @param orderId
     * @returns
     */
    getBidPriceByOrderId(orderId: BN): Price | undefined;
    /**
     *
     * @param orderId
     * @returns
     */
    getAskPriceByOrderId(orderId: BN): Price | undefined;
    /**
     *
     * @param connection
     * @param callback
     * @returns
     */
    loadOrderbookListener(connection: Connection, callback: (slab: Orderbook) => void): number[];
    /**
     *
     * @param baseQty
     * @param side
     * @param uiAmount
     */
    estimateAvgFillForBaseQty(baseQty: number, side: Side, uiAmount?: boolean): void;
    /**
     *
     * @param quoteQty
     * @param side
     * @param uiAmount
     */
    estimateAvgFillForQuoteQty(quoteQty: number, side: Side, uiAmount?: boolean): void;
    private estimateFillForQty;
    private loadSlabListener;
}
