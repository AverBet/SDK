import { BN, Program } from "@project-serum/anchor"
import { Market } from "./market"
import {
  MarketStatus,
  OrderType,
  RoundingFormat,
  Side,
  SizeFormat,
  UserBalanceState,
  UserMarketState,
} from "./types"
import { UserHostLifetime } from "./user-host-lifetime"
import { roundDecimalPriceToNearestTickSize, roundPriceToNearestProbabilityTickSize } from "./utils"
import * as fs from "fs"
// import path from 'path'
import { PublicKey } from "@solana/web3.js"

export function checkSufficientLamportBalance(
  user_balance_state: UserBalanceState
) {
  if (user_balance_state.lamportBalance < 5000)
    throw Error(
      `Payer has insufficient lamports. Lamport balance: ${user_balance_state.lamportBalance}`
    )
}

export function checkMarketActivePreEvent(market_status: MarketStatus) {
  if (market_status !== MarketStatus.ActivePreEvent)
    throw Error(
      `The current market status does not permit this action. Market status ${market_status}`
    )
}

export function checkUhlSelfExcluded(uhl: UserHostLifetime) {
  if (uhl.isSelfExcluded)
    throw Error("This user is self excluded at this time.")
}

export function checkUserMarketFull(user_market_state: UserMarketState) {
  if (user_market_state.numberOfOrders == user_market_state.maxNumberOfOrders)
    throw Error(
      `The UserMarketAccount for this market has reach its maximum capacity for open orders. Open orders: ${user_market_state.numberOfOrders} Slots: ${user_market_state.maxNumberOfOrders}`
    )
}

export function checkLimitPriceError(limit_price: number, market: Market) {
  const one_in_market_decimals = 10 ** market.decimals
  if (limit_price > one_in_market_decimals)
    throw Error(
      `Limit prices must be in the range 0 to 1 USDC (0 - 1,000,000). Value provided: ${limit_price}`
    )
}

export function checkPriceError(limit_price: number, side: Side) {
  if (side == Side.Bid) {
    if (!(limit_price > 0)) {
      throw Error(
        `The price provided for a BUY order must be strictly greater than 0. Limit price provided: ${limit_price}`
      )
    }
  }

  if (side == Side.Ask) {
    if (!(limit_price < 1))
      throw Error(
        `The price provided for a SELL order must be strictly less than 1 USDC (1,000,000). Limit price provided: ${limit_price}`
      )
  }
}

export function checkOutcomeOutsideSpace(outcome_id: number, market: Market) {
  if (!(outcome_id >= 0 && outcome_id < market.numberOfOutcomes))
    throw Error(
      `The outcome index provided is not within the outcome space for this market. Outcome index provided: ${outcome_id}; Outcome indices in this market: 0 to ${
        market.numberOfOutcomes - 1
      }`
    )
}

export function checkIncorrectOrderTypeForMarketOrder(
  limit_price: number,
  order_type: OrderType,
  side: Side,
  market: Market
) {
  const market_order =
    (limit_price == 1 && side == Side.Bid) ||
    (limit_price == 0 && side == Side.Ask)
  if (market_order) {
    if (order_type != OrderType.KillOrFill && order_type != OrderType.Ioc)
      throw Error(
        `When placing a market order (BUY with price = 1, or SELL with price = 0), the order type must to be IOC or KOF`
      )
  }
}

export function checkStakeNoop(
  size_format: SizeFormat,
  limit_price: number,
  side: Side
) {
  const market_order =
    (limit_price == 1 && side == Side.Bid) ||
    (limit_price == 0 && side == Side.Ask)
  if (size_format == SizeFormat.Stake && market_order)
    throw Error(
      `Market orders are currently not supports for orders specified in STAKE.`
    )
}

export function checkIsOrderValid(
  market: Market,
  outcome_index: number,
  side: Side,
  limit_price: number,
  size: number,
  size_format: SizeFormat,
  tokens_available_to_sell: number,
  tokens_available_to_buy: number
) {
  limit_price = market.roundingFormat == RoundingFormat.Probability ? roundPriceToNearestProbabilityTickSize(limit_price): roundDecimalPriceToNearestTickSize(limit_price)

  const balance_required =
    size_format == SizeFormat.Payout ? size * limit_price : size
  const current_balance =
    side == Side.Ask ? tokens_available_to_sell : tokens_available_to_buy

  if (current_balance < balance_required)
    throw Error(
      `Insufficient token balance to support this order. Balance: ${current_balance}; Required: ${balance_required}`
    )
}

export function checkQuoteAndBaseSizeTooSmall(
  market: Market,
  side: Side,
  size_format: SizeFormat,
  outcome_id: number,
  limit_price: number,
  size: number
) {
  market.marketStore
  const binary_second_outcome = market.numberOfOutcomes == 2 && outcome_id == 1
  const limit_price_rounded = market.roundingFormat == RoundingFormat.Probability ? roundPriceToNearestProbabilityTickSize(limit_price): roundDecimalPriceToNearestTickSize(limit_price)

  let max_base_qty
  let max_quote_qty

  if (size_format == SizeFormat.Payout) {
    max_base_qty = size
    if (limit_price != 0) max_quote_qty = limit_price_rounded * max_base_qty
    else max_quote_qty = max_base_qty
    if (side == Side.Ask) max_quote_qty = size
  } else {
    if (limit_price != 0) {
      if (binary_second_outcome) {
        max_base_qty = size / (1 - limit_price_rounded)
        max_quote_qty = max_base_qty
      } else {
        max_quote_qty = size
        max_base_qty = max_quote_qty / limit_price_rounded
      }
    }
  }

  max_quote_qty = max_quote_qty * 10 ** market.decimals
  max_base_qty = max_base_qty * 10 ** market.decimals

  if (
    binary_second_outcome &&
    size_format == SizeFormat.Payout &&
    side == Side.Bid &&
    max_base_qty - max_quote_qty < market.minNewOrderQuoteSize
  )
    throw Error(
      `The resulting STAKE size for this order is below the market minimum. Stake: ${
        max_base_qty - max_quote_qty
      }, Minimum stake: ${market.minNewOrderQuoteSize}`
    )

  if (!binary_second_outcome && max_quote_qty < market.minNewOrderQuoteSize)
    throw Error(
      `The resulting STAKE size for this order is below the market minimum. Stake: ${max_quote_qty}, Minimum stake: ${market.minNewOrderQuoteSize}`
    )

  if (max_base_qty < market.minNewOrderBaseSize)
    throw Error(
      `The resulting PAYOUT size for this order is below the market minimum. Payout: ${max_base_qty}, Minimum payout: ${market.minOrderbookBaseSize}`
    )
}

