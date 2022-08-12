// @ts-nocheck
import { Idl, IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl"
import {
  IdlTypes,
  TypeDef,
} from "@project-serum/anchor/dist/cjs/program/namespace/types"
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  AccountMeta,
  AccountInfo,
  SendOptions,
} from "@solana/web3.js"
import { SelfTradeBehavior } from "@bonfida/aaob"
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { AverClient } from "./aver-client"
import {
  AccountType,
  OrderbookAccountsState,
  OrderType,
  Side,
  SizeFormat,
  UserBalanceState,
  UserMarketState,
} from "./types"
import {
  getBestDiscountToken,
  parseWithVersion,
  signAndSendTransactionInstructions,
} from "./utils"
import { Market } from "./market"
import BN from "bn.js"
import {
  AVER_PROGRAM_ID,
  AVER_HOST_ACCOUNT,
  CANCEL_ALL_ORDERS_INSTRUCTION_CHUNK_SIZE,
} from "./ids"
import { UserHostLifetime } from "./user-host-lifetime"
import { chunk } from "lodash"
import {
  checkCorrectUmaMarketMatch,
  checkMarketActivePreEvent,
  checkSufficientLamportBalance,
  checkCancelOrderMarketStatus,
  checkIncorrectOrderTypeForMarketOrder,
  checkIsOrderValid,
  checkLimitPriceError,
  checkOrderExists,
  checkUhlSelfExcluded,
  checkOutcomeHasOrders,
  checkOutcomeOutsideSpace,
  checkQuoteAndBaseSizeTooSmall,
  checkStakeNoop,
  checkUserMarketFull,
  checkUserPermissionAndQuoteTokenLimitExceeded,
} from "./checks"
export class UserMarket {
  /**
   * Contains data on a user's orders on a particular market (for a particular host)
   */

  /**
   * AverClient object
   * @private
   */
  private _userMarketState: UserMarketState

  /**
   * UserMarket public key
   * @private
   */
  private _pubkey: PublicKey

  /**
   * Corresponding Market object
   * @private
   */
  private _averClient: AverClient

  /**
   * UserMarketState object
   * @private
   */
  private _market: Market

  /**
   * UserBalanceState object
   * @private
   */
  private _userBalanceState: UserBalanceState

  /**
   * UserHostLifetime object
   * @private
   */
  private _userHostLifetime: UserHostLifetime

  /**
   * Initialise an UserMarket object. Do not use this function; use load() instead
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey} pubkey - UserMarket public key
   * @param {UserMarketState} userMarketState - UserMarketState object
   * @param {Market} market - Market object
   * @param {UserBalanceState} userBalanceState - UserBalanceState object
   * @param {UserHostLifetime} userHostLifetime - UserHostLifetime object
   */
  private constructor(
    averClient: AverClient,
    pubkey: PublicKey,
    userMarketState: UserMarketState,
    market: Market,
    userBalanceState: UserBalanceState,
    userHostLifetime: UserHostLifetime
  ) {
    this._userMarketState = userMarketState
    this._pubkey = pubkey
    this._averClient = averClient
    this._market = market
    this._userBalanceState = userBalanceState
    this._userHostLifetime = userHostLifetime
  }

  /**
   * Initialises an UserMarket object from Market, Host and Owner public keys
   *
   * To refresh data on an already loaded UserMarket use refresh()
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Market} market - Corresponding Market object
   * @param {PublicKey} owner - Owner of UserMarket account
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT.
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   *
   * @returns {Promise<UserMarket>} - UserMarket object
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
    const uhl = UserHostLifetime.derivePubkeyAndBump(umaOwner, host, programId)
    return UserMarket.loadByUma(averClient, uma, market, uhl)
  }

  /**
   * Initialises an UserMarket object from UserMarket account public key
   *
   * To refresh data on an already loaded UserMarket use refresh()
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey} pubkey - UserMarket account public key
   * @param {Market} market - AverMarket object or AverMarket public key
   * @param {PublicKey} uhl - UserHostLifetime account
   *
   * @returns {Promise<UserMarket>} - UserMarket object
   */
  static async loadByUma(
    averClient: AverClient,
    pubkey: PublicKey,
    market: Market,
    uhl: PublicKey
  ) {
    const program = averClient.program

    const userMarketResult = await program.account["userMarket"].fetch(pubkey)

    const uhlAccount = await UserHostLifetime.load(averClient, uhl)

    const userMarketState = UserMarket.parseUserMarketState(userMarketResult)

    const lamportBalance = await averClient.requestLamportBalance(
      userMarketState.user
    )
    const tokenBalance = await averClient.requestTokenBalance(
      averClient.quoteTokenMint,
      userMarketState.user
    )
    const userBalanceState: UserBalanceState = {
      lamportBalance: lamportBalance,
      tokenBalance: parseInt(tokenBalance.amount),
    }

    if (userMarketState.market.toString() !== market.pubkey.toString()) {
      throw Error("UserMarket and Market do not match")
    }

    return new UserMarket(
      averClient,
      pubkey,
      userMarketState,
      market,
      userBalanceState,
      uhlAccount
    )
  }

