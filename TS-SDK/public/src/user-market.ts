import { Idl, IdlTypeDef } from '@project-serum/anchor/dist/cjs/idl'
import { IdlTypes, TypeDef } from '@project-serum/anchor/dist/cjs/program/namespace/types'
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  AccountMeta,
  AccountInfo,
  SendOptions,
} from '@solana/web3.js'
import { SelfTradeBehavior } from '@bonfida/aaob'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { AverClient } from './aver-client'
import {
  OrderbookAccountsState,
  OrderType,
  Side,
  SizeFormat,
  UserBalanceState,
  UserMarketState,
} from './types'
import {
  getBestDiscountToken,
  roundPriceToNearestTickSize,
  signAndSendTransactionInstructions,
} from './utils'
import { canCancelOrderInMarket, isMarketTradable, Market } from './market'
import BN from 'bn.js'
import { AVER_PROGRAM_ID, AVER_HOST_ACCOUNT } from './ids'
import { UserHostLifetime } from './user-host-lifetime'
import { chunk } from 'lodash'
export class UserMarket {
  private _userMarketState: UserMarketState

  private _pubkey: PublicKey

  private _averClient: AverClient

  private _market: Market

  private _userBalanceState: UserBalanceState

  private constructor(
    averClient: AverClient,
    pubkey: PublicKey,
    userMarketState: UserMarketState,
    market: Market,
    userBalanceState: UserBalanceState
  ) {
    this._userMarketState = userMarketState
    this._pubkey = pubkey
    this._averClient = averClient
    this._market = market
    this._userBalanceState = userBalanceState
  }

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
  static async load(
    averClient: AverClient,
    market: Market,
    owner?: PublicKey,
    host: PublicKey = AVER_HOST_ACCOUNT,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    const umaOwner = owner || averClient.owner

    const [uma, _bump] = await UserMarket.derivePubkeyAndBump(
      umaOwner,
      market.pubkey,
      host,
      programId
    )
    return UserMarket.loadByUma(averClient, uma, market)
  }

  /**
   * Load the User Market object when the Public Key is known
   * 
   * @param averClient 
   * @param pubkey 
   * @param market 
   * 
   * @returns {Promise<UserMarket>}
   */
  static async loadByUma(averClient: AverClient, pubkey: PublicKey, market: Market) {
    const program = averClient.program

    const userMarketResult = await program.account['userMarket'].fetch(pubkey)

    const userMarketState = UserMarket.parseUserMarketState(userMarketResult)

    const lamportBalance = await averClient.requestLamportBalance(userMarketState.user)
    const tokenBalance = await averClient.requestTokenBalance(
      averClient.quoteTokenMint,
      userMarketState.user
    )
    const userBalanceState: UserBalanceState = {
      lamportBalance: lamportBalance,
      tokenBalance: parseInt(tokenBalance.amount),
    }

    return new UserMarket(averClient, pubkey, userMarketState, market, userBalanceState)
  }

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
  static async loadMultiple(
    averClient: AverClient,
    markets: Market[],
    owner?: PublicKey,
    host: PublicKey = AVER_HOST_ACCOUNT,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    const umaOwner = owner || averClient.owner

    const umasAndBumps = await Promise.all(
      markets.map((m) => UserMarket.derivePubkeyAndBump(umaOwner, m.pubkey, host, programId))
    )
    const umasPubkeys = umasAndBumps.map((u) => u[0])

    return UserMarket.loadMultipleByUma(averClient, umasPubkeys, markets)
  }

