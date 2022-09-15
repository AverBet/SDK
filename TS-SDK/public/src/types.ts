import { Price } from "@bonfida/aaob"
import { BN } from "@project-serum/anchor"
import { PublicKey } from "@solana/web3.js"

export type AverDbMint = {
  pubkey: string
  name: string
  description: string
  notes: string
  decimals: number
}

/**
 * Status of a market
 * @enum
 *
 * Note: This is called MarketState in the contract. However, it conflicts with the market state property of the market
 */
export enum MarketStatus {
  Uninitialised,
  Initialised,
  ActivePreEvent,
  ActiveInPlay,
  HaltedPreEvent,
  HaltedInPlay,
  TradingCeased,
  CeasedCrankedClosed,
  Resolved,
  Voided,
  InPlayTransition,
}

/**
 * Level of fees paid
 *
 * This is determined by the number of AVER tokens held
 * @enum{string}
 */
export enum FeeTier {
  Base = "base",
  Aver1 = "aver1",
  Aver2 = "aver2",
  Aver3 = "aver3",
  Aver4 = "aver4",
  Aver5 = "aver5",
  Free = "zeroFees",
}

export type MarketState = {
  version: number
  marketStatus: MarketStatus
  numberOfOutcomes: number
  numberOfWinners: number
  numberOfUmas: number
  vaultBump: number
  decimals: number
  inplayStartTime?: BN
  tradingCeaseTime: BN
  winningOutcome: number
  maxQuoteTokensIn: BN
  maxQuoteTokensInPermissionCapped: BN
  crankerReward: BN
  matchedCount: BN
  averAccumulatedFees: BN
  thirdPartyAccumulatedFees: BN
  openInterest: BN
  stableQuoteTokenBalance: BN
  permissionedMarketFlag: boolean
  goingInPlayFlag: boolean
  quoteTokenMint: PublicKey
  quoteVault: PublicKey
  vaultAuthority: PublicKey
  marketAuthority: PublicKey
  marketStore: PublicKey
  oracleFeed: PublicKey
  feeTierCollectionBpsRates: [BN, BN, BN, BN, BN, BN, BN]
  marketName: string
  outcomeNames: string[]
  category: number
  subCategory: number
  series: number
  event: number
  roundingFormat: number
  inPlayQueue: PublicKey
  inPlayStartTime?: number
}

export type MarketStoreState = {
  version: number
  market: PublicKey
  numberOfOutcomes: number
  minOrderbookBaseSize: BN
  minNewOrderBaseSize: BN
  minNewOrderQuoteSize: BN
  orderbookAccounts: OrderbookAccountsState[]
  initCounter: number
  reInitCounter: number
  orderIdCounter: BN
  inPlayDelaySeconds?: number
}

export type UserMarketState = {
  version: number
  market: PublicKey
  user: PublicKey
  userVerificationAccount: PublicKey | undefined
  userHostLifetime: PublicKey
  numberOfOutcomes: number
  numberOfOrders: number
  maxNumberOfOrders: number
  netQuoteTokensIn: BN
  accumulatedMakerQuoteVolume: BN
  accumulatedMakerBaseVolume: BN
  accumulatedTakerQuoteVolume: BN
  accumulatedTakerBaseVolume: BN
  outcomePositions: OutcomePosition[]
  orders: UmaOrder[]
  inPlayOrders: InPlayOrder[]
}

export type InPlayOrder = {
  order_id: BN
  outcome_id: number
  side: number
  limit_price: BN // NOT fp32
  size_format: number
  size: BN
  order_type: number
  self_trade_behavior: number
  fee_tier: FeeTier
  total_quote_qty: number
  total_base_qty: number
  post_only: boolean
  post_allowed: boolean
  neutralize: boolean
}

export type UserBalanceState = {
  lamportBalance: number
  tokenBalance: number
}

export type ReferrerState = {
  version: number
  owner: PublicKey
  host: PublicKey
  creationDate: BN
  lastBalanceUpdate: BN
  lastWithdrawal: BN
  lastReferral: BN
  numberUsersReferred: BN
  referrerRevenueShareCollected: BN
  referrerFeeRateBps: BN
}

export type HostState = {
  version: number
  owner: PublicKey
  creationDate: BN
  lastWithdrawal: BN
  lastBalanceUpdate: BN
  hostRevenueShareUncollected: BN
  hostRevenueShareCollected: BN
  hostFeeRateBps: BN
  referrerFeeRateOfferedBps: BN
  lastReferrerTermsChange: BN
}

export type UserHostLifetimeState = {
  version: number
  user: PublicKey
  host: PublicKey
  userQuoteTokenAta: PublicKey
  referrer: PublicKey | undefined
  referrerRevenueShareUncollected: BN
  referralRevenueShareTotalGenerated: BN
  referrerFeeRateBps: BN
  lastFeeTierCheck: FeeTier
  isSelfExcluded: boolean | undefined
  isSelfExcludedUntil: BN | undefined
  creationDate: BN
  lastBalanceUpdate: BN
  totalMarketsTraded: BN
  totalQuoteVolumeTraded: BN
  totalBaseVolumeTraded: BN
  totalFeesPaid: BN
  cumulativePnl: BN
  cumulativeInvest: BN
  displayName: string | undefined
  nftPfp: PublicKey | undefined
}

export type OutcomePosition = {
  free: BN
  locked: BN
}

export type UmaOrder = {
  orderId: BN
  outcomeId: number
  baseQty: BN
  isPreEvent: boolean
  aaobOrderId: BN
}

/**
 * Type of order
 * LIMIT = a Limit order, will attempt to fill against existing opposing orders and post any or all residual order to the orderbook
 * IOC ('Immediate-or-Cancel') = will fill as much as available against existing opposing orders. Any residual unmatched part of the order will not be posted to the orderbook
 * KILL_OR_FILL = The entire order will be aborted if it cannot be immediately matched with existing opposing orders
 * POST_ONLY = The entire order will be aborted if it would have resulted in some or all of the order being filled against existing opposing orders.
 */
export enum OrderType {
  Limit = 0,
  Ioc = 1,
  KillOrFill = 2,
  PostOnly = 3,
}

export type OrderbookAccountsState = {
  asks: PublicKey
  bids: PublicKey
  eventQueue: PublicKey
  orderbook: PublicKey
}

/**
 * Side of the orderbook to trade
 * @enum{number}
 */
export enum Side {
  Bid = 0,
  Ask = 1,
}

/**
 * Order size format
 *
 * Payout is the total amount paid out if a bet is won (stake + profit).
 * Stake is the total amount at risk for a user (payout - profit).
 * @enum{number}
 */
export enum SizeFormat {
  Payout = 0,
  Stake = 1,
}

/**
 * Solana Network
 *
 * Currently only DEVNET and MAINNET are available
 * @enum
 */
export enum SolanaNetwork {
  Devnet = "devnet",
  Mainnet = "mainnet-beta",
}

export type PriceAndSide = Price & { side: Side }

export type SlabOrder = {
  id: BN
  price: number
  price_ui: number
  base_quantity: number
  base_quantity_ui: number
  // user_market: PublicKey
  // fee_tier: number
}

export enum AccountType {
  MARKET = "market",
  MARKET_STORE = "marketStore",
  USER_MARKET = "userMarket",
  USER_HOST_LIFETIME = "userHostLifetime",
}
