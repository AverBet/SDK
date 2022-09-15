import { Slab, Price, Side, LeafNode } from "@bonfida/aaob"
import { BN } from "@project-serum/anchor"
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js"
import { AVER_PROGRAM_IDS, CALLBACK_INFO_LEN } from "./ids"
import { PriceAndSide, SlabOrder, UmaOrder } from "./types"
import { chunkAndFetchMultiple, throwIfNull } from "./utils"

/**
 * Orderbook class
 */
export class Orderbook {
  /** Pubkey of the orderbook
   * @private
   */
  private _pubkey: PublicKey

  /** Market of the orderbook
   * @private
   */
  private _decimals: number

  /** Slab that contains asks
   * @private
   */
  private _slabAsks: Slab

  /** Slab that contains bids
   * @private
   */
  private _slabBids: Slab

  /** Asks slab public key
   * @private
   */
  private _slabAsksPubkey: PublicKey

  /** Bids slab public key
   * @private
   */
  private _slabBidsPubkey: PublicKey

  /**
   * @private
   * Whether the bids and asks should be interpretted as inverted when parsing the data. (Used in the case of the second outcome in a two-outcome market.)
   */
  private _isInverted: boolean

  /**
   * Initialise an Orderbook object. Do not use this function; use Orderbook.load() instead
   *
   * @param {PublicKey} pubkey - Orderbook public key
   * @param {Slab} slabBids - Slab object for bids
   * @param {Slab} slabAsks - Slab object for asks
   * @param {PublicKey} slabBidsPubkey - Slab bids public key
   * @param {PublicKey} slabAsksPubkey - Slab asks public key
   * @param {number} decimals - Decimal precision for orderbook
   * @param {boolean} isInverted - Whether the bids and asks have been switched with each other. Defaults to False.
   */
  constructor(
    pubkey: PublicKey,
    slabBids: Slab,
    slabAsks: Slab,
    slabBidsPubkey: PublicKey,
    slabAsksPubkey: PublicKey,
    decimals: number,
    isInverted = false
  ) {
    this._pubkey = pubkey
    this._decimals = decimals
    this._slabBids = slabBids
    this._slabAsks = slabAsks
    this._slabBidsPubkey = slabBidsPubkey
    this._slabAsksPubkey = slabAsksPubkey
    this._isInverted = isInverted
  }

  /**
   * Returns the market object associated to the orderbook
   */
  get pubkey(): PublicKey {
    return this._pubkey
  }

  /**
   * Returns the market object associated to the orderbook
   */
  get decimals(): number {
    return this._decimals
  }

  /**
   * Returns the asks slab of the orderbook
   */
  get slabAsks(): Slab {
    return this._slabAsks
  }

  /**
   * Returns the bids slab of the orderbook
   */
  get slabBids(): Slab {
    return this._slabBids
  }

  /**
   * Returns a version of the orderbook which has been parsed with bids and asks switched and
   * prices inverted. (Used for the second outcome in a two-outcome market)
   *
   * @param {Orderbook} orderbook - Orderbook object
   * @returns {Orderbook} Orderbook
   */
  static invert(orderbook: Orderbook) {
    // switch bids and asks around to invert
    return new Orderbook(
      orderbook.pubkey,
      orderbook.slabAsks,
      orderbook.slabBids,
      orderbook._slabAsksPubkey,
      orderbook._slabBidsPubkey,
      orderbook.decimals,
      true
    )
  }

  /**
   * Loads onchain data for a Slab (contains orders for a particular side of the orderbook)
   *
   * @param connection -  Solana Connection object
   * @param slabAddress - Slab public key
   * @returns {Slab} A deserialized Slab object
   */
  static async loadSlab(connection: Connection, slabAddress: PublicKey) {
    const { data } = throwIfNull(await connection.getAccountInfo(slabAddress))
    const slab = Slab.deserialize(data, new BN(CALLBACK_INFO_LEN))
    return slab
  }

  /**
   * Loads onchain data for multiple Slabs (contains orders for a particular side of the orderbook)
   *
   * @param {Connection} connection - The solana connection object to the RPC node
   * @param {PublicKey[]} slabAddress - The address of the Slab
   * @returns {Slab[]} Multiple deserialized Slab object
   */
  static async loadMultipleSlabs(
    connection: Connection,
    slabAddresses: PublicKey[]
  ) {
    try {
      const data = await chunkAndFetchMultiple(connection, slabAddresses)
      return Orderbook.deserializeMultipleSlabData(data)
    } catch (error) {
      console.error("There was an error loading multiple slabs. ", error)
      return slabAddresses.map(() => null)
    }
  }