  /**
   * Load Multiple User Markets when Public Keys are known
   * 
   * @param averClient 
   * @param pubkeys 
   * @param markets 
   * @returns 
   */
  static async loadMultipleByUma(averClient: AverClient, pubkeys: PublicKey[], markets: Market[]) {
    const program = averClient.program

    const userMarketResult = await program.account['userMarket'].fetchMultiple(pubkeys)
    const userMarketStates = userMarketResult.map((umr) =>
      umr ? UserMarket.parseUserMarketState(umr) : null
    )

    const userPubkeys = userMarketStates.map((umr) => umr?.user || new Keypair().publicKey)
    const userBalances = (
      await Market.loadMultipleAccountStates(averClient, [], [], [], [], userPubkeys)
    ).userBalanceStates

    return userMarketStates.map((ums, i) =>
      ums ? new UserMarket(averClient, pubkeys[i], ums, markets[i], userBalances[i]) : undefined
    )
  }

  private static parseUserMarketState(marketResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>): UserMarketState {
    return marketResult as UserMarketState
  }

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
  static async makeCreateUserMarketAccountInstruction(
    averClient: AverClient,
    market: Market,
    owner?: PublicKey,
    host: PublicKey = AVER_HOST_ACCOUNT,
    numberOfOrders: number = market.numberOfOutcomes * 5,
    programId: PublicKey = AVER_PROGRAM_ID
  ): Promise<TransactionInstruction> {
    const umaOwner = owner || averClient.owner
    const program = averClient.program

    const [userMarket, umaBump] = await UserMarket.derivePubkeyAndBump(
      umaOwner,
      market.pubkey,
      host,
      programId
    )

    const [userHostLifetime, _uhlBump] = await UserHostLifetime.derivePubkeyAndBump(
      umaOwner,
      host,
      programId
    )

    const getBestDiscountTokenAccount = await getBestDiscountToken(averClient, umaOwner)
    const discountTokenAccount = {
      isSigner: false,
      isWritable: false,
      pubkey: getBestDiscountTokenAccount,
    } as AccountMeta

    return program.instruction['initUserMarket'](numberOfOrders, umaBump, {
      accounts: {
        user: umaOwner,
        userHostLifetime: userHostLifetime,
        userMarket: userMarket,
        market: market.pubkey,
        host: host,
        systemProgram: SystemProgram.programId,
      },
      remainingAccounts: getBestDiscountTokenAccount.equals(SystemProgram.programId)
        ? []
        : [discountTokenAccount],
    })
  }

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
  static async createUserMarketAccount(
    averClient: AverClient,
    market: Market,
    owner: Keypair,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    host: PublicKey = AVER_HOST_ACCOUNT,
    numberOfOrders: number = market.numberOfOutcomes * 5,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    const createUserMarketAccountIx = await this.makeCreateUserMarketAccountInstruction(
      averClient,
      market,
      owner.publicKey,
      host,
      numberOfOrders,
      programId
    )

    return signAndSendTransactionInstructions(
      averClient.connection,
      [],
      owner,
      [createUserMarketAccountIx],
      sendOptions,
      manualMaxRetry
    )
  }

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
  static async getOrCreateUserMarketAccount(
    averClient: AverClient,
    owner: Keypair,
    market: Market,
    sendOptions?: SendOptions,
    quoteTokenMint: PublicKey = averClient.quoteTokenMint,
    host: PublicKey = AVER_HOST_ACCOUNT,
    numberOfOrders: number = market.numberOfOutcomes * 5,
    referrer: PublicKey = SystemProgram.programId,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    // check if account already exists for user
    const userMarket = (
      await UserMarket.derivePubkeyAndBump(owner.publicKey, market.pubkey, host, programId)
    )[0]
    const userMarketResult = await averClient.program.account['userMarket'].fetchNullable(
      userMarket
    )

    if (userMarketResult) {
      const userMarketState = UserMarket.parseUserMarketState(userMarketResult)
      const lamportBalance = await averClient.requestLamportBalance(userMarketState.user)
      const tokenBalance = await averClient.requestTokenBalance(
        averClient.quoteTokenMint,
        userMarketState.user
      )
      const userBalanceState: UserBalanceState = {
        lamportBalance: lamportBalance,
        tokenBalance: parseInt(tokenBalance.amount),
      }
      return new UserMarket(averClient, userMarket, userMarketState, market, userBalanceState)
    }

    await UserHostLifetime.getOrCreateUserHostLifetime(
      averClient,
      owner,
      sendOptions,
      quoteTokenMint,
      host,
      referrer,
      programId
    )

    const sig = await UserMarket.createUserMarketAccount(
      averClient,
      market,
      owner,
      sendOptions,
      undefined,
      host,
      numberOfOrders,
      programId
    )

    await averClient.connection.confirmTransaction(sig, sendOptions?.preflightCommitment)

    const userMarketAccount = await UserMarket.loadByUma(averClient, userMarket, market)

    return userMarketAccount
  }

