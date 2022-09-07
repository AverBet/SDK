import { EventFill, EventOut, Slab } from "@bonfida/aaob"
import { BN, Wallet } from "@project-serum/anchor"
import { Idl, IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl"
import {
  IdlTypes,
  TypeDef,
} from "@project-serum/anchor/dist/cjs/program/namespace/types"
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token"
import {
  AccountLayout,
  ACCOUNT_SIZE,
  getAssociatedTokenAddress,
} from "@solana/spl-token"
import {
  AccountInfo,
  Connection,
  Keypair,
  PublicKey,
  AccountMeta,
  SystemProgram,
  SendOptions,
} from "@solana/web3.js"
import { AverClient } from "./aver-client"
import { loadAllEventQueues, prepareUserAccountsList } from "./event-queue"
import {
  AVER_PROGRAM_IDS,
  getQuoteToken,
  MAX_ITERATIONS_FOR_CONSUME_EVENTS,
} from "./ids"
import { Orderbook } from "./orderbook"
import {
  AccountType,
  MarketState,
  MarketStatus,
  MarketStoreState,
  OrderbookAccountsState,
  SolanaNetwork,
  UserBalanceState,
  UserHostLifetimeState,
  UserMarketState,
} from "./types"
import { UserHostLifetime } from "./user-host-lifetime"
import { UserMarket } from "./user-market"
import {
  chunkAndFetchMultiple,
  getVersionOfAccountTypeInProgram,
  parseWithVersion,
  signAndSendTransactionInstructions,
} from "./utils"

export class Market {
  /**
   * AverMarket object
   *
   * Contains information, references and and orderbooks on a particular market
   */

  /**
   * @private
   * Market pubkey
   */
  private _pubkey: PublicKey

  /**
   * @private
   * MarketState object holding data about the market
   */
  private _marketState: MarketState

  /**
   * @private
   * MarketStoreStateobject holding data about the market required during active trading.
   *
   * This does not exist if the market has stopped trading, voided or resolved
   */
  private _marketStoreState?: MarketStoreState

  /**
   * @private
   * Ordered list of Orderbooks for this market.
   *
   * Note: Binary (two-outcome) markets only have 1 orderbook on chain.
   */
  private _orderbooks?: Orderbook[]

  /**
   * @private
   * AverClient object
   */
  private _averClient: AverClient

  /**
   * @private
   * Program ID for this market
   */
  private _programId: PublicKey

  /**
   * Initialise an AverMarket object. Do not use this function; use Market.load() instead.
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey} pubkey - Market public key
   * @param {MarketState} marketState - MarketState object
   * @param {PublicKey} programId - Program ID Public Key
   * @param {MarketStoreState} marketStoreState - MarketStoreState object
   * @param {Orderbook[]} orderbooks - List of Orderbook objects
   */
  private constructor(
    averClient: AverClient,
    pubkey: PublicKey,
    marketState: MarketState,
    programId: PublicKey,
    marketStoreState?: MarketStoreState,
    orderbooks?: Orderbook[]
  ) {
    this._pubkey = pubkey
    this._marketState = marketState
    this._marketStoreState = marketStoreState
    this._averClient = averClient
    this._programId = programId

    // Store 2 orderbooks for binary markets
    this._orderbooks =
      marketState.numberOfOutcomes == 2 && orderbooks?.length == 1
        ? orderbooks?.concat(Orderbook.invert(orderbooks[0]))
        : orderbooks
  }

  /**
   * Initialises an AverMarket object
   *
   * To refresh data on an already loaded market use refreshMarkets()
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey} pubkey - Market public key
   *
   * @returns {Promise<Market>} - AverMarket object
   */
  static async load(averClient: AverClient, pubkey: PublicKey) {
    return (await Market.loadMultiple(averClient, [pubkey]))[0]
  }

  /**
   * Initialises multiple AverMarket objects
   *
   * This method is quicker that using Market.load() multiple times
   *
   * To refresh data on already loaded markets use refreshMultipleMarkets()
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey[]} pubkeys - List of Market public keys
   *
   * @returns {Promise<(Market |  null)[]>} List of AverMarket objects
   */
  static async loadMultiple(
    averClient: AverClient,
    pubkeys: PublicKey[]
  ): Promise<(Market | null)[]> {
    // get programId of market
    const programIds = (
      await chunkAndFetchMultiple(averClient.connection, pubkeys)
    ).map((m) => m?.owner)
    const programs = await Promise.all(
      programIds.map((p) => averClient.getProgramFromProgramId(p))
    )

    const marketStorePubkeys = (
      await Market.deriveMarketStorePubkeysAndBump(pubkeys, programIds)
    ).map(([pubkey, bump]) => {
      return pubkey
    })

    const marketResultsAndMarketStoreResults = await chunkAndFetchMultiple(
      averClient.connection,
      pubkeys.concat(marketStorePubkeys)
    )

    const marketStateResults = marketResultsAndMarketStoreResults
      .slice(0, pubkeys.length)
      .map((v, i) =>
        v ? parseWithVersion(programs[i], AccountType.MARKET, v) : null
      )

    const marketStoreStateResults = marketResultsAndMarketStoreResults
      .slice(pubkeys.length, marketResultsAndMarketStoreResults.length)
      .map((v, i) =>
        v ? parseWithVersion(programs[i], AccountType.MARKET_STORE, v) : null
      )

    const marketStates = marketStateResults.map((marketResult) =>
      marketResult ? Market.parseMarketState(marketResult) : null
    )
    const marketStoreStates = marketStoreStateResults.map((marketStoreResult) =>
      marketStoreResult ? Market.parseMarketStoreState(marketStoreResult) : null
    )

    const nestedOrderbooks =
      await Market.getOrderbooksFromOrderbookAccountsMultipleMarkets(
        averClient.connection,
        marketStates,
        marketStoreStates
      )

    return marketStates.map((marketState, i) =>
      marketState
        ? new Market(
            averClient,
            pubkeys[i],
            marketState,
            programIds[i] || AVER_PROGRAM_IDS[0],
            marketStoreStates[i] || undefined,
            nestedOrderbooks[i] || undefined
          )
        : null
    )
  }

  /**
   * Refresh all data for multiple markets quickly
   *
   * This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.
   *
   * Use instead instead of loadMultiple()
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Market[]} markets - List of AverMarket objects
   *
   * @returns {Promise<Market[]>} - List of refreshed AverMarket objects
   */
  static async refreshMultipleMarkets(
    averClient: AverClient,
    markets: Market[]
  ) {
    const orderbookAccounts = markets
      .filter((market) => !!market.orderbookAccounts)
      .map(
        (market) => market.orderbookAccounts
      ) as any as OrderbookAccountsState[][]

    const multipleAccountStates = await Market.loadMultipleAccountStates(
      averClient,
      markets.map((market) => market.pubkey),
      markets.map((market) => market.marketStore),
      orderbookAccounts.flatMap((ordAcc) =>
        ordAcc?.flatMap((acc) => [acc.bids, acc.asks])
      )
    )

    return Market.getMarketsFromAccountStates(
      averClient,
      markets.map((m) => m.pubkey),
      multipleAccountStates.marketStates,
      multipleAccountStates.marketStoreStates,
      multipleAccountStates.slabs,
      markets.map((m) => m._programId)
    )
  }

  static getMarketsFromAccountStates(
    averClient: AverClient,
    marketPubkeys: PublicKey[],
    marketStates: (MarketState | null)[],
    marketStoreStates: (MarketStoreState | null)[],
    slabs: (Slab | null)[],
    programIds: PublicKey[]
  ) {
    // creates orderbooks for each market
    let slabPositionCounter = 0
    const allOrderbooks: (Orderbook[] | undefined)[] = marketStoreStates.map(
      (mss, j) => {
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
          (marketStoreStates[j] as MarketStoreState)?.orderbookAccounts.length *
            2 || 0

        return newOrderbookList
      }
    )

    return marketPubkeys.map(
      (m, i) =>
        new Market(
          averClient,
          m,
          marketStates[i] as MarketState,
          programIds[i],
          marketStoreStates[i] || undefined,
          allOrderbooks[i]
        )
    )
  }

  /**
   * Fetchs account data for multiple account types at once
   *
   * Used to quickly and efficiently pull all account data at once
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey[]} marketPubkeys - List of MarketState object public keys
   * @param {PublicKey[]} marketStorePubkeys - List of MarketStoreStore object public keys
   * @param {PublicKey[]} slabPubkeys - List of Slab public keys for orderbooks
   * @param {PublicKey[]} userMarketPubkeys - List of UserMarketState object public keys
   * @param {PublicKey[]} userPubkeys - List of UserMarket owners' public keys
   * @param {PublicKey[]} userHostLifetimePubkeys - List of UserHostLifetime public keys
   * @returns - Object containing loaded accounts
   */
  static async loadMultipleAccountStates(
    averClient: AverClient,
    marketPubkeys: PublicKey[] = [],
    marketStorePubkeys: PublicKey[] = [],
    slabPubkeys: PublicKey[] = [],
    userMarketPubkeys: PublicKey[] = [],
    userPubkeys: PublicKey[] = [],
    userHostLifetimePubkeys: PublicKey[] = []
  ): Promise<{
    marketStates: (MarketState | null)[]
    marketStoreStates: (MarketStoreState | null)[]
    slabs: (Slab | null)[]
    userMarketStates: (UserMarketState | null)[]
    userBalanceStates: UserBalanceState[]
    userHostLifetimes: (UserHostLifetime | null)[]
  }> {
    const connection = averClient.connection

    const allAtaPubkeys = await Promise.all(
      userPubkeys.map((u) =>
        getAssociatedTokenAddress(averClient.quoteTokenMint, u)
      )
    )

    const allPubkeys = marketPubkeys
      .concat(marketStorePubkeys)
      .concat(slabPubkeys)
      .concat(userMarketPubkeys)
      .concat(userPubkeys)
      .concat(allAtaPubkeys)
      .concat(userHostLifetimePubkeys)

    const accountsData = await chunkAndFetchMultiple(connection, allPubkeys)

    const deserializedMarketData = await Market.deserializeMultipleMarketData(
      averClient,
      accountsData.slice(0, marketPubkeys.length)
    )
    const deserializedMarketStoreData =
      await Market.deserializeMultipleMarketStoreData(
        averClient,
        accountsData.slice(
          marketPubkeys.length,
          marketPubkeys.length + marketStorePubkeys.length
        )
      )
    const deserializedSlabsData = Orderbook.deserializeMultipleSlabData(
      accountsData.slice(
        marketPubkeys.length + marketStorePubkeys.length,
        marketPubkeys.length + marketStorePubkeys.length + slabPubkeys.length
      )
    )

    const deserializedUserMarketData =
      UserMarket.deserializeMultipleUserMarketStoreData(
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
      .slice(
        -userPubkeys.length * 2 - userHostLifetimePubkeys.length,
        -userPubkeys.length - userHostLifetimePubkeys.length
      )
      .map((info) => info?.lamports || 0)

    const tokenBalances = accountsData
      .slice(
        -userPubkeys.length - userHostLifetimePubkeys.length,
        -userPubkeys.length
      )
      .map((info) =>
        info?.data?.length == ACCOUNT_SIZE
          ? Number(AccountLayout.decode(info.data).amount)
          : 0
      )

    const userHostLifetimes = accountsData
      .slice(
        accountsData.length - userHostLifetimePubkeys.length,
        accountsData.length
      )
      .map((info, i) =>
        !!info
          ? new UserHostLifetime(
              averClient,
              userHostLifetimePubkeys[i],
              UserHostLifetime.deserializeMultipleUserHostLifetimesData(
                averClient,
                [info]
              )[0] as UserHostLifetimeState,
              info.owner
            )
          : null
      )

    const userBalanceStates: UserBalanceState[] = lamportBalances.map(
      (b, i) => ({
        lamportBalance: b,
        tokenBalance: tokenBalances[i],
      })
    )

    return {
      marketStates: deserializedMarketData,
      marketStoreStates: deserializedMarketStoreData,
      slabs: deserializedSlabsData,
      userMarketStates: deserializedUserMarketData,
      userBalanceStates,
      userHostLifetimes: userHostLifetimes,
    }
  }

  /**
   * Parses onchain data for multiple MarketStore States
   *
   * @param {AverClient} averClient - AverClient object
   * @param {AccountInfo<Buffer | null>[]} marketsData - Raw bytes coming from onchain
   * @returns {(MarketState | null)[]} - MarketStore objects
   */
  private static async deserializeMultipleMarketData(
    averClient: AverClient,
    marketsData: (AccountInfo<Buffer> | null)[]
  ): Promise<(MarketState | null)[]> {
    const programs = await Promise.all(
      marketsData.map((m) =>
        averClient.getProgramFromProgramId(m ? m.owner : AVER_PROGRAM_IDS[0])
      )
    )
    return marketsData.map((marketData, i) =>
      parseWithVersion(programs[i], AccountType.MARKET, marketData)
    )
  }

  /**
   * Parses onchain data for multiple MarketStore State
   *
   * @param {AverClient} averClient - AverClient object
   * @param {AccountInfo<Buffer | null>[]} marketStoresData - Raw bytes coming from onchain
   * @returns {(MarketStoreState | null)[]} - MarketStoreState objects
   */
  private static async deserializeMultipleMarketStoreData(
    averClient: AverClient,
    marketStoresData: (AccountInfo<Buffer> | null)[]
  ): Promise<(MarketStoreState | null)[]> {
    const programs = await Promise.all(
      marketStoresData.map((m) =>
        m ? averClient.getProgramFromProgramId(m.owner) : null
      )
    )
    return marketStoresData.map((marketStoreData, i) =>
      marketStoreData
        ? parseWithVersion(
            //@ts-ignore
            programs[i],
            AccountType.MARKET_STORE,
            marketStoreData
          )
        : null
    )
  }

  /**
   * Parses onchain data for a MarketStore State object
   *
   * @param {TypeDef<IdlTypeDef, IdlTypes<Idl>>} marketResult - On chain market result
   * @returns {MarketState} - MarketState object
   */
  private static parseMarketState(
    marketResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>
  ): MarketState {
    return marketResult as MarketState
  }

  /**
   * Parses onchain data for a MarketStoreStore object
   *
   * @param {TypeDef<IdlTypeDef, IdlTypes<Idl>>} marketResult - On chain market result
   * @returns {MarketStoreState} - MarketStoreState object
   */
  private static parseMarketStoreState(
    marketStoreResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>
  ): MarketStoreState {
    return marketStoreResult as MarketStoreState
  }

  /**
   * Derives PDA (Program Derived Account) for MarketStore public key.
   *
   * MarketStore account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey} marketPubkey - Market public key
   * @param {PublicKey} programIds - Program public keys. Defaults to AVER_PROGRAM_ID.
   * @returns {PublicKey} - MarketStore public key
   */
  static async deriveMarketStorePubkeyAndBump(
    marketPubkey: PublicKey,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    return PublicKey.findProgramAddress(
      [Buffer.from("market-store", "utf-8"), marketPubkey.toBuffer()],
      programId
    )
  }

  /**
   * Derives PDA (Program Derived Account) for MarketStore public keys.
   *
   * MarketStore account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey[]} marketPubkeys - Markets' public keys
   * @param {PublicKey} s - Program public keys. Defaults to AVER_PROGRAM_ID.
   * @returns {PublicKey[]} - MarketStore public key
   */
  private static async deriveMarketStorePubkeysAndBump(
    marketPubkeys: PublicKey[],
    programIds: (PublicKey | undefined)[]
  ) {
    return await Promise.all(
      marketPubkeys.map((marketPubkey, i) => {
        return PublicKey.findProgramAddress(
          [Buffer.from("market-store", "utf-8"), marketPubkey.toBuffer()],
          programIds[i] || AVER_PROGRAM_IDS[0] // TODO make this dynamic
        )
      })
    )
  }

  /**
   * Derives PDA (Program Derived Account)for Quote Vault Authority public key.
   *
   * Quote Vault Authority account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey} marketPubkey - Market public key
   * @param {PublicKey} programIds - Program public keys. Defaults to AVER_PROGRAM_ID.
   * @returns {PublicKey} - Quote Vault Authority public key
   */
  private static async deriveQuoteVaultAuthorityPubkeyAndBump(
    marketPubkey: PublicKey,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    return PublicKey.findProgramAddress([marketPubkey.toBuffer()], programId)
  }

  /**
   * Derives PDA (Program Derived Account)for Quote Vault public key.
   *
   * Quote Vault account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey} marketPubkey - Market public key
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   * @returns {PublicKey} - Quote Vault public key
   */
  static async deriveQuoteVaultPubkey(
    marketPubkey: PublicKey,
    network: SolanaNetwork,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    const [vaultAuthority, _] =
      await Market.deriveQuoteVaultAuthorityPubkeyAndBump(
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

  get outcomeNames() {
    return this._marketState.outcomeNames
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

  /**
   * DEPRECATED
   */
  get withdrawableQuoteTokenBalance() {
    return this._marketState.stableQuoteTokenBalance
  }

  get stableQuoteTokenBalance() {
    return this._marketState.stableQuoteTokenBalance
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

  get volumeMatched() {
    return this._marketState.matchedCount.toNumber()
  }

  get averClient() {
    return this._averClient
  }

  get programId() {
    return this._programId
  }

  get inPlayQueue() {
    return this._marketState.inPlayQueue
  }

  /**
   * Refresh all data for an AverMarket quickly
   *
   * This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.
   *
   * Use instead instead of load()
   */
  async refresh() {
    const market = (
      await Market.refreshMultipleMarkets(this._averClient, [this])
    )[0]
    this._marketState = market._marketState
    this._marketStoreState = market._marketStoreState
    this._orderbooks = market._orderbooks
  }

  /**
   * Loads Market Listener
   *
   * @param {(marketState: MarketState) => void} callback - Callback function
   * @returns
   */
  async loadMarketListener(callback: (marketState: MarketState) => void) {
    const program = await this._averClient.getProgramFromProgramId(
      this._programId
    )
    const ee = program.account["market"].subscribe(this.pubkey)
    ee.on("change", callback)
    return ee
  }

  /**
   * Loads Market Store Listener
   *
   * @param {(marketStoreState: MarketStoreState) => void} callback - Callback function
   * @returns
   */
  async loadMarketStoreListener(callback: (marketState: MarketState) => void) {
    const program = await this._averClient.getProgramFromProgramId(
      this._programId
    )
    const ee = program.account["marketStore"].subscribe(this.marketStore)
    ee.on("change", callback)
    return ee
  }

  /**
   * Returns Orderbook objects from Orderbook Account objects, by fetching and parsing.
   *
   * @param {Connection} connection - Solana Connection object
   * @param {(OrderbookAccountsState | undefined)[]} orderbookAccounts - List of orderbook account objects
   * @param {number[]} decimals - List of decimal precision for each orderbook account state. Variable normally found in MarketState object
   * @returns {Promise<Orderbook[]>} - List of orderbook objects
   */
  private static async getOrderbooksFromOrderbookAccounts(
    connection: Connection,
    orderbookAccounts: (OrderbookAccountsState | undefined)[],
    decimals: number[]
  ): Promise<Orderbook[]> {
    const allBidsAndAsksAccounts = orderbookAccounts
      //@ts-ignore
      .map((o) => [o.bids, o.asks])
      .flat()
    const allSlabs = await Orderbook.loadMultipleSlabs(
      connection,
      allBidsAndAsksAccounts
    )

    return orderbookAccounts.map(
      (o, i) =>
        new Orderbook(
          //@ts-ignore
          o?.orderbook,
          allSlabs[i * 2],
          allSlabs[i * 2 + 1],
          allBidsAndAsksAccounts[i * 2],
          allBidsAndAsksAccounts[i * 2 + 1],
          decimals[i]
        )
    )
  }

  /**
   * Returns Orderbook objects from MarketState and MarketStoreStateobjects, by fetching and parsing for multiple markets.
   *
   * Use when fetching orderbooks for multiple markets
   *
   * @param {Connection} connection - Solana Connection object
   * @param {(MarketState | null)[]} marketStates - List of MarketState objects
   * @param {(MarketStoreState | null)[]} marketStoreStates - List of MarketStoreStateobjects
   * @returns {Promise<(Orderbook[] | undefined)[]>} - List of orderbooks for each market
   */
  private static async getOrderbooksFromOrderbookAccountsMultipleMarkets(
    connection: Connection,
    marketStates: (MarketState | null)[],
    marketStoreStates: (MarketStoreState | null)[]
  ) {
    //Create a list of accounts and decimals for each account
    const orderbookAccounts = marketStoreStates
      .map((m) => m?.orderbookAccounts || [])
      .flat()

    const decimals = marketStoreStates
      .map(
        (m, i) =>
          m?.orderbookAccounts.map((o) => marketStates[i]?.decimals || 6) || []
      )
      .flat()

    //Load all orderbooks
    let allOrderbooks = await Market.getOrderbooksFromOrderbookAccounts(
      connection,
      orderbookAccounts,
      decimals
    )

    //Create a list for each market we receive. This list contains all orderbooks for that market
    let orderbooks_market_list: (Orderbook[] | undefined)[] = []
    for (let ms of marketStates) {
      if (!ms) {
        orderbooks_market_list.push(undefined)
        continue
      }

      const numberOfOutcomes = ms.numberOfOutcomes
      let orderbooks: Orderbook[] = []

      if (isMarketStatusClosed(ms.marketStatus)) {
        orderbooks_market_list.push(undefined)
        continue
      }
      if (numberOfOutcomes === 2 && allOrderbooks.length >= 1) {
        //We check for this error above
        //@ts-ignore
        orderbooks.push(allOrderbooks.shift())
      } else if (
        numberOfOutcomes !== 2 &&
        allOrderbooks.length >= numberOfOutcomes
      ) {
        Array.from({ length: numberOfOutcomes }).map(() => {
          //@ts-ignore
          orderbooks.push(allOrderbooks.shift())
        })
      } else {
        throw new Error("Error getting orderbooks")
      }
      orderbooks_market_list.push(orderbooks)
    }

    return orderbooks_market_list
  }

  async getImpliedMarketStatus(): Promise<MarketStatus> {
    const solanaDatetime = await this._averClient.getSystemClockDatetime()
    if (!solanaDatetime) return this.marketStatus

    if (solanaDatetime > this.tradingCeaseTime.getTime())
      return MarketStatus.TradingCeased
    if (this.inplayStartTime && solanaDatetime > this.inplayStartTime.getTime())
      return MarketStatus.ActiveInPlay

    return this.marketStatus
  }

  async makeUpdateMarketStateInstruction(feePayer: PublicKey) {
    const program = await this._averClient.getProgramFromProgramId(
      this._programId
    )
    const remainingAccounts = this._marketStoreState
      ? [
          {
            pubkey: this.marketStore,
            isSigner: false,
            isWritable: true,
          } as AccountMeta,
        ]
      : []
    return program.instruction["updateMarketState"]({
      accounts: {
        payer: feePayer,
        marketAuthority: this.marketAuthority,
        market: this.pubkey,
        marketStore: this.marketStore,
        systemProgram: SystemProgram.programId,
      },
      remainingAccounts: remainingAccounts,
    })
  }

  async updateMarketState(
    feePayer: Keypair | undefined = this._averClient.keypair,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    if (!feePayer) throw new Error("No fee payer given")
    const ix = await this.makeUpdateMarketStateInstruction(feePayer.publicKey)

    return signAndSendTransactionInstructions(
      this._averClient,
      [],
      feePayer,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  async checkIfMarketLatestVersion() {
    const program = await this._averClient.getProgramFromProgramId(
      this._programId
    )
    if (
      this._marketState.version <
      getVersionOfAccountTypeInProgram(AccountType.MARKET, program)
    ) {
      console.log("Market needs to be upgraded")
      return false
    }
    return true
  }

  /**
   * Consume events
   *
   * Sends instructions on chain
   *
   * @param {number} outcome_idx - Index of the outcome
   * @param {PublicKey[]} user_accounts - List of User Account public keys
   * @param {Keypair} payer - Fee payer. Defaults to AverClient wallet.
   * @param {number} max_iterations - Depth of events to iterate through. Defaults to MAX_ITERATIONS_FOR_CONSUME_EVENTS.
   * @param {PublicKey} reward_target - Target for reward. Defaults to AverClient wallet
   * @returns {Promise<string>} - Transaction Signature
   */
  async consumeEvents(
    outcome_idx: number,
    user_accounts: PublicKey[],
    payer: Keypair,
    max_iterations?: number,
    reward_target?: PublicKey
  ) {
    if (!reward_target) reward_target = this._averClient.owner
    if (!max_iterations || max_iterations > MAX_ITERATIONS_FOR_CONSUME_EVENTS)
      max_iterations = MAX_ITERATIONS_FOR_CONSUME_EVENTS

    const program = await this._averClient.getProgramFromProgramId(
      this._programId
    )

    const sortedUserAccounts = user_accounts.sort((a, b) =>
      a.toString().localeCompare(b.toString())
    )
    //@ts-ignore
    const userMarketAccounts: UserMarketState[] = await program.account[
      "userMarket"
    ].fetchMultiple(sortedUserAccounts)
    const userAtas = await Promise.all(
      userMarketAccounts.map((u) =>
        getAssociatedTokenAddress(this.quoteTokenMint, u.user)
      )
    )

    const remainingAccountsUmas = sortedUserAccounts.map((pk) => {
      return { pubkey: pk, isSigner: false, isWritable: true } as AccountMeta
    })

    const remainingAccountsAtas = userAtas.map((pk) => {
      return { pubkey: pk, isSigner: false, isWritable: true } as AccountMeta
    })

    if (!this.orderbookAccounts) throw new Error("No orderbook accounts")

    console.log({
      market: this.pubkey,
      marketStore: this.marketStore,
      orderbook: this.orderbookAccounts[outcome_idx].orderbook,
      eventQueue: this.orderbookAccounts[outcome_idx].eventQueue,
      rewardTarget: reward_target,
      quoteVault: this.quoteVault,
      vaultAuthority: this.vaultAuthority,
      splTokenProgram: TOKEN_PROGRAM_ID,
    })
    console.log(remainingAccountsUmas.concat(remainingAccountsAtas))

    console.log(program.provider.wallet.publicKey.toBase58())

    //Wallet should be payer
    //@ts-ignore
    program.provider.wallet = new Wallet(payer)

    return await program.rpc["consumeEvents"](
      new BN(max_iterations),
      new BN(outcome_idx),
      {
        accounts: {
          market: this.pubkey,
          marketStore: this.marketStore,
          orderbook: this.orderbookAccounts[outcome_idx].orderbook,
          eventQueue: this.orderbookAccounts[outcome_idx].eventQueue,
          rewardTarget: reward_target,
          quoteVault: this.quoteVault,
          vaultAuthority: this.vaultAuthority,
          splTokenProgram: TOKEN_PROGRAM_ID,
        },
        remainingAccounts: remainingAccountsUmas.concat(remainingAccountsAtas),
      }
    )
  }

  /**
   * Refresh market before cranking
   *
   * If no outcome_idx are passed, all outcomes are cranked if they meet the criteria to be cranked.
   *
   * @param {Keypair} payer - Fee payer. Defaults to AverClient wallet.
   * @param {number[]} outcome_idxs - Indices of the outcomes
   * @param {PublicKey} reward_target - Target for reward. Defaults to AverClient wallet
   * @returns {Promise<string>} Transaction signature
   */
  async crankMarket(
    payer: Keypair,
    outcome_idxs?: number[],
    reward_target?: PublicKey
  ) {
    //Refresh market before cranking
    //If no outcome_idx are passed, all outcomes are cranked if they meet the criteria to be cranked.
    if (!outcome_idxs) {
      //For binary markets, there is only one orderbook
      const range = this.numberOfOutcomes == 2 ? 1 : this.numberOfOutcomes
      outcome_idxs = Array.from(Array(range).keys())
    }
    if (
      this.numberOfOutcomes == 2 &&
      (outcome_idxs.includes(0) || outcome_idxs.includes(1))
    ) {
      outcome_idxs = [0]
    }
    if (!reward_target) reward_target = this._averClient.owner

    if (!this.orderbookAccounts) throw new Error("No orderbook accounts")

    await this.refresh()

    const eventQueues = this.orderbookAccounts?.map((o) => o.eventQueue)
    const loadedEventQueues = await loadAllEventQueues(
      this._averClient.connection,
      eventQueues
    )

    let sig = ""
    for (let idx of outcome_idxs) {
      if (loadedEventQueues[idx].header.count == 0) continue

      console.log(
        `Cranking market ${this.pubkey.toString()} for outcome ${idx} - ${
          loadedEventQueues[idx].header.count
        } events left to crank`
      )
      if (loadedEventQueues[idx].header.count > 0) {
        let userAccounts = loadedEventQueues[idx]
          .parseFill(MAX_ITERATIONS_FOR_CONSUME_EVENTS)
          .map((e) => {
            if (e instanceof EventFill) {
              return new PublicKey(e.makerCallbackInfo.slice(0, 32))
            } else if (e instanceof EventOut) {
              return new PublicKey(e.callBackInfo.slice(0, 32))
            } else {
              throw new Error("Not Fill and Not Out")
            }
          })

        userAccounts = prepareUserAccountsList(userAccounts)
        const eventsToCrank = Math.min(
          MAX_ITERATIONS_FOR_CONSUME_EVENTS,
          ...loadedEventQueues.map((e) => e.header.count)
        )

        sig = await this.consumeEvents(
          idx,
          userAccounts,
          payer,
          eventsToCrank,
          reward_target
        )
      }
    }
    return sig
  }
}

/**
 * Checks if a market no longer in a trading status, and therefore will have no Orderbook or MarketStore accounts.
 *
 * Note: Once trading has ceased for a market, these accounts are closed.
 *
 * @param {MarketStatus} marketStatus - Market status (find in MarketState object)
 * @returns {boolean} - Market status closed
 */
export const isMarketStatusClosed = (marketStatus: MarketStatus) =>
  [
    MarketStatus.CeasedCrankedClosed,
    MarketStatus.Resolved,
    MarketStatus.Voided,
  ].includes(marketStatus)

/**
 * Checks if a market no longer in Active
 *
 * @param {MarketStatus} marketStatus - Market status (find in MarketState object)
 * @returns {boolean} - Market status tradeable
 */
export const isMarketTradable = (marketStatus: MarketStatus) =>
  [MarketStatus.ActiveInPlay, MarketStatus.ActivePreEvent].includes(
    marketStatus
  )

/**
 * Checks if it is possible to cancel orders in a market
 *
 * @param {MarketStatus} marketStatus - Market status (find in MarketState object)
 * @returns {boolean} - Market status order cancellable
 */
export const canCancelOrderInMarket = (marketStatus: MarketStatus) =>
  [
    MarketStatus.ActiveInPlay,
    MarketStatus.ActivePreEvent,
    MarketStatus.HaltedInPlay,
    MarketStatus.HaltedPreEvent,
  ].includes(marketStatus)
