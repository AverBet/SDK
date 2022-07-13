import { Price } from '@bonfida/aaob'
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

export type AverDbMint = {
  pubkey: string
  name: string
  description: string
  notes: string
  decimals: number
}

// Note: This is called MarketState in the contract. However, it conflicts with the market state property of the market
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
}

export enum FeeTier {
  Base = 'base',
  Aver1 = 'aver1',
  Aver2 = 'aver2',
  Aver3 = 'aver3',
  Aver4 = 'aver4',
  Aver5 = 'aver5',
  Free = 'zeroFees',
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
  withdrawableQuoteTokenBalance: BN
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
}

// custom type
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
}

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

export enum Side {
  Bid = 0,
  Ask = 1,
}

export enum SizeFormat {
  Payout = 0,
  Stake = 1,
}

export enum SolanaNetwork {
  Devnet = 'devnet',
  Mainnet = 'mainnet-beta',
}

export type PriceAndSide = Price & {side: Side}
