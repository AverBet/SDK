from .aver_client import AverClient
from spl.token.instructions import get_associated_token_address
from spl.token._layouts import ACCOUNT_LAYOUT
from spl.token.constants import ACCOUNT_LEN
from .data_classes import UserBalanceState, MarketStatus
from solana.publickey import PublicKey
from .errors import parse_error
from .slab import Slab
from solana.keypair import Keypair
from solana.rpc.types import RPCResponse, TxOpts
import base64
from anchorpy.error import ProgramError
from solana.publickey import PublicKey
from solana.rpc.async_api import AsyncClient
from solana.transaction import TransactionInstruction, Transaction

def parse_bytes_data(res: RPCResponse) -> bytes:
    """
    Parses bytes from an RPC response

    Args:
        res (RPCResponse): Response

    Raises:
        Exception: Cannot load byte data

    Returns:
        bytes: Parsed data
    """
    if ("result" not in res) or ("value" not in res["result"]) or ("data" not in res["result"]["value"]):
        raise Exception(f"Cannot load byte data. {res['error']}")
    data = res["result"]["value"]["data"][0]
    return base64.decodebytes(data.encode("ascii"))

def parse_multiple_bytes_data(res: RPCResponse, is_only_getting_data: bool = True) -> list[bytes]:
    """
    Parses bytes from an RPC response for multiple accounts

    Args:
        res (RPCResponse): Response
        is_only_getting_data (bool, optional): Only returns account data if true; gets all information otherwise. Defaults to True.

    Raises:
        Exception: Cannot load byte data

    Returns:
        list[bytes]: List of parsed byte data
    """
    if ("result" not in res) or ("value" not in res["result"]):
        raise Exception(f"Cannot load byte data. {res['error']}")
    data_list = []
    raw_data_list = res['result']['value']
    for r in raw_data_list:
        if(r is None):
            data_list.append(None)
            continue
        if(is_only_getting_data):
            data_list.append(base64.decodebytes(r['data'][0].encode('ascii')))
        else:
            datum = r
            datum['data'] = base64.decodebytes(r['data'][0].encode('ascii'))
            data_list.append(datum)
    return data_list

async def load_bytes_data(conn: AsyncClient, address: PublicKey) -> bytes:
    """
    Fetch account data from AsyncClient 

    Args:
        conn (AsyncClient): Solana AsyncClient object
        address (PublicKey): Public key of account to be loaded

    Returns:
        bytes: bytes
    """
    res = await conn.get_account_info(address)
    return parse_bytes_data(res)

#This function chunks requests into max size of 100 accounts
async def load_multiple_bytes_data(
    conn: AsyncClient, 
    addresses_remaining: list[PublicKey], 
    loaded_data_so_far: list[bytes] = [],
    is_only_getting_data: bool = True):
    """
    Fetch account data from AsyncClient for multiple accounts

    Args:
        conn (AsyncClient): Solana AsyncClient object
        addresses_remaining (list[PublicKey]): Public keys of accounts to be loaded
        loaded_data_so_far (list[bytes], optional): Parameter for recursive use of function. Defaults to [].
        is_only_getting_data (bool, optional): Only returns account data if true; gets all information otherwise. Defaults to True.

    Returns:
        list[bytes]: _description_
    """
    if(len(addresses_remaining) == 0):
        return loaded_data_so_far
    
    addresses_to_load = addresses_remaining[:100]
    res = await conn.get_multiple_accounts(addresses_to_load)
    return await load_multiple_bytes_data(
        conn,
        addresses_remaining[100:],
        loaded_data_so_far + parse_multiple_bytes_data(res, is_only_getting_data),
        is_only_getting_data
    )

#TODO - calculate lamports required for transaction    
async def sign_and_send_transaction_instructions(
    client: AverClient,
    signers: list[Keypair],
    fee_payer: Keypair,
    tx_instructions: list[TransactionInstruction],
    send_options: TxOpts = None,
    manual_max_retry: int = 0
):
    """
    Cryptographically signs transaction and sends onchain

    Args:
        client (AverClient): AverClient object
        signers (list[Keypair]): List of signing keypairs
        fee_payer (Keypair): Keypair to pay fee for transaction
        tx_instructions (list[TransactionInstruction]): List of transaction instructions to pack into transaction to be sent
        send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.

    Raises:
        error: COMING SOON

    Returns:
        RPCResponse: Response
    """
    tx = Transaction()
    if(not fee_payer in signers):
        signers = [fee_payer] + signers
    tx.add(*tx_instructions)
    if(send_options == None):
        send_options = client.provider.opts
    

    attempts = 0
    while attempts <= manual_max_retry:
        try:
            return await client.provider.connection.send_transaction(tx, *signers, opts=send_options)
        except Exception as e:
            error = parse_error(e, client.program)
            if(isinstance(error, ProgramError)):
                raise error
            else:
                attempts = attempts + 1
                


