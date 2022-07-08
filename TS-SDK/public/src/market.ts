import { Slab } from '@bonfida/aaob'
import { Idl, IdlTypeDef } from '@project-serum/anchor/dist/cjs/idl'
import { IdlTypes, TypeDef } from '@project-serum/anchor/dist/cjs/program/namespace/types'
import { AccountLayout, ACCOUNT_SIZE, getAssociatedTokenAddress } from '@solana/spl-token'
import { AccountInfo, Connection, PublicKey } from '@solana/web3.js'
import { AverClient } from './aver-client'
import { AVER_PROGRAM_ID, getQuoteToken } from './ids'
import { Orderbook } from './orderbook'
import {
  MarketState,
  MarketStatus,
  MarketStoreState,
  OrderbookAccountsState,
  SolanaNetwork,
  UserBalanceState,
  UserMarketState,
} from './types'
import { UserMarket } from './user-market'
import { chunkAndFetchMultiple } from './utils'

export class Market {
  private _pubkey: PublicKey

  private _marketState: MarketState

  private _marketStoreState?: MarketStoreState

  private _orderbooks?: Orderbook[]

  private _averClient: AverClient

  private constructor(
    averClient: AverClient,
    pubkey: PublicKey,
    marketState: MarketState,
    marketStoreState?: MarketStoreState,
    orderbooks?: Orderbook[]
  ) {
    this._pubkey = pubkey
    this._marketState = marketState
    this._marketStoreState = marketStoreState
    this._averClient = averClient

    // store 2 orderbooks for binary markets
    this._orderbooks =
      marketState.numberOfOutcomes == 2 && orderbooks?.length == 1
        ? orderbooks?.concat(Orderbook.invert(orderbooks[0]))
        : orderbooks
  }

  /**
   * Load the Aver Market
   * 
   * @param {AverClient} averClient The aver client instance
   * @param {PublicKey} pubkey The market public key
   * 
   * @returns {Promise<Market>} the market once it has loaded
   */
  static async load(averClient: AverClient, pubkey: PublicKey) {
    const program = averClient.program
    const [marketStorePubkey, marketStoreBump] = await Market.deriveMarketStorePubkeyAndBump(
      pubkey
    )
    const marketResultAndMarketStoreResult = await Promise.all([
      program.account['market'].fetch(pubkey.toBase58()),
      program.account['marketStore'].fetch(marketStorePubkey.toBase58())
    ])
    const marketState = Market.parseMarketState(marketResultAndMarketStoreResult[0])

    // market store and orderbooks do not exist for closed markets
    const marketStoreResult = marketResultAndMarketStoreResult[1]

    if (!marketStoreResult) {
      return new Market(averClient, pubkey, marketState)
    }

    const marketStoreState = Market.parseMarketStoreState(marketStoreResult)

    const orderbooks = await Market.getOrderbooksFromOrderbookAccounts(
      program.provider.connection,
      marketStoreState.orderbookAccounts,
      marketState.decimals
    )

    return new Market(averClient, pubkey, marketState, marketStoreState, orderbooks)
  }

  /**
   * Load multiple Aver Markets
   * 
   * @param {AverClient} averClient The aver client instance
   * @param {PublicKey[]} pubkeys The market public keys
   * 
   * @returns {Promise<(Market |  null)[]>} the markets once they have loaded
   */
  static async loadMultiple(
    averClient: AverClient,
    pubkeys: PublicKey[]
  ): Promise<(Market | null)[]> {
    const program = averClient.program
    const marketStorePubkeys = await Market.deriveMarketStorePubkeysAndBump(pubkeys)
    const marketResultsAndMarketStoreResults = await Promise.all([
      program.account['market'].fetchMultiple(pubkeys),
      program.account['marketStore'].fetchMultiple(
        marketStorePubkeys.map(([pubkey, bump]) => {
          return pubkey
        })
      )
    ])

    const marketStates = marketResultsAndMarketStoreResults[0].map((marketResult) =>
      marketResult ? Market.parseMarketState(marketResult) : null
    )
    const marketStoreStates = marketResultsAndMarketStoreResults[1].map((marketStoreResult) =>
      marketStoreResult ? Market.parseMarketStoreState(marketStoreResult) : null
    )

    // TODO optimize to load all slabs for all orderbooks for all markets in one request
    const nestedOrderbooks = await Promise.all(
      marketStoreStates.map((mss, i) =>
        mss && marketStates[i]
          ? Market.getOrderbooksFromOrderbookAccounts(
              program.provider.connection,
              mss.orderbookAccounts,
              marketStates[i]?.decimals || 6
            )
          : null
      )
    )

    return marketStates.map((marketState, i) =>
      marketState
        ? new Market(
            averClient,
            pubkeys[i],
            marketState,
            marketStoreStates[i] || undefined,
            nestedOrderbooks[i] || undefined
          )
        : null
    )
  }

