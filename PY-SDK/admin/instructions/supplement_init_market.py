from ...public.src.pyaver.aver_client import AverClient
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.orderbook import Orderbook
from typing import NamedTuple
from solana.publickey import PublicKey
from solana.keypair import Keypair
from solana.system_program import SYS_PROGRAM_ID
from anchorpy import Program, Context

class SupplementInitMarketArgs(NamedTuple):
  outcome_id: int
  outcome_names: list[str]
  event_capacity: int
  nodes_capacity: int

class SupplementInitMarketAccounts(NamedTuple):
  payer: Keypair
  market: PublicKey
  market_authority: PublicKey

async def supplement_init_market_tx(
  aver_client: AverClient,
  args: SupplementInitMarketArgs,
  accs: SupplementInitMarketAccounts,
  program_id: PublicKey = None
):
  if program_id:
    program = await aver_client.get_program_from_program_id(program_id)
  else:
    program = aver_client.programs[0]

  [market_store, _] = AverMarket.derive_market_store_pubkey_and_bump(accs.market, program.program_id)
  [orderbook, orderbook_bump] = Orderbook.derive_orderbook(accs.market, args.outcome_id, program.program_id)
  [bids, bids_bump] = Orderbook.derive_bids(accs.market, args.outcome_id, program.program_id)
  [asks, asks_bump] = Orderbook.derive_asks(accs.market, args.outcome_id, program.program_id)
  [event_queue, event_queue_bump] = Orderbook.derive_event_queue(accs.market, args.outcome_id, program.program_id)

  return await program.rpc['supplement_init_market']({
    "outcome_id": args.outcome_id,
    "outcome_names": args.outcome_names,
    "event_capacity": args.event_capacity,
    "nodes_capacity": args.nodes_capacity,
    "orderbook_bump": orderbook_bump,
    "event_queue_bump": event_queue_bump,
    "bids_bump": bids_bump,
    "asks_bump": asks_bump
  },
  ctx=Context(
    accounts={
      "payer": accs.payer.public_key,
      "market": accs.market,
      "market_store": market_store,
      "market_authority": accs.market_authority,
      "orderbook": orderbook,
      "event_queue": event_queue,
      "bids": bids,
      "asks": asks,
      "system_program": SYS_PROGRAM_ID
    }
  ))