def calculate_tick_size_for_price(limit_price: float):
    """
    Calculates tick size for specific price

    Args:
        limit_price (float): Limit price

    Raises:
        Exception: Limit price too low
        Exception: Limit price too high

    Returns:
        int: Tick size
    """
    if(limit_price < 1_000):
        raise Exception('Limit price too low')
    if(limit_price <= 2_000):
        return 100
    if(limit_price <= 5_000):
        return 250
    if(limit_price <= 10_000):
        return 500
    if(limit_price <= 20_000):
        return 1_000
    if(limit_price <= 50_000):
        return 2_500
    if(limit_price <= 100_000):
        return 5_000
    if(limit_price <= 990_000):
        return 10_000
    if(limit_price > 990_000):
        raise Exception('Limit price too high')
    return limit_price

def round_price_to_nearest_tick_size(limit_price: float):
    """
    Rounds price to the nearest tick size available

    Args:
        limit_price (float): Limit price

    Returns:
        float: Rounded limit price
    """
    limit_price_to_6dp = limit_price * (10 ** 6)
    tick_size  = calculate_tick_size_for_price(limit_price_to_6dp)
    rounded_limit_price_to_6dp = round(limit_price_to_6dp/tick_size) * tick_size
    rounded_limit_price = rounded_limit_price_to_6dp / (10 ** 6)

    return rounded_limit_price

def parse_user_market_state(buffer: bytes, aver_client: AverClient):
        """
        Parses raw onchain data to UserMarketState object        
        Args:
            buffer (bytes): Raw bytes coming from onchain
            aver_client (AverClient): AverClient object

        Returns:
            UserMarket: UserMarketState object
        """
        #uma_parsed = USER_MARKET_STATE_LAYOUT.parse(buffer)
        uma_parsed = aver_client.program.account['UserMarket'].coder.accounts.decode(buffer)
        return uma_parsed

def parse_market_state(buffer: bytes, aver_client: AverClient):
        """
        Parses raw onchain data to MarketState object        
        Args:
            buffer (bytes): Raw bytes coming from onchain
            aver_client (AverClient): AverClient object

        Returns:
            MarketState: MarketState object
        """
        
        market_account_info = aver_client.program.account['Market'].coder.accounts.decode(buffer)
        return market_account_info

def parse_market_store(buffer: bytes, aver_client: AverClient):
        """
        Parses onchain data for a MarketStore State

        Args:
            buffer (bytes): Raw bytes coming from onchain
            aver_client (AverClient): AverClient

        Returns:
            MarketStore: MarketStore object
        """
        market_store_account_info = aver_client.program.account['MarketStore'].coder.accounts.decode(buffer)
        return market_store_account_info  


def parse_user_host_lifetime_state(aver_client: AverClient, buffer):
        """
        Parses raw onchain data to UserHostLifetime object

        Args:
            aver_client (AverClient): AverClient object
            buffer (bytes): Raw bytes coming from onchain

        Returns:
            UserHostLifetime: UserHostLifetime object
        """
        user_host_lifetime_info = aver_client.program.account['UserHostLifetime'].coder.accounts.decode(buffer)
        return user_host_lifetime_info