  /**
   * Refresh multiple markets
   * 
   * @param {AverClient} averClient The aver client instance
   * @param {Market[]} markets The markets to be refreshed
   * 
   * @returns {Promise<Market[]>} The refreshed markets
   */
  static async refreshMultipleMarkets(averClient: AverClient, markets: Market[]) {
    const orderbookAccounts = markets
      .filter((market) => !!market.orderbookAccounts)
      .map((market) => market.orderbookAccounts) as any as OrderbookAccountsState[][]

    const multipleAccountStates = await Market.loadMultipleAccountStates(
      averClient,
      markets.map((market) => market.pubkey),
      markets.map((market) => market.marketStore),
      orderbookAccounts.flatMap((ordAcc) => ordAcc?.flatMap((acc) => [acc.bids, acc.asks]))
    )

    return Market.getMarketsFromAccountStates(
      averClient,
      markets.map((m) => m.pubkey),
      multipleAccountStates.marketStates,
      multipleAccountStates.marketStoreStates,
      multipleAccountStates.slabs
    )
  }

  static getMarketsFromAccountStates(
    averClient: AverClient,
    marketPubkeys: PublicKey[],
    marketStates: (MarketState | null)[],
    marketStoreStates: (MarketStoreState | null)[],
    slabs: (Slab | null)[]
  ) {
    // creates orderbooks for each market
    let slabPositionCounter = 0
    const allOrderbooks: (Orderbook[] | undefined)[] = marketStoreStates.map((mss, j) => {
      const newOrderbookList = mss?.orderbookAccounts?.map((oa, i) => {
        const newOrderbook = new Orderbook(
          oa.orderbook,
          slabs[slabPositionCounter + i * 2] as Slab,
          slabs[slabPositionCounter + i * 2 + 1] as Slab,
          oa.bids,
          oa.asks,
          marketStates[j]?.decimals || 6
        )
        return newOrderbook
      })

      slabPositionCounter +=
        (marketStoreStates[j] as MarketStoreState)?.orderbookAccounts.length * 2 || 0

      return newOrderbookList
    })

    return marketPubkeys.map(
      (m, i) =>
        new Market(
          averClient,
          m,
          marketStates[i] as MarketState,
          marketStoreStates[i] || undefined,
          allOrderbooks[i]
        )
    )
  }

