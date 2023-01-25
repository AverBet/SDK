from asyncio import gather
from anchorpy import Program
from .aver_client import AverClient
from spl.token.instructions import get_associated_token_address
from spl.token._layouts import ACCOUNT_LAYOUT
from spl.token.constants import ACCOUNT_LEN
from .data_classes import UserBalanceState, MarketStatus
from .constants import AVER_PROGRAM_IDS
from solana.publickey import PublicKey
from .errors import parse_error
from hashlib import sha256
from .slab import Slab
from .enums import AccountTypes
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
        manual_max_retry (int, optional): Number of times to retry a transaction if it fails. Defaults to 0

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
            error = parse_error(e, client.programs[0])
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

def round_price_to_nearest_tick_size(limit_price: float, is_binary: bool = False):
    """
    Rounds price to the nearest tick size available

    Args:
        limit_price (float): Limit price

    Returns:
        float: Rounded limit price
    """
    factor = 10 ** 6
    limit_price_to_6dp = limit_price * factor
    tick_size  = calculate_tick_size_for_price(factor - limit_price_to_6dp if is_binary else limit_price_to_6dp)
    rounded_limit_price_to_6dp = round(limit_price_to_6dp/tick_size) * tick_size
    rounded_limit_price = rounded_limit_price_to_6dp / factor

    return rounded_limit_price

def calculate_tick_size_for_decimal_price(limit_price_decimal: float):
    """
    Calculates tick size for specific price

    Args:
        limit_price (float): Limit price in decimal

    Raises:
        Exception: Limit price too low
        Exception: Limit price too high

    Returns:
        int: Tick size
    """
    if(limit_price_decimal < 1.01):
        raise Exception('Limit price too low')
    if(limit_price_decimal <= 2):
        return 0.01
    if(limit_price_decimal <= 3):
        return 0.02
    if(limit_price_decimal <= 4):
        return 0.05
    if(limit_price_decimal <= 6):
        return 0.1
    if(limit_price_decimal <= 10):
        return 0.2
    if(limit_price_decimal <= 20):
        return 0.5
    if(limit_price_decimal <= 30):
        return 1
    if(limit_price_decimal <= 50):
        return 2
    if(limit_price_decimal <= 100):
        return 5
    if(limit_price_decimal <= 1000):
        return 10
    if(limit_price_decimal > 1000):
        raise Exception('Limit price too high')
    return limit_price_decimal

def round_price_decimal(tickSize: float, limitPrice: float):
  return round(limitPrice / tickSize) * tickSize

def round_price_to_nearest_decimal_tick_size(limit_price: float, is_binary: bool = False):
    """
    Rounds price to the nearest tick size available

    Args:
        limit_price (float): Limit price

    Returns:
        float: Rounded limit price
    """
    limit_price_decimal = 1 / limit_price
    one_in_market_decimals = pow(10, 6)

    min_value_for_market = 1.01
    max_value_for_market = 1000

    if limit_price_decimal < min_value_for_market: 
        return 1.0 / min_value_for_market
    elif limit_price_decimal > max_value_for_market: 
        return 1.0 / max_value_for_market
    else:
        limit_price_decimal_rounded = 0

        if is_binary and limit_price_decimal > 2.0: 
            limit_price_decimal_rounded = round_price_decimal(
                calculate_tick_size_for_decimal_price(
                    1.0 / ((one_in_market_decimals - limit_price) / one_in_market_decimals),
                ),
                limit_price_decimal,
            )
        else:
            tick_size = calculate_tick_size_for_decimal_price(limit_price_decimal=limit_price_decimal)

            limit_price_decimal_rounded = round_price_decimal(
                tickSize=tick_size,
                limitPrice=limit_price_decimal,
            )

        return 1.0 / limit_price_decimal_rounded

def parse_user_market_state(buffer: bytes, aver_client: AverClient, program: Program = None):
        """
        Parses raw onchain data to UserMarketState object        
        Args:
            buffer (bytes): Raw bytes coming from onchain
            aver_client (AverClient): AverClient object
            program (Program, optional): Anchor Program. Defaults to first program in client.

        Returns:
            UserMarket: UserMarketState object
        """
        if(program is None):
            program = aver_client.programs[0]
        return parse_with_version(program, AccountTypes.USER_MARKET, buffer)


