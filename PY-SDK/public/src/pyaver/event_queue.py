from anchorpy import Context
from .data_classes import UserMarketState
from .constants import MAX_ITERATIONS_FOR_CONSUME_EVENTS
from .utils import load_multiple_bytes_data
from solana.publickey import PublicKey
from solana.rpc.async_api import AsyncClient
from solana.transaction import AccountMeta
from spl.token.instructions import get_associated_token_address
from solana.keypair import Keypair
from typing import List, Tuple, Union, Container
from .enums import Fill, Out, Side
from solana.rpc.async_api import AsyncClient
from .layouts import EVENT_QUEUE_HEADER_LAYOUT, EVENT_QUEUE_HEADER_LEN, REGISTER_SIZE, EVENT_LAYOUT


async def load_all_event_queues(conn: AsyncClient, event_queues: list[PublicKey]):
    """
    Loads onchain data for multiple Event Queues

    Args:
        conn (AsyncClient): Solana AsyncClient object
        event_queues (list[PublicKey]): List of EventQueue account pubkeys

    Returns:
        list[Tuple[Container, List[Fill | Out]]]: List of EventQueues
    """
    data = await load_multiple_bytes_data(conn, event_queues)
    return [read_event_queue_from_bytes(d) for d in data]

def read_event_queue_from_bytes(buffer: bytes) -> Tuple[Container, List[Union[Fill, Out]]]:
    """
    Parses raw event queue data into Event objects

    Args:
        buffer (bytes): Raw bytes coming from onchain

    Returns:
        Tuple[Container, List[Union[Fill, Out]]]: _description_
    """
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

def prepare_user_accounts_list(user_account: List[PublicKey]) -> List[PublicKey]:
    """
    Sorts list of user accounts by public key (alphabetically)

    Args:
        user_account (List[PublicKey]): List of User Account account pubkeys

    Returns:
        List[PublicKey]: Sorted list of User Account account pubkeys
    """
    str_list = [str(pk) for pk in user_account]
    deduped_list = list(set(str_list))
    # TODO: Not clear if this sort is doing the same thing as dex_v4 - they use .sort_unstable()
    sorted_list = sorted(deduped_list)
    pubkey_list = [PublicKey(stpk) for stpk in sorted_list]
    return pubkey_list

async def consume_events(
        market,
        outcome_idx: int,
        user_accounts: list[PublicKey],
        max_iterations: int = None,
        reward_target: PublicKey = None,
        payer: Keypair = None,
        quote_token: PublicKey = None
    ):
        """
        Consume events

        Sends instructions on chain

        Args:
            outcome_idx (int): index of the outcome
            user_accounts (list[PublicKey]): List of User Account public keys
            max_iterations (int, optional): Depth of events to iterate through. Defaults to MAX_ITERATIONS_FOR_CONSUME_EVENTS.
            reward_target (PublicKey, optional): Target for reward. Defaults to AverClient wallet.
            payer (Keypair, optional): Fee payer. Defaults to AverClient wallet.
            quote_tone (PublicKey, optional): Quote Token. Defaults to AverClient quote token

        Returns:
            Transaction Signature: TransactionSignature object
        """
        if reward_target == None:
            reward_target = market.aver_client.owner.public_key
        if payer == None:
            payer = market.aver_client.owner
        if max_iterations > MAX_ITERATIONS_FOR_CONSUME_EVENTS or max_iterations == None:
            max_iterations = MAX_ITERATIONS_FOR_CONSUME_EVENTS
        if quote_token == None:
            quote_token = market.aver_client.quote_token
        
        program = await market.aver_client.get_program_from_program_id(market.program_id)

        user_accounts_unsorted = [AccountMeta(
                pk, False, True) for pk in user_accounts]
                
        sorted_user_accounts = sorted(user_accounts_unsorted, key=lambda account: bytes(account.pubkey))
        sorted_loaded_umas: list[UserMarketState] = await program.account['UserMarket'].fetch_multiple(sorted_user_accounts)
        user_atas =  [get_associated_token_address(u.user, quote_token) for u in sorted_loaded_umas]

        remaining_accounts  = sorted_user_accounts + user_atas

        return await program.rpc["consume_events"](
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