  /**
   * Parses onchain data for multiple Slabs (contains orders for a particular side of the orderbook)
   *
   * @param {AccountInfo<Buffer | null>[]} slabsData
   * @returns {Slab[]} - Multiple deserialized Slab object
   */
  static deserializeMultipleSlabData(
    slabsData: (AccountInfo<Buffer> | null)[]
  ) {
    return slabsData.map((d) =>
      !!d?.data ? Slab.deserialize(d.data, new BN(CALLBACK_INFO_LEN)) : null
    )
  }

  /**
   * Initialise an Orderbook object
   *
   * Parameters are found in MarketStoreStates' --> OrderbookAccounts
   *
   * @param {Connection} connection - Solana Connection object
   * @param {Orderbook} orderbook - Orderbook public key
   * @param {PublicKey} bids - Slab bids public key
   * @param {PublicKey} asks - Slab asks public key
   * @param {number} decimals - Decimal precision for orderbook
   * @param {boolean} isInverted - Whether the bids and asks have been switched with each other. Defaults to False.
   *
   * @returns {Promise<Orderbook>} The Orderbook object
   */
  static async load(
    connection: Connection,
    orderbook: PublicKey,
    bids: PublicKey,
    asks: PublicKey,
    decimals: number,
    isInverted = false
  ) {
    const slabBids = await Orderbook.loadSlab(connection, bids)
    const slabAsks = await Orderbook.loadSlab(connection, asks)
    return new Orderbook(
      orderbook,
      slabBids,
      slabAsks,
      bids,
      asks,
      decimals,
      isInverted
    )
  }

  /**
   * Converts price to correct order of magnitude based on decimal precision
   *
   * @param {Price} p - Unconverted Price object
   * @param {number} decimals - Decimal precision for orderbook
   * @returns {Price} Price object
   */
  static convertPrice(p: Price, decimals: number) {
    const exp = Math.pow(10, decimals)
    return {
      price: Math.round((p.price / Math.pow(2, 32)) * exp) / exp,
      size: p.size / exp,
    }
  }

  /**
   * Converts price to correct order of magnitude based on decimal precision
   *
   * @param {Price} p - Unconverted Price object
   * @returns {Price} Price object
   */
  private convertPrice(p: Price) {
    const exp = Math.pow(10, this.decimals)
    return {
      price: Math.round((p.price / Math.pow(2, 32)) * exp) / exp,
      size: p.size / exp,
    }
  }

  /**
   * Get Level 2 market information for a particular slab
   *
   * This contains information on orders on the slab aggregated by price tick.
   *
   * @param {Slab} slab - Slab object
   * @param {number} depth - Number of orders to return
   * @param {boolean} increasing - Sort orders increasing
   * @param {number} decimals - Decimal precision for orderbook
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true. Defaults to False.
   * @param {boolean} isInverted - Whether the bids and asks have been switched with each other. Defaults to False.
   * @returns {Price[]} - Price object lists
   */
  static getL2ForSlab(
    slab: Slab,
    depth: number,
    increasing: boolean,
    decimals: number,
    uiAmount?: boolean,
    isInverted?: boolean
  ) {
    const l2Depth = isInverted
      ? slab
          .getL2DepthJS(depth, increasing)
          .map((p) => Orderbook.invertPrice(p))
      : slab.getL2DepthJS(depth, increasing)

    return uiAmount
      ? l2Depth.map((p) => Orderbook.convertPrice(p, decimals))
      : l2Depth
  }

  /**
   * Get Level 3 market information for a particular slab
   *
   * See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information
   *
   * @param {Slab} slab - Slab object
   * @param {boolean} increasing - Sort orders increasing
   * @param {boolean} decimals - Decimal precision for orderbook
   * @param {boolean} isInverted - Whether the bids and asks have been switched with each other. Defaults to False.
   * @returns {SlabOrder[]} Slab Order list
   */
  static getL3ForSlab(
    slab: Slab,
    decimals: number,
    increasing: boolean,
    isInverted?: boolean
  ) {
    let orders: SlabOrder[] = []
    for (let node of slab.items(!increasing)) {
      node.getPrice()
      orders.push({
        id: node.key,
        price: isInverted
          ? 1 - node.getPrice() / 2 ** 32
          : node.getPrice() / 2 ** 32,
        price_ui: isInverted
          ? 1 - node.getPrice() / 2 ** 32
          : node.getPrice() / 2 ** 32,
        base_quantity: node.baseQuantity,
        base_quantity_ui: node.baseQuantity * 10 ** -decimals,
        // user_market: new PublicKey(node.callBackInfoPt[0 - 32]), //TODO - CHECK THIS
        // fee_tier: node.callBackInfoPt,
      } as SlabOrder)
    }
    return orders
  }

