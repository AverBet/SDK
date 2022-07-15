from jsonrpcserver import Error
from .utils import round_price_to_nearest_tick_size
from .market import AverMarket
from .enums import MarketStatus, OrderType, Side, SizeFormat
from .user_host_lifetime import UserHostLifetime
from .data_classes import UserBalanceState, UserMarketState

###### PLACE ORDER CHECKS

#TODO - Waiting on Adi for cost of creating UHL/UMA and add this to calculation
def check_sufficient_lamport_balance(user_balance_state: UserBalanceState):
    if(user_balance_state.lamport_balance < 5000):
        raise Exception('Payer has insufficient funds')

def check_market_active_pre_event(market_status: MarketStatus):
    if(market_status != MarketStatus.ACTIVE_PRE_EVENT):
        raise Exception('Market status is invalid for operation.')

def check_uhl_self_excluded(uhl: UserHostLifetime):
    if(uhl.user_host_lifetime_state.is_self_excluded):
        raise Exception('This user is self excluded at this time.')

def check_user_market_full(user_market_state: UserMarketState):
    if(user_market_state.number_of_orders == user_market_state.max_number_of_orders):
        raise Exception('The user account has reached its maximum capacity for open orders.')

def check_limit_price_error(limit_price: float, market: AverMarket):
    one_in_market_decimals = 10 ** market.market_state.decimals
    if(limit_price > one_in_market_decimals):
        raise Exception('Limit price too high for market decimals')

def check_price_error(limit_price: float, side: Side):
    error_message = 'If buy: price must be strictly greater than zero, sell: price strictly less than 1"'
    if(side == Side.BUY):
        if(not limit_price > 0):
            raise Exception(error_message)
    
    if(side == Side.SELL):
        if(not limit_price < 1):
            raise Exception(error_message)

def check_outcome_outside_space(outcome_id: int, market: AverMarket):
    if(not outcome_id in range(0, market.market_state.number_of_outcomes - 1)):
        raise Exception('Given outcome is outside the outcome space for this market')

def check_incorrect_order_type_for_market_order(limit_price: float, order_type: OrderType, side: Side, market: AverMarket):
    market_order = (limit_price == 1 and side == Side.BUY) or (limit_price == 0 and side == Side.SELL)
    if(market_order):
        if(order_type != OrderType.KILL_OR_FILL and order_type != OrderType.IOC):
            raise Exception('"Market order type needs to be IOC or KOF')

def check_stake_noop(size_format: SizeFormat, limit_price: float, side: Side):
    market_order = (limit_price == 1 and side == Side.BUY) or (limit_price == 0 and side == Side.SELL)
    if(size_format == SizeFormat.STAKE and market_order):
        raise Exception('The operation is a no-op"')

def check_is_order_valid(
    outcome_index: int,
    side: Side,
    limit_price: float,
    size: float,
    size_format: SizeFormat,
    tokens_available_to_sell: float,
    tokens_available_to_buy: float,
):
        """
        Performs clientside checks prior to placing an order

        Args:
            outcome_index (int): Outcome ID
            side (Side): Side
            limit_price (float): Limit price
            size (float): Size
            size_format (SizeFormat): SizeFormat object (state or payout)

        Raises:
            Exception: Insufficient Token Balance

        Returns:
            bool: True if order is valid
        """
        
        balance_required = size * limit_price if size_format == SizeFormat.PAYOUT else size
        current_balance = tokens_available_to_sell if side == Side.SELL else tokens_available_to_buy

        if(current_balance < balance_required):
            raise Exception('')

#TODO - Please check this function 
#Here one_in_market_decimals has been replaced by 1, as price is not in market decimals
def check_quote_and_base_size_too_small(market: AverMarket, side: Side, size_format: SizeFormat, outcome_id: int, limit_price: float, size: float):
    binary_second_outcome = market.market_state.number_of_outcomes == 2 and outcome_id == 1
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
    
    if(binary_second_outcome and size_format == SizeFormat.PAYOUT and side == Side.BUY and (max_base_qty - max_quote_qty) < market.market_store_state.min_new_order_quote_size):
        raise Exception('The quote order size is too small.')
  

    if((not binary_second_outcome) and max_quote_qty < market.market_store_state.min_new_order_quote_size):
        raise Exception('The quote order size is too small.')
    
    if(max_base_qty < market.market_store_state.min_new_order_base_size):
        raise Exception('The base order size is too small.')

#TODO - check this
def check_user_permission_and_quote_token_limit_exceeded(market: AverMarket, user_market_state: UserMarketState, size: float, limit_price: float, size_format: SizeFormat):
    balance_required = size * limit_price if size_format == SizeFormat.PAYOUT else size
    pmf = market.market_state.permissioned_market_flag

    if((not pmf) or (pmf and user_market_state.user_verification_account is not None)):
        quote_tokens_limit = market.market_state.max_quote_tokens_in
    elif(pmf and user_market_state.user_verification_account is None):
        quote_tokens_limit = market.market_state.max_quote_tokens_in_permission_capped
    else:
        raise Exception('Something went wrong with user permissioning')

    if((balance_required + user_market_state.net_quote_tokens_in) > quote_tokens_limit):
        raise Exception('Permissioned quote token limit exceeded')

#####
## Cancel order

def check_correct_uma_market_match(user_market_state: UserMarketState, market: AverMarket):
    if(user_market_state.market.to_base58() != market.market_pubkey.to_base58()):
        raise Exception('Aver Market is not as expected when placing order')

def check_cancel_order_market_status(market_status: MarketStatus):
    invalid_statuses = [MarketStatus.INITIALIZED, MarketStatus.RESOLVED, MarketStatus.VOIDED, MarketStatus.UNINITIALIZED, MarketStatus.CEASED_CRANKED_CLOSED, MarketStatus.TRADING_CEASED]

    if(market_status in invalid_statuses):
        raise Error('Market status is invalid for operation')

def check_order_exists(user_market_state: UserMarketState, order_id: int):
    for o in user_market_state.orders:
        if o.order_id - order_id == 0:
            return

    raise Exception('The specified order has not been found.')

#TODO - Calculate min across free outcome positions
def check_outcome_position_amount_error(user_market_state: UserMarketState):
    pass

def check_outcome_has_orders(outcome_id: int, user_market_state: UserMarketState):
    for o in user_market_state.orders:
        if(o.outcome_id == outcome_id):
            return

    raise Exception('The specified order has not been found.')