  /**
   * Desearealise multiple User Market Stores Data
   * 
   * @param averClient 
   * @param userMarketStoresData 
   * 
   * @returns {(UserMarketState | null)[]}
   */
  static deserializeMultipleUserMarketStoreData(
    averClient: AverClient,
    userMarketStoresData: AccountInfo<Buffer | null>[]
  ): (UserMarketState | null)[] {
    return userMarketStoresData.map((marketStoreData) =>
      marketStoreData?.data
        ? averClient.program.account['userMarket'].coder.accounts.decode(
            'UserMarket',
            marketStoreData.data
          )
        : null
    )
  }

  /**
   * Refresh Multiple User Markets
   * 
   * @param averClient 
   * @param userMarkets 
   * 
   * @returns {Promise<(UserMarket | null)[]>}
   */
  static async refreshMultipleUserMarkets(averClient: AverClient, userMarkets: UserMarket[]) {
    const markets = userMarkets.map((um) => um.market)

    const orderbookAccounts = markets
      .filter((market) => !!market.orderbookAccounts)
      .map((market) => market.orderbookAccounts) as any as OrderbookAccountsState[][]

    const multipleAccountStates = await Market.loadMultipleAccountStates(
      averClient,
      markets.map((market) => market.pubkey),
      markets.map((market) => market.marketStore),
      orderbookAccounts.flatMap((ordAcc) => ordAcc?.flatMap((acc) => [acc.bids, acc.asks])),
      userMarkets.map((u) => u.pubkey),
      userMarkets.map((u) => u.user)
    )

    const newMarkets = Market.getMarketsFromAccountStates(
      averClient,
      markets.map((m) => m.pubkey),
      multipleAccountStates.marketStates,
      multipleAccountStates.marketStoreStates,
      multipleAccountStates.slabs
    )

    return multipleAccountStates.userMarketStates.map((userMarketState, i) =>
      userMarketState
        ? new UserMarket(
            averClient,
            userMarkets[i].pubkey,
            userMarketState,
            newMarkets[i],
            multipleAccountStates.userBalanceStates[i]
          )
        : undefined
    )
  }

  /**
   * Derive the User Market Pubkey based on the Owner, Market, Host and program
   * 
   * @param owner 
   * @param market 
   * @param host 
   * @param programId 
   * @returns 
   */
  static async derivePubkeyAndBump(
    owner: PublicKey,
    market: PublicKey,
    host: PublicKey = AVER_HOST_ACCOUNT,
    programId = AVER_PROGRAM_ID
  ) {
    return PublicKey.findProgramAddress(
      [Buffer.from('user-market', 'utf-8'), owner.toBuffer(), market.toBuffer(), host.toBuffer()],
      programId
    )
  }

  get pubkey() {
    return this._pubkey
  }

  get market() {
    return this._market
  }

  get user() {
    return this._userMarketState.user
  }

  get numberOfOutcomes() {
    return this._userMarketState.numberOfOutcomes
  }

  get numberOfOrders() {
    return this._userMarketState.numberOfOrders
  }

  get maxNumberOfOrders() {
    return this._userMarketState.maxNumberOfOrders
  }

  get netQuoteTokensIn() {
    return this._userMarketState.netQuoteTokensIn
  }

  get accumulatedMakerQuoteVolume() {
    return this._userMarketState.accumulatedMakerQuoteVolume
  }