  /**
   * Derives PDA (Program Derived Account) for Orderbook public key.
   *
   * MarketStore account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey} market - Market public key
   * @param {number} outcomeId - Outcome ID of orderbook
   * @param {PublicKey} programId - Program ID. Defaults to AverProgramId
   *
   * @returns {Promise<[PublicKey, number]>} The Orderbook pubkey and bump
   */
  static async deriveOrderbookPubkeyAndBump(
    market: PublicKey,
    outcomeId: number,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("orderbook", "utf-8"),
        market.toBuffer(),
        Buffer.of(outcomeId),
      ],
      programId
    )
  }

  /**
   * Derives PDA (Program Derived Account) for Event Queue public key.
   *
   * MarketStore account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey} market - Market public key
   * @param {number} outcomeId - Outcome ID of orderbook
   * @param {PublicKey} programId - Program ID. Defaults to AverProgramId
   * @returns {Promise<[PublicKey, number]>} The Event Queue pubkey and bump
   */
  static async deriveEventQueuePubkeyAndBump(
    market: PublicKey,
    outcomeId: number,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("event-queue", "utf-8"),
        market.toBuffer(),
        Buffer.of(outcomeId),
      ],
      programId
    )
  }

  /**
   * Derives PDA (Program Derived Account) for Bids public key.
   *
   * MarketStore account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey} market - Market public key
   * @param {number} outcomeId - Outcome ID of orderbook
   * @param {PublicKey} programId - Program ID. Defaults to AverProgramId
   * @returns {Promise<[PublicKey, number]>} The Bids pubkey and bump
   */
  static async deriveBidsPubkeyAndBump(
    market: PublicKey,
    outcomeId: number,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    return PublicKey.findProgramAddress(
      [Buffer.from("bids", "utf-8"), market.toBuffer(), Buffer.of(outcomeId)],
      programId
    )
  }

  /**
   * Derives PDA (Program Derived Account) for Asks public key.
   *
   * MarketStore account addresses are derived deterministically using the market's pubkey.
   *
   * @param {PublicKey} market - Market public key
   * @param {number} outcomeId - Outcome ID of orderbook
   * @param {PublicKey} programId - Program ID. Defaults to AverProgramId
   * @returns {Promise<[PublicKey, number]>} The Asks pubkey and bump
   */
  static async deriveAsksPubkeyAndBump(
    market: PublicKey,
    outcomeId: number,
    programId: PublicKey = AVER_PROGRAM_IDS[0]
  ) {
    return PublicKey.findProgramAddress(
      [Buffer.from("asks", "utf-8"), market.toBuffer(), Buffer.of(outcomeId)],
      programId
    )
  }

  /**
   * Inverts prices
   *
   * This is used when inverting the second outcome in a two-outcome market.
   * When switching prices between bids and asks, the price is `1-p`.
   * Example, a BUY on A at a (probability) price of 0.4 is equivelant to a SELL on B at a price of 0.6 (1-0.4) and vice versa.
   *
   * @param {Price} price - Price object
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true. Defaults to False.
   * @returns {Price} - Inverted Price object
   */
  private static invertPrice(price: Price, uiAmount?: boolean): Price {
    return {
      size: price.size,
      price: uiAmount ? 1 - price.price : Math.pow(2, 32) - price.price,
    }
  }

  /**
   * Gets level 2 market information for bids
   *
   * See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information
   *
   * @param {number} depth - Number of orders to return
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true.
   * @returns {Price[]} - Price object lists
   */
  getBidsL2(depth: number, uiAmount?: boolean) {
    const isIncreasing = this._isInverted ? true : false
    return Orderbook.getL2ForSlab(
      this._slabBids,
      depth,
      isIncreasing,
      this.decimals,
      uiAmount,
      this._isInverted
    )
  }

  /**
   * Gets level 2 market information for asks
   *
   * See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information
   *
   * @param {number} depth - Number of orders to return
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true.
   * @returns {Price[]} - Price object lists
   */
  getAsksL2(depth: number, uiAmount?: boolean) {
    const isIncreasing = this._isInverted ? false : true
    return Orderbook.getL2ForSlab(
      this._slabAsks,
      depth,
      isIncreasing,
      this.decimals,
      uiAmount,
      this._isInverted
    )
  }

  /**
   * Gets level 3 market information for bids
   *
   * See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information
   *
   * @returns {SlabOrder[]} - SlabOrder object lists
   */
  getBidsL3() {
    const isIncreasing = this._isInverted ? true : false
    return Orderbook.getL3ForSlab(
      this._slabBids,
      this.decimals,
      isIncreasing,
      this._isInverted
    )
  }

  /**
   * Gets level 3 market information for asks
   *
   * See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information
   *
   * @returns {SlabOrder[]} - SlabOrder object lists
   */
  getAsksL3() {
    const isIncreasing = this._isInverted ? false : true
    return Orderbook.getL3ForSlab(
      this._slabAsks,
      this.decimals,
      isIncreasing,
      this._isInverted
    )
  }

  /**
   * Gets the best bid price
   *
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true.
   * @returns {Price | undefined} - Price object
   */
  getBestBidPrice(uiAmount?): Price | undefined {
    const bids = this.getBidsL2(1, uiAmount)
    return bids.length ? bids[0] : undefined
  }

  /**
   * Gets the best ask price
   *
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true.
   * @returns {Price | undefined} - Price object
   */
  getBestAskPrice(uiAmount?): Price | undefined {
    const asks = this.getAsksL2(1, uiAmount)
    return asks.length ? asks[0] : undefined
  }

  /**
   * Gets bid Price object by orderId
   *
   * @param {BN} orderId - Order ID
   * @returns {Price | undefined} - Price object
   */
  getBidPriceByOrderId(orderId: BN): Price | undefined {
    const bid = this.slabBids.getNodeByKey(orderId)
    if (!bid) return undefined

    const bidPrice = {
      price: bid.getPrice().toNumber(),
      size: bid.baseQuantity.toNumber(),
    }

    return this._isInverted ? Orderbook.invertPrice(bidPrice) : bidPrice
  }

  /**
   * Gets ask Price object by orderId
   *
   * @param {BN} orderId - Order ID
   * @returns {Price | undefined} - Price object
   */
  getAskPriceByOrderId(orderId: BN): Price | undefined {
    const ask = this.slabAsks.getNodeByKey(orderId)
    if (!ask) return undefined

    const askPrice = {
      price: ask.getPrice().toNumber(),
      size: ask.baseQuantity.toNumber(),
    }

    return this._isInverted ? Orderbook.invertPrice(askPrice) : askPrice
  }

  /**
   * Gets Price object by orderId
   *
   * @param {UmaOrder} order - the order
   * @returns {PriceAndSide | undefined} - PriceAndSide object
   */
  getPriceByOrder(order: UmaOrder): PriceAndSide | undefined {
    const orderId = order.aaobOrderId || order.orderId

    for (const node of this._slabBids.items()) {
      if (orderId.eq(node.key)) {
        let bidPriceRaw = {
          price: node.getPrice().toNumber(),
          size: node.baseQuantity.toNumber(),
        }

        bidPriceRaw = this._isInverted
          ? Orderbook.invertPrice(bidPriceRaw)
          : bidPriceRaw

        const bidPrice = {
          ...this.convertPrice(bidPriceRaw),
        }

        return { ...bidPrice, side: Side.Bid }
      }
    }

    for (const node of this._slabAsks.items()) {
      if (orderId.eq(node.key)) {
        let askPriceRaw = {
          price: node.getPrice().toNumber(),
          size: node.baseQuantity.toNumber(),
        }

        askPriceRaw = this._isInverted
          ? Orderbook.invertPrice(askPriceRaw)
          : askPriceRaw

        const askPrice = {
          ...this.convertPrice(askPriceRaw),
        }

        return { ...askPrice, side: Side.Ask }
      }
    }

    return undefined
  }

  /**
   * Loads Orderbook Listener
   *
   * @param {Connection} connection - Solana Connection object
   * @param {(slab: Orderbook) => void} callback
   * @returns {number[]}
   */
  loadOrderbookListener(
    connection: Connection,
    callback: (slab: Orderbook) => void
  ) {
    const onSlabChange = (slab: Slab, bids: boolean) =>
      callback(
        new Orderbook(
          this.pubkey,
          bids ? slab : this.slabBids,
          !bids ? slab : this.slabAsks,
          this._slabBidsPubkey,
          this._slabAsksPubkey,
          this.decimals,
          this._isInverted
        )
      )

    const bidsListener = this.loadSlabListener(connection, Side.Bid, (slab) =>
      onSlabChange(slab, true)
    )
    const asksListener = this.loadSlabListener(connection, Side.Ask, (slab) =>
      onSlabChange(slab, false)
    )

    return [bidsListener, asksListener]
  }

  /**
   * Gets estimate of average fill price (probability format) given a base/payout quantity
   *
   * @param {boolean} baseQty - Base quantity
   * @param {Side} side - Side object (bid or ask)
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true.
   * @returns Average price, worst price and filled
   */
  estimateAvgFillForBaseQty(baseQty: number, side: Side, uiAmount?: boolean) {
    return this.estimateFillForQty(baseQty, side, false, uiAmount)
  }

  /**
   * Gets estimate of average fill price (probability format) given a stake/quote quantity
   *
   * @param {boolean} baseQty - Base quantity
   * @param {Side} side - Side object (bid or ask)
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true.
   * @returns Average price, worst price and filled
   */
  estimateAvgFillForQuoteQty(quoteQty: number, side: Side, uiAmount?: boolean) {
    return this.estimateFillForQty(quoteQty, side, true, uiAmount)
  }

  /**
   * Gets estimate of average fill price (probability format) given a base/payout quantity
   *
   * @private
   * @param {boolean} baseQty - Base quantity
   * @param {Side} side - Side object (bid or ask)
   * @param {boolean} quote - Whether this is stake/quote (or base/payout)
   * @param {boolean} uiAmount - Converts prices based on decimal precision if true.
   * @returns Average price, worst price and filled
   */
  private estimateFillForQty(
    qty: number,
    side: Side,
    quote: boolean,
    uiAmount?: boolean
  ) {
    const prices =
      side == Side.Bid
        ? this.getBidsL2(100, uiAmount)
        : this.getAsksL2(100, uiAmount)
    const accumulator = quote
      ? (price: Price) => price.size
      : (price: Price) => price.size * price.price

    let newPrices: Price[] = []
    let cumulativeQty = 0
    for (const price of prices) {
      const remainingQty = qty - cumulativeQty
      if (remainingQty <= accumulator(price)) {
        cumulativeQty += remainingQty
        const newSize = quote ? remainingQty : remainingQty / price.price
        newPrices.push({ price: price.price, size: newSize })
        break
      } else {
        cumulativeQty += accumulator(price)
        newPrices.push(price)
      }
    }

    return {
      avgPrice: weightedAverage(
        newPrices.map((p) => p.price),
        newPrices.map((p) => p.size)
      ),
      worstPrice: newPrices.slice(-1)[0],
      filled: cumulativeQty,
    }
  }

  /**
   * Load slab listener
   *
   * @param connection - Solana Connection object
   * @param {Side} side - Side object (bid or ask)
   * @param {(slab: Slab) => void} callback - Callback function
   * @param {(error: any) => void} errorCallback
   * @returns {number}
   */
  private loadSlabListener(
    connection: Connection,
    side: Side,
    callback: (slab: Slab) => void,
    errorCallback?: (error: any) => void
  ) {
    const account =
      side == Side.Ask ? this._slabAsksPubkey : this._slabBidsPubkey

    return connection.onAccountChange(account, (accountInfo) => {
      try {
        const slab = Slab.deserialize(
          accountInfo.data,
          new BN(CALLBACK_INFO_LEN)
        )
        callback(slab)
      } catch (error) {
        if (errorCallback) errorCallback(error)
      }
    })
  }
}

/**
 * Calculates weighted average
 *
 * @param {number[]} nums - List of values
 * @param {number[]} weights - List of weights
 * @returns {number} Weighted average
 */
const weightedAverage = (nums, weights) => {
  const [sum, weightSum] = weights.reduce(
    (acc, w, i) => {
      acc[0] = acc[0] + nums[i] * w
      acc[1] = acc[1] + w
      return acc
    },
    [0, 0]
  )
  return sum / weightSum
}
