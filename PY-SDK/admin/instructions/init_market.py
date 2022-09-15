from unicodedata import category
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.constants import AVER_PROGRAM_IDS, get_quote_token
from ...public.src.pyaver.aver_client import AverClient
from anchorpy import Program, Context
from typing import NamedTuple
from solana.publickey import PublicKey
from solana.keypair import Keypair
from solana.system_program import SYS_PROGRAM_ID
from spl.token.instructions import get_associated_token_address
from ..utils import get_or_create_associated_token_address

class InitMarketArgs(NamedTuple):
  number_of_outcomes: int
  number_of_winners: int
  permissioned_market_flag: bool
  min_orderbook_base_size: int
  min_new_order_base_size: int
  min_new_order_quote_size: int
  max_quote_tokens_in: int
  max_quote_tokens_in_permission_capped: int
  cranker_reward: int
  fee_tier_collection_bps_rates: list[int]
  market_name: str
  going_in_play_flag: bool
  active_immediately: bool
  trading_cease_time: int
  in_play_start_time: int or None
  rounding_format: int
  category: int
  sub_category: int
  series: int
  event: int
  in_play_start_time: int or None
  max_in_play_crank_orders: int or None
  in_play_delay_seconds: int or None

class InitMarketAccounts(NamedTuple):
  payer: Keypair
  market: Keypair
  market_authority: Keypair
  oracle_feed: PublicKey = SYS_PROGRAM_ID
  in_play_queue: Keypair = Keypair()

async def init_market_tx(
  aver_client: AverClient,
  args: InitMarketArgs,
  accs: InitMarketAccounts,
  program_id: PublicKey = None,
):
  if program_id:
    program = await aver_client.get_program_from_program_id(program_id)
  else:
    program = aver_client.programs[0]

  [market_store_pubkey, market_store_bump] = AverMarket.derive_market_store_pubkey_and_bump(accs.market.public_key, program.program_id)
  [vault_authority, vault_bump] = PublicKey.find_program_address(
    [bytes(accs.market.public_key)], program.program_id
  )
  vault_quote_acount = await get_or_create_associated_token_address(aver_client.connection, vault_authority, aver_client.quote_token, accs.payer)

  # TODO change based on progrma ID

  return await program.rpc['init_market']({
    "number_of_outcomes": args.number_of_outcomes,
    "number_of_winners": args.number_of_winners,
    "vault_bump": vault_bump,
    "permissioned_market_flag": args.permissioned_market_flag,
    "min_orderbook_base_size": args.min_orderbook_base_size,
    "min_new_order_base_size": args.min_new_order_base_size,
    "min_new_order_quote_size": args.min_new_order_quote_size,
    "max_quote_tokens_in": args.max_quote_tokens_in,
    "max_quote_tokens_in_permission_capped": args.max_quote_tokens_in_permission_capped,
    "cranker_reward": args.cranker_reward,
    "fee_tier_collection_bps_rates": args.fee_tier_collection_bps_rates,
    "market_name": args.market_name,
    "going_in_play_flag": args.going_in_play_flag,
    "active_immediately": args.active_immediately,
    "trading_cease_time": args.trading_cease_time,
    "rounding_format": args.rounding_format,
    "category": args.category,
    "sub_category": args.sub_category,
    "series": args.series,
    "event": args.event,
    "in_play_start_time": args.in_play_start_time,
    "max_in_play_crank_orders": args.max_in_play_crank_orders,
    "in_play_delay_seconds": args.in_play_delay_seconds

  },
  ctx=Context(
    accounts={
      "payer": accs.payer.public_key,
      "market": accs.market.public_key,
      "market_authority": accs.market_authority.public_key,
      "market_store": market_store_pubkey,
      "quote_token_mint": aver_client.quote_token,
      "quote_vault": vault_quote_acount,
      "vault_authority": vault_authority,
      "oracle_feed": accs.oracle_feed,
      "in_play_queue": accs.in_play_queue.public_key,
      "system_program": SYS_PROGRAM_ID,
    },
    signers=[accs.market, accs.payer, accs.in_play_queue, accs.market_authority],
      ),
  )
