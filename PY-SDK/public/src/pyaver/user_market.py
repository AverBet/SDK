from copy import deepcopy
from pydash import chunk
from .market import AverMarket
from solana.publickey import PublicKey
from asyncio import gather
from .checks import *
from solana.transaction import AccountMeta
from solana.keypair import Keypair
from solana.system_program import SYS_PROGRAM_ID
from spl.token.constants import TOKEN_PROGRAM_ID
from anchorpy import Context
from .user_host_lifetime import UserHostLifetime
from spl.token.instructions import get_associated_token_address
from .aver_client import AverClient
from .utils import sign_and_send_transaction_instructions, load_multiple_account_states, is_market_tradeable, can_cancel_order_in_market
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Finalized
from .data_classes import UserMarketState, UserBalanceState
# from constants import DEFAULT_QUOTE_TOKEN_DEVNET, AVER_PROGRAM_ID, DEFAULT_HOST_ACCOUNT_DEVNET
from .constants import AVER_PROGRAM_ID, AVER_HOST_ACCOUNT
from .enums import OrderType, SelfTradeBehavior, Side, FeeTier, SizeFormat
import math

class UserMarket():
    """
    Contains data on a user's orders on a particular market (for a particular host)
    """

    aver_client: AverClient
    """
    AverClient object
    """
    pubkey: PublicKey
    """
    UserMarket public key
    """
    market: AverMarket
    """
    Corresponding Market object
    """
    user_market_state: UserMarketState
    """
    UserMarketState object
    """
    user_balance_state: UserBalanceState
    """
    UserBalanceState object
    """

    def __init__(self, aver_client: AverClient, pubkey: PublicKey, user_market_state: UserMarketState, market: AverMarket, user_balance_state: UserBalanceState):
        """
         Initialise an UserMarket object. Do not use this function; use UserMarket.load() instead

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): UserMarket public key
            user_market_state (UserMarketState): UserMarketState object
            market (AverMarket): Market object
            user_balance_state (UserBalanceState): UserBalanceState object
        """
        self.user_market_state = user_market_state
        self.pubkey = pubkey
        self.aver_client = aver_client
        self.market = market
        self.user_balance_state = user_balance_state

    @staticmethod
    async def load(
        aver_client: AverClient, 
        market: AverMarket, 
        owner: PublicKey, 
        host: PublicKey = AVER_HOST_ACCOUNT,
        program_id: PublicKey = AVER_PROGRAM_ID
        ):
            """
            Initialises an UserMarket object, from Market, Host and Owner public keys

            To refresh data on an already loaded UserMarket use src.refresh.refresh_user_market()

            Args:
                aver_client (AverClient): AverClient object
                market (AverMarket): Corresponding Market object
                owner (PublicKey): Owner of UserMarket account
                host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
                program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

            Returns:
                UserMarket: UserMarket object
            """
            uma, bump = UserMarket.derive_pubkey_and_bump(owner, market.market_pubkey, host, program_id)
            return await UserMarket.load_by_uma(aver_client, uma, market)

    #Should we instead have owners: list[PublicKey] here to allow for different owners
    @staticmethod
    async def load_multiple(
        aver_client: AverClient, 
        markets: list[AverMarket], 
        owner: PublicKey, 
        host: PublicKey = AVER_HOST_ACCOUNT,
        program_id: PublicKey = AVER_PROGRAM_ID,
        ):
            """
            Initialises multiple UserMarket objects, from Market, Host and Owner public keys

            This method is quicker that using UserMarket.load() multiple times

            To refresh data on already loaded UserMarkets use src.refresh.refresh_multiple_user_markets()

            Args:
                aver_client (AverClient): AverClient object
                markets (list[AverMarket]): List of corresponding AverMarket objects (in correct order)
                owner (PublicKey): Owner of UserMarket account
                host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
                program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

            Returns:
                list[UserMarket]: List of UserMarket objects
            """
            umas = [UserMarket.derive_pubkey_and_bump(owner, m.market_pubkey, host, program_id)[0] for m in markets]
            return await UserMarket.load_multiple_by_uma(aver_client, umas, markets)

    @staticmethod
    async def load_by_uma(aver_client: AverClient, pubkey: PublicKey, market: AverMarket):
        """
        Initialises an UserMarket object, from UserMarket account public key

        To refresh data on an already loaded UserMarket use src.refresh.refresh_user_market()

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): UserMarket account public key
            market (AverMarket): AverMarket object

        Returns:
            UserMarket: UserMarket object
        """
        res: UserMarketState = await aver_client.program.account['UserMarket'].fetch(pubkey)

        lamport_balance = await aver_client.request_lamport_balance(res.user)
        token_balance = await aver_client.request_token_balance(aver_client.quote_token, res.user)
        user_balance_state = UserBalanceState(lamport_balance, token_balance)

        if(res.market.to_base58() != market.market_pubkey.to_base58()):
            raise Exception('UserMarket and Market do not match')

        return UserMarket(aver_client, pubkey, res, market, user_balance_state)   
    
    @staticmethod
    async def load_multiple_by_uma(aver_client: AverClient, pubkeys: list[PublicKey], markets: list[AverMarket]):
        res: list[UserMarketState] = await aver_client.program.account['UserMarket'].fetch_multiple(pubkeys)

        user_pubkeys = [u.user for u in res]
        user_balances = (await load_multiple_account_states(aver_client, [], [], [], [], user_pubkeys))['user_balance_states']

        umas: list[UserMarket] = []
        for i, pubkey in enumerate(pubkeys):
            if(res[i].market.to_base58() != markets[i].market_pubkey.to_base58()):
                raise Exception('UserMarket and Market do not match')
            umas.append(UserMarket(aver_client, pubkey, res[i], markets[i], user_balances[i]))
        return umas
    
    @staticmethod
    def get_user_markets_from_account_state(
        aver_client: AverClient, 
        pubkeys: list[PublicKey], 
        user_market_states: list[UserMarketState],
        aver_markets: list[AverMarket],
        user_balance_states: list[UserBalanceState]
        ):
        """
        Returns multiple UserMarket objects from their respective MarketStates, stores and orderbook objects

        Used in refresh.py

        Args:
            aver_client (AverClient): AverClient object
            pubkeys (list[PublicKey]): List of UserMarket account pubkeys
            user_market_states (list[UserMarketState]): List of UserMarketState objects
            aver_markets (list[AverMarket]): List of AverMarket objects
            user_balance_states (list[UserBalanceState]): List of UserBalanceState objects

        Returns:
            list[UserMarket]: List of UserMarket objects
        """
        user_markets: list[UserMarket] = []
        for i, pubkey in enumerate(pubkeys):
            user_market = UserMarket(aver_client, pubkey, user_market_states[i], aver_markets[i], user_balance_states[i])
            user_markets.append(user_market)
        return user_markets
    
    @staticmethod
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
    
    @staticmethod
    def parse_multiple_user_market_state(buffer: list[bytes], aver_client: AverMarket):
        """
        Parses raw onchain data to UserMarketState objects    

        Args:
            buffer (list[bytes]): List of raw bytes coming from onchain
            aver_client (AverMarket): AverClient object

        Returns:
            list[UserMarketState]: List of UserMarketState objects
        """
        return [UserMarket.parse_user_market_state(b, aver_client) for b in buffer]

    @staticmethod
    def derive_pubkey_and_bump(owner: PublicKey, market: PublicKey, host: PublicKey, program_id: PublicKey = AVER_PROGRAM_ID) -> PublicKey:
        """
        Derives PDA for MarketStore public key 

        Args:
            owner (PublicKey): Owner of UserMarket account
            market (PublicKey): Corresponding Market account public key
            host (PublicKey): Host public key
            program_id (PublicKey, optional): _description_. Defaults to AVER_PROGRAM_ID.

        Returns:
            PublicKey: UserMarket account public key
        """
        return PublicKey.find_program_address(
            [bytes('user-market', 'utf-8'), bytes(owner), bytes(market), bytes(host)],
            program_id
        )    

    @staticmethod
    def make_create_user_market_account_instruction(
        aver_client: AverClient,
        market: AverMarket,
        owner: PublicKey,
        host: PublicKey = AVER_HOST_ACCOUNT, 
        number_of_orders: int = None,
        program_id: PublicKey = AVER_PROGRAM_ID
    ):
        """
        Creates instruction for UserMarket account creation.

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            aver_client (AverClient): AverClient object
            market (AverMarket): Corresponding Market object
            owner (PublicKey): Owner of UserMarket account
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            number_of_orders (int, optional): _description_. Defaults to 5*number of market outcomes.
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(number_of_orders is None):
            number_of_orders = market.market_state.number_of_outcomes * 5
        
        uma, uma_bump = UserMarket.derive_pubkey_and_bump(owner, market.market_pubkey, host, program_id)
        user_host_lifetime, uhl_bump = UserHostLifetime.derive_pubkey_and_bump(owner, host, program_id)

        return aver_client.program.instruction['init_user_market'](
            number_of_orders,
            uma_bump, 
            ctx=Context(
                accounts={
                    "user": owner,
                    "user_host_lifetime": user_host_lifetime,
                    "user_market": uma,
                    "market": market.market_pubkey,
                    "host": host,
                    "system_program": SYS_PROGRAM_ID,
                },
            )
        )

    @staticmethod
    async def create_user_market_account(
        aver_client: AverClient,
        market: AverMarket,
        owner: Keypair,
        send_options: TxOpts = None,
        host: PublicKey = AVER_HOST_ACCOUNT,
        number_of_orders: int = None,
        program_id: PublicKey = AVER_PROGRAM_ID
    ):
        """
        Creates UserMarket account.

        Sends instructions on chain

        Args:
            aver_client (AverClient): AverClient object
            market (AverMarket): Correspondign Market object
            owner (Keypair): Owner of UserMarket account
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            number_of_orders (int, optional): _description_. Defaults to 5 * number of market outcomes.
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            RPCResponse: Response
        """
        if(number_of_orders is None):
            number_of_orders = 5 * market.market_state.number_of_outcomes

        ix = UserMarket.make_create_user_market_account_instruction(
            aver_client,
            market,
            owner.public_key,
            host,
            number_of_orders,
            program_id
        )

        if(send_options is None):
            send_options = TxOpts()
        else:
            send_options = TxOpts(
                skip_confirmation=send_options.skip_confirmation,
                skip_preflight=send_options.skip_confirmation,
                preflight_commitment=Finalized,
                max_retries=send_options.max_retries)

        return await sign_and_send_transaction_instructions(
            aver_client,
            [],
            owner,
            [ix],
            send_options,
        )
    
    @staticmethod
    async def get_or_create_user_market_account(
        client: AverClient,
        owner: Keypair,
        market: AverMarket,
        send_options: TxOpts = None,
        quote_token_mint: PublicKey = None,
        host: PublicKey = AVER_HOST_ACCOUNT,
        number_of_orders: int = None,
        referrer: PublicKey = SYS_PROGRAM_ID,
        discount_token: PublicKey = SYS_PROGRAM_ID,
        program_id: PublicKey = AVER_PROGRAM_ID 
    ):
        """
        Attempts to load UserMarket object and creates one if not found

        Args:
            client (AverClient): AverClient object
            owner (Keypair): Owner of UserMarket account
            market (AverMarket): Corresponding AverMarket object
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            quote_token_mint (PublicKey, optional): ATA token mint public key. Defaults to USDC token according to chosen solana network.
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            number_of_orders (int, optional): _description_. Defaults to 5 * number of market outcomes.
            referrer (PublicKey, optional): Referrer account public key. Defaults to SYS_PROGRAM_ID.
            discount_token (PublicKey, optional): _description_. Defaults to SYS_PROGRAM_ID.
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            UserMarket: UserMarket object
        """
        quote_token_mint = quote_token_mint if quote_token_mint is not None else client.quote_token
        if(number_of_orders is None):
            number_of_orders = market.market_state.number_of_outcomes * 5
        
        user_market_pubkey = UserMarket.derive_pubkey_and_bump(owner.public_key, market.market_pubkey, host, program_id)[0]
        try:
            uma = await UserMarket.load(client, market, owner.public_key, host, program_id)
            return uma
        except:
            uhl = await UserHostLifetime.get_or_create_user_host_lifetime(
                client,
                owner,
                send_options,
                quote_token_mint,
                host,
                referrer,
                discount_token,
                program_id
            )

            sig = await UserMarket.create_user_market_account(
                client,
                market,
                owner, 
                send_options,
                host,
                number_of_orders,
                program_id,
            )

            await client.provider.connection.confirm_transaction(
                sig['result'],
                commitment=Finalized
            )

            return await UserMarket.load(
                client, 
                market,  
                owner.public_key,
                host,
                program_id)

    
    @staticmethod
    async def create_uma_and_get_or_create_associated_accounts(
        aver_client: AverClient,
        fee_payer: Keypair,
        owner: PublicKey,
        token_mint: PublicKey = None
    ):
        """
        See src.aver_client.AverClient.get_or_create_associated_token_account()
        """
        token_mint = token_mint if token_mint is not None else aver_client.quote_token
        ata = aver_client.get_or_create_associated_token_account(
            owner,
            fee_payer,
            token_mint
        )

        return ata


    def make_place_order_instruction(
        self,
        outcome_position: int,
        side: Side,
        limit_price: float,
        size: float,
        size_format: SizeFormat,
        user_quote_token_ata: PublicKey,
        order_type: OrderType = OrderType.LIMIT,
        self_trade_behavior: SelfTradeBehavior = SelfTradeBehavior.CANCEL_PROVIDE,
        active_pre_flight_check: bool = False,
    ):
        """
        Creates instruction to place order.

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            outcome_position (int): ID of outcome
            side (Side): Side object (bid or ask)
            limit_price (float): Limit price
            size (float): Size
            size_format (SizeFormat): SizeFormat object (Stake or Payout)
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            order_type (OrderType, optional): OrderType object. Defaults to OrderType.LIMIT.
            self_trade_behavior (SelfTradeBehavior, optional): Behavior when a user's trade is matched with themselves. Defaults to SelfTradeBehavior.CANCEL_PROVIDE.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to False.

        Raises:
            Exception: Cannot place error on closed market

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(self.market.orderbooks is None):
            raise Exception('Cannot place error on closed market')

        if(active_pre_flight_check):
            check_sufficient_lamport_balance(self.user_balance_state)
            check_correct_uma_market_match(self.user_market_state, self.market)
            check_market_active_pre_event(self.market.market_state.market_status)
            #check_uhl_self_excluded(self.user_market_state.user_host_lifetime) - Requires loading UHL
            check_user_market_full(self.user_market_state)
            check_limit_price_error(limit_price, self.market)
            check_outcome_outside_space(outcome_position, self.market)
            check_incorrect_order_type_for_market_order(limit_price, order_type, side, self.market)
            check_stake_noop(size_format, limit_price, side)
            tokens_available_to_buy = self.calculate_tokens_available_to_buy(outcome_position, limit_price)
            tokens_available_to_sell = self.calculate_tokens_available_to_sell(outcome_position, limit_price)
            check_is_order_valid(outcome_position, side, limit_price, size, size_format, tokens_available_to_sell, tokens_available_to_buy)
            check_quote_and_base_size_too_small(self.market, side, size_format, outcome_position, limit_price, size)
            check_user_permission_and_quote_token_limit_exceeded(self.market, self.user_market_state, size, limit_price, size_format)
        
        #Do we need a limit_price_u64 for Python?
        max_base_qty = math.floor(size * (10 ** self.market.market_state.decimals))
        limit_price_u64 = math.ceil(limit_price * (10 ** self.market.market_state.decimals))

        is_binary_market_second_outcome = self.market.market_state.number_of_outcomes == 2 and outcome_position == 1
        orderbook_account_index = outcome_position if not is_binary_market_second_outcome else 0
        orderbook_account = self.market.market_store_state.orderbook_accounts[orderbook_account_index]

        return self.aver_client.program.instruction['place_order'](
            {
                "limit_price": limit_price_u64,
                "size": max_base_qty,
                "size_format": size_format,
                "side": side,
                "order_type": order_type,
                "self_trade_behavior": self_trade_behavior,
                "outcome_id": outcome_position,
            },
            ctx=Context(
                accounts={
                    "user": self.user_market_state.user,
                    "user_host_lifetime": self.user_market_state.user_host_lifetime,
                    "market": self.market.market_pubkey,
                    "market_store": self.market.market_state.market_store,
                    "user_market": self.pubkey,
                    "user": self.user_market_state.user,
                    "user_quote_token_ata": user_quote_token_ata,
                    "quote_vault": self.market.market_state.quote_vault,
                    "orderbook": orderbook_account.orderbook,
                    "bids": orderbook_account.bids,
                    "asks": orderbook_account.asks,
                    "event_queue": orderbook_account.event_queue,
                    "spl_token_program": TOKEN_PROGRAM_ID,
                    "system_program": SYS_PROGRAM_ID,
               },)
        )

    async def place_order(
        self,
        owner: Keypair,
        outcome_position: int,
        side: Side,
        limit_price: float,
        size: float,
        size_format: SizeFormat,
        send_options: TxOpts = None,
        order_type: OrderType = OrderType.LIMIT,
        self_trade_behavior: SelfTradeBehavior = SelfTradeBehavior.CANCEL_PROVIDE,
        active_pre_flight_check: bool = True,  
    ):
        """
        Places order

        Sends instructions on chain

        Args:
            owner (Keypair): Owner of UserMarket account
            outcome_position (int): ID of outcome
            side (Side): Side object (bid or ask)
            limit_price (float): Limit price
            size (float): Size
            size_format (SizeFormat): SizeFormat object (stake or payout)
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            order_type (OrderType, optional): OrderType object. Defaults to OrderType.LIMIT.
            self_trade_behavior (SelfTradeBehavior, optional): Behavior when a user's trade is matched with themselves. Defaults to SelfTradeBehavior.CANCEL_PROVIDE.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to True.

        Raises:
            Exception: Owner must be same as user market owner

        Returns:
            RPCResponse: Response
        """
        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as user market owner')

        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )

        ix = self.make_place_order_instruction(
            outcome_position,
            side, 
            limit_price,
            size,
            size_format,
            user_quote_token_ata,
            order_type,
            self_trade_behavior,
            active_pre_flight_check
        )
        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    def make_cancel_order_instruction(
        self,
        order_id: int,
        outcome_position: int,
        active_pre_flight_check: bool = False,
    ):
        """
        Creates instruction for to cancel order.

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            order_id (int): ID of order to cancel
            outcome_position (int): ID of outcome
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to False.

        Raises:
            Exception: Cannot cancel orders on closed market
            Exception: Insufficient lamport balance
            Exception: Cannot cancel orders in current market status
            Exception: Order ID does not exist in list of open orders

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(self.market.orderbooks is None):
            raise Exception('Cannot cancel orders on closed market')

        if(active_pre_flight_check):
            check_sufficient_lamport_balance(self.user_balance_state)
            check_cancel_order_market_status(self.market.market_state.market_status)
            check_order_exists(self.user_market_state, order_id)
      
        
        is_binary_market_second_outcome = self.market.market_state.number_of_outcomes == 2 and outcome_position == 1
        orderbook_account_index = outcome_position if not is_binary_market_second_outcome else 0
        orderbook_account = self.market.market_store_state.orderbook_accounts[orderbook_account_index]

        return self.aver_client.program.instruction['cancel_order'](
            order_id, 
            orderbook_account_index, 
            ctx=Context(accounts={
                "orderbook": orderbook_account.orderbook,
                "event_queue": orderbook_account.event_queue,
                "bids": orderbook_account.bids,
                "asks": orderbook_account.asks,
                "market": self.market.market_pubkey,
                "user_market": self.pubkey,
                "user": self.user_market_state.user,
                "market_store": self.market.market_state.market_store,
            })
        )
    
    async def cancel_order(
        self,
        fee_payer: Keypair,
        order_id: int,
        outcome_position: int,
        send_options: TxOpts = None,
        active_pre_flight_check: bool = True,
    ):
        """
        Cancels order

        Sends instructions on chain

        Args:
            fee_payer (Keypair): Keypair to pay fee for transaction
            order_id (int): ID of order to cancel
            outcome_position (int): ID of outcome
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to True.

        Returns:
            RPCResponse: Response
        """

        ix = self.make_cancel_order_instruction(
            order_id,
            outcome_position,
            active_pre_flight_check
        )

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            fee_payer,
            [ix],
            send_options
        )

    def make_cancel_all_orders_instruction(
        self, 
        outcome_ids_to_cancel: list[int],
        active_pre_flight_check: bool = False,
        ):
        """
        Creates instruction for to cancelling all orders

        Cancels all orders on particular outcome_ids (not by order_id)

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            outcome_ids_to_cancel (list[int]): List of outcome ids to cancel orders on
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to False.

        Raises:
            Exception: Cannot cancel orders on closed market
            Exception: Insufficient lamport balance
            Exception: Cannot cancel orders in current market status

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(self.market.orderbooks is None):
            raise Exception('Cannot cancel orders on closed market')

        if(active_pre_flight_check):
            check_sufficient_lamport_balance(self.user_balance_state)
            check_cancel_order_market_status(self.market.market_state.market_status)
            for outcome_id in outcome_ids_to_cancel:
                check_outcome_has_orders(outcome_id, self.user_market_state)

        remaining_accounts: list[AccountMeta] = []
        for i, accounts in enumerate(self.market.market_store_state.orderbook_accounts):
            if(not outcome_ids_to_cancel.__contains__(i)):
                continue
            remaining_accounts += [AccountMeta(
                pubkey=accounts.orderbook,
                is_signer=False,
                is_writable=True,
            )]
            remaining_accounts += [AccountMeta(
                pubkey=accounts.event_queue,
                is_signer=False,
                is_writable=True,
            )]
            remaining_accounts += [AccountMeta(
                pubkey=accounts.bids,
                is_signer=False,
                is_writable=True,
            )]
            remaining_accounts += [AccountMeta(
                pubkey=accounts.asks,
                is_signer=False,
                is_writable=True,
            )]
        
        chunk_size = 5
        chunked_outcome_ids = chunk(outcome_ids_to_cancel, chunk_size)
        chunked_remaining_accounts = chunk(remaining_accounts, chunk_size * 4)

        ixs = []

        for i, outcome_ids in enumerate(chunked_outcome_ids):
            ixs.append(
                self.aver_client.program.instruction['cancel_all_orders'](
                    outcome_ids,
                    ctx=Context(
                        accounts={
                                "user_market": self.pubkey,
                                "market": self.market.market_pubkey,
                                "user": self.user_market_state.user,
                                "market_store": self.market.market_state.market_store,
                            },
                        remaining_accounts = chunked_remaining_accounts[i],
                        )
                    )
            )

        return ixs
    
    async def cancel_all_orders(
        self,
        fee_payer: Keypair, 
        outcome_ids_to_cancel: list[int], 
        send_options: TxOpts = None,
        active_pre_flight_check: bool = True,
    ):
        """
        Cancels all orders on particular outcome_ids (not by order_id)

        Sends instructions on chain

        Args:
            fee_payer (Keypair): Keypair to pay fee for transaction
            outcome_ids_to_cancel (list[int]): List of outcome ids to cancel orders on
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to True.

        Returns:
            RPCResponse: Response
        """
        ixs = self.make_cancel_all_orders_instruction(outcome_ids_to_cancel, active_pre_flight_check)

        sigs = await gather(
            *[sign_and_send_transaction_instructions(
                self.aver_client,
                [],
                fee_payer,
                [ix],
                send_options
            ) for ix in ixs]
            )
        return sigs

    def make_deposit_token_instruction(self, amount: int, user_quote_token_ata: PublicKey):
        """
        COMING SOON

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            amount (int): amount
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)

        Returns:
            TransactionInstruction: TransactionInstruction
        """
        return self.aver_client.program.instruction['deposit_tokens'](
            amount,
            ctx=Context(
                accounts={
                    "user": self.user_market_state.user,
                    "user_market": self.pubkey,
                    "user_quote_token_ata": user_quote_token_ata,
                    "market": self.market.market_pubkey,
                    "quote_vault": self.market.market_state.quote_vault,
                    "spl_token_program": TOKEN_PROGRAM_ID,
                },
            )
        )
    
    async def deposit_tokens(self, owner: Keypair, amount: int, send_options: TxOpts = None):
        """
        COMING SOON

        Sends instructions on chain

        Args:
            owner (Keypair): Owner of UserMarket account
            amount (int): amount
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.

        Raises:
            Exception: Owner must be same as UMA owner

        Returns:
            RPCResponse: Response
        """
        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as UMA owner')

        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )
        
        ix = self.make_deposit_token_instruction(amount, user_quote_token_ata)

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )


    def make_withdraw_idle_funds_instruction(
        self,
        user_quote_token_ata: PublicKey,
        amount: float = None,
    ):
        """
        Creates instruction for withdrawing funds in ATA 

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            amount (float, optional): amount. Defaults to maximum available funds.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(amount is None):
            amount = self.calculate_funds_available_to_withdraw()
        
        return self.aver_client.program.instruction['withdraw_tokens'](
            amount,
            ctx=Context(
                accounts={
                    "market": self.market.market_pubkey,
                    "user_market": self.pubkey,
                    "user": self.user_market_state.user,
                    "user_quote_token_ata": user_quote_token_ata,
                    "quote_vault": self.market.market_state.quote_vault,
                    "vault_authority": self.market.market_state.vault_authority,
                    "spl_token_program": TOKEN_PROGRAM_ID,
                },
            )
        )
    
    async def withdraw_idle_funds(self, owner: Keypair, send_options: TxOpts = None, amount: float = None):
        """
        Withdraws idle funds in ATA

        Sends instructions on chain

        Args:
            owner (Keypair): Owner of UserMarket account
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            amount (float, optional): amount. Defaults to None.

        Raises:
            Exception: Owner must be same as UMA owner

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )
        
        ix = self.make_withdraw_idle_funds_instruction(user_quote_token_ata, amount)

        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as UMA owner')

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    def make_collect_instruction(self):
        """
        COMING SOON

        Returns TransactionInstruction object only. Does not send transaction.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        user_quote_token_ata = get_associated_token_address(self.market.market_state.quote_token_mint, self.user_market_state.user)

        return self.aver_client.program.instruction['collect'](True,
        ctx=Context(
            accounts={
                "market": self.market.market_pubkey,
                "user_market": self.pubkey,
                "user": self.user_market_state.user,
                "user_quote_token_ata": user_quote_token_ata,
                "quote_vault": self.market.market_state.quote_vault,
                "vault_authority": self.market.market_state.vault_authority,
                "spl_token_program": TOKEN_PROGRAM_ID,
                }
            )
        )
    
    async def collect(self, owner: Keypair, send_options: TxOpts = None):
        """
        COMING SOON

        Sends instructions on chain

        Args:
            owner (Keypair): Owner of UserMarket account
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.

        Raises:
            Exception: Owner must be same as UMA owner

        Returns:
            RPCResponse: Response
        """
        ix = self.make_collect_instruction()

        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as UMA owner')

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    def calculate_funds_available_to_withdraw(self):
        """
        Calculates idle funds available to withdraw

        Returns:
            int: Tokens available to withdraw
        """
        return min([o.free for o in self.user_market_state.outcome_positions] + [self.user_market_state.net_quote_tokens_in])

    def calculate_funds_available_to_collect(self, winning_outcome: int):
        """
        Calculate funds won if a particular outcome wins

        Args:
            winning_outcome (int): Winning outcome ID

        Returns:
            int: Tokens won
        """
        winning_outcome_position = self.user_market_state.outcome_positions[winning_outcome]
        return winning_outcome_position.free + winning_outcome_position.locked

    def calculate_exposures(self):
        """
        Calcualtes exposures for every possible outcome

        The exposure on a particular outcome is the profit/loss if that outcome wins

        Returns:
            list[int]: List of exposures
        """
        net_quote_tokens_in = self.user_market_state.net_quote_tokens_in
        return [o.free + o.locked - net_quote_tokens_in for o in self.user_market_state.outcome_positions]

    #TODO - UMA listener

    #TODO - Add close instructions

    # def get_fee_tier_position(self):
    #     fee_tier_last_checked =  self.user_market_state.fee_tier_last_checked
    #     if(fee_tier_last_checked == FeeTier.BASE):
    #         return 0
    #     if(fee_tier_last_checked == FeeTier.AVER2):
    #         return 1
    #     if(fee_tier_last_checked == FeeTier.AVER3):
    #         return 2
    #     return 0

    def calculate_tokens_available_to_sell(self, outcome_index: int, price: float):
        """
        Calculates tokens available to sell on a particular outcome

        Args:
            outcome_index (int): Outcome ID
            price (float): Price

        Returns:
            float: Token amount
        """
        return self.user_market_state.outcome_positions[outcome_index].free + price * self.user_balance_state.token_balance
    
    def calculate_tokens_available_to_buy(self, outcome_index: int, price: float):
        """
         Calculates tokens available to buy on a particular outcome

        Args:
            outcome_index (int): Outcome ID
            price (float): Price

        Returns:
            float: Token amount
        """
        filtered_outcomes = deepcopy(self.user_market_state.outcome_positions)
        del filtered_outcomes[outcome_index]
        min_free_tokens_except_outcome_index  = min([op.free for op in filtered_outcomes])

        return min_free_tokens_except_outcome_index + price * self.user_balance_state.token_balance
    
    def calculate_min_free_outcome_positions(self):
        return min([o.free for o in self.user_market_state.outcome_positions])
