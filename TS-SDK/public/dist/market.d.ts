import { Slab } from '@bonfida/aaob';
import { PublicKey } from '@solana/web3.js';
import { AverClient } from './aver-client';
import { Orderbook } from './orderbook';
import { MarketState, MarketStatus, MarketStoreState, OrderbookAccountsState, SolanaNetwork, UserBalanceState, UserMarketState } from './types';
export declare class Market {
    private _pubkey;
    private _marketState;
    private _marketStoreState?;
    private _orderbooks?;
    private _averClient;
    private constructor();
    /**
     * Load the Aver Market
     *
     * @param {AverClient} averClient The aver client instance
     * @param {PublicKey} pubkey The market public key
     *
     * @returns {Promise<Market>} the market once it has loaded
     */
    static load(averClient: AverClient, pubkey: PublicKey): Promise<Market>;
    /**
     * Load multiple Aver Markets
     *
     * @param {AverClient} averClient The aver client instance
     * @param {PublicKey[]} pubkeys The market public keys
     *
     * @returns {Promise<(Market |  null)[]>} the markets once they have loaded
     */
    static loadMultiple(averClient: AverClient, pubkeys: PublicKey[]): Promise<(Market | null)[]>;
    /**
     * Refresh multiple markets
     *
     * @param {AverClient} averClient The aver client instance
     * @param {Market[]} markets The markets to be refreshed
     *
     * @returns {Promise<Market[]>} The refreshed markets
     */
    static refreshMultipleMarkets(averClient: AverClient, markets: Market[]): Promise<Market[]>;
    static getMarketsFromAccountStates(averClient: AverClient, marketPubkeys: PublicKey[], marketStates: (MarketState | null)[], marketStoreStates: (MarketStoreState | null)[], slabs: (Slab | null)[]): Market[];
    static loadMultipleAccountStates(averClient: AverClient, marketPubkeys?: PublicKey[], marketStorePubkeys?: PublicKey[], slabPubkeys?: PublicKey[], userMarketPubkeys?: PublicKey[], userPubkeys?: PublicKey[]): Promise<{
        marketStates: (MarketState | null)[];
        marketStoreStates: (MarketStoreState | null)[];
        slabs: (Slab | null)[];
        userMarketStates: (UserMarketState | null)[];
        userBalanceStates: UserBalanceState[];
    }>;
    private static deserializeMultipleMarketData;
    private static deserializeMultipleMarketStoreData;
    private static parseMarketState;
    private static parseMarketStoreState;
    static deriveMarketStorePubkeyAndBump(marketPubkey: PublicKey, programId?: PublicKey): Promise<[PublicKey, number]>;
    private static deriveMarketStorePubkeysAndBump;
    private static deriveQuoteVaultAuthorityPubkeyAndBump;
    static deriveQuoteVaultPubkey(marketPubkey: PublicKey, network: SolanaNetwork, programId?: PublicKey): Promise<PublicKey>;
    get pubkey(): PublicKey;
    get name(): string;
    get decimals(): number;
    get marketStore(): PublicKey;
    get quoteTokenMint(): PublicKey;
    get quoteVault(): PublicKey;
    get marketStatus(): MarketStatus;
    get vaultAuthority(): PublicKey;
    get winningOutcome(): number;
    get numberOfOutcomes(): number;
    get numberOfWinners(): number;
    get maxQuoteTokensIn(): BN;
    get maxQuoteTokensInPermissionCapped(): BN;
    get crankerReward(): BN;
    get withdrawableQuoteTokenBalance(): BN;
    get permissionedMarketFlag(): boolean;
    get goingInPlayFlag(): boolean;
    get marketAuthority(): PublicKey;
    get oracleFeed(): PublicKey;
    get feeTierCollectionBpsRates(): [BN, BN, BN, BN, BN, BN, BN];
    get minNewOrderBaseSize(): any;
    get minNewOrderQuoteSize(): any;
    get minOrderbookBaseSize(): any;
    get orderbooks(): Orderbook[] | undefined;
    get orderbookAccounts(): OrderbookAccountsState[] | undefined;
    get tradingCeaseTime(): Date;
    get inplayStartTime(): Date | undefined;
    /**
     * Refresh the Market instance
     */
    refresh(): Promise<void>;
    loadMarketListener(callback: (marketState: MarketState) => void): Promise<import("eventemitter3")<string | symbol, any>>;
    loadMarketStoreListener(callback: (marketState: MarketState) => void): Promise<import("eventemitter3")<string | symbol, any>>;
    private static getOrderbooksFromOrderbookAccounts;
}
export declare const isMarketStatusClosed: (marketStatus: MarketStatus) => boolean;
export declare const isMarketTradable: (marketStatus: MarketStatus) => boolean;
export declare const canCancelOrderInMarket: (marketStatus: MarketStatus) => boolean;
