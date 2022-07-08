import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
export declare type AverDbMint = {
    pubkey: string;
    name: string;
    description: string;
    notes: string;
    decimals: number;
};
export declare enum MarketStatus {
    Uninitialised = 0,
    Initialised = 1,
    ActivePreEvent = 2,
    ActiveInPlay = 3,
    HaltedPreEvent = 4,
    HaltedInPlay = 5,
    TradingCeased = 6,
    CeasedCrankedClosed = 7,
    Resolved = 8,
    Voided = 9
}
export declare enum FeeTier {
    Base = "base",
    Aver1 = "aver1",
    Aver2 = "aver2",
    Aver3 = "aver3",
    Aver4 = "aver4",
    Aver5 = "aver5",
    Free = "zeroFees"
}
export declare type MarketState = {
    version: number;
    marketStatus: MarketStatus;
    numberOfOutcomes: number;
    numberOfWinners: number;
    numberOfUmas: number;
    vaultBump: number;
    decimals: number;
    inplayStartTime?: BN;
    tradingCeaseTime: BN;
    winningOutcome: number;
    maxQuoteTokensIn: BN;
    maxQuoteTokensInPermissionCapped: BN;
    crankerReward: BN;
    matchedCount: BN;
    averAccumulatedFees: BN;
    thirdPartyAccumulatedFees: BN;
    openInterest: BN;
    withdrawableQuoteTokenBalance: BN;
    permissionedMarketFlag: boolean;
    goingInPlayFlag: boolean;
    quoteTokenMint: PublicKey;
    quoteVault: PublicKey;
    vaultAuthority: PublicKey;
    marketAuthority: PublicKey;
    marketStore: PublicKey;
    oracleFeed: PublicKey;
    feeTierCollectionBpsRates: [BN, BN, BN, BN, BN, BN, BN];
    marketName: string;
    outcomeNames: string[];
};
export declare type MarketStoreState = {
    version: number;
    market: PublicKey;
    numberOfOutcomes: number;
    minOrderbookBaseSize: BN;
    minNewOrderBaseSize: BN;
    minNewOrderQuoteSize: BN;
    orderbookAccounts: OrderbookAccountsState[];
    initCounter: number;
};
export declare type UserMarketState = {
    version: number;
    market: PublicKey;
    user: PublicKey;
    userVerificationAccount: PublicKey | undefined;
    userHostLifetime: PublicKey;
    numberOfOutcomes: number;
    numberOfOrders: number;
    maxNumberOfOrders: number;
    netQuoteTokensIn: BN;
    accumulatedMakerQuoteVolume: BN;
    accumulatedMakerBaseVolume: BN;
    accumulatedTakerQuoteVolume: BN;
    accumulatedTakerBaseVolume: BN;
    outcomePositions: OutcomePosition[];
    orders: UmaOrder[];
};
export declare type UserBalanceState = {
    lamportBalance: number;
    tokenBalance: number;
};
export declare type ReferrerState = {
    version: number;
    owner: PublicKey;
    host: PublicKey;
    creationDate: BN;
    lastBalanceUpdate: BN;
    lastWithdrawal: BN;
    lastReferral: BN;
    numberUsersReferred: BN;
    referrerRevenueShareCollected: BN;
    referrerFeeRateBps: BN;
};
export declare type HostState = {
    version: number;
    owner: PublicKey;
    creationDate: BN;
    lastWithdrawal: BN;
    lastBalanceUpdate: BN;
    hostRevenueShareUncollected: BN;
    hostRevenueShareCollected: BN;
    hostFeeRateBps: BN;
    referrerFeeRateOfferedBps: BN;
    lastReferrerTermsChange: BN;
};
export declare type UserHostLifetimeState = {
    version: number;
    user: PublicKey;
    host: PublicKey;
    userQuoteTokenAta: PublicKey;
    referrer: PublicKey | undefined;
    referrerRevenueShareUncollected: BN;
    referralRevenueShareTotalGenerated: BN;
    referrerFeeRateBps: BN;
    lastFeeTierCheck: FeeTier;
    isSelfExcluded: boolean | undefined;
    creationDate: BN;
    lastBalanceUpdate: BN;
    totalMarketsTraded: BN;
    totalQuoteVolumeTraded: BN;
    totalBaseVolumeTraded: BN;
    totalFeesPaid: BN;
    cumulativePnl: BN;
    cumulativeInvest: BN;
    displayName: string | undefined;
    nftPfp: PublicKey | undefined;
};
export declare type OutcomePosition = {
    free: BN;
    locked: BN;
};
export declare type UmaOrder = {
    orderId: BN;
    outcomeId: number;
    baseQty: BN;
};
export declare enum OrderType {
    Limit = 0,
    Ioc = 1,
    KillOrFill = 2,
    PostOnly = 3
}
export declare type OrderbookAccountsState = {
    asks: PublicKey;
    bids: PublicKey;
    eventQueue: PublicKey;
    orderbook: PublicKey;
};
export declare enum Side {
    Bid = 0,
    Ask = 1
}
export declare enum SizeFormat {
    Payout = 0,
    Stake = 1
}
export declare enum SolanaNetwork {
    Devnet = "devnet",
    Mainnet = "mainnet-beta"
}
