from enum import IntEnum, Enum
from typing import NamedTuple
from solana.publickey import PublicKey

class Side(IntEnum):
    """
    Side of the orderbook to trade
    """
    BUY = 0
    SELL = 1

class OrderType(IntEnum):
    """
    Type of order

    LIMIT = a Limit order, will attempt to fill against existing opposing orders and post any or all residual order to the orderbook
    IOC ('Immediate-or-Cancel') = will fill as much as available against existing opposing orders. Any residual unmatched part of the order will not be posted to the orderbook
    KILL_OR_FILL = The entire order will be aborted if it cannot be immediately matched with existing opposing orders
    POST_ONLY = The entire order will be aborted if it would have resulted in some or all of the order being filled against existing opposing orders.
    """

    LIMIT = 0
    IOC = 1
    KILL_OR_FILL = 2
    POST_ONLY = 3


class SelfTradeBehavior(IntEnum):
    """
    Behavior when a user's trade is matched with themselves

    DECREMENT_TAKE = Reduces the size of the new order
    CANCEL_PROVIDE = Reduces the size of the existing (opposing) order
    ABORT_TRANSACTION = Cancels the whole transaction if some or all of it would self-trade
    """
    DECREMENT_TAKE = 0
    CANCEL_PROVIDE = 1
    ABORT_TRANSACTION = 2

class MarketStatus(IntEnum):
    """
    Status of a market
    """
    UNINITIALIZED = 0
    INITIALIZED = 1
    ACTIVE_PRE_EVENT = 2
    ACTIVE_IN_PLAY = 3
    HALTED_PRE_EVENT = 4
    HALTED_IN_PLAY = 5
    TRADING_CEASED = 6
    CEASED_CRANKED_CLOSED = 7
    RESOLVED = 8
    VOIDED = 9

class TransactionType(IntEnum):
    """
    Type of transaction
    """
    INIT_MARKET = 0
    CHANGE_MARKET_STATUS = 1
    ATTEMPT_RESOLUTION = 2
    SWEEP_FEES = 3
    CLOSE_AOB = 4
    CONSUME_EVENTS_CRANK = 5
    MAKER_FILL = 6
    OUT = 7
    INIT_USER_MARKET = 8
    DEPOSIT = 9
    WITHDRAW = 10
    PLACE_ORDER = 11
    TAKER_FILL = 12
    CANCEL_ORDER = 13
    COLLECT = 14
    CLOSE_USER_MARKET = 15
    COLLECT_CLOSE_CRANK = 16

class FeeTier(Enum):
    """
    Level of fees paid

    This is determined by the number of AVER tokens held
    """
    BASE = 'base'
    AVER1 = 'aver1'
    AVER2 = 'aver2'
    AVER3 = 'aver3'
    AVER4 = 'aver4'
    AVER5 = 'aver5'
    FREE = 'free'

class SizeFormat(IntEnum):
    """
    Order size format

    Payout is the total amount paid out if a bet is won (stake + profit). 
    Stake is the total amount at risk for a user (payout - profit).
    """
    PAYOUT = 0
    STAKE = 1

class SolanaNetwork(str, Enum):
    """
    Solana Network

    Currently only DEVNET and MAINNET are available
    """
    DEVNET = 'devnet'
    MAINNET = 'mainnet-beta'

class Fill(NamedTuple):
    """
    A Fill event describes a matched trade between a maker and a taker, and contains all of the necessary information to facilitate update of the maker’s UserMarket account to reflect the trade.
    """
    taker_side: Side
    maker_order_id: int
    quote_size: int
    base_size: int
    maker_user_market: PublicKey
    taker_user_market: PublicKey
    maker_fee_tier: int
    taker_fee_tier: int

class Out(NamedTuple):
    """
    An Out event describes the removal of an order from the orderbook, and contains all of the necessary information to facilitate updating the order owner’s UserMarket account to reflect that this order (or residual part of an order) is no longer being offered. (i.e. unlocked positions previously locked to back the order)
    """
    side: Side
    order_id: int
    base_size: int
    delete: bool
    user_market: PublicKey
    fee_tier: int