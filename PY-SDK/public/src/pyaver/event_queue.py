from .utils import load_multiple_bytes_data
from solana.publickey import PublicKey
from solana.rpc.async_api import AsyncClient
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