  get accumulatedMakerBaseVolume() {
    return this._userMarketState.accumulatedMakerBaseVolume
  }

  get accumulatedTakerQuoteVolume() {
    return this._userMarketState.accumulatedTakerQuoteVolume
  }

  get accumulatedTakerBaseVolume() {
    return this._userMarketState.accumulatedTakerBaseVolume
  }

  get outcomePositions() {
    return this._userMarketState.outcomePositions
  }

  get orders() {
    return this._userMarketState.orders
  }

  get userHostLifetime() {
    return this._userMarketState.userHostLifetime
  }

  get lamportBalance() {
    return this._userBalanceState.lamportBalance
  }

  get lamportBalanceUi() {
    return this._userBalanceState.lamportBalance / Math.pow(10, 9)
  }

  get tokenBalance() {
    return this._userBalanceState.tokenBalance
  }

  get tokenBalanceUi() {
    return this._userBalanceState.tokenBalance / Math.pow(10, this.market.decimals)
  }

  /**
   * Refresh the User Market object
   */
  async refresh() {
    const refreshedUserMarket = (
      (await UserMarket.refreshMultipleUserMarkets(this._averClient, [this])) as UserMarket[]
    )[0]
    this._market = refreshedUserMarket._market
    this._userMarketState = refreshedUserMarket._userMarketState
  }

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
  async makePlaceOrderInstruction(
    outcomeIndex: number,
    side: Side,
    limitPrice: number,
    size: number,
    sizeFormat: SizeFormat,
    orderType: OrderType = OrderType.Limit,
    selfTradeBehavior: SelfTradeBehavior = SelfTradeBehavior.CancelProvide,
    averPreFlightCheck: boolean = false
  ) {
    if (averPreFlightCheck) {
      this.isOrderValid(outcomeIndex, side, limitPrice, size, sizeFormat)
    }

    const sizeU64 = new BN(Math.floor(size * Math.pow(10, this.market.decimals)))
    const limitPriceU64 = new BN(Math.ceil(limitPrice * Math.pow(10, this.market.decimals)))
    // consider when binary markets where there is only one order book
    const orderbookAccountIndex =
      this.market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex
    // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
    const orderbookAccount = this.market.orderbookAccounts[orderbookAccountIndex]

    const userQuoteTokenAta = await getAssociatedTokenAddress(this.market.quoteTokenMint, this.user)

    return this._averClient.program.instruction['placeOrder'](
      {
        size: sizeU64,
        sizeFormat,
        limitPrice: limitPriceU64,
        side: side,
        orderType: orderType,
        selfTradeBehaviour: selfTradeBehavior,
        outcomeId: outcomeIndex,
      },
      {
        accounts: {
          user: this.user,
          userHostLifetime: this.userHostLifetime,
          userMarket: this.pubkey,
          userQuoteTokenAta: userQuoteTokenAta,
          market: this.market.pubkey,
          marketStore: this.market.marketStore,
          quoteVault: this.market.quoteVault,
          orderbook: orderbookAccount.orderbook,
          bids: orderbookAccount.bids,
          asks: orderbookAccount.asks,
          eventQueue: orderbookAccount.eventQueue,
          splTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
      }
    )
  }

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
  async placeOrder(
    owner: Keypair,
    outcomeIndex: number,
    side: Side,
    limitPrice: number,
    size: number,
    sizeFormat: SizeFormat,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    orderType: OrderType = OrderType.Limit,
    selfTradeBehavior: SelfTradeBehavior = SelfTradeBehavior.CancelProvide,
    averPreFlightCheck: boolean = true
  ) {
    if (!owner.publicKey.equals(this.user))
      throw new Error('Owner must be same as user market owner')

    const ix = await this.makePlaceOrderInstruction(
      outcomeIndex,
      side,
      limitPrice,
      size,
      sizeFormat,
      orderType,
      selfTradeBehavior,
      averPreFlightCheck
    )

    return signAndSendTransactionInstructions(
      this._averClient.connection,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Format the instruction to cancel an order
   * 
   * @param orderId 
   * @param outcomeIndex 
   * @param averPreFlightCheck 
   * 
   * @returns {Promise<TransactionInstruction>}
   */
  makeCancelOrderInstruction(
    orderId: BN,
    outcomeIndex: number,
    averPreFlightCheck: boolean = false
  ) {
    if (averPreFlightCheck) {
      if (this.lamportBalance < 5000) throw new Error('Insufficient lamport balance')

      if (!canCancelOrderInMarket(this.market.marketStatus))
        throw new Error('Cannot cancel orders in current market status')

      if (!this.orders.map((o) => o.orderId.toString()).includes(orderId.toString())) {
        throw new Error('Order ID does not exist in list of open orders')
      }
    }

    // account for binary markets where there is only one order book
    outcomeIndex = this.market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex
    // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
    const orderbookAccount = this.market.orderbookAccounts[outcomeIndex]

    return this._averClient.program.instruction['cancelOrder'](orderId, outcomeIndex, {
      accounts: {
        orderbook: orderbookAccount.orderbook,
        eventQueue: orderbookAccount.eventQueue,
        bids: orderbookAccount.bids,
        asks: orderbookAccount.asks,
        market: this.market.pubkey,
        userMarket: this.pubkey,
        user: this.user,
        marketStore: this.market.marketStore,
      },
    })
  }

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
  cancelOrder(
    feePayer: Keypair,
    orderId: BN,
    outcomeIndex: number,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    averPreFlightCheck: boolean = true
  ) {
    const ix = this.makeCancelOrderInstruction(orderId, outcomeIndex, averPreFlightCheck)

    return signAndSendTransactionInstructions(
      this._averClient.connection,
      [],
      feePayer,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Format instruction to cancel all orders on given outcomes
   * 
   * @param outcomeIdsToCancel 
   * @param averPreFlightCheck 
   * 
   * @returns {Promise<TransactionInstruction>}
   */
  makeCancelAllOrdersInstructions(
    outcomeIdsToCancel: number[],
    averPreFlightCheck: boolean = false
  ) {
    if (averPreFlightCheck) {
      if (this.lamportBalance < 5000) throw new Error('Insufficient lamport balance')

      if (!canCancelOrderInMarket(this.market.marketStatus))
        throw new Error('Cannot cancel orders in current market status')
    }

    // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
    const remainingAccounts: AccountMeta[] = this.market.orderbookAccounts
      .filter((_oa, i) => outcomeIdsToCancel.includes(i))
      .flatMap((oa) => [oa.orderbook, oa.eventQueue, oa.bids, oa.asks])
      .map(
        (account) =>
          ({
            pubkey: account,
            isSigner: false,
            isWritable: true,
          } as AccountMeta)
      )

    const chunkSize = 5
    const chunkedOutcomeIds = chunk(outcomeIdsToCancel, chunkSize)
    const chunkedRemainingAccounts = chunk(remainingAccounts, 4 * chunkSize)

    return chunkedOutcomeIds.map((ids, i) =>
      this._averClient.program.instruction['cancelAllOrders'](ids, {
        accounts: {
          market: this.market.pubkey,
          userMarket: this.pubkey,
          user: this.user,
          marketStore: this.market.marketStore,
        },
        remainingAccounts: chunkedRemainingAccounts[i],
      })
    )
  }

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
  cancelAllOrders(
    feePayer: Keypair,
    outcomeIdsToCancel: number[],
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    averPreFlightCheck: boolean = true
  ) {
    const ixs = this.makeCancelAllOrdersInstructions(outcomeIdsToCancel, averPreFlightCheck)

    return Promise.all(
      ixs.map((ix) =>
        signAndSendTransactionInstructions(
          this._averClient.connection,
          [],
          feePayer,
          [ix],
          sendOptions,
          manualMaxRetry
        )
      )
    )
  }

  /**
   * Format instruction to deposit tokens
   * 
   * @param amount 
   * 
   * @returns {Promise<TransactionInstruction>}
   */
  async makeDepositTokensInstruction(amount: BN) {
    const userQuoteTokenAta = await getAssociatedTokenAddress(this.market.quoteTokenMint, this.user)

    return this._averClient.program.instruction['depositTokens'](amount, {
      accounts: {
        user: this.user,
        userMarket: this.pubkey,
        userQuoteTokenAta,
        market: this.market.pubkey,
        quoteVault: this.market.quoteVault,
        splTokenProgram: TOKEN_PROGRAM_ID,
      },
    })
  }

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
  async depositTokens(
    owner: Keypair,
    amount: BN,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    if (!owner.publicKey.equals(this.user))
      throw new Error('Owner must be same as user market owner')

    const ix = await this.makeDepositTokensInstruction(amount)

    return signAndSendTransactionInstructions(
      this._averClient.connection,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Format instruction to withdraw idle funds
   * 
   * @param amount 
   * 
   * @returns {Promise<TransactionInstruction>}
   */
  async makeWithdrawIdleFundsInstruction(amount?: BN) {
    const userQuoteTokenAta = await getAssociatedTokenAddress(this.market.quoteTokenMint, this.user)
    const amountToWithdraw = new BN(amount || this.calculateFundsAvailableToWithdraw())

    return this._averClient.program.instruction['withdrawTokens'](amountToWithdraw, {
      accounts: {
        market: this.market.pubkey,
        userMarket: this.pubkey,
        user: this.user,
        userQuoteTokenAta,
        quoteVault: this.market.quoteVault,
        vaultAuthority: this.market.vaultAuthority,
        splTokenProgram: TOKEN_PROGRAM_ID,
      },
    })
  }

  /**
   * Withdraw idle funds from the User Market
   * @param owner 
   * @param amount 
   * @param sendOptions 
   * @param manualMaxRetry 
   * 
   * @returns {Promise<string>}
   */
  async withdrawIdleFunds(
    owner: Keypair,
    amount?: BN,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    if (!owner.publicKey.equals(this.user))
      throw new Error('Owner must be same as user market owner')

    const ix = await this.makeWithdrawIdleFundsInstruction(amount)

    return signAndSendTransactionInstructions(
      this._averClient.connection,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Format instruction to neutralise the outcome position
   * 
   * @param outcomeId 
   * 
   * @returns {Promise<TransactionInstruction>}
   */
  async makeNeutralizePositionInstruction(outcomeId: number) {
    const quoteTokenAta = await getAssociatedTokenAddress(this.market.quoteTokenMint, this.user)
    return this._averClient.program.instruction['neutralizeOutcomePosition'](outcomeId, {
      accounts: {
        user: this.user,
        userHostLifetime: this.userHostLifetime,
        userMarket: this.pubkey,
        userQuoteTokenAta: quoteTokenAta,
        market: this.market.pubkey,
        quoteVault: this.market.quoteVault,
        marketStore: this.market.marketStore,
        orderbook: this.market.orderbookAccounts?.[outcomeId].orderbook as PublicKey,
        bids: this.market.orderbookAccounts?.[outcomeId].bids as PublicKey,
        asks: this.market.orderbookAccounts?.[outcomeId].asks as PublicKey,
        eventQueue: this.market.orderbookAccounts?.[outcomeId].eventQueue as PublicKey,
        splTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
    })
  }

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
  async neutralizePosition(
    owner: Keypair,
    outcomeId: number,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    if (!owner.publicKey.equals(this.user))
      throw new Error('Owner must be same as user market owner')

    const ix = await this.makeNeutralizePositionInstruction(outcomeId)

    return signAndSendTransactionInstructions(
      this._averClient.connection,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  // NOT TESTED
  /**
   * Format instruction to collect funds from the User Market
   * 
   * @returns {Promise<string>}
   */
  async makeCollectInstruction() {
    const userQuoteTokenAta = await getAssociatedTokenAddress(this.market.quoteTokenMint, this.user)

    return this._averClient.program.instruction['collect'](true, {
      accounts: {
        market: this.market.pubkey,
        userMarket: this.pubkey,
        user: this.user,
        userQuoteTokenAta,
        quoteVault: this.market.quoteVault,
        vaultAuthority: this.market.vaultAuthority,
        splTokenProgram: TOKEN_PROGRAM_ID,
      },
    })
  }

  // NOT TESTED
  /**
   * Collect funds from the User Market
   * 
   * @param owner 
   * @param sendOptions 
   * @param manualMaxRetry 
   * 
   * @returns {Promise<string>}
   */
  async collect(owner: Keypair, sendOptions?: SendOptions, manualMaxRetry?: number) {
    if (!owner.publicKey.equals(this.user))
      throw new Error('Owner must be same as user market owner')

    const ix = await this.makeCollectInstruction()

    return signAndSendTransactionInstructions(
      this._averClient.connection,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  // NOT TESTED
  async loadUserMarketListener(callback: (userMarket: UserMarket) => void) {
    const ee = this._averClient.program.account['userMarket'].subscribe(this.pubkey)
    ee.on('change', callback)
    return ee
  }

  /**
   * Calculate funds available to withdraw from the User Market
   * 
   * @returns {number}
   */
  calculateFundsAvailableToWithdraw() {
    return Math.min(
      ...this.outcomePositions.map((op) => op.free.toNumber()),
      this.netQuoteTokensIn.toNumber()
    )
  }

  /**
   * Calculate exposures to each outcome
   * 
   * @returns {BN[]}
   */
  calculateExposures() {
    return this.outcomePositions.map((op) => op.free.add(op.locked).sub(this.netQuoteTokensIn))
  }

  // NOT TESTED
  /**
   * Calculate funds available to collect based on the winning outcome
   * 
   * @param winningOutcome 
   * 
   * @returns {number}
   */
  calculateFundsAvailableToCollect(winningOutcome: number) {
    return (
      this.outcomePositions[winningOutcome].free.toNumber() +
      this.outcomePositions[winningOutcome].locked.toNumber()
    )
  }

  /**
   * Calculates the tokens available to sell on an outcome
   * @param outcomeIndex 
   * @param price 
   * 
   * @returns {number}
   */
  calculateTokensAvailableToSell(outcomeIndex: number, price: number) {
    return this.outcomePositions[outcomeIndex].free.toNumber() + price * this.tokenBalance
  }

  /**
   * Calculates the tokens available to buy on an outcome
   * 
   * @param outcomeIndex 
   * @param price 
   * 
   * @returns {number}
   */
  calculateTokensAvailableToBuy(outcomeIndex: number, price) {
    const minFreeTokensExceptOutcomeIndex = Math.min(
      ...this.outcomePositions.filter((op, i) => i != outcomeIndex).map((op) => op.free.toNumber())
    )

    return minFreeTokensExceptOutcomeIndex + price * this.tokenBalance
  }

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
  isOrderValid(
    outcomeIndex: number,
    side: Side,
    limitPrice: number,
    size: number,
    sizeFormat: SizeFormat
  ) {
    if (this.lamportBalance < 5000) {
      throw new Error('Insufficient lamport balance')
    }

    const balanceRequired = sizeFormat == SizeFormat.Payout ? size * limitPrice : size
    const currentBalance =
      side == Side.Ask
        ? this.calculateTokensAvailableToSell(outcomeIndex, limitPrice)
        : this.calculateTokensAvailableToBuy(outcomeIndex, limitPrice)
    if (currentBalance < balanceRequired) {
      throw new Error('Insufficient token balance')
    }

    if (this.orders.length == this.maxNumberOfOrders) {
      throw new Error('Max number of orders reached')
    }

    roundPriceToNearestTickSize(limitPrice, this.market.numberOfOutcomes == 2)

    if (!isMarketTradable(this.market.marketStatus)) {
      throw new Error('Market currently not in a tradeable status')
    }

    return true
  }
}