  static async loadMultipleAccountStates(
    averClient: AverClient,
    marketPubkeys: PublicKey[] = [],
    marketStorePubkeys: PublicKey[] = [],
    slabPubkeys: PublicKey[] = [],
    userMarketPubkeys: PublicKey[] = [],
    userPubkeys: PublicKey[] = []
  ): Promise<{
    marketStates: (MarketState | null)[]
    marketStoreStates: (MarketStoreState | null)[]
    slabs: (Slab | null)[]
    userMarketStates: (UserMarketState | null)[]
    userBalanceStates: UserBalanceState[]
  }> {
    const connection = averClient.connection

    const allAtaPubkeys = await Promise.all(
      userPubkeys.map((u) => getAssociatedTokenAddress(averClient.quoteTokenMint, u))
    )

    const allPubkeys = marketPubkeys
      .concat(marketStorePubkeys)
      .concat(slabPubkeys)
      .concat(userMarketPubkeys)
      .concat(userPubkeys)
      .concat(allAtaPubkeys)

    const accountsData = await chunkAndFetchMultiple(connection, allPubkeys)

    const deserializedMarketData = Market.deserializeMultipleMarketData(
      averClient,
      accountsData.slice(0, marketPubkeys.length)
    )
    const deserializedMarketStoreData = Market.deserializeMultipleMarketStoreData(
      averClient,
      accountsData.slice(marketPubkeys.length, marketPubkeys.length + marketStorePubkeys.length)
    )
    const deserializedSlabsData = Orderbook.deserializeMultipleSlabData(
      accountsData.slice(
        marketPubkeys.length + marketStorePubkeys.length,
        marketPubkeys.length + marketStorePubkeys.length + slabPubkeys.length
      )
    )

    const deserializedUserMarketData = UserMarket.deserializeMultipleUserMarketStoreData(
      averClient,
      accountsData.slice(
        marketPubkeys.length + marketStorePubkeys.length + slabPubkeys.length,
        marketPubkeys.length +
          marketStorePubkeys.length +
          slabPubkeys.length +
          userMarketPubkeys.length
      )
    )

    const lamportBalances: number[] = accountsData
      .slice(-userPubkeys.length * 2, -userPubkeys.length)
      .map((info) => info?.lamports || 0)

    const tokenBalances = accountsData
      .slice(-userPubkeys.length)
      .map((info) =>
        info?.data?.length == ACCOUNT_SIZE ? Number(AccountLayout.decode(info.data).amount) : 0
      )

    const userBalanceStates: UserBalanceState[] = lamportBalances.map((b, i) => ({
      lamportBalance: b,
      tokenBalance: tokenBalances[i],
    }))

    return {
      marketStates: deserializedMarketData,
      marketStoreStates: deserializedMarketStoreData,
      slabs: deserializedSlabsData,
      userMarketStates: deserializedUserMarketData,
      userBalanceStates,
    }
  }

  private static deserializeMultipleMarketData(
    averClient: AverClient,
    marketsData: AccountInfo<Buffer | null>[]
  ): (MarketState | null)[] {
    return marketsData.map((marketData) =>
      marketData?.data
        ? averClient.program.account['market'].coder.accounts.decode('Market', marketData.data)
        : null
    )
  }

  private static deserializeMultipleMarketStoreData(
    averClient: AverClient,
    marketStoresData: AccountInfo<Buffer | null>[]
  ): (MarketStoreState | null)[] {
    return marketStoresData.map((marketStoreData) =>
      marketStoreData?.data
        ? averClient.program.account['marketStore'].coder.accounts.decode(
            'MarketStore',
            marketStoreData.data
          )
        : null
    )
  }

  private static parseMarketState(marketResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>): MarketState {
    return marketResult as MarketState
  }

  private static parseMarketStoreState(
    marketStoreResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>
  ): MarketStoreState {
    return marketStoreResult as MarketStoreState
  }

  static async deriveMarketStorePubkeyAndBump(
    marketPubkey: PublicKey,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    return PublicKey.findProgramAddress(
      [Buffer.from('market-store', 'utf-8'), marketPubkey.toBuffer()],
      programId
    )
  }

  private static async deriveMarketStorePubkeysAndBump(
    marketPubkeys: PublicKey[],
    programId: PublicKey = AVER_PROGRAM_ID
  ) {

    return await Promise.all(marketPubkeys.map((marketPubkey) => {
      return PublicKey.findProgramAddress(
        [Buffer.from('market-store', 'utf-8'), marketPubkey.toBuffer()],
        programId
      )
    }))
  }

  private static async deriveQuoteVaultAuthorityPubkeyAndBump(
    marketPubkey: PublicKey,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    return PublicKey.findProgramAddress([marketPubkey.toBuffer()], programId)
  }

  static async deriveQuoteVaultPubkey(
    marketPubkey: PublicKey,
    network: SolanaNetwork,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    const [vaultAuthority, _] = await Market.deriveQuoteVaultAuthorityPubkeyAndBump(
      marketPubkey,
      programId
    )
    const quoteToken = getQuoteToken(network)
    return getAssociatedTokenAddress(quoteToken, vaultAuthority, true)
  }

  get pubkey() {
    return this._pubkey
  }

  get name() {
    return this._marketState.marketName
  }

  get decimals() {
    return this._marketState.decimals
  }

  get marketStore() {
    return this._marketState.marketStore
  }

  get quoteTokenMint() {
    return this._marketState.quoteTokenMint
  }

  get quoteVault() {
    return this._marketState.quoteVault
  }