  /**
   * Initialises multiple UserMarket objects from Market, Host and Owner public keys
   *
   * This method is more highly optimized and faster than using load() multiple times.
   *
   * To refresh data on already loaded UserMarkets use refreshMultipleUserMarkets()
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Market[]} markets - List of corresponding AverMarket objects (in correct order)
   * @param {PublicKey[]} owners - List of owners of UserMarket account
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT.
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   * @returns {Promise<(UserMarket | undefined)[]>} List of UserMarket objects
   */
  static async loadMultiple(
    averClient: AverClient,
    markets: Market[],
    owners?: PublicKey[],
    host: PublicKey = AVER_HOST_ACCOUNT,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    const umaOwners = owners || Array(markets.length).fill(averClient.owner)

    const umasAndBumps = await Promise.all(
      markets.map((m, i) =>
        UserMarket.derivePubkeyAndBump(umaOwners[i], m.pubkey, host, programId)
      )
    )
    const umasPubkeys = umasAndBumps.map((u) => u[0])
    const uhlPubkeysAndBumps = await Promise.all(
      umaOwners?.map((o) =>
        UserHostLifetime.derivePubkeyAndBump(o, host, programId)
      )
    )
    const uhlPubkeys = uhlPubkeysAndBumps.map((u) => u[0])

    return UserMarket.loadMultipleByUma(
      averClient,
      umasPubkeys,
      markets,
      uhlPubkeys
    )
  }

  /**
   * Initialises an multiple UserMarket objects from a list of UserMarket account public keys
   *
   * To refresh data on an already loaded UserMarket use src.refresh.refresh_user_markets()
   *
   * @param {AverClient} averClient - AverClient object
   * @param {PublicKey[]} pubkeys - List of UserMarket account public keys
   * @param {Market[]} markets - List of AverMarket objects
   * @param {PublicKey[]} uhls - List of UserHostLifetime  account public keys
   * @returns {Promise<(UserMarket | undefined)[]>} List of UserMarket objects
   */
  static async loadMultipleByUma(
    averClient: AverClient,
    pubkeys: PublicKey[],
    markets: Market[],
    uhls: PublicKey[]
  ) {
    const program = averClient.program

    const userMarketResult = await program.account["userMarket"].fetchMultiple(
      pubkeys
    )
    const uhlAccounts = await UserHostLifetime.loadMultiple(averClient, uhls)
    const userMarketStates = userMarketResult.map((umr) =>
      umr ? UserMarket.parseUserMarketState(umr) : null
    )

    const userPubkeys = userMarketStates.map(
      (umr) => umr?.user || new Keypair().publicKey
    )
    const userBalances = (
      await Market.loadMultipleAccountStates(
        averClient,
        [],
        [],
        [],
        [],
        userPubkeys
      )
    ).userBalanceStates

    for (let i = 0; i < userMarketStates.length; i++) {
      if (
        userMarketStates[i].market.toString() !== markets[i].pubkey.toString()
      ) {
        throw Error(`UserMarket and Market do not match for the ${i}th market`)
      }
    }

    return userMarketStates.map((ums, i) =>
      ums
        ? new UserMarket(
            averClient,
            pubkeys[i],
            ums,
            markets[i],
            userBalances[i],
            uhlAccounts[i]
          )
        : undefined
    )
  }

  private static parseUserMarketState(
    marketResult: TypeDef<IdlTypeDef, IdlTypes<Idl>>
  ): UserMarketState {
    return marketResult as UserMarketState
  }

