// // PLACE ORDER CHECKS
import { Market } from "./market"
import {
  MarketStatus,
  OrderType,
  Side,
  SizeFormat,
  UserBalanceState,
  UserMarketState,
} from "./types"
import { UserHostLifetime } from "./user-host-lifetime"
import { roundPriceToNearestTickSize } from "./utils"

//TODO - Waiting on Adi for cost of creating UHL/UMA and add this to calculation
export function checkSufficientLamportBalance(
  user_balance_state: UserBalanceState
) {
  if (user_balance_state.lamportBalance < 5000)
    throw Error("Payer has insufficient funds")
}

export function checkMarketActivePreEvent(market_status: MarketStatus) {
  if (market_status !== MarketStatus.ActivePreEvent)
    throw Error("Market status is invalid for operation.")
}

export function checkUhlSelfExcluded(uhl: UserHostLifetime) {
  if (uhl.isSelfExcluded)
    throw Error("This user is self excluded at this time.")
}

export function checkUserMarketFull(user_market_state: UserMarketState) {
  if (user_market_state.numberOfOrders == user_market_state.maxNumberOfOrders)
    throw Error(
      "The user account has reached its maximum capacity for open orders."
    )
}

export function checkLimitPriceError(limit_price: number, market: Market) {
  const one_in_market_decimals = 10 ** market.decimals
  if (limit_price > one_in_market_decimals)
    throw Error("Limit price too high for market decimals")
}

export function checkPriceError(limit_price: number, side: Side) {
  const error_message =
    'If buy: price must be strictly greater than zero, sell: price strictly less than 1"'
  if (side == Side.Bid) {
    if (!(limit_price > 0)) {
      throw Error(error_message)
    }
  }

  if (side == Side.Ask) {
    if (!(limit_price < 1)) throw Error(error_message)
  }
}

export function checkOutcomeOutsideSpace(outcome_id: number, market: Market) {
  if (!(outcome_id >= 0 && outcome_id < market.numberOfOutcomes))
    throw Error("Given outcome is outside the outcome space for this market")
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
      throw Error('"Market order type needs to be IOC or KOF')
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
    throw Error('The operation is a no-op"')
}

export function checkIsOrderValid(
  outcome_index: number,
  side: Side,
  limit_price: number,
  size: number,
  size_format: SizeFormat,
  tokens_available_to_sell: number,
  tokens_available_to_buy: number
) {
  limit_price = roundPriceToNearestTickSize(limit_price)

  const balance_required =
    size_format == SizeFormat.Payout ? size * limit_price : size
  const current_balance =
    side == Side.Ask ? tokens_available_to_sell : tokens_available_to_buy

  if (current_balance < balance_required) throw Error("")
}

//TODO - Please check this function
//Here one_in_market_decimals has been replaced by 1, as price is not in market decimals
export function checkQuoteAndBaseSizeTooSmall(
  market: Market,
  side: Side,
  size_format: SizeFormat,
  outcome_id: number,
  limit_price: number,
  size: number
) {
  const binary_second_outcome = market.numberOfOutcomes == 2 && outcome_id == 1
  const limit_price_rounded = roundPriceToNearestTickSize(limit_price)

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
    throw Error("The quote order size is too small.")

  if (!binary_second_outcome && max_quote_qty < market.minNewOrderQuoteSize)
    throw Error("The quote order size is too small.")

  if (max_base_qty < market.minNewOrderBaseSize)
    throw Error("The base order size is too small.")
}

//TODO - check this
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
  else throw Error("Something went wrong with user permissioning")

  if (
    balance_required + user_market_state.netQuoteTokensIn >
    quote_tokens_limit
  )
    throw Error("Permissioned quote token limit exceeded")
}

///////
// Cancel order

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
    throw Error("Market status is invalid for operation")
}

export function checkOrderExists(
  user_market_state: UserMarketState,
  order_id: number
) {
  for (let o of user_market_state.orders) {
    if (o.orderId - order_id === 0) return
  }

  throw Error("The specified order has not been found.")
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

  throw Error("The specified order has not been found.")
}
