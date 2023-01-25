from .utils import round_price_to_nearest_tick_size, round_price_to_nearest_decimal_tick_size
from .market import AverMarket
from .enums import MarketStatus, OrderType, Side, SizeFormat, PriceRoundingFormat
from .user_host_lifetime import UserHostLifetime
from .data_classes import UserBalanceState, UserMarketState

###### PLACE ORDER CHECKS

def check_sufficient_lamport_balance(user_balance_state: UserBalanceState):
    if(user_balance_state.lamport_balance < 5000):
        raise Exception(f'Payer has insufficient lamports. Lamport balance: {user_balance_state.lamport_balance}')

def check_market_active_pre_event(market_status: MarketStatus):
    if(market_status != MarketStatus.ACTIVE_PRE_EVENT):
        raise Exception(f'The current market status does not permit this action. Market status {market_status}')

def check_uhl_self_excluded(uhl: UserHostLifetime):
    if(uhl.user_host_lifetime_state.is_self_excluded_until):
        raise Exception('This user is self excluded at this time.')

def check_user_market_full(user_market_state: UserMarketState):
    if(user_market_state.number_of_orders == user_market_state.max_number_of_orders):
        raise Exception(f'The UserMarketAccount for this market has reach its maximum capacity for open orders. Open orders: {user_market_state.number_of_orders } Slots: {user_market_state.max_number_of_orders}')

def check_limit_price_error(limit_price: float, market: AverMarket):
    one_in_market_decimals = 10 ** market.market_state.decimals
    if(limit_price > one_in_market_decimals):
        raise Exception(f'Limit prices must be in the range 0 to 1 USDC (0 - 1,000,000). Value provided: {limit_price}')

def check_price_error(limit_price: float, side: Side):
    if(side == Side.BUY):
        if(not limit_price > 0):
            raise Exception(f'The price provided for a BUY order must be strictly greater than 0. Limit price provided: {limit_price}')
    
    if(side == Side.SELL):
        if(not limit_price < 1):
            raise Exception(f'The price provided for a SELL order must be strictly less than 1 USDC (1,000,000). Limit price provided: {limit_price}')

def check_outcome_outside_space(outcome_id: int, market: AverMarket):
    if(not outcome_id in range(0, market.market_state.number_of_outcomes)):
        raise Exception(f'The outcome index provided is not within the outcome space for this market. Outcome index provided: {outcome_id}; Outcome indices in this market: 0 to {(market.market_state.number_of_outcomes-1)}')

def check_incorrect_order_type_for_market_order(limit_price: float, order_type: OrderType, side: Side, market: AverMarket):
    market_order = (limit_price == 1 and side == Side.BUY) or (limit_price == 0 and side == Side.SELL)
    if(market_order):
        if(order_type != OrderType.KILL_OR_FILL and order_type != OrderType.IOC):
            raise Exception(f"When placing a market order (BUY with price = 1, or SELL with price = 0), the order type must to be IOC or KOF")

def check_stake_noop(size_format: SizeFormat, limit_price: float, side: Side):
    market_order = (limit_price == 1 and side == Side.BUY) or (limit_price == 0 and side == Side.SELL)
    if(size_format == SizeFormat.STAKE and market_order):
        raise Exception('Market orders are currently not supports for orders specified in STAKE.')

def check_is_order_valid(
    market: AverMarket,
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
        limit_price = round_price_to_nearest_tick_size(limit_price) if market.market_state.rounding_format == PriceRoundingFormat.PROBABILITY else round_price_to_nearest_decimal_tick_size(limit_price)

        balance_required = size * limit_price if size_format == SizeFormat.PAYOUT else size
        current_balance = tokens_available_to_sell if side == Side.SELL else tokens_available_to_buy

        if(current_balance < balance_required):
            raise Exception(f'Insufficient token balance to support this order. Balance: {current_balance}; Required: {balance_required}')

def check_quote_and_base_size_too_small(market: AverMarket, side: Side, size_format: SizeFormat, outcome_id: int, limit_price: float, size: float):
    binary_second_outcome = market.market_state.number_of_outcomes == 2 and outcome_id == 1
    limit_price_rounded = round_price_to_nearest_tick_size(limit_price) if market.market_state.rounding_format == PriceRoundingFormat.PROBABILITY else round_price_to_nearest_decimal_tick_size(limit_price)

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
        raise Exception(f'The resulting STAKE size for this order is below the market minimum. Stake: {max_base_qty - max_quote_qty}, Minimum stake: {market.market_store_state.min_new_order_quote_size}')
  

    if((not binary_second_outcome) and max_quote_qty < market.market_store_state.min_new_order_quote_size):
        raise Exception(f'The resulting STAKE size for this order is below the market minimum. Stake: {max_quote_qty}, Minimum stake: {market.market_store_state.min_new_order_quote_size}')
    
    if(max_base_qty < market.market_store_state.min_new_order_base_size):
        raise Exception(f'The resulting PAYOUT size for this order is below the market minimum. Payout: {max_base_qty}, Minimum payout: {market.market_store_state.min_new_order_base_size}')


def check_user_permission_and_quote_token_limit_exceeded(market: AverMarket, user_market_state: UserMarketState, size: float, limit_price: float, size_format: SizeFormat):
    balance_required = size * limit_price if size_format == SizeFormat.PAYOUT else size
    pmf = market.market_state.permissioned_market_flag

    if((not pmf) or (pmf and user_market_state.user_verification_account is not None)):
        quote_tokens_limit = market.market_state.max_quote_tokens_in
    elif(pmf and user_market_state.user_verification_account is None):
        quote_tokens_limit = market.market_state.max_quote_tokens_in_permission_capped
    else:
        raise Exception(f'This wallet does not have the required permissions to interact with this market.')

    if((balance_required + user_market_state.net_quote_tokens_in) > quote_tokens_limit):
        raise Exception(f'This order would lead to the maximum number of tokens for this market being exceeded. Please adjust your order to remain within market limits. Tokens required for this order {balance_required}; Remaining tokens until limit reached: {quote_tokens_limit - user_market_state.net_quote_tokens_in}')

#####
## Cancel order

def check_correct_uma_market_match(user_market_state: UserMarketState, market: AverMarket):
    if(user_market_state.market.to_base58() != market.market_pubkey.to_base58()):
        raise Exception('Aver Market is not as expected when placing order')

def check_cancel_order_market_status(market_status: MarketStatus):
    invalid_statuses = [MarketStatus.INITIALIZED, MarketStatus.RESOLVED, MarketStatus.VOIDED, MarketStatus.UNINITIALIZED, MarketStatus.CEASED_CRANKED_CLOSED, MarketStatus.TRADING_CEASED]

    if(market_status in invalid_statuses):
        raise Exception(f'The current market status does not permit this action. Market status {market_status}')

def check_order_exists(user_market_state: UserMarketState, order_id: int):
    for o in user_market_state.orders:
        if o.order_id - order_id == 0:
            return
    raise Exception(f'No order at order_id {order_id} was found for this market.')

#TODO - Calculate min across free outcome positions
def check_outcome_position_amount_error(user_market_state: UserMarketState):
    pass

def check_outcome_has_orders(outcome_id: int, user_market_state: UserMarketState):
    for o in user_market_state.orders:
        if(o.outcome_id == outcome_id):
            return
    raise Exception(f'No open orders found for outcome {outcome_id} in this market.')

