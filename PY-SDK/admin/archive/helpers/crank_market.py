from pyaver.enums import IntEnum, Side
from typing import List, Optional, Tuple, Union, cast, NamedTuple
from solana.publickey import PublicKey
from solana.keypair import Keypair
from pyaver.market import AverMarket
from solana.rpc.async_api import AsyncClient
from construct import Container
from pyaver.layouts import EVENT_QUEUE_HEADER_LAYOUT, EVENT_QUEUE_HEADER_LEN, REGISTER_SIZE, EVENT_LAYOUT
from anchorpy import Context
from pyaver.utils import load_multiple_bytes_data
from pyaver.refresh import refresh_market

# MAX_USER_ACCOUNTS_FOR_CONSUME_EVENTS = 20                   # TODO: Confirm this
MAX_ITERATIONS_FOR_CONSUME_EVENTS = 5                      # TODO: Confirm this
# MAX_REMAINING_ACCOUNTS_FOR_COLLECTION_CRANK = 18            # TODO: Confirm this
# MAX_ITERATIONS_FOR_COLLECTION_CRANK = 6                     # TODO: Confirm this

class QueueType(IntEnum):
    EVENT = 1
    REQUEST = 2

class Fill(NamedTuple):
    taker_side: Side
    maker_order_id: int
    quote_size: int
    base_size: int
    maker_user_market: PublicKey
    taker_user_market: PublicKey
    maker_fee_tier: int
    taker_fee_tier: int

class Out(NamedTuple):
    side: Side
    order_id: int
    base_size: int
    delete: bool
    user_market: PublicKey
    fee_tier: int


def read_event_queue_from_bytes(buffer: bytes) -> Tuple[Container, List[Union[Fill, Out]]]:
    header = EVENT_QUEUE_HEADER_LAYOUT.parse(buffer)
    buffer_len = len(buffer)
    nodes: List[Union[Fill, Out]] = []
    for i in range(header.count):
        header_offset = EVENT_QUEUE_HEADER_LEN + REGISTER_SIZE
        offset = header_offset + ((i * header.event_size) + header.head) % (buffer_len - header_offset)
        event = EVENT_LAYOUT.parse(buffer[offset : offset + header.event_size])

        if event.tag == 0: # FILL
            node = Fill(
                taker_side = Side(event.node.taker_side),
                maker_order_id = int.from_bytes(event.node.maker_order_id, "little"),
                quote_size = event.node.quote_size,
                base_size = event.node.base_size,
                maker_user_market = PublicKey(event.node.maker_callback_info.user_market),
                taker_user_market = PublicKey(event.node.taker_callback_info.user_market),
                maker_fee_tier = event.node.maker_callback_info.fee_tier,
                taker_fee_tier = event.node.taker_callback_info.fee_tier,
            )
        else:  # OUT
            node = Out(
                side = Side(event.node.side),
                order_id = int.from_bytes(event.node.order_id, "little"),
                base_size = event.node.base_size,
                delete = bool(event.node.delete),
                user_market =PublicKey(event.node.callback_info.user_market),
                fee_tier = event.node.callback_info.fee_tier,
            )
        nodes.append(node)
    return {"header": header, "nodes": nodes}

async def crank_market(
    market: AverMarket,
    outcome_idxs: list[int] = None,
    reward_target: PublicKey = None,
    payer: Keypair = None,
):
    '''
    If no outcome_idx are passed, all outcomes are cranked if they meet the criteria to be cranked.
    '''
    if outcome_idxs == None:
        # For binary markets, there is only one orderbook
        outcome_idxs = [idx for idx in range(
            1 if market.market_state.number_of_outcomes == 2 else market.market_state.number_of_outcomes)]
    if market.market_state.number_of_outcomes == 2 and (0 in outcome_idxs or 1 in outcome_idxs):
        # OLD COMMENT: For binary markets, there is only one orderbook
        ### ^ Not anymore. I've left the legacy code in there just in case.
        outcome_idxs = [0]
    if reward_target == None:
        reward_target = market.aver_client.owner.public_key
    if payer == None:
        payer = market.aver_client.owner

    refreshed_market = await refresh_market(market.aver_client, market)

    event_queues = [o.event_queue for o in refreshed_market.market_store_state.orderbook_accounts]
    loaded_event_queues = await load_all_event_queues(
        market.aver_client.provider.connection,
        event_queues 
        )

    sig = ''
    for idx in outcome_idxs:
        if loaded_event_queues[idx]["header"].count == 0:
            continue

        print(f'Cranking market {str(market.market_pubkey)} for outcome {idx} - {loaded_event_queues[idx]["header"].count} events left to crank')
        if loaded_event_queues[idx]['header'].count > 0:
            user_accounts = []
            for j, event in enumerate(loaded_event_queues[idx]['nodes']):
                if type(event) == Fill:
                    user_accounts += [event.maker_user_market]
                else:  # Out
                    user_accounts += [event.user_market]
                if j == MAX_ITERATIONS_FOR_CONSUME_EVENTS:
                    break
            user_accounts = prepare_user_accounts_list(user_accounts)
            events_to_crank = min(
                loaded_event_queues[idx]['header'].count, MAX_ITERATIONS_FOR_CONSUME_EVENTS)

            sig = await consume_events(
                market=market,
                outcome_idx=idx,
                max_iterations=events_to_crank,
                user_accounts=user_accounts,
                reward_target=reward_target,
                payer=payer,
            )

    return sig

def prepare_user_accounts_list(user_account: List[PublicKey]) -> List[PublicKey]:
    str_list = [str(pk) for pk in user_account]
    deduped_list = list(set(str_list))
    # TODO: Not clear if this sort is doing the same thing as dex_v4 - they use .sort_unstable()
    sorted_list = sorted(deduped_list)
    pubkey_list = [PublicKey(stpk) for stpk in sorted_list]
    return pubkey_list

async def load_all_event_queues(conn: AsyncClient, event_queues: list[PublicKey]):
    data = await load_multiple_bytes_data(conn, event_queues)
    return [read_event_queue_from_bytes(d) for d in data]

async def consume_events(
    market: AverMarket,
    outcome_idx: int,
    user_accounts: list[PublicKey],
    max_iterations: int = None,
    reward_target: PublicKey = None,
    payer: Keypair = None,
):
    if reward_target == None:
        reward_target = market.aver_client.owner.public_key
    if payer == None:
        payer = market.aver_client.owner
    if max_iterations > MAX_ITERATIONS_FOR_CONSUME_EVENTS or max_iterations == None:
        max_iterations = MAX_ITERATIONS_FOR_CONSUME_EVENTS
    
    user_accounts_unsorted = [AccountMeta(
            pk, False, True) for pk in user_accounts]
            
    remaining_accounts = sorted(user_accounts_unsorted, key=lambda account: bytes(account.pubkey))

    return await market.aver_client.program.rpc["consume_events"](
            max_iterations,
            outcome_idx,
            ctx=Context(
                accounts={
                    "market": market.market_pubkey,
                    "market_store": market.market_state.market_store,
                    "orderbook": market.market_store_state.orderbook_accounts[outcome_idx].orderbook,
                    "event_queue": market.market_store_state.orderbook_accounts[outcome_idx].event_queue,
                    "reward_target": reward_target,
                },
                remaining_accounts=remaining_accounts,
            ),
        )