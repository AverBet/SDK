// // PLACE ORDER CHECKS

import { Market } from "./market"
import { MarketStatus, OrderType, Side, SizeFormat, UserBalanceState, UserMarketState } from "./types"
import { UserHostLifetime } from "./user-host-lifetime"
import {roundPriceToNearestTickSize} from './utils'

//TODO - Waiting on Adi for cost of creating UHL/UMA and add this to calculation
export function check_sufficient_lamport_balance(user_balance_state: UserBalanceState){
    if(user_balance_state.lamportBalance < 5000)
        throw Error('Payer has insufficient funds')
}

export function check_market_active_pre_event(market_status: MarketStatus){
    if(market_status !== MarketStatus.ActivePreEvent)
        throw Error('Market status is invalid for operation.')
}

export function check_uhl_self_excluded(uhl: UserHostLifetime){
    if(uhl.isSelfExcluded)
        throw Error('This user is self excluded at this time.')
}

export function check_user_market_full(user_market_state: UserMarketState){
    if(user_market_state.numberOfOrders == user_market_state.maxNumberOfOrders)
        throw Error('The user account has reached its maximum capacity for open orders.')
}

export function check_limit_price_error(limit_price: number, market: Market){
    const one_in_market_decimals = 10 ** market.decimals
    if(limit_price > one_in_market_decimals)
        throw Error('Limit price too high for market decimals')
}

export function check_price_error(limit_price: number, side: Side){
    const error_message = 'If buy: price must be strictly greater than zero, sell: price strictly less than 1"'
    if(side == Side.Bid){
        if(!(limit_price > 0)){
            throw Error(error_message)
    }}
    
    if(side == Side.Ask){
        if(!(limit_price < 1))
            throw Error(error_message)
    }
}

export function check_outcome_outside_space(outcome_id: number, market: Market){
    if(!(outcome_id >= 0 && outcome_id < market.numberOfOutcomes))
        throw Error('Given outcome is outside the outcome space for this market')
}

export function check_incorrect_order_type_for_market_order(limit_price: number, order_type: OrderType, side: Side, market: Market){
    const market_order = (limit_price == 1 && side == Side.Bid) || (limit_price == 0 && side == Side.Ask)
    if(market_order){
        if(order_type != OrderType.KillOrFill && order_type != OrderType.Ioc)
            throw Error('"Market order type needs to be IOC or KOF')
    }
}

export function check_stake_noop(size_format: SizeFormat, limit_price: number, side: Side){
    const market_order = (limit_price == 1 && side == Side.Bid) || (limit_price == 0 && side == Side.Ask)
    if(size_format == SizeFormat.Stake && market_order):
        throw Error('The operation is a no-op"')
}

export function check_is_order_valid(
    outcome_index: number,
    side: Side,
    limit_price:  number,
    size:  number,
    size_format: SizeFormat,
    tokens_available_to_sell:  number,
    tokens_available_to_buy:  number,
){
        limit_price = roundPriceToNearestTickSize(limit_price)

        const balance_required = size_format == SizeFormat.Payout ? size * limit_price : size
        const current_balance = side == Side.Ask ? tokens_available_to_sell : tokens_available_to_buy

        if(current_balance < balance_required)
            throw Error('')
}

//TODO - Please check this function 
//Here one_in_market_decimals has been replaced by 1, as price is not in market decimals
export function check_quote_and_base_size_too_small(market: AverMarket, side: Side, size_format: SizeFormat, outcome_id:  number, limit_price:  number, size:  number):
    binary_second_outcome = market.market_state.number_of_outcomes == 2 && outcome_id == 1
    limit_price_rounded = round_price_to_nearest_tick_size(limit_price)

    if(size_format == SizeFormat.PAYOUT):
        max_base_qty = size
        if(limit_price != 0):
            max_quote_qty = limit_price_rounded * max_base_qty
        else:
            max_quote_qty = max_base_qty
        if(side == Side.SELL):
            max_quote_qty = size
    else:
        if(limit_price != 0):
            if(binary_second_outcome):
                max_base_qty = size / (1 - limit_price_rounded)
                max_quote_qty = max_base_qty
            else:
                max_quote_qty = size
                max_base_qty = (max_quote_qty) / limit_price_rounded
    
    max_quote_qty = max_quote_qty * (10 ** market.market_state.decimals)
    max_base_qty = max_base_qty * (10 ** market.market_state.decimals)
    
    if(binary_second_outcome && size_format == SizeFormat.PAYOUT && side == Side.BUY && (max_base_qty - max_quote_qty) < market.market_store_state.min_new_order_quote_size):
        throw Error('The quote order size is too small.')
  

    if((not binary_second_outcome) && max_quote_qty < market.market_store_state.min_new_order_quote_size):
        throw Error('The quote order size is too small.')
    
    if(max_base_qty < market.market_store_state.min_new_order_base_size):
        throw Error('The base order size is too small.')

#TODO - check this
export function check_user_permission_and_quote_token_limit_exceeded(market: AverMarket, user_market_state: UserMarketState, size:  number, limit_price:  number, size_format: SizeFormat):
    balance_required = size * limit_price if size_format == SizeFormat.PAYOUT else size
    pmf = market.market_state.permissioned_market_flag

    if((not pmf) || (pmf && user_market_state.user_verification_account is not None)):
        quote_tokens_limit = market.market_state.max_quote_tokens_in
    elif(pmf && user_market_state.user_verification_account is None):
        quote_tokens_limit = market.market_state.max_quote_tokens_in_permission_capped
    else:
        throw Error('Something went wrong with user permissioning')

    if((balance_required + user_market_state.net_quote_tokens_in) > quote_tokens_limit):
        throw Error('Permissioned quote token limit exceeded')

#####
## Cancel order

export function check_correct_uma_market_match(user_market_state: UserMarketState, market: AverMarket):
    if(user_market_state.market.to_base58() != market.market_pubkey.to_base58()):
        throw Error('Aver Market is not as expected when placing order')

export function check_cancel_order_market_status(market_status: MarketStatus):
    invalid_statuses = [MarketStatus.INITIALIZED, MarketStatus.RESOLVED, MarketStatus.VOIDED, MarketStatus.UNINITIALIZED, MarketStatus.CEASED_CRANKED_CLOSED, MarketStatus.TRADING_CEASED]

    if(market_status in invalid_statuses):
        raise Error('Market status is invalid for operation')

export function check_order_exists(user_market_state: UserMarketState, order_id:  number):
    for o in user_market_state.orders:
        if o.order_id - order_id == 0:
            return

    throw Error('The specified order has not been found.')

#TODO - Calculate min across free outcome positions
export function check_outcome_position_amount_error(user_market_state: UserMarketState):
    pass

export function check_outcome_has_orders(outcome_id:  number, user_market_state: UserMarketState):
    for o in user_market_state.orders:
        if(o.outcome_id == outcome_id):
            return

    throw Error('The specified order has not been found.')