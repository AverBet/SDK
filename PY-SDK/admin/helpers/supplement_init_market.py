from typing import NamedTuple
from solana.publickey import PublicKey
from solana.keypair import Keypair
from solana.system_program import SYS_PROGRAM_ID
from anchorpy import Program, Context
from .deriveables import *

class SupplementInitMarketArgs(NamedTuple):
  outcome_id: int
  outcome_names: list[str]
  event_capacity: int
  nodes_capacity: int


class SupplementInitMarketAccounts(NamedTuple):
  payer: Keypair
  market: PublicKey
  market_authority: Keypair

async def supplement_init_market(program: Program, args: SupplementInitMarketArgs, accs: SupplementInitMarketAccounts):
  [market_store, _] = derive_market_store(accs.market)
  [orderbook, orderbook_bump] = derive_orderbook(accs.market, args.outcome_id)
  [bids, bids_bump] = derive_bids(accs.market, args.outcome_id)
  [asks, asks_bump] = derive_asks(accs.market, args.outcome_id)
  [event_queue, event_queue_bump] = derive_event_queue(accs.market, args.outcome_id)

  print(orderbook)

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
      "market_authority": accs.market_authority.public_key,
      "orderbook": orderbook,
      "event_queue": event_queue, 
      "bids": bids,
      "asks": asks,
      "system_program": SYS_PROGRAM_ID
    },
    signers=[accs.payer, accs.market_authority]
  ))