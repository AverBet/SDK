from anchorpy import Context, Program
from .utils import load_multiple_bytes_data, parse_with_version
from solana.publickey import PublicKey
from solana.rpc.async_api import AsyncClient
from spl.token.constants import TOKEN_PROGRAM_ID
from solana.transaction import AccountMeta
from spl.token.instructions import get_associated_token_address
from solana.keypair import Keypair
from typing import List, Tuple, Union, Container
from .enums import AccountTypes, Fill, Out, Side
from solana.rpc.async_api import AsyncClient
from .layouts import EVENT_QUEUE_HEADER_LAYOUT, EVENT_QUEUE_HEADER_LEN, REGISTER_SIZE, EVENT_LAYOUT
from .compute_units import set_compute_unit_limit_ixn, set_compute_unit_price_ixn


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
        Tuple[Container, List[Union[Fill, Out]]]: List of headers and nodes (indexed by 'header' and 'node')
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
        max_iterations: int,
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
            quote_token (PublicKey, optional): Quote Token. Defaults to AverClient quote token

        Returns:
            Transaction Signature: TransactionSignature object
        """
        if reward_target == None:
            reward_target = market.aver_client.owner.public_key
        if payer == None:
            payer = market.aver_client.owner
        if quote_token == None:
            quote_token = market.aver_client.quote_token
        
        program: Program = await market.aver_client.get_program_from_program_id(market.program_id)

        sorted_user_accounts = sorted(user_accounts, key=lambda account: bytes(account))
        umas = await load_multiple_bytes_data(market.aver_client.connection, sorted_user_accounts, [])
        sorted_loaded_umas = [parse_with_version(program, AccountTypes.USER_MARKET, u) for u in umas]
        user_atas =  [get_associated_token_address(u.user, quote_token) for u in sorted_loaded_umas]

        remaining_accounts  = [AccountMeta(pk, False, True) for pk in sorted_user_accounts + user_atas]

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
                        "vault_authority": market.market_state.vault_authority,
                        "quote_vault": market.market_state.quote_vault,
                        'spl_token_program': TOKEN_PROGRAM_ID
                    },
                    remaining_accounts=remaining_accounts,
                    pre_instructions = [
                        set_compute_unit_limit_ixn(units=1000000),
                        set_compute_unit_price_ixn(micro_lamports=1)
                    ],
                ),
            )