async def load_multiple_account_states(
        aver_client: AverClient,
        market_pubkeys: list[PublicKey],
        market_store_pubkeys: list[PublicKey],
        slab_pubkeys: list[PublicKey],
        user_market_pubkeys: list[PublicKey] = [],
        user_pubkeys: list[PublicKey] = [],
        uhl_pubkeys: list[PublicKey] = []
    ):
        """
        Fetchs account data for multiple account types at once

        Used in refresh.py to quckly and efficiently pull all account data at once

        Args:
            aver_client (AverClient): AverClient object
            market_pubkeys (list[PublicKey]): List of MarketState object public keys
            market_store_pubkeys (list[PublicKey]): List of MarketStoreStore object public keys
            slab_pubkeys (list[PublicKey]): List of Slab public keys for orderbooks
            user_market_pubkeys (list[PublicKey], optional): List of UserMarketState object public keys. Defaults to [].
            user_pubkeys (list[PublicKey], optional): List of UserMarket owners' public keys. Defaults to [].
            uhl_pubkeuys(list[PublicKey], optional): List of UserHostLifetime public keys. Defaults to []

        Returns:
            dict[str, list]: Dictionary containing `market_states`, `market_stores`, `slabs`, `user_market_states`, `user_balance_sheets`
        """
        all_ata_pubkeys = [get_associated_token_address(u, aver_client.quote_token) for u in user_pubkeys]

        all_pubkeys = market_pubkeys + market_store_pubkeys + slab_pubkeys + user_market_pubkeys + user_pubkeys + all_ata_pubkeys + uhl_pubkeys
        data = await load_multiple_bytes_data(aver_client.provider.connection, all_pubkeys, [], False)

        deserialized_market_state = []
        for index, m in enumerate(market_pubkeys):
            buffer = data[index]
            deserialized_market_state.append(parse_market_state(buffer['data'], aver_client))
        
        deserialized_market_store = []
        for index, m in enumerate(market_pubkeys):
            buffer = data[index + len(market_pubkeys)]
            if(buffer is None):
                deserialized_market_store.append(None)
                continue
            deserialized_market_store.append(parse_market_store(buffer['data'], aver_client))

        deserialized_slab_data = []
        for index, s in enumerate(slab_pubkeys):
            buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys)]
            if(buffer is None):
                deserialized_slab_data.append(None)
                continue
            deserialized_slab_data.append(Slab.from_bytes(buffer['data']))

        deserialized_uma_data = []
        if(user_market_pubkeys is not None):
            for index, u in enumerate(user_market_pubkeys):
                buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(slab_pubkeys)]
                if(buffer is None):
                    deserialized_uma_data.append(None)
                    continue
                deserialized_uma_data.append(parse_user_market_state(buffer['data'], aver_client))

        lamport_balances = []
        if(user_pubkeys is not None):
            for index, pubkey in enumerate(user_pubkeys):
                balance = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(slab_pubkeys) + len(user_market_pubkeys)]
                lamport_balances.append(balance['lamports'] if balance and balance['lamports'] is not None else 0)

        token_balances = []
        if(all_ata_pubkeys is not None):
            for index, pubkey in enumerate(all_ata_pubkeys):
                buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(slab_pubkeys) + len(user_market_pubkeys) + len(user_pubkeys)]
                if(len(buffer['data']) == ACCOUNT_LEN):
                    token_balances.append(ACCOUNT_LAYOUT.parse(buffer['data'])['amount'])
                else:
                    token_balances.append(0)

        user_balance_states = []
        for index, x in enumerate(lamport_balances):
            user_balance_state = UserBalanceState(lamport_balances[index], token_balances[index])
            user_balance_states.append(user_balance_state)

        uhl_states = []
        for index, pubkey in enumerate(uhl_pubkeys):
            buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(slab_pubkeys) + len(user_market_pubkeys) + len(user_pubkeys) + len(all_ata_pubkeys)]
            if(buffer is None):
                uhl_states.append(None)
                continue
            uhl_state = parse_user_host_lifetime_state(aver_client, buffer['data'])
            uhl_states.append(uhl_state)

        return {
            'market_states': deserialized_market_state,
            'market_stores': deserialized_market_store,
            'slabs': deserialized_slab_data,
            'user_market_states': deserialized_uma_data,
            'user_balance_states': user_balance_states,
            'user_host_lifetime_states': uhl_states
        }

def is_market_tradeable(market_status: MarketStatus):
    """
    Returns if it is possible to place an order on a market

    Args:
        market_status (MarketStatus): Market Status (found in MarketState)

    Returns:
        bool: Trade possible is true
    """
    return market_status in [MarketStatus.ACTIVE_IN_PLAY, MarketStatus.ACTIVE_PRE_EVENT]

def can_cancel_order_in_market(market_status: MarketStatus):
    """
    Returns if it is possible to cancel an order on a market

    Args:
        market_status (MarketStatus): Market Status (found in MarketState)

    Returns:
        _type_: Order cancellable if true
    """
    return market_status in [
        MarketStatus.ACTIVE_PRE_EVENT,
        MarketStatus.ACTIVE_IN_PLAY,
        MarketStatus.HALTED_IN_PLAY,
        MarketStatus.HALTED_PRE_EVENT
    ]