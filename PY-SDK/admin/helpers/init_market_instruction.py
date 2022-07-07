from .deriveables import derive_market_store
from anchorpy import Program, Context
from pyaver.aver_client import AverClient
from typing import NamedTuple
from solana.publickey import PublicKey
from solana.keypair import Keypair
from solana.rpc.commitment import Processed
from pyaver.constants import AVER_PROGRAM_ID
from solana.system_program import SYS_PROGRAM_ID
# from constants import DEFAULT_QUOTE_TOKEN_DEVNET
# from constants import AVER_PROGRAM_ID_DEVNET_2 as AVER_PROGRAM_ID_DEVNET
from spl.token.instructions import get_associated_token_address, create_associated_token_account
from solana.rpc.types import TxOpts

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
  inplay_start_time: int or None

class InitMarketAccounts(NamedTuple):
  payer: Keypair
  market: Keypair
  market_authority: Keypair
  oracle_feed: PublicKey = SYS_PROGRAM_ID

async def init_market(
  client: AverClient,
  program: Program,
  args: InitMarketArgs,
  accs: InitMarketAccounts,
  program_id: PublicKey = AVER_PROGRAM_ID
):
  market_store_pubkey, market_store_bump = derive_market_store(accs.market.public_key)
  vault_authority, vault_bump = PublicKey.find_program_address(
    [bytes(accs.market.public_key)], program_id
  )

  vault_quote_acount = await client.get_or_create_associated_token_account(vault_authority, accs.payer)

  return await program.rpc['init_market']({
    "number_of_outcomes": args.number_of_outcomes,
    "number_of_winners": args.number_of_winners,
    "vault_bump": vault_bump,
    "market_store_bump": market_store_bump,
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
    "inplay_start_time": args.inplay_start_time,
  },
  ctx=Context(
    accounts={
      "payer": accs.payer.public_key,
      "market": accs.market.public_key,
      "market_authority": accs.market_authority.public_key,
      "market_store": market_store_pubkey,
      "quote_token_mint": client.quote_token,
      "quote_vault": vault_quote_acount,
      "vault_authority": vault_authority,
      "oracle_feed": accs.oracle_feed,
      "system_program": SYS_PROGRAM_ID,
    },
    signers=[accs.payer, accs.market, accs.market_authority],
      ),
  )