  /**
   * Creates instruction for UserMarket account creation
   *
   * Returns TransactionInstruction object only. Does not send transaction.
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Market} market - Corresponding Market object
   * @param {PublicKey} owner - Owner of UserMarket account
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT.
   * @param {number} numberOfOrders - Max no. of open orders on UMA. Defaults to 5*number of market outcomes.
   * @param {PublicKey} programId -  Program public key. Defaults to AVER_PROGRAM_ID.
   *
   * @returns {Promise<TransactionInstruction>} - TransactionInstruction object
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

    const [userHostLifetime, _uhlBump] =
      await UserHostLifetime.derivePubkeyAndBump(umaOwner, host, programId)

    const getBestDiscountTokenAccount = await getBestDiscountToken(
      averClient,
      umaOwner
    )
    const discountTokenAccount = {
      isSigner: false,
      isWritable: false,
      pubkey: getBestDiscountTokenAccount,
    } as AccountMeta

    console.log("Creating a User Market")
    console.log(
      "user:",
      umaOwner.toString(),
      "userHostLifetime:",
      userHostLifetime.toString(),
      "userMarket:",
      userMarket.toString(),
      "market:",
      market.pubkey.toString(),
      "host:",
      host.toString()
    )

    return program.instruction["initUserMarket"](numberOfOrders, umaBump, {
      accounts: {
        user: umaOwner,
        userHostLifetime: userHostLifetime,
        userMarket: userMarket,
        market: market.pubkey,
        host: host,
        systemProgram: SystemProgram.programId,
      },
      remainingAccounts: getBestDiscountTokenAccount.equals(
        SystemProgram.programId
      )
        ? []
        : [discountTokenAccount],
    })
  }

  /**
   * Creates UserMarket account
   *
   * Sends instructions on chain
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Market} market - Corresponding Market object
   * @param {Keypair} owner - Owner of UserMarket account. Defaults to AverClient wallet
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction. Defaults to None.
   * @param {number} manualMaxRetry - No. of times to retry in case of failure
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT.
   * @param {number} numberOfOrders - Max no. of open orders on UMA. Defaults to 5*number of market outcomes.
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   * @returns {Promise<String>} Transaction signature
   */
  static async createUserMarketAccount(
    averClient: AverClient,
    market: Market,
    owner: Keypair = averClient.keypair,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    host: PublicKey = AVER_HOST_ACCOUNT,
    numberOfOrders: number = market.numberOfOutcomes * 5,
    programId: PublicKey = AVER_PROGRAM_ID
  ) {
    const createUserMarketAccountIx =
      await this.makeCreateUserMarketAccountInstruction(
        averClient,
        market,
        owner.publicKey,
        host,
        numberOfOrders,
        programId
      )

    return signAndSendTransactionInstructions(
      averClient,
      [],
      owner,
      [createUserMarketAccountIx],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Attempts to load UserMarket object or creates one if not one is not found
   *
   * @param {AverClient} averClient - AverClient object
   * @param {Keypair} owner - Owner of UserMarket account. Defaults to AverClient wallet
   * @param {Market} market - Corresponding AverMarket object
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction
   * @param {PublicKey} quoteTokenMint - ATA token mint public key. Defaults to USDC token according to Aver Client.
   * @param {PublicKey} host - Host account public key. Defaults to AVER_HOST_ACCOUNT.
   * @param {number} numberOfOrders - Max no. of open orders on UMA. Defaults to 5*number of market outcomes.
   * @param {PublicKey} referrer - Referrer account public key. Defaults to SYS_PROGRAM_ID.
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   *
   * @returns {Promise<UserMarket>} - UserMarket account object
   */
  static async getOrCreateUserMarketAccount(
    averClient: AverClient,
    owner: Keypair = averClient.keypair,
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
      await UserMarket.derivePubkeyAndBump(
        owner.publicKey,
        market.pubkey,
        host,
        programId
      )
    )[0]
    const userMarketResult = await averClient.program.account[
      "userMarket"
    ].fetchNullable(userMarket)

    if (userMarketResult) {
      const userMarketState = UserMarket.parseUserMarketState(userMarketResult)
      const lamportBalance = await averClient.requestLamportBalance(
        userMarketState.user
      )
      const tokenBalance = await averClient.requestTokenBalance(
        averClient.quoteTokenMint,
        userMarketState.user
      )
      const userBalanceState: UserBalanceState = {
        lamportBalance: lamportBalance,
        tokenBalance: parseInt(tokenBalance.amount),
      }
      const uhlPubkey = (
        await UserHostLifetime.derivePubkeyAndBump(
          owner.publicKey,
          host,
          programId
        )
      )[0]
      const uhlAccount = await UserHostLifetime.load(averClient, uhlPubkey)
      return new UserMarket(
        averClient,
        userMarket,
        userMarketState,
        market,
        userBalanceState,
        uhlAccount
      )
    }

    const uhl = await UserHostLifetime.getOrCreateUserHostLifetime(
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

    await averClient.connection.confirmTransaction(
      sig,
      sendOptions?.preflightCommitment
    )

    const userMarketAccount = await UserMarket.loadByUma(
      averClient,
      userMarket,
      market,
      uhl.pubkey
    )

    return userMarketAccount
  }

  /**
   * Parses onchain data for multiple UserMarketState objects
   *
   * @param {AverClient} averClient - AverClient object
   * @param {AccountInfo<Buffer | null>[]} userMarketStoresData - Raw bytes coming from onchain
   *
   * @returns {(UserMarketState | null)[]} - UserMarketState objects
   */
  static deserializeMultipleUserMarketStoreData(
    averClient: AverClient,
    userMarketStoresData: AccountInfo<Buffer | null>[]
  ): (UserMarketState | null)[] {
    return userMarketStoresData.map((marketStoreData) =>
      parseWithVersion(
        averClient.program,
        AccountType.USER_MARKET,
        marketStoreData
      )
    )
  }

  /**
   * Refresh all data for multiple user markets quickly
   *
   * This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.
   *
   * Also refreshes the underlying AverMarket objects
   *
   * @param {AverClient} averClient - AverClient object
   * @param {UserMarket[]} userMarkets - List of UserMarket objects
   *
   * @returns {Promise<(UserMarket | null)[]>} - List of refreshed UserMarket objects
   */
  static async refreshMultipleUserMarkets(
    averClient: AverClient,
    userMarkets: UserMarket[]
  ) {
    const markets = userMarkets.map((um) => um.market)

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
      ),
      userMarkets.map((u) => u.pubkey),
      userMarkets.map((u) => u.user),
      userMarkets.map((u) => u._userHostLifetime.pubkey)
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
            multipleAccountStates.userBalanceStates[i],
            multipleAccountStates.userHostLifetimes[i]
          )
        : undefined
    )
  }

  /**
   * Derives PDA (Program Derived Account) for UserMarket public key given a user, host and market
   *
   * @param {PublicKey} owner - Owner of UserMarket account
   * @param {PublicKey} market - Corresponding Market account public key
   * @param {PublicKey} host - Host public key
   * @param {PublicKey} programId - Program public key. Defaults to AVER_PROGRAM_ID.
   * @returns {Promise<[PublicKey, number]>} UserMarket Pubkey and bump
   */
  static async derivePubkeyAndBump(
    owner: PublicKey,
    market: PublicKey,
    host: PublicKey = AVER_HOST_ACCOUNT,
    programId = AVER_PROGRAM_ID
  ) {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("user-market", "utf-8"),
        owner.toBuffer(),
        market.toBuffer(),
        host.toBuffer(),
      ],
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
    return this._userHostLifetime
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
    return (
      this._userBalanceState.tokenBalance / Math.pow(10, this.market.decimals)
    )
  }

  /**
   * Refresh all data for a user markets quickly
   *
   * This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.
   *
   * Also refreshes the underlying AverMarket object
   */
  async refresh() {
    const refreshedUserMarket = (
      (await UserMarket.refreshMultipleUserMarkets(this._averClient, [
        this,
      ])) as UserMarket[]
    )[0]
    this._market = refreshedUserMarket._market
    this._userMarketState = refreshedUserMarket._userMarketState
    this._userBalanceState = refreshedUserMarket._userBalanceState
    this._userHostLifetime = refreshedUserMarket._userHostLifetime
  }

  /**
   * Creates instruction to place order.
   *
   * Returns TransactionInstruction object only. Does not send transaction.
   *
   * @param {number} outcomeIndex - ID of outcome
   * @param {Side} side - Side object (bid or ask)
   * @param {number} limitPrice - Limit price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument
   * @param {number} size - Size - in the format specified in size_format. This value is in number of 'tokens' - i.e. 20.45 => 20.45 USDC, the SDK handles the conversion to u64 token units (e.g. to 20,450,000 as USDC is a 6 decimal place token)
   * @param {SizeFormat} sizeFormat - SizeFormat object (Stake or Payout)
   * @param {OrderType} orderType - OrderType object. Defaults to OrderType.LIMIT.
   * @param {SelfTradeBehavior} selfTradeBehavior - Behavior when a user's trade is matched with themselves. Defaults to SelfTradeBehavior.CANCEL_PROVIDE.
   * @param {boolean} averPreFlightCheck - Clientside check if order will success or fail. Defaults to False.
   *
   * @returns {Promise<TransactionInstruction>} TransactionInstruction object
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
      checkSufficientLamportBalance(this._userBalanceState)
      checkCorrectUmaMarketMatch(this._userMarketState, this._market)
      checkMarketActivePreEvent(this._market.marketStatus)
      checkUhlSelfExcluded(this.userHostLifetime)
      checkUserMarketFull(this._userMarketState)
      checkLimitPriceError(limitPrice, this._market)
      checkOutcomeOutsideSpace(outcomeIndex, this._market)
      checkIncorrectOrderTypeForMarketOrder(
        limitPrice,
        orderType,
        side,
        this._market
      )
      checkStakeNoop(sizeFormat, limitPrice, side)
      let tokens_available_to_buy = this.calculateTokensAvailableToBuy(
        outcomeIndex,
        limitPrice
      )
      let tokens_available_to_sell = this.calculateTokensAvailableToSell(
        outcomeIndex,
        limitPrice
      )
      checkIsOrderValid(
        outcomeIndex,
        side,
        limitPrice,
        size,
        sizeFormat,
        tokens_available_to_sell,
        tokens_available_to_buy
      )
      checkQuoteAndBaseSizeTooSmall(
        this._market,
        side,
        sizeFormat,
        outcomeIndex,
        limitPrice,
        size
      )
      checkUserPermissionAndQuoteTokenLimitExceeded(
        this._market,
        this._userMarketState,
        size,
        limitPrice,
        sizeFormat
      )
    }

    const sizeU64 = new BN(
      Math.floor(size * Math.pow(10, this.market.decimals))
    )
    const limitPriceU64 = new BN(
      Math.ceil(limitPrice * Math.pow(10, this.market.decimals))
    )
    // consider when binary markets where there is only one order book
    const orderbookAccountIndex =
      this.market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex
    //@ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
    // @ts-ignore
    const orderbookAccount =
      this.market.orderbookAccounts[orderbookAccountIndex]

    const userQuoteTokenAta = await getAssociatedTokenAddress(
      this.market.quoteTokenMint,
      this.user
    )

    return this._averClient.program.instruction["placeOrder"](
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
          userHostLifetime: this.userHostLifetime.pubkey,
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
          vaultAuthority: this.market.vaultAuthority,
        },
      }
    )
  }

  //Why are there 2?
  // /**
  //  *
  //  * @param outcomeIndex
  //  * @param side
  //  * @param limitPrice
  //  * @param size
  //  * @param sizeFormat
  //  * @param market
  //  * @param user
  //  * @param averClient
  //  * @param userHostLifetime
  //  * @param umaPubkey
  //  * @param orderType
  //  * @param selfTradeBehavior
  //  * @returns
  //  */
  // static async makePlaceOrderInstruction(
  //   outcomeIndex: number,
  //   side: Side,
  //   limitPrice: number,
  //   size: number,
  //   sizeFormat: SizeFormat,
  //   market: Market,
  //   user: PublicKey,
  //   averClient: AverClient,
  //   userHostLifetime: PublicKey,
  //   umaPubkey: PublicKey,
  //   orderType: OrderType = OrderType.Limit,
  //   selfTradeBehavior: SelfTradeBehavior = SelfTradeBehavior.CancelProvide
  // ) {
  //   const sizeU64 = new BN(Math.floor(size * Math.pow(10, market.decimals)))
  //   const limitPriceU64 = new BN(
  //     Math.ceil(limitPrice * Math.pow(10, market.decimals))
  //   )
  //   // consider when binary markets where there is only one order book
  //   const orderbookAccountIndex =
  //     market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex
  //   // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
  //   const orderbookAccount = market.orderbookAccounts[orderbookAccountIndex]

  //   const userQuoteTokenAta = await getAssociatedTokenAddress(
  //     market.quoteTokenMint,
  //     user
  //   )

  //   console.log("Placing the order")
  //   console.log(
  //     "user:",
  //     user.toString(),
  //     "userHostLifetime:",
  //     userHostLifetime.toString(),
  //     "userMarket:",
  //     umaPubkey.toString(),
  //     "userQuoteTokenAta:",
  //     userQuoteTokenAta.toString(),
  //     "market:",
  //     market.pubkey.toString(),
  //     "marketStore:",
  //     market.marketStore.toString(),
  //     "quoteVault:",
  //     market.quoteVault.toString(),
  //     "orderbook:",
  //     orderbookAccount.orderbook.toString(),
  //     "bids:",
  //     orderbookAccount.bids.toString(),
  //     "asks:",
  //     orderbookAccount.asks.toString(),
  //     "eventQueue:",
  //     orderbookAccount.eventQueue.toString()
  //   )
  //   return averClient.program.instruction["placeOrder"](
  //     {
  //       size: sizeU64,
  //       sizeFormat,
  //       limitPrice: limitPriceU64,
  //       side: side,
  //       orderType: orderType,
  //       selfTradeBehaviour: selfTradeBehavior,
  //       outcomeId: outcomeIndex,
  //     },
  //     {
  //       accounts: {
  //         user: user,
  //         userHostLifetime: userHostLifetime,
  //         userMarket: umaPubkey,
  //         userQuoteTokenAta: userQuoteTokenAta,
  //         market: market.pubkey,
  //         marketStore: market.marketStore,
  //         quoteVault: market.quoteVault,
  //         orderbook: orderbookAccount.orderbook,
  //         bids: orderbookAccount.bids,
  //         asks: orderbookAccount.asks,
  //         eventQueue: orderbookAccount.eventQueue,
  //         splTokenProgram: TOKEN_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //       },
  //     }
  //   )
  // }

  /**
   * Places a new order
   *
   * Sends instructions on chain
   *
   * @param {Keypair} owner - Owner of UserMarket account. Pays transaction fees.
   * @param {number} outcomeIndex - Index of the outcome intended to be traded
   * @param {Side} side - Side object (bid/back/buy or ask/lay/sell)
   * @param {number} limitPrice -  Limit price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument
   * @param {number} size - Size - in the format specified in size_format. This value is in number of 'tokens' - i.e. 20.45 => 20.45 USDC, the SDK handles the conversion to u64 token units (e.g. to 20,450,000 as USDC is a 6 decimal place token)
   * @param {SizeFormat} sizeFormat - SizeFormat object (Stake or Payout formats supported)
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction
   * @param {number} manualMaxRetry - No. of times to retry in case of failure
   * @param {OrderType} orderType - OrderType object. Defaults to OrderType.LIMIT. Other options include OrderType.IOC, OrderType.KILL_OR_FILL, OrderType.POST_ONLY.
   * @param {SelfTradeBehavior} selfTradeBehavior - Behavior when a user's trade is matched with themselves. Defaults to SelfTradeBehavior.CANCEL_PROVIDE. Other options include SelfTradeBehavior.DECREMENT_TAKE and SelfTradeBehavior.ABORT_TRANSACTION
   * @param {boolean} averPreFlightCheck - Clientside check if order will success or fail. Defaults to True.
   *
   * @returns {Promise<string>} - Transaction signature
   */
  async placeOrder(
    owner: Keypair = this._averClient.keypair,
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
    await this.checkIfUhlLatestVersion()
    await this.checkIfUmaLatestVersion()

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
      this._averClient,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Creates instruction for to cancel order.
   *
   * Returns TransactionInstruction object only. Does not send transaction.
   *
   * @param {BN} orderId - ID of order to cancel
   * @param {number} outcomeIndex - ID of outcome
   * @param {boolean} averPreFlightCheck - Clientside check if order will success or fail. Defaults to False.
   *
   * @returns {Promise<TransactionInstruction>} TransactionInstruction object
   */
  async makeCancelOrderInstruction(
    orderId: BN,
    outcomeIndex: number,
    averPreFlightCheck: boolean = false
  ) {
    if (averPreFlightCheck) {
      checkSufficientLamportBalance(this._userBalanceState)
      checkCancelOrderMarketStatus(this._market.marketStatus)
      checkOrderExists(this._userMarketState, orderId)
    }

    const quoteTokenAta = await getAssociatedTokenAddress(
      this.market.quoteTokenMint,
      this.user
    )

    // account for binary markets where there is only one order book
    outcomeIndex =
      this.market.numberOfOutcomes == 2 && outcomeIndex == 1 ? 0 : outcomeIndex
    // @ts-ignore: Object is possibly 'null'. We do the pre flight check for this already
    const orderbookAccount = this.market.orderbookAccounts[outcomeIndex]

    return this._averClient.program.instruction["cancelOrder"](
      orderId,
      outcomeIndex,
      {
        accounts: {
          orderbook: orderbookAccount.orderbook,
          eventQueue: orderbookAccount.eventQueue,
          bids: orderbookAccount.bids,
          asks: orderbookAccount.asks,
          market: this.market.pubkey,
          userMarket: this.pubkey,
          user: this.user,
          marketStore: this.market.marketStore,
          userQuoteTokenAta: quoteTokenAta,
          quoteVault: this.market.quoteVault,
          vaultAuthority: this.market.vaultAuthority,
          splTokenProgram: TOKEN_PROGRAM_ID,
        },
      }
    )
  }

  /**
   * Cancels order
   *
   * Sends instructions on chain
   *
   * @param {Keypair} feePayer - Keypair to pay fee for transaction. Defaults to AverClient wallet
   * @param {BN} orderId - ID of order to cancel
   * @param {number} outcomeIndex - ID of outcome
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction
   * @param {number} manualMaxRetry - No. of times to retry in case of failure
   * @param {boolean} averPreFlightCheck - Clientside check if order will success or fail. Defaults to True.
   *
   * @returns {Promise<string>}
   */
  async cancelOrder(
    feePayer: Keypair = this._averClient.keypair,
    orderId: BN,
    outcomeIndex: number,
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    averPreFlightCheck: boolean = true
  ) {
    await this.checkIfUhlLatestVersion()
    await this.checkIfUmaLatestVersion()

    const ix = await this.makeCancelOrderInstruction(
      orderId,
      outcomeIndex,
      averPreFlightCheck
    )

    return signAndSendTransactionInstructions(
      this._averClient,
      [],
      feePayer,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Creates instruction for to cancelling all orders
   *
   * Cancels all orders on particular outcome_ids (not by order_id)
   *
   * Returns TransactionInstruction object only. Does not send transaction.
   *
   * @param {number[]} outcomeIdsToCancel - List of outcome ids to cancel orders on
   * @param {boolean} averPreFlightCheck - Clientside check if order will success or fail. Defaults to False.
   *
   * @returns {Promise<TransactionInstruction>} TransactionInstruction ojbect
   */
  async makeCancelAllOrdersInstructions(
    outcomeIdsToCancel: number[],
    averPreFlightCheck: boolean = false
  ) {
    if (averPreFlightCheck) {
      checkSufficientLamportBalance(this._userBalanceState)
      checkCancelOrderMarketStatus(this._market.marketStatus)
      outcomeIdsToCancel.map((o) => {
        checkOutcomeHasOrders(o, this._userMarketState)
      })
    }

    const quoteTokenAta = await getAssociatedTokenAddress(
      this.market.quoteTokenMint,
      this.user
    )

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

    const chunkSize = CANCEL_ALL_ORDERS_INSTRUCTION_CHUNK_SIZE
    const chunkedOutcomeIds = chunk(outcomeIdsToCancel, chunkSize)
    const chunkedRemainingAccounts = chunk(remainingAccounts, 4 * chunkSize)

    return chunkedOutcomeIds.map((ids, i) =>
      this._averClient.program.instruction["cancelAllOrders"](ids, {
        accounts: {
          market: this.market.pubkey,
          userMarket: this.pubkey,
          user: this.user,
          marketStore: this.market.marketStore,
          userQuoteTokenAta: quoteTokenAta,
          quoteVault: this.market.quoteVault,
          vaultAuthority: this.market.vaultAuthority,
          splTokenProgram: TOKEN_PROGRAM_ID,
        },
        remainingAccounts: chunkedRemainingAccounts[i],
      })
    )
  }

  /**
   * Cancels all orders on particular outcome_ids (not by order_id)
   *
   * Sends instructions on chain
   *
   * @param {Keypair} feePayer - Keypair to pay fee for transaction. Defaults to AverClient wallet
   * @param {number[]} outcomeIdsToCancel - List of outcome ids to cancel orders on
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction. Defaults to None.
   * @param {number} manualMaxRetry - No. of times to retry in case of failure
   * @param {boolean} averPreFlightCheck - Clientside check if order will success or fail. Defaults to True.
   *
   * @returns {Promise<string>} - Transaction signature
   */
  async cancelAllOrders(
    feePayer: Keypair = this._averClient.keypair,
    outcomeIdsToCancel: number[],
    sendOptions?: SendOptions,
    manualMaxRetry?: number,
    averPreFlightCheck: boolean = true
  ) {
    await this.checkIfUhlLatestVersion()
    await this.checkIfUmaLatestVersion()

    const ixs = await this.makeCancelAllOrdersInstructions(
      outcomeIdsToCancel,
      averPreFlightCheck
    )

    return Promise.all(
      ixs.map((ix) =>
        signAndSendTransactionInstructions(
          this._averClient,
          [],
          feePayer,
          [ix],
          sendOptions,
          manualMaxRetry
        )
      )
    )
  }

  // /**
  //  * Format instruction to withdraw idle funds
  //  *
  //  * @param amount
  //  *
  //  * @returns {Promise<TransactionInstruction>}
  //  */
  // async makeWithdrawIdleFundsInstruction(amount?: BN) {
  //   const userQuoteTokenAta = await getAssociatedTokenAddress(
  //     this.market.quoteTokenMint,
  //     this.user
  //   )
  //   const amountToWithdraw = new BN(
  //     amount || this.calculateFundsAvailableToWithdraw()
  //   )

  //   return this._averClient.program.instruction["withdrawTokens"](
  //     amountToWithdraw,
  //     {
  //       accounts: {
  //         market: this.market.pubkey,
  //         userMarket: this.pubkey,
  //         user: this.user,
  //         userQuoteTokenAta,
  //         quoteVault: this.market.quoteVault,
  //         vaultAuthority: this.market.vaultAuthority,
  //         splTokenProgram: TOKEN_PROGRAM_ID,
  //       },
  //     }
  //   )
  // }

  /**
  //  * Withdraw idle funds from the User Market
  //  * @param owner
  //  * @param amount
  //  * @param sendOptions
  //  * @param manualMaxRetry
  //  *
  //  * @returns {Promise<string>}
  //  */
  // async withdrawIdleFunds(
  //   owner: Keypair = this._averClient.keypair,
  //   amount?: BN,
  //   sendOptions?: SendOptions,
  //   manualMaxRetry?: number
  // ) {
  //   if (!owner.publicKey.equals(this.user))
  //     throw new Error("Owner must be same as user market owner")

  //   const ix = await this.makeWithdrawIdleFundsInstruction(amount)

  //   return signAndSendTransactionInstructions(
  //     this._averClient,
  //     [],
  //     owner,
  //     [ix],
  //     sendOptions,
  //     manualMaxRetry
  //   )
  // }

  /**
   * Format instruction to neutralise the outcome position
   *
   * Returns TransactionInstruction object only. Does not send transaction.
   *
   * @param outcomeId - Outcome ids to neutralize positions on
   *
   * @returns {Promise<TransactionInstruction>} TransactionInstruction object
   */
  async makeNeutralizePositionInstruction(outcomeId: number) {
    const quoteTokenAta = await getAssociatedTokenAddress(
      this.market.quoteTokenMint,
      this.user
    )
    return this._averClient.program.instruction["neutralizeOutcomePosition"](
      outcomeId,
      {
        accounts: {
          user: this.user,
          userHostLifetime: this.userHostLifetime.pubkey,
          userMarket: this.pubkey,
          userQuoteTokenAta: quoteTokenAta,
          market: this.market.pubkey,
          quoteVault: this.market.quoteVault,
          marketStore: this.market.marketStore,
          orderbook: this.market.orderbookAccounts?.[outcomeId]
            .orderbook as PublicKey,
          bids: this.market.orderbookAccounts?.[outcomeId].bids as PublicKey,
          asks: this.market.orderbookAccounts?.[outcomeId].asks as PublicKey,
          eventQueue: this.market.orderbookAccounts?.[outcomeId]
            .eventQueue as PublicKey,
          splTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          vaultAuthority: this.market.vaultAuthority,
        },
      }
    )
  }

  /**
   * Neutralise the outcome position
   *
   * Sends instructions on chain
   *
   * @param {Keypair} owner - Owner of UserMarket account
   * @param {number} outcomeId - Outcome ids to neutralize positions on
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction. Defaults to None.
   * @param {number} manualMaxRetry - No. of times to retry in case of failure
   *
   * @returns {Promise<string>} - Transaction signature
   */
  async neutralizePosition(
    owner: Keypair = this._averClient.keypair,
    outcomeId: number,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    if (!owner.publicKey.equals(this.user))
      throw new Error("Owner must be same as user market owner")

    await this.checkIfUhlLatestVersion()
    await this.checkIfUmaLatestVersion()

    const ix = await this.makeNeutralizePositionInstruction(outcomeId)

    return signAndSendTransactionInstructions(
      this._averClient,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Changes size of UMA account to hold more or less max open orders
   *
   * Returns TransactionInstruction object only. Does not send transaction.
   *
   * @param {number} newSize - New number of open orders available
   * @returns {Promise<TransactionInstruction>} TransactionInstruction object
   */
  async makeUpdateUserMarketOrders(newSize: number) {
    return this._averClient.program.instruction["updateUserMarketOrders"](
      newSize,
      {
        accounts: {
          user: this.user,
          userMarket: this.pubkey,
          systemProgram: SystemProgram.programId,
        },
      }
    )
  }

  /**
   * Changes size of UMA account to hold more or less max open orders
   *
   * Sends instructions on chain
   *
   * @param {Keypair} owner - Owner of UserMarket account
   * @param {number} newSize - New number of open orders available
   * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction. Defaults to None.
   * @param {number} manualMaxRetry - No. of times to retry in case of failure
   *
   * @returns {Promise<string>} - Transaction signature
   */
  async updateUserMarketOrders(
    owner: Keypair = this._averClient.keypair,
    newSize: number,
    sendOptions?: SendOptions,
    manualMaxRetry?: number
  ) {
    if (!owner.publicKey.equals(this.user))
      throw new Error("Owner must be same as user market owner")

    await this.checkIfUhlLatestVersion()
    await this.checkIfUmaLatestVersion()

    const ix = await this.makeUpdateUserMarketOrders(newSize)

    return signAndSendTransactionInstructions(
      this._averClient,
      [],
      owner,
      [ix],
      sendOptions,
      manualMaxRetry
    )
  }

  /**
   * Loads UserMarket listener
   *
   * @param {(userMarket: UserMarket) => void} callback - Callback function
   * @returns
   */
  async loadUserMarketListener(callback: (userMarket: UserMarket) => void) {
    const ee = this._averClient.program.account["userMarket"].subscribe(
      this.pubkey
    )
    ee.on("change", callback)
    return ee
  }

  /**
   * Calculates idle funds available to withdraw
   *
   * @returns {number} Idle funds
   */
  calculateFundsAvailableToWithdraw() {
    return Math.min(
      ...this.outcomePositions.map((op) => op.free.toNumber()),
      this.netQuoteTokensIn.toNumber()
    )
  }

  /**
   * Calcualtes exposures for every possible outcome
   *
   * The exposure on a particular outcome is the profit/loss if that outcome wins
   *
   * @returns {BN[]} List of exposures
   */
  calculateExposures() {
    return this.outcomePositions.map((op) =>
      op.free.add(op.locked).sub(this.netQuoteTokensIn)
    ) as BN[]
  }

  /**
   * Calculate funds won if a particular outcome wins
   *
   * @param {number} winningOutcome - Winning outcome ID
   *
   * @returns {number} Tokens won
   */
  calculateFundsAvailableToCollect(winningOutcome: number) {
    return (
      this.outcomePositions[winningOutcome].free.toNumber() +
      this.outcomePositions[winningOutcome].locked.toNumber()
    )
  }

  /**
   * Calculates tokens available to sell on a particular outcome
   *
   * @param {number} outcomeIndex - Outcome ID
   * @param {number} price - Price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument
   *
   * @returns {number} Token amount
   */
  calculateTokensAvailableToSell(outcomeIndex: number, price: number) {
    return (
      this.outcomePositions[outcomeIndex].free.toNumber() +
      price * this.tokenBalance
    )
  }

  /**
   * Calculates tokens available to buy on a particular outcome
   *
   * @param {number} outcomeIndex - Outcome ID
   * @param {number} price - Price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument
   *
   * @returns {number} Token amount
   */
  calculateTokensAvailableToBuy(outcomeIndex: number, price) {
    const minFreeTokensExceptOutcomeIndex = Math.min(
      ...this.outcomePositions
        .filter((op, i) => i != outcomeIndex)
        .map((op) => op.free.toNumber())
    )

    return minFreeTokensExceptOutcomeIndex + price * this.tokenBalance
  }

  async checkIfUmaLatestVersion() {
    if (this._userMarketState.version < AVER_VERSION) {
      //UPGRADE VERSION WHEN AVAILALBLE
      //Reload
      console.log("UPGRADING UMA VERSION")
      await this.refresh()
    }
  }

  async checkIfUhlLatestVersion() {
    if (this._userHostLifetime.version < AVER_VERSION) {
      //UPGRADE VERSION WHEN AVAILALBLE
      //Reload
      console.log("UPGRADING UHL VERSION")
      await this.refresh()
    }
  }
}
