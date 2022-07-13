/// <reference types="node" />
import { Keypair, PublicKey, TransactionInstruction, AccountInfo, SendOptions } from "@solana/web3.js";
import { SelfTradeBehavior } from "@bonfida/aaob";
import { AverClient } from "./aver-client";
import { OrderType, Side, SizeFormat, UserMarketState } from "./types";
import { Market } from "./market";
import BN from "bn.js";
export declare class UserMarket {
    private _userMarketState;
    private _pubkey;
    private _averClient;
    private _market;
    private _userBalanceState;
    private constructor();
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
    static load(averClient: AverClient, market: Market, owner?: PublicKey, host?: PublicKey, programId?: PublicKey): Promise<UserMarket>;
    /**
     * Load the User Market object when the Public Key is known
     *
     * @param averClient
     * @param pubkey
     * @param market
     *
     * @returns {Promise<UserMarket>}
     */
    static loadByUma(averClient: AverClient, pubkey: PublicKey, market: Market): Promise<UserMarket>;
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
    static loadMultiple(averClient: AverClient, markets: Market[], owner?: PublicKey, host?: PublicKey, programId?: PublicKey): Promise<(UserMarket | undefined)[]>;
    /**
     * Load Multiple User Markets when Public Keys are known
     *
     * @param averClient
     * @param pubkeys
     * @param markets
     * @returns
     */
    static loadMultipleByUma(averClient: AverClient, pubkeys: PublicKey[], markets: Market[]): Promise<(UserMarket | undefined)[]>;
    private static parseUserMarketState;
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
    static makeCreateUserMarketAccountInstruction(averClient: AverClient, market: Market, owner?: PublicKey, host?: PublicKey, numberOfOrders?: number, programId?: PublicKey): Promise<TransactionInstruction>;
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
    static createUserMarketAccount(averClient: AverClient, market: Market, owner: Keypair, sendOptions?: SendOptions, manualMaxRetry?: number, host?: PublicKey, numberOfOrders?: number, programId?: PublicKey): Promise<string>;
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
    static getOrCreateUserMarketAccount(averClient: AverClient, owner: Keypair, market: Market, sendOptions?: SendOptions, quoteTokenMint?: PublicKey, host?: PublicKey, numberOfOrders?: number, referrer?: PublicKey, programId?: PublicKey): Promise<UserMarket>;
    /**
     * Desearealise multiple User Market Stores Data
     *
     * @param averClient
     * @param userMarketStoresData
     *
     * @returns {(UserMarketState | null)[]}
     */
    static deserializeMultipleUserMarketStoreData(averClient: AverClient, userMarketStoresData: AccountInfo<Buffer | null>[]): (UserMarketState | null)[];
    /**
     * Refresh Multiple User Markets
     *
     * @param averClient
     * @param userMarkets
     *
     * @returns {Promise<(UserMarket | null)[]>}
     */
    static refreshMultipleUserMarkets(averClient: AverClient, userMarkets: UserMarket[]): Promise<(UserMarket | undefined)[]>;
    /**
     * Derive the User Market Pubkey based on the Owner, Market, Host and program
     *
     * @param owner
     * @param market
     * @param host
     * @param programId
     * @returns
     */
    static derivePubkeyAndBump(owner: PublicKey, market: PublicKey, host?: PublicKey, programId?: PublicKey): Promise<[PublicKey, number]>;
    get pubkey(): PublicKey;
    get market(): Market;
    get user(): PublicKey;
    get numberOfOutcomes(): number;
    get numberOfOrders(): number;
    get maxNumberOfOrders(): number;
    get netQuoteTokensIn(): BN;
    get accumulatedMakerQuoteVolume(): BN;
    get accumulatedMakerBaseVolume(): BN;
    get accumulatedTakerQuoteVolume(): BN;
    get accumulatedTakerBaseVolume(): BN;
    get outcomePositions(): import("./types").OutcomePosition[];
    get orders(): import("./types").UmaOrder[];
    get userHostLifetime(): PublicKey;
    get lamportBalance(): number;
    get lamportBalanceUi(): number;
    get tokenBalance(): number;
    get tokenBalanceUi(): number;
    /**
     * Refresh the User Market object
     */
    refresh(): Promise<void>;
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
    makePlaceOrderInstruction(outcomeIndex: number, side: Side, limitPrice: number, size: number, sizeFormat: SizeFormat, orderType?: OrderType, selfTradeBehavior?: SelfTradeBehavior, averPreFlightCheck?: boolean): Promise<TransactionInstruction>;
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
    static makePlaceOrderInstruction(outcomeIndex: number, side: Side, limitPrice: number, size: number, sizeFormat: SizeFormat, market: Market, user: PublicKey, averClient: AverClient, userHostLifetime: PublicKey, umaPubkey: PublicKey, orderType?: OrderType, selfTradeBehavior?: SelfTradeBehavior): Promise<TransactionInstruction>;
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
    placeOrder(owner: Keypair, outcomeIndex: number, side: Side, limitPrice: number, size: number, sizeFormat: SizeFormat, sendOptions?: SendOptions, manualMaxRetry?: number, orderType?: OrderType, selfTradeBehavior?: SelfTradeBehavior, averPreFlightCheck?: boolean): Promise<string>;
    /**
     * Format the instruction to cancel an order
     *
     * @param orderId
     * @param outcomeIndex
     * @param averPreFlightCheck
     *
     * @returns {Promise<TransactionInstruction>}
     */
    makeCancelOrderInstruction(orderId: BN, outcomeIndex: number, averPreFlightCheck?: boolean): TransactionInstruction;
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
    cancelOrder(feePayer: Keypair, orderId: BN, outcomeIndex: number, sendOptions?: SendOptions, manualMaxRetry?: number, averPreFlightCheck?: boolean): Promise<string>;
    /**
     * Format instruction to cancel all orders on given outcomes
     *
     * @param outcomeIdsToCancel
     * @param averPreFlightCheck
     *
     * @returns {Promise<TransactionInstruction>}
     */
    makeCancelAllOrdersInstructions(outcomeIdsToCancel: number[], averPreFlightCheck?: boolean): TransactionInstruction[];
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
    cancelAllOrders(feePayer: Keypair, outcomeIdsToCancel: number[], sendOptions?: SendOptions, manualMaxRetry?: number, averPreFlightCheck?: boolean): Promise<string[]>;
    /**
     * Format instruction to deposit tokens
     *
     * @param amount
     *
     * @returns {Promise<TransactionInstruction>}
     */
    makeDepositTokensInstruction(amount: BN): Promise<TransactionInstruction>;
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
    depositTokens(owner: Keypair, amount: BN, sendOptions?: SendOptions, manualMaxRetry?: number): Promise<string>;
    /**
     * Format instruction to withdraw idle funds
     *
     * @param amount
     *
     * @returns {Promise<TransactionInstruction>}
     */
    makeWithdrawIdleFundsInstruction(amount?: BN): Promise<TransactionInstruction>;
    /**
     * Withdraw idle funds from the User Market
     * @param owner
     * @param amount
     * @param sendOptions
     * @param manualMaxRetry
     *
     * @returns {Promise<string>}
     */
    withdrawIdleFunds(owner: Keypair, amount?: BN, sendOptions?: SendOptions, manualMaxRetry?: number): Promise<string>;
    /**
     * Format instruction to neutralise the outcome position
     *
     * @param outcomeId
     *
     * @returns {Promise<TransactionInstruction>}
     */
    makeNeutralizePositionInstruction(outcomeId: number): Promise<TransactionInstruction>;
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
    neutralizePosition(owner: Keypair, outcomeId: number, sendOptions?: SendOptions, manualMaxRetry?: number): Promise<string>;
    /**
     * Format instruction to collect funds from the User Market
     *
     * @returns {Promise<string>}
     */
    makeCollectInstruction(): Promise<TransactionInstruction>;
    /**
     * Collect funds from the User Market
     *
     * @param owner
     * @param sendOptions
     * @param manualMaxRetry
     *
     * @returns {Promise<string>}
     */
    collect(owner: Keypair, sendOptions?: SendOptions, manualMaxRetry?: number): Promise<string>;
    loadUserMarketListener(callback: (userMarket: UserMarket) => void): Promise<import("eventemitter3")<string | symbol, any>>;
    /**
     * Calculate funds available to withdraw from the User Market
     *
     * @returns {number}
     */
    calculateFundsAvailableToWithdraw(): number;
    /**
     * Calculate exposures to each outcome
     *
     * @returns {BN[]}
     */
    calculateExposures(): any[];
    /**
     * Calculate funds available to collect based on the winning outcome
     *
     * @param winningOutcome
     *
     * @returns {number}
     */
    calculateFundsAvailableToCollect(winningOutcome: number): any;
    /**
     * Calculates the tokens available to sell on an outcome
     * @param outcomeIndex
     * @param price
     *
     * @returns {number}
     */
    calculateTokensAvailableToSell(outcomeIndex: number, price: number): any;
    /**
     * Calculates the tokens available to buy on an outcome
     *
     * @param outcomeIndex
     * @param price
     *
     * @returns {number}
     */
    calculateTokensAvailableToBuy(outcomeIndex: number, price: any): number;
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
    isOrderValid(outcomeIndex: number, side: Side, limitPrice: number, size: number, sizeFormat: SizeFormat): boolean;
}