def parse_market_state(buffer: bytes, aver_client: AverClient, program: Program = None):
        """
        Parses raw onchain data to MarketState object        
        Args:
            buffer (bytes): Raw bytes coming from onchain
            aver_client (AverClient): AverClient object
            program (Program, optional): Anchor Program. Defaults to first program in client.

        Returns:
            MarketState: MarketState object
        """
        if(program is None):
            program = aver_client.programs[0]
        return parse_with_version(program, AccountTypes.MARKET, buffer)


def parse_market_store(buffer: bytes, aver_client: AverClient, program = None):
        """
        Parses onchain data for a MarketStore State

        Args:
            buffer (bytes): Raw bytes coming from onchain
            aver_client (AverClient): AverClient
            program (Program, optional): Anchor Program. Defaults to first program in client.

        Returns:
            MarketStore: MarketStore object
        """
        if(program is None):
            program = aver_client.programs[0]
        return parse_with_version(program, AccountTypes.MARKET_STORE, buffer)



def parse_user_host_lifetime_state(aver_client: AverClient, buffer, program: Program=None):
        """
        Parses raw onchain data to UserHostLifetime object

        Args:
            aver_client (AverClient): AverClient object
            buffer (bytes): Raw bytes coming from onchain
            program (Program, optional): Anchor Program. Defaults to first program in client.

        Returns:
            UserHostLifetime: UserHostLifetime object
        """
        if(program is None):
            program = aver_client.programs[0]
        return parse_with_version(program, AccountTypes.USER_HOST_LIFETIME, buffer)

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
            uhl_pubkeys(list[PublicKey], optional): List of UserHostLifetime public keys. Defaults to []

        Returns:
            dict[str, list]: Dictionary containing `market_states`, `market_stores`, `slabs`, `user_market_states`, `user_balance_sheets`, `program_ids`
        """
        all_ata_pubkeys = [get_associated_token_address(u, aver_client.quote_token) for u in user_pubkeys]

        all_pubkeys = market_pubkeys + market_store_pubkeys + user_market_pubkeys + uhl_pubkeys +  slab_pubkeys + user_pubkeys + all_ata_pubkeys 
        data = await load_multiple_bytes_data(aver_client.provider.connection, all_pubkeys, [], False)
        programs = await gather(*[aver_client.get_program_from_program_id(PublicKey(d['owner'] if d else AVER_PROGRAM_IDS[0])) for d in data[0: len(market_pubkeys) + len(market_store_pubkeys) + len(user_market_pubkeys)]])
       
        deserialized_market_state = []
        for index, m in enumerate(market_pubkeys):
            buffer = data[index]
            deserialized_market_state.append(parse_market_state(buffer['data'], aver_client, programs[index]))
        
        deserialized_market_store = []
        for index, m in enumerate(market_pubkeys):
            buffer = data[index + len(market_pubkeys)]
            if(buffer is None):
                deserialized_market_store.append(None)
                continue
            deserialized_market_store.append(parse_market_store(buffer['data'], aver_client, programs[index]))

        deserialized_uma_data = []
        if(user_market_pubkeys is not None):
            for index, u in enumerate(user_market_pubkeys):
                buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys)]
                if(buffer is None):
                    deserialized_uma_data.append(None)
                    continue
                deserialized_uma_data.append(parse_user_market_state(buffer['data'], aver_client, programs[index]))
        
        uhl_states = []
        for index, pubkey in enumerate(uhl_pubkeys):
            buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(user_market_pubkeys)]
            if(buffer is None):
                uhl_states.append(None)
                continue
            uhl_state = parse_user_host_lifetime_state(aver_client, buffer['data'], programs[index])
            uhl_states.append(uhl_state)

        deserialized_slab_data = []
        for index, s in enumerate(slab_pubkeys):
            buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(user_market_pubkeys) + len(uhl_pubkeys)]
            if(buffer is None):
                deserialized_slab_data.append(None)
                continue
            deserialized_slab_data.append(Slab.from_bytes(buffer['data']))

        lamport_balances = []
        if(user_pubkeys is not None):
            for index, pubkey in enumerate(user_pubkeys):
                balance = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(user_market_pubkeys) + len(uhl_pubkeys) + len(slab_pubkeys)]
                lamport_balances.append(balance['lamports'] if balance and balance['lamports'] is not None else 0)

        token_balances = []
        if(all_ata_pubkeys is not None):
            for index, pubkey in enumerate(all_ata_pubkeys):
                buffer = data[index + len(market_pubkeys) + len(market_store_pubkeys) + len(user_market_pubkeys) + len(uhl_pubkeys) + len(slab_pubkeys) + len(user_pubkeys)]
                if(buffer is not None and len(buffer['data']) == ACCOUNT_LEN):
                    token_balances.append(ACCOUNT_LAYOUT.parse(buffer['data'])['amount'])
                else:
                    token_balances.append(0)

        user_balance_states = []
        for index, x in enumerate(lamport_balances):
            user_balance_state = UserBalanceState(lamport_balances[index], token_balances[index])
            user_balance_states.append(user_balance_state)

        return {
            'market_states': deserialized_market_state,
            'market_stores': deserialized_market_store,
            'slabs': deserialized_slab_data,
            'user_market_states': deserialized_uma_data,
            'user_balance_states': user_balance_states,
            'user_host_lifetime_states': uhl_states,
            'program_ids': [p.program_id for p in programs[0: len(market_pubkeys)]]
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

async def fetch_with_version(conn: AsyncClient, program: Program, account_type: AccountTypes, pubkey: PublicKey):
    """
    Fetches from onchain taking into account Aver Version

    Args:
        conn (AsyncClient): Solana AysyncClient object
        program (Program): AnchorPy Program
        account_type (AccountTypes): Account Type (e.g., MarketStore)
        pubkey (PublicKey): Public key to fetch

    Returns:
        Container: Parsed and fetched object
    """
    bytes = await load_bytes_data(conn, pubkey)
    #9th byte contains version
    return parse_with_version(program, account_type, bytes)


async def fetch_multiple_with_version(conn: AsyncClient, program: Program, account_type: AccountTypes, pubkeys: list[PublicKey]):
    """
    Fetches from onchain taking into account Aver Version

    Args:
        conn (AsyncClient): Solana AysyncClient object
        program (Program): AnchorPy Program
        account_type (AccountTypes): Account Type (e.g., MarketStore)
        pubkeys (list[PublicKey]): Public key to fetch

    Returns:
        list[Container]: Parsed and fetched objects
    """
    bytes = await load_multiple_bytes_data(conn, pubkeys)

    accounts = []
    for i, d in enumerate(bytes):
        accounts.append(parse_with_version(program, account_type, d))
    
    return accounts

def parse_with_version(program: Program, account_type: AccountTypes, bytes: bytes):
    """
    Parses objects taking into account the Aver Version.

    Rewrites first 8 bytes of discriminator

    Args:
        program (Program): AnchorPy Program
        account_type (AccountTypes): Account Type (e.g., MarketStore)
        bytes (bytes): Raw bytes data

    Returns:
        Container: Parsed object
    """
    #Version is 9th byte
    version = bytes[8]

    #Latest version according to program
    latest_version = get_version_of_account_type_in_program(account_type, program)
    
    #Checks if this is reading the correct version OR if it is not possible to read an old version
    if(version == latest_version or program.account.get(f'{account_type.value}V{version}') is None):
        return program.account[f'{account_type.value}'].coder.accounts.decode(bytes)
    else:
        #Reads old version
        print(f'THE {account_type} BEING READ HAS NOT BEEN UPDATED TO THE LATEST VERSION')
        print('PLEASE CALL THE UPDATE INSTRUCTION FOR THE CORRESPONDING ACCOUNT TYPE TO RECTIFY, IF POSSIBLE')
        #We need to replace the discriminator on the bytes data to prevent anchor errors
        account_discriminator = get_account_discriminator(account_type, version, latest_version)
        new_bytes = bytearray(bytes)
        for i, a in enumerate(account_discriminator):
            new_bytes[i] = a
        return program.account[f'{account_type.value}V{version}'].coder.accounts.decode(new_bytes)


def get_account_discriminator(account_type: AccountTypes, version: int, latest_version: int):
    """
    Gets the account discriminator (8 bytes) for a specific account type

    Args:
        account_type (AccountTypes): Account Type (e.g., MarketStore)
        version (int): Version 

    Returns:
        bytes: Discriminator bytes
    """
    name = account_type.value if version == latest_version else f'{account_type.value}V{version}'
    return sha256(bytes(f'account:{name}', 'utf-8')).digest()[0:8]

#Latest version according to the program
def get_version_of_account_type_in_program(account_type: AccountTypes, program: Program):
    version = 0
    while True:
        account = program.account.get(f'{account_type.value}V{version}')
        if(account is None):
            break
        else:
            version = version + 1
    
    return version

