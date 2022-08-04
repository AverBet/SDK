from dataclasses import dataclass
from solana.publickey import PublicKey
from .enums import MarketStatus, FeeTier

@dataclass
class MarketState():
    """
    Market State Object
    
    Holds particular data for a market
    """
    market_status: MarketStatus
    market_store: PublicKey
    market_authority: PublicKey
    quote_token_mint: PublicKey
    quote_vault: PublicKey
    vault_authority: PublicKey
    number_of_outcomes: int
    number_of_winners: int
    decimals: int 
    cranker_reward: int 
    matched_count: int
    prize_balance: int
    withdrawable_quote_token_balance: int
    winning_outcome: int
    permissioned_market_flag: bool
    going_in_play_flag: bool
    max_quote_tokens_in: int
    max_quote_tokens_in_permission_capped: str
    outcome_names: list[str]
    version: float
    number_of_umas: int
    vault_bump: int
    trading_cease_time: int
    aver_accumulated_fees: int
    third_party_accumulated_fees: int
    open_interest: int
    oracle_feed: PublicKey
    fee_tier_collection_bps_rates: list[int]
    inplay_start_time: int = None
   
   

@dataclass
class OrderbookAccountsState():
    """
    Orderbook Accounts State Object.

    Contains public keys for asks, bids, event queue and orderbook
    """
    asks: PublicKey
    bids: PublicKey
    event_queue: PublicKey
    orderbook: PublicKey


@dataclass
class MarketStoreState():
    """
    Market store state object

    Does not exist for markets that have a market status of closed, voided or resolved
    """
    market: PublicKey
    orderbook_accounts: list[OrderbookAccountsState]
    number_of_outcomes: int
    min_orderbook_base_size: int
    min_new_order_base_size: int
    min_new_order_quote_size: int
    version: float
    init_counter: float

@dataclass
class Price():
    price: float
    size: float

@dataclass
class OutcomePosition():
    free: int
    locked: int

@dataclass
class UmaOrder():
    order_id: int
    outcome_id: int
    base_qty: int

@dataclass
class UserMarketState():
    """
    User market state object

    Holds data on a particular user for a particular market
    """
    market: PublicKey
    user: PublicKey
    number_of_outcomes: int
    number_of_orders: int
    max_number_of_orders: int
    net_quote_tokens_in: int
    accumulated_maker_quote_volume: int
    accumulated_maker_base_volume: int
    accumulated_taker_quote_volume: int
    accumulated_taker_base_volume: int
    outcome_positions: list[OutcomePosition]
    orders: list[UmaOrder]
    version: int
    user_verification_account: PublicKey or None
    user_host_lifetime: PublicKey

@dataclass
class ReferrerState():
    """
    Referrer state object

    Holds data on a particular referrer
    """
    version: int
    owner: PublicKey
    host: PublicKey
    creation_date: int
    last_balance_update: int
    last_withdrawal: int
    last_referral: int
    number_users_referred: int
    referrer_revenue_share_collected: int
    referrer_fee_rate_bps: int


@dataclass
class HostState():
    """
    Host state object

    Holds data on a particular host
    """
    version: int
    owner: PublicKey
    creation_date: int
    last_withdrawal: int
    last_balance_update: int
    host_revenue_share_uncollected: int
    host_revenue_share_collected: int
    host_fee_rate_bps: int
    referrer_fee_rate_offered_bps: int
    last_referrer_terms_change: int

@dataclass
class UserHostLifetimeState(): 
    """
    User host lifetime state object

    Holds data on a particular user across all markets (for 1 specific host)
    """
    version: int
    user: PublicKey
    host: PublicKey
    user_quote_token_ata: PublicKey
    referrer: PublicKey or None
    referrer_revenue_share_uncollected: int
    referral_revenue_share_total_generated: int
    referrer_fee_rate_bps: int
    last_fee_tier_check: FeeTier
    is_self_excluded_until: bool or None
    creation_date: int
    last_balance_update: int
    total_markets_traded: int
    total_quote_volume_traded: int
    total_base_volume_traded: int
    total_fees_paid: int
    cumulative_pnl: int
    cumulative_invest: int
    display_name: str or None
    nft_pfp: PublicKey or None

@dataclass
class SlabOrder(): 
  id: bytes
  price: int
  price_ui: float
  base_quantity: int
  base_quantity_ui: float
  user_market: PublicKey
  fee_tier: int

@dataclass
class UserBalanceState():
    lamport_balance: int
    token_balance: int