export function checkUserPermissionAndQuoteTokenLimitExceeded(
  market: Market,
  user_market_state: UserMarketState,
  size: number,
  limit_price: number,
  size_format: SizeFormat
) {
  const balance_required =
    size_format == SizeFormat.Payout ? size * limit_price : size
  const pmf = market.permissionedMarketFlag

  let quote_tokens_limit

  if (!pmf || (pmf && user_market_state.userVerificationAccount))
    quote_tokens_limit = market.maxQuoteTokensIn
  else if (pmf && user_market_state.userVerificationAccount)
    quote_tokens_limit = market.maxQuoteTokensInPermissionCapped
  else
    throw Error(
      "This wallet does not have the required permissions to interact with this market."
    )

  if (
    user_market_state.netQuoteTokensIn
      .add(new BN(balance_required))
      .gt(quote_tokens_limit)
  )
    throw Error(
      `This order would lead to the maximum number of tokens for this market being exceeded. Please adjust your order to remain within market limits. Tokens required for this order ${balance_required}; Remaining tokens until limit reached: ${
        quote_tokens_limit - user_market_state.netQuoteTokensIn
      }`
    )
}

export function checkCorrectUmaMarketMatch(
  user_market_state: UserMarketState,
  market: Market
) {
  if (user_market_state.market.toString() !== market.pubkey.toString())
    throw Error("Aver Market is not as expected when placing order")
}

export function checkCancelOrderMarketStatus(market_status: MarketStatus) {
  const invalid_statuses = [
    MarketStatus.Initialised,
    MarketStatus.Resolved,
    MarketStatus.Voided,
    MarketStatus.Uninitialised,
    MarketStatus.CeasedCrankedClosed,
    MarketStatus.TradingCeased,
  ]

  if (invalid_statuses.includes(market_status))
    throw Error(
      `The current market status does not permit this action. Market status ${market_status}`
    )
}

export function checkOrderExists(
  user_market_state: UserMarketState,
  order_id: number
) {
  for (const o of user_market_state.orders) {
    if (o.orderId - order_id === 0) return
  }

  throw Error(`'No order at order_id ${order_id} was found for this market.`)
}

//TODO - Calculate min across free outcome positions
export function checkOutcomePositionAmountError(
  user_market_state: UserMarketState
) {}

export function checkOutcomeHasOrders(
  outcome_id: number,
  user_market_state: UserMarketState
) {
  for (let o of user_market_state.orders) {
    if (o.outcomeId == outcome_id) return
  }

  throw Error(`No open orders found for outcome ${outcome_id} in this market.`)
}

export function loadIdlFromJson(programId: PublicKey) {
  const filePath = __dirname + "/idl" + `/${programId.toBase58()}.json`
  const data = fs.readFileSync(filePath, "utf-8")
  const fileIdl = JSON.parse(data)

  return fileIdl
}

/**
 * Checks the idl json file's instructions against the instructions in the program
 *
 * Warns the user incase their SDK version may be out of date
 *
 * @param program -  AnchorPy Program
 */
export function checkIdlHasSameInstructionsAsSdk(program: Program) {
  // do not do read file or do checks for browser
  if (typeof window !== "undefined") {
    return true
  }
  let fileIdl: any = undefined
  try {
    fileIdl = loadIdlFromJson(program.programId)
  } catch {
    console.log(
      "IDL not found. This means your SDK version is likely out of date"
    )
    return
  }
  const fileInstructions = fileIdl["instructions"]

  program.idl.instructions.map((i) => {
    const fileInstruction = fileInstructions.find((f) => f["name"] === i.name)
    if (!fileInstruction) {
      console.log("-".repeat(10))
      console.log(`INSTRUCTION ${i.name} IS IN THE IDL BUT IS NOT EXPECTED`)
      console.log("THIS MEANS YOUR VERSION OF THE SDK MAY NEEDED TO BE UPDATED")
      console.log("-".repeat(10))
      return
    }

    const fileAccountNames = fileInstruction["accounts"].map((a) => a.name)
    const idlAccountNames = i.accounts.map((a) => a.name)
    //Checks for array equality
    if (
      fileAccountNames.sort().join(",") !== idlAccountNames.sort().join(",")
    ) {
      console.log("-".repeat(10))
      console.log(
        `INSTRUCTION ${i.name} ACCOUNTS REQUIRED FROM THE IDL ARE DIFFERENT FROM EXPECTED`
      )
      console.log("THIS MEANS YOUR VERSION OF THE SDK MAY NEEDED TO BE UPDATED")
      console.log("-".repeat(10))
    }
  })
}