  get marketStatus() {
    return this._marketState.marketStatus
  }

  get vaultAuthority() {
    return this._marketState.vaultAuthority
  }

  get winningOutcome() {
    return this._marketState.winningOutcome
  }

  get numberOfOutcomes() {
    return this._marketState.numberOfOutcomes
  }

  get numberOfWinners() {
    return this._marketState.numberOfWinners
  }

  get maxQuoteTokensIn() {
    return this._marketState.maxQuoteTokensIn
  }

  get maxQuoteTokensInPermissionCapped() {
    return this._marketState.maxQuoteTokensInPermissionCapped
  }

  get crankerReward() {
    return this._marketState.crankerReward
  }

  get withdrawableQuoteTokenBalance() {
    return this._marketState.withdrawableQuoteTokenBalance
  }

  get permissionedMarketFlag() {
    return this._marketState.permissionedMarketFlag
  }

  get goingInPlayFlag() {
    return this._marketState.goingInPlayFlag
  }

  get marketAuthority() {
    return this._marketState.marketAuthority
  }

  get oracleFeed() {
    return this._marketState.oracleFeed
  }

  get feeTierCollectionBpsRates() {
    return this._marketState.feeTierCollectionBpsRates
  }

  get minNewOrderBaseSize() {
    return this._marketStoreState?.minNewOrderBaseSize
  }

  get minNewOrderQuoteSize() {
    return this._marketStoreState?.minNewOrderQuoteSize
  }

  get minOrderbookBaseSize() {
    return this._marketStoreState?.minOrderbookBaseSize
  }

  get orderbooks() {
    return this._orderbooks
  }

  get orderbookAccounts() {
    return this._marketStoreState?.orderbookAccounts
  }

  get tradingCeaseTime() {
    return new Date(this._marketState.tradingCeaseTime.toNumber() * 1000)
  }

  get inplayStartTime() {
    return this._marketState.inplayStartTime
      ? new Date(this._marketState.inplayStartTime.toNumber() * 1000)
      : undefined
  }

  /**
   * Refresh the Market instance
   */
  async refresh() {
    const market = (await Market.refreshMultipleMarkets(this._averClient, [this]))[0]
    this._marketState = market._marketState
    this._marketStoreState = market._marketStoreState
    this._orderbooks = market._orderbooks
  }

  // NOT TESTED
  async loadMarketListener(callback: (marketState: MarketState) => void) {
    const ee = this._averClient.program.account['market'].subscribe(this.pubkey)
    ee.on('change', callback)
    return ee
  }

  // NOT TESTED
  async loadMarketStoreListener(callback: (marketState: MarketState) => void) {
    const ee = this._averClient.program.account['marketStore'].subscribe(this.marketStore)
    ee.on('change', callback)
    return ee
  }

  private static async getOrderbooksFromOrderbookAccounts(
    connection: Connection,
    orderbookAccounts: OrderbookAccountsState[],
    decimals: number
  ): Promise<Orderbook[]> {
    const allBidsAndAsksAccounts = orderbookAccounts.map((o) => [o.bids, o.asks]).flat()
    const allSlabs = await Orderbook.loadMultipleSlabs(connection, allBidsAndAsksAccounts)

    return orderbookAccounts.map(
      (o, i) =>
        new Orderbook(
          o.orderbook,
          // @ts-expect-error
          allSlabs[i * 2],
          allSlabs[i * 2 + 1],
          allBidsAndAsksAccounts[i * 2],
          allBidsAndAsksAccounts[i * 2 + 1],
          decimals
        )
    )
  }
}

export const isMarketStatusClosed = (marketStatus: MarketStatus) =>
  [MarketStatus.CeasedCrankedClosed, MarketStatus.Resolved, MarketStatus.Voided].includes(
    marketStatus
  )

export const isMarketTradable = (marketStatus: MarketStatus) =>
  [MarketStatus.ActiveInPlay, MarketStatus.ActivePreEvent].includes(marketStatus)

export const canCancelOrderInMarket = (marketStatus: MarketStatus) =>
  [
    MarketStatus.ActiveInPlay,
    MarketStatus.ActivePreEvent,
    MarketStatus.HaltedInPlay,
    MarketStatus.HaltedPreEvent,
  ].includes(marketStatus)
