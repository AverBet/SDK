
from anchorpy import Program, Context
from solana.publickey import PublicKey
from solana.keypair import Keypair
from solana.transaction import AccountMeta
from solana.system_program import SYS_PROGRAM_ID
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.constants import AVER_PROGRAM_IDS, get_quote_token
from ...public.src.pyaver.aver_client import AverClient
from ...public.src.pyaver.orderbook import Orderbook

async def close_aaob_tx(
  program: Program,
  market: AverMarket,
  market_authority: Keypair,
  outcomes: list[int],
):
  [market_store, _] = AverMarket.derive_market_store_pubkey_and_bump(market.market_pubkey, market.program_id)
  orderbooks = [Orderbook.derive_orderbook(market.market_pubkey, outcome_id, market.program_id)[0] for outcome_id in outcomes]
  event_queues = [Orderbook.derive_event_queue(market.market_pubkey, outcome_id, market.program_id)[0] for outcome_id in outcomes]
  bids = [Orderbook.derive_bids(market.market_pubkey, outcome_id, market.program_id)[0] for outcome_id in outcomes]
  asks = [Orderbook.derive_asks(market.market_pubkey, outcome_id, market.program_id)[0] for outcome_id in outcomes]

  in_play_queue = market.market_state.in_play_queue

  remaining_accounts = [
    [
      AccountMeta(orderbooks[i], False, True),
      AccountMeta(event_queues[i], False, True),
      AccountMeta(bids[i], False, True),
      AccountMeta(asks[i], False, True)
    ]
    for i in range(len(outcomes))
  ]
  flattened_remaining_accounts = [item for sublist in remaining_accounts for item in sublist]
  
  # pass in random keypair for in play queue if old market
  if not in_play_queue or in_play_queue == SYS_PROGRAM_ID:
    in_play_queue = Keypair().public_key

  return await program.rpc["close_aaob"](
        outcomes,
        ctx=Context(
            accounts={
                "market": market.market_pubkey,
                "market_authority": market_authority.public_key,
                "market_store": market_store,
                "target_lamports_account": market_authority.public_key,
                "in_play_queue": in_play_queue
            },
            remaining_accounts=flattened_remaining_accounts,
            signers=[market_authority],
        ),
    )