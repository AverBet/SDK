from copy import deepcopy
from pydash import chunk
from .market import AverMarket
from solana.publickey import PublicKey
from asyncio import gather
from .checks import *
from solana.transaction import AccountMeta
from solana.keypair import Keypair
from .version_checks import check_if_instruction_is_out_of_date_with_idl
from solana.system_program import SYS_PROGRAM_ID
from spl.token.constants import TOKEN_PROGRAM_ID
from anchorpy import Context, Program
from .user_host_lifetime import UserHostLifetime
from .aver_client import AverClient
from .utils import get_version_of_account_type_in_program, load_multiple_bytes_data, sign_and_send_transaction_instructions, load_multiple_account_states, parse_user_market_state
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed
from .data_classes import UserHostLifetimeState, UserMarketState, UserBalanceState
from .constants import AVER_HOST_ACCOUNT, AVER_PROGRAM_IDS, CANCEL_ALL_ORDERS_INSTRUCTION_CHUNK_SIZE
from .enums import AccountTypes, OrderType, SelfTradeBehavior, Side, SizeFormat
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
    user_host_lifetime: UserHostLifetime
    """
    UserHostLifetime object
    """


    def __init__(self, aver_client: AverClient, pubkey: PublicKey, user_market_state: UserMarketState, market: AverMarket, user_balance_state: UserBalanceState, user_host_lifetime: UserHostLifetime):
        """
         Initialise an UserMarket object. Do not use this function; use UserMarket.load() instead

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): UserMarket public key
            user_market_state (UserMarketState): UserMarketState object
            market (AverMarket): Market object
            user_balance_state (UserBalanceState): UserBalanceState object
            user_host_lifetime (UserHostLifetime): UserHostLifetime object
        """
        self.user_market_state = user_market_state
        self.pubkey = pubkey
        self.aver_client = aver_client
        self.market = market
        self.user_balance_state = user_balance_state
        self.user_host_lifetime = user_host_lifetime
        self.program_id = market.program_id

    @staticmethod
    async def load(
            aver_client: AverClient, 
            market: AverMarket, 
            owner: PublicKey, 
            host: PublicKey = AVER_HOST_ACCOUNT,
        ):
            """
            Initialises an UserMarket object from Market, Host and Owner public keys

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
            uma, bump = UserMarket.derive_pubkey_and_bump(owner, market.market_pubkey, host, market.program_id)
            uhl = UserHostLifetime.derive_pubkey_and_bump(owner, host, market.program_id)[0]
            return await UserMarket.load_by_uma(aver_client, uma, market, uhl)

    @staticmethod
    async def load_multiple(
            aver_client: AverClient, 
            markets: list[AverMarket], 
            owners: list[PublicKey], 
            host: PublicKey = AVER_HOST_ACCOUNT,
        ):
            """
            Initialises multiple UserMarket objects from Market, Host and Owner public keys

            This method is more highly optimized and faster than using UserMarket.load() multiple times.

            To refresh data on already loaded UserMarkets use src.refresh.refresh_multiple_user_markets()

            Args:
                aver_client (AverClient): AverClient object
                markets (list[AverMarket]): List of corresponding AverMarket objects (in correct order)
                owner (PublicKey): List of owners of UserMarket account
                host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
                program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

            Returns:
                list[UserMarket]: List of UserMarket objects
            """
            umas = []
            for i, m in enumerate(markets):
                program_id = m.program_id
                umas.append(UserMarket.derive_pubkey_and_bump(owners[i], m.market_pubkey, host, program_id)[0])
            uhls = []
            for i, o in enumerate(owners):
                uhls.append(UserHostLifetime.derive_pubkey_and_bump(o, host, markets[i].program_id)[0])
            return await UserMarket.load_multiple_by_uma(aver_client, umas, markets, uhls)

    @staticmethod
    async def load_by_uma(
            aver_client: AverClient,
            pubkey: PublicKey,
            market: (AverMarket or PublicKey),
            uhl: PublicKey,
        ):
        """
        Initialises an UserMarket object from UserMarket account public key

        To refresh data on an already loaded UserMarket use src.refresh.refresh_user_market()

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): UserMarket account public key
            market (AverMarket or PublicKey): AverMarket object or AverMarket public key
            uhl (PublicKey): UserHostLifetime account

        Returns:
            UserMarket: UserMarket object
        """
        user_market = await UserMarket.load_multiple_by_uma(aver_client, [pubkey], [market], [uhl])
        return user_market[0]
    
    @staticmethod
    async def load_multiple_by_uma(
            aver_client: AverClient,
            pubkeys: list[PublicKey],
            markets: list[AverMarket],
            uhls: list[PublicKey]
        ):
        """
        Initialises an multiple UserMarket objects from a list of UserMarket account public keys

        To refresh data on an already loaded UserMarket use src.refresh.refresh_user_markets()

        Args:
            aver_client (AverClient): AverClient object 
            pubkeys (list[PublicKey]): List of UserMarket account public keys
            markets (list[AverMarket]): List of AverMarket objects
            uhls (list[PublicKey]): List of UserHostLifetime  account public keys

        Raises:
            Exception: UserMarket and market do not match

        Returns:
            list[UserMarket]: List of UserMarket objects
        """
        account_buffers = await load_multiple_bytes_data(aver_client.connection, pubkeys, [], True)
        programs = await gather(*[aver_client.get_program_from_program_id(m.program_id) for m in markets])
        res: list[UserMarketState] = UserMarket.parse_multiple_user_market_state(account_buffers, aver_client, programs)
        uhls = await UserHostLifetime.load_multiple(aver_client, uhls)

        user_pubkeys = [u.user for u in res]
        user_balances = (await load_multiple_account_states(aver_client, [], [], [], [], user_pubkeys))['user_balance_states']

        umas: list[UserMarket] = []
        for i, pubkey in enumerate(pubkeys):
            if(res[i].market.to_base58() != markets[i].market_pubkey.to_base58()):
                raise Exception('UserMarket and Market do not match')
            umas.append(UserMarket(aver_client, pubkey, res[i], markets[i], user_balances[i], uhls[i]))
        return umas
    
    @staticmethod
    def get_user_markets_from_account_state(
            aver_client: AverClient, 
            pubkeys: list[PublicKey], 
            user_market_states: list[UserMarketState],
            aver_markets: list[AverMarket],
            user_balance_states: list[UserBalanceState],
            user_host_lifetime_states: list[UserHostLifetimeState],
            user_host_lifetime_pubkeys: list[PublicKey]
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
            user_host_lifetime_states: (List[UserHostLifetimeState]): List of UserHostLifetimeState objects
            user_host_lifetime_pubkeys (list[PublicKey]): List of UserHostLifetime public keys

        Returns:
            list[UserMarket]: List of UserMarket objects
        """
        user_markets: list[UserMarket] = []
        for i, pubkey in enumerate(pubkeys):
            user_market = UserMarket(aver_client, pubkey, user_market_states[i], aver_markets[i], user_balance_states[i], UserHostLifetime(aver_client, user_host_lifetime_pubkeys[i],user_host_lifetime_states[i]))
            user_markets.append(user_market)
        return user_markets
    
    
    @staticmethod
    def parse_multiple_user_market_state(
            buffer: list[bytes],
            aver_client: AverMarket,
            programs: list[Program]
        ):
        """
        Parses raw onchain data to UserMarketState objects    

        Args:
            buffer (list[bytes]): List of raw bytes coming from onchain
            aver_client (AverMarket): AverClient object

        Returns:
            list[UserMarketState]: List of UserMarketState objects
        """
        return [parse_user_market_state(b, aver_client, programs[i]) for i, b in enumerate(buffer)]

    @staticmethod
    def derive_pubkey_and_bump(
            owner: PublicKey,
            market: PublicKey,
            host: PublicKey,
            program_id: PublicKey = AVER_PROGRAM_IDS[0]
        ) -> PublicKey:
        """
        Derives PDA (Program Derived Account) for UserMarket public key given a user, host and market

        Args:
            owner (PublicKey): Owner of UserMarket account
            market (PublicKey): Corresponding Market account public key
            host (PublicKey): Host public key
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            PublicKey: UserMarket account public key
        """

        return PublicKey.find_program_address(
            [bytes('user-market', 'utf-8'), bytes(owner), bytes(market), bytes(host)],
            program_id
        )    

    @staticmethod
    async def make_create_user_market_account_instruction(
            aver_client: AverClient,
            market: AverMarket,
            owner: PublicKey,
            host: PublicKey = AVER_HOST_ACCOUNT, 
            number_of_orders: int = None,
            program_id: PublicKey = AVER_PROGRAM_IDS[0]
        ):
        """
        Creates instruction for UserMarket account creation

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

        program = await aver_client.get_program_from_program_id(program_id)

        # check_if_instruction_is_out_of_date_with_idl('place_order', program)

        #Logic to return correct instruction based on ProgramID
        if(program_id.to_base58() == ''):
            #return program.instruction()...
            return ''
        else:
            return program.instruction['init_user_market'](
                number_of_orders,
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
            owner: Keypair = None,
            send_options: TxOpts = None,
            host: PublicKey = AVER_HOST_ACCOUNT,
            number_of_orders: int = None,
            program_id: PublicKey = None
        ):
        """
        Creates UserMarket account

        Sends instructions on chain

        Args:
            aver_client (AverClient): AverClient object
            market (AverMarket): Correspondign Market object
            owner (Keypair): Owner of UserMarket account. Defaults to AverClient wallet
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            number_of_orders (int, optional): _description_. Defaults to 5 * number of market outcomes.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Returns:
            RPCResponse: Response
        """
        if(number_of_orders is None):
            number_of_orders = 5 * market.market_state.number_of_outcomes

        if(owner is None):
            owner = aver_client.owner
        
        if(program_id is None):
            program_id = market.program_id

        ix = await UserMarket.make_create_user_market_account_instruction(
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
                preflight_commitment=Confirmed,
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
            market: AverMarket,
            owner: Keypair = None,
            send_options: TxOpts = None,
            quote_token_mint: PublicKey = None,
            host: PublicKey = AVER_HOST_ACCOUNT,
            number_of_orders: int = None,
            referrer: PublicKey = SYS_PROGRAM_ID,
            discount_token: PublicKey = SYS_PROGRAM_ID,
        ):
        """
        Attempts to load UserMarket object or creates one if not one is not found

        Args:
            client (AverClient): AverClient object
            market (AverMarket): Corresponding AverMarket object
            owner (Keypair): Owner of UserMarket account. Defaults to AverClient wallet
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
        
        if(owner is None):
            owner = client.owner
        
        user_market_pubkey = UserMarket.derive_pubkey_and_bump(owner.public_key, market.market_pubkey, host, market.program_id)[0]
        try:
            uma = await UserMarket.load(client, market, owner.public_key, host)
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
                market.program_id,
            )

            sig = await UserMarket.create_user_market_account(
                client,
                market,
                owner, 
                send_options,
                host,
                number_of_orders,
                market.program_id
            )

            await client.provider.connection.confirm_transaction(
                sig['result'],
                commitment=Confirmed
            )

            return await UserMarket.load(
                client, 
                market,  
                owner.public_key,
                host,
                )



    async def make_place_order_instruction(
            self,
            outcome_id: int,
            side: Side,
            limit_price: float,
            size: float,
            size_format: SizeFormat,
            user_quote_token_ata: PublicKey,
            order_type: OrderType = OrderType.LIMIT,
            self_trade_behavior: SelfTradeBehavior = SelfTradeBehavior.CANCEL_PROVIDE,
            active_pre_flight_check: bool = False,
            program_id: PublicKey = None,
        ):
        """
        Creates instruction to place order.

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            outcome_id (int): ID of outcome
            side (Side): Side object (bid or ask)
            limit_price (float): Limit price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument
            size (float): Size - in the format specified in size_format. This value is in number of 'tokens' - i.e. 20.45 => 20.45 USDC, the SDK handles the conversion to u64 token units (e.g. to 20,450,000 as USDC is a 6 decimal place token)
            size_format (SizeFormat): SizeFormat object (Stake or Payout)
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            order_type (OrderType, optional): OrderType object. Defaults to OrderType.LIMIT.
            self_trade_behavior (SelfTradeBehavior, optional): Behavior when a user's trade is matched with themselves. Defaults to SelfTradeBehavior.CANCEL_PROVIDE.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to False.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Raises:
            Exception: Cannot place error on closed market

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(self.market.orderbooks is None):
            raise Exception('Cannot place error on closed market')

        if(program_id is None):
            program_id = self.market.program_id

        program = await self.aver_client.get_program_from_program_id(program_id)

        if(active_pre_flight_check):
            check_if_instruction_is_out_of_date_with_idl('place_order', program)
            check_sufficient_lamport_balance(self.user_balance_state)
            check_correct_uma_market_match(self.user_market_state, self.market)
            check_market_active_pre_event(self.market.market_state.market_status)
            check_uhl_self_excluded(self.user_host_lifetime)
            check_user_market_full(self.user_market_state)
            check_limit_price_error(limit_price, self.market)
            check_outcome_outside_space(outcome_id, self.market)
            check_incorrect_order_type_for_market_order(limit_price, order_type, side, self.market)
            check_stake_noop(size_format, limit_price, side)
            tokens_available_to_buy = self.calculate_tokens_available_to_buy(outcome_id, limit_price)
            tokens_available_to_sell = self.calculate_tokens_available_to_sell(outcome_id, limit_price)
            check_is_order_valid(self.market, outcome_id, side, limit_price, size, size_format, tokens_available_to_sell, tokens_available_to_buy)
            check_quote_and_base_size_too_small(self.market, side, size_format, outcome_id, limit_price, size)
            check_user_permission_and_quote_token_limit_exceeded(self.market, self.user_market_state, size, limit_price, size_format)
        
        max_base_qty = math.floor(size * (10 ** self.market.market_state.decimals))
        limit_price_u64 = math.ceil(limit_price * (10 ** self.market.market_state.decimals))

        is_binary_market_second_outcome = self.market.market_state.number_of_outcomes == 2 and outcome_id == 1
        orderbook_account_index = outcome_id if not is_binary_market_second_outcome else 0
        orderbook_account = self.market.market_store_state.orderbook_accounts[orderbook_account_index]

        if self.market.market_state.in_play_queue == None or self.market.market_state.in_play_queue == SYS_PROGRAM_ID:
            in_play_queue = Keypair().public_key
        else:
            in_play_queue = self.market.market_state.in_play_queue

        #Logic to return correct instruction based on ProgramID
        if(program_id.to_base58() == ''):
            #return program.instruction()...
            return ''
        else:        
            return program.instruction['place_order'](
                {
                    "limit_price": limit_price_u64,
                    "size": max_base_qty,
                    "size_format": size_format,
                    "side": side,
                    "order_type": order_type,
                    "self_trade_behavior": self_trade_behavior,
                    "outcome_id": outcome_id,
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
                        "vault_authority": self.market.market_state.vault_authority,
                        "orderbook": orderbook_account.orderbook,
                        "bids": orderbook_account.bids,
                        "asks": orderbook_account.asks,
                        "event_queue": orderbook_account.event_queue,
                        "in_play_queue": in_play_queue,
                        "spl_token_program": TOKEN_PROGRAM_ID,
                        "system_program": SYS_PROGRAM_ID,
                        "vault_authority": self.market.market_state.vault_authority
                },)
            )

    async def place_order(
            self,
            owner: Keypair,
            outcome_id: int,
            side: Side,
            limit_price: float,
            size: float,
            size_format: SizeFormat,
            send_options: TxOpts = None,
            order_type: OrderType = OrderType.LIMIT,
            self_trade_behavior: SelfTradeBehavior = SelfTradeBehavior.CANCEL_PROVIDE,
            active_pre_flight_check: bool = True,  
            program_id: PublicKey = None,
        ):
        """
        Places a new order

        Sends instructions on chain

        Args:
            owner (Keypair): Owner of UserMarket account. Pays transaction fees.
            outcome_id (int): index of the outcome intended to be traded
            side (Side): Side object (bid/back/buy or ask/lay/sell)
            limit_price (float): Limit price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument
            size (float): Size - in the format specified in size_format. This value is in number of 'tokens' - i.e. 20.45 => 20.45 USDC, the SDK handles the conversion to u64 token units (e.g. to 20,450,000 as USDC is a 6 decimal place token)
            size_format (SizeFormat): SizeFormat object (Stake or Payout formats supported)
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            order_type (OrderType, optional): OrderType object. Defaults to OrderType.LIMIT. Other options include OrderType.IOC, OrderType.KILL_OR_FILL, OrderType.POST_ONLY.
            self_trade_behavior (SelfTradeBehavior, optional): Behavior when a user's trade is matched with themselves. Defaults to SelfTradeBehavior.CANCEL_PROVIDE. Other options include SelfTradeBehavior.DECREMENT_TAKE and SelfTradeBehavior.ABORT_TRANSACTION.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to True. 
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Raises:
            Exception: Owner must be same as user market owner

        Returns:
            RPCResponse: Response
        """
        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as user market owner')

        if(program_id is None):
            program_id = self.market.program_id
        
        await self.update_all_accounts_if_required(owner)

        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )

        ix = await self.make_place_order_instruction(
            outcome_id,
            side, 
            limit_price,
            size,
            size_format,
            user_quote_token_ata,
            order_type,
            self_trade_behavior,
            active_pre_flight_check,
            program_id
        )
        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    async def make_cancel_order_instruction(
            self,
            order_id: int,
            outcome_id: int,
            active_pre_flight_check: bool = False,
            program_id: PublicKey = None
        ):
        """
        Creates instruction for to cancel order.

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            order_id (int): ID of order to cancel
            outcome_id (int): ID of outcome
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to False.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

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
        
        if(program_id is None):
            program_id = self.market.program_id

        program = await self.aver_client.get_program_from_program_id(program_id)

        # find the corresponding order id incase they pass in aaob order in by accident
        order_from_aaob_id = self.get_order_from_aaob_order_id(order_id)
        order_id = order_from_aaob_id.order_id if order_from_aaob_id else order_id

        if(active_pre_flight_check):
            check_if_instruction_is_out_of_date_with_idl('cancel_order', program)
            check_sufficient_lamport_balance(self.user_balance_state)
            check_cancel_order_market_status(self.market.market_state.market_status)
            check_order_exists(self.user_market_state, order_id)

        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )
      
        is_binary_market_second_outcome = self.market.market_state.number_of_outcomes == 2 and outcome_id == 1
        orderbook_account_index = outcome_id if not is_binary_market_second_outcome else 0
        orderbook_account = self.market.market_store_state.orderbook_accounts[orderbook_account_index]

        if self.market.market_state.in_play_queue == None or self.market.market_state.in_play_queue == SYS_PROGRAM_ID:
            in_play_queue = Keypair().public_key
        else:
            in_play_queue = self.market.market_state.in_play_queue

        if self.user_market_state.version == 0:
            aaob_order_id = order_id
            order_id = 0
        else:
            # if the order is from 1.0 but we migrated to 1.2, we need to pass in this value
            aaob_order_id = next((order.aaob_order_id for order in self.user_market_state.orders if order.aaob_order_id == order_id), None)

        #Logic to return correct instruction based on ProgramID
        if(program_id.to_base58() == ''):
            #return program.instruction()...
            return ''
        else:
            return program.instruction['cancel_order'](
                {
                    "order_id": order_id, 
                    "outcome_id": orderbook_account_index,
                    "aaob_order_id": aaob_order_id
                },
                ctx=Context(accounts={
                    "orderbook": orderbook_account.orderbook,
                    "event_queue": orderbook_account.event_queue,
                    "bids": orderbook_account.bids,
                    "asks": orderbook_account.asks,
                    "market": self.market.market_pubkey,
                    "user_market": self.pubkey,
                    "user": self.user_market_state.user,
                    "market_store": self.market.market_state.market_store,
                    "user_quote_token_ata": user_quote_token_ata,
                    "quote_vault": self.market.market_state.quote_vault,
                    "vault_authority": self.market.market_state.vault_authority,
                    "spl_token_program": TOKEN_PROGRAM_ID,
                    "in_play_queue": in_play_queue
                })
            )
        
    async def cancel_order(
        self,
        order_id: int,
        outcome_id: int,
        fee_payer: Keypair = None,
        send_options: TxOpts = None,
        active_pre_flight_check: bool = True,
        program_id: PublicKey = None
    ):
        """
        Cancels order

        Sends instructions on chain

        Args:
            fee_payer (Keypair): Keypair to pay fee for transaction. Defaults to AverClient wallet
            order_id (int): ID of order to cancel
            outcome_id (int): ID of outcome
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to True.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Returns:
            RPCResponse: Response
        """

        if(fee_payer is None):
            fee_payer = self.aver_client.owner

        if(program_id is None):
            program_id = self.market.program_id
        
        sig = await self.update_all_accounts_if_required(fee_payer)
        #await self.market.aver_client.connection.confirm_transaction(sig['result'], Finalized)

        ix = await self.make_cancel_order_instruction(
            order_id,
            outcome_id,
            active_pre_flight_check,
            program_id
        )

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            fee_payer,
            [ix],
            send_options
        )

    async def make_cancel_all_orders_instruction(
        self, 
        outcome_ids_to_cancel: list[int],
        active_pre_flight_check: bool = False,
        program_id: PublicKey = None,
        ):
        """
        Creates instruction for to cancelling all orders

        Cancels all orders on particular outcome_ids (not by order_id)

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            outcome_ids_to_cancel (list[int]): List of outcome ids to cancel orders on
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to False.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Raises:
            Exception: Cannot cancel orders on closed market
            Exception: Insufficient lamport balance
            Exception: Cannot cancel orders in current market status

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(self.market.orderbooks is None):
            raise Exception('Cannot cancel orders on closed market')

        if(program_id is None):
            program_id = self.market.program_id

        program = await self.aver_client.get_program_from_program_id(program_id)

        if(active_pre_flight_check):
            check_if_instruction_is_out_of_date_with_idl('cancel_all_orders', program)
            check_sufficient_lamport_balance(self.user_balance_state)
            check_cancel_order_market_status(self.market.market_state.market_status)
            for outcome_id in outcome_ids_to_cancel:
                check_outcome_has_orders(outcome_id, self.user_market_state)

        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )

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
        
        chunk_size = CANCEL_ALL_ORDERS_INSTRUCTION_CHUNK_SIZE
        chunked_outcome_ids = chunk(outcome_ids_to_cancel, chunk_size)
        chunked_remaining_accounts = chunk(remaining_accounts, chunk_size * 4)

        ixs = []

        if self.market.market_state.in_play_queue == None or self.market.market_state.in_play_queue == SYS_PROGRAM_ID:
            in_play_queue = Keypair().public_key
        else:
            in_play_queue = self.market.market_state.in_play_queue

        for i, outcome_ids in enumerate(chunked_outcome_ids):
            #Logic to return correct instruction based on ProgramID
            ix = None
            if(program_id.to_base58() == ''):
                #ix = program.instruction()...
                pass
            else:
                ix = program.instruction['cancel_all_orders'](
                    outcome_ids,
                    ctx=Context(
                        accounts={
                                "user_market": self.pubkey,
                                "market": self.market.market_pubkey,
                                "user": self.user_market_state.user,
                                "market_store": self.market.market_state.market_store,
                                "user_quote_token_ata": user_quote_token_ata,
                                "quote_vault": self.market.market_state.quote_vault,
                                "vault_authority": self.market.market_state.vault_authority,
                                "spl_token_program": TOKEN_PROGRAM_ID,
                                "in_play_queue": in_play_queue
                            },
                        remaining_accounts = chunked_remaining_accounts[i],
                        )
                    )
            ixs.append(ix)

        return ixs
    
    async def cancel_all_orders(
        self,
        outcome_ids_to_cancel: list[int], 
        fee_payer: Keypair = None, 
        send_options: TxOpts = None,
        active_pre_flight_check: bool = True,
        program_id: PublicKey = None,
    ):
        """
        Cancels all orders on particular outcome_ids (not by order_id)

        Sends instructions on chain

        Args:
            fee_payer (Keypair): Keypair to pay fee for transaction. Defaults to AverClient wallet
            outcome_ids_to_cancel (list[int]): List of outcome ids to cancel orders on
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            active_pre_flight_check (bool, optional): Clientside check if order will success or fail. Defaults to True.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Returns:
            RPCResponse: Response
        """
        if(fee_payer is None):
            fee_payer = self.aver_client.owner
        
        if(program_id is None):
            program_id = self.market.program_id

        sig = await self.update_all_accounts_if_required(fee_payer)
        #await self.market.aver_client.connection.confirm_transaction(sig['result'], Finalized)

        ixs = await self.make_cancel_all_orders_instruction(outcome_ids_to_cancel, active_pre_flight_check, program_id)

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

    async def make_withdraw_idle_funds_instruction(
        self,
        user_quote_token_ata: PublicKey,
        amount: float = None,
        program_id: PublicKey = None
    ):
        """
        Creates instruction for withdrawing funds in ATA 

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            amount (float, optional): amount. Defaults to maximum available funds.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(amount is None):
            amount = self.calculate_funds_available_to_withdraw()

        if(program_id is None):
            program_id = self.market.program_id
        
        program = await self.aver_client.get_program_from_program_id(program_id)

        check_if_instruction_is_out_of_date_with_idl('cancel_all_orders', program)
        
        #Logic to return correct instruction based on ProgramID
        if(program_id.to_base58() == ''):
            #return program.instruction()...
            return ''
        else:        
            return program.instruction['withdraw_tokens'](
                amount,
                ctx=Context(
                    accounts={
                        "market": self.market.market_pubkey,
                        "user_market": self.pubkey,
                        "user": self.user_market_state.user,
                        "user_quote_token_ata": user_quote_token_ata,
                        "quote_vault": self.market.market_state.quote_vault,
                        "vault_authority": self.market.market_state.vault_authority,
                        "spl_token_program": TOKEN_PROGRAM_ID
                    },
                )
            )
    
    async def withdraw_idle_funds(self, owner: Keypair, send_options: TxOpts = None, amount: float = None, program_id: PublicKey = None):
        """
        Withdraws idle funds in ATA

        Sends instructions on chain

        Args:
            owner (Keypair): Owner of UserMarket account
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            amount (float, optional): amount. Defaults to None.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Raises:
            Exception: Owner must be same as UMA owner

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        sig = await self.update_all_accounts_if_required(owner)
        #await self.market.aver_client.connection.confirm_transaction(sig['result'], Finalized)

        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )

        if(program_id is None):
            program_id = self.market.program_id
        
        ix = await self.make_withdraw_idle_funds_instruction(user_quote_token_ata, amount, program_id)

        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as UMA owner')

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    async def make_neutralize_positions_instruction(
        self,
        outcome_id: int,
        program_id: PublicKey = None,
    ):
        """
        Format instruction to neutralise the outcome position
   
        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            outcome_id (int): Outcome ids to neutralize positions on
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(program_id is None):
            program_id = self.market.program_id
        
        program = await self.aver_client.get_program_from_program_id(program_id)

        user_quote_token_ata = await self.market.aver_client.get_or_create_associated_token_account(
            self.user_market_state.user,
            self.market.aver_client.owner,
            self.market.market_state.quote_token_mint
        )

        check_if_instruction_is_out_of_date_with_idl('cancel_all_orders', program)

         #Logic to return correct instruction based on ProgramID
        if(program_id.to_base58() == ''):
            #return program.instruction()...
            return ''
        else:       
            return program.instruction['neutralize_outcome_position'](
                outcome_id,
                ctx=Context(
                    accounts={
                        "market": self.market.market_pubkey,
                        "user_market": self.pubkey,
                        "user": self.user_market_state.user,
                        "user_host_lifetime": self.user_host_lifetime.pubkey,
                        "user_quote_token_ata": user_quote_token_ata,
                        "quote_vault": self.market.market_state.quote_vault,
                        "market_store": self.market.market_state.market_store,
                        "orderbook": self.market.market_store_state.orderbook_accounts[outcome_id].orderbook,
                        "bids": self.market.market_store_state.orderbook_accounts[outcome_id].bids,
                        "asks": self.market.market_store_state.orderbook_accounts[outcome_id].asks,
                        "event_queue": self.market.market_store_state.orderbook_accounts[outcome_id].event_queue,
                        "system_program": SYS_PROGRAM_ID,
                        "spl_token_program": TOKEN_PROGRAM_ID,
                        "vault_authority": self.market.market_state.vault_authority,
                    },
                )
            )

    async def neutralize_positions(
        self,
        owner: Keypair,
        outcome_id: int,
        send_options: TxOpts = None,
        program_id: PublicKey = None,
    ):
        """
        Neutralise the outcome position
    
        Sends instructions on chain

        Args:
            owner (Keypair): Owner of UserMarket account
            outcome_id (int): Outcome ids to neutralize positions on
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Raises:
            Exception: Owner must be same as UMA owner

        Returns:
            RPCResponse: Response
        """
        if(program_id is None):
            program_id = self.market.program_id

        sig = await self.update_all_accounts_if_required(owner)
        #await self.market.aver_client.connection.confirm_transaction(sig['result'], Finalized)
        
        ix = self.make_neutralize_positions_instruction(outcome_id, program_id)

        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as UMA owner')
        

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    async def make_update_user_market_orders_instruction(
        self,
        new_size: int,
        program_id: PublicKey = None
        ):
        """
        Changes size of UMA account to hold more or less max open orders

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            new_size (int): New number of open orders available
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        if(program_id is None):
            program_id = self.market.program_id
        
        program = await self.aver_client.get_program_from_program_id(program_id)

        check_if_instruction_is_out_of_date_with_idl('cancel_all_orders', program)
        
        #Logic to return correct instruction based on ProgramID
        if(program_id.to_base58() == ''):
            #return program.instruction()...
            return ''
        else:
            return program.instruction['update_user_market_orders'](
                new_size,
                ctx=Context(
                    accounts={
                        "user_market": self.pubkey,
                        "user": self.user_market_state.user,
                        "system_program": SYS_PROGRAM_ID
                    },
                )
            )
    
    async def update_user_market_orders(
        self,
        owner: Keypair,
        new_size: int,
        send_options: TxOpts = None,
        program_id: PublicKey = None,
    ):
        """
        Changes size of UMA account to hold more or less max open orders

        Sends instructions on chain 

        Args:
            owner (Keypair): Owner of UserMarket account
            new_size (int): New number of open orders available
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            program_id (PublicKey, optional): Program public key. Defaults to Market Program ID.

        Raises:
            Exception: Owner must be same as UMA owner

        Returns:
            RPCResponse: Response
        """
        if(program_id is None):
            program_id = self.market.program_id

        sig = await self.update_all_accounts_if_required(owner)
        #await self.market.aver_client.connection.confirm_transaction(sig['result'], Finalized)

        ix = await self.make_update_user_market_orders_instruction(new_size, program_id)

        if(not owner.public_key == self.user_market_state.user):
            raise Exception('Owner must be same as UMA owner')

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    async def make_update_user_market_state_instruction(self, fee_payer = None):
        """
        Creates instruction to update user market state to new version if the smart contract has an update

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            fee_payer (PublicKey): Pays transaction fees. Defaults to AverClient wallet

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        program = await self.aver_client.get_program_from_program_id(self.program_id)
        fee_payer = fee_payer if fee_payer else self.aver_client.owner.public_key
        return program.instruction['update_user_market_state'](
            ctx=Context(accounts={
                "payer": fee_payer,
                "user": self.user_market_state.user,
                "user_market": self.pubkey,
                "system_program": SYS_PROGRAM_ID 
            })
        )

    async def update_user_market_state(self, fee_payer: Keypair = None, send_options: TxOpts = None):
        """
        Updates user market state account to latest version if the smart contract has an update

        Sends instructions on chain

        Args:
            fee_payer (Keypair, optional): Pays transaction fees. Defaults to AverClient wallet
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.

        Returns:
            RPCResponse: Response
        """
        if(fee_payer == None):
            fee_payer = self.aver_client.owner

        ix = await self.make_update_user_market_state_instruction(fee_payer.public_key)

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            fee_payer,
            [ix],
            send_options
        )

    async def make_update_all_accounts_if_required_instructions(self, fee_payer: PublicKey):
        """
        Creates instruction to all accounts state to new version if the smart contract has an update

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            fee_payer (PublicKey): Pays transaction fees. Defaults to AverClient wallet

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        ixs = []
        program = await self.aver_client.get_program_from_program_id(self.program_id)
        if not await self.market.check_if_market_latest_version():
            print(f"Creaing ix to update market from V{self.market.market_state.version} to V{get_version_of_account_type_in_program(AccountTypes.MARKET, program)}")
            ix = await self.market.make_update_market_state_instruction(fee_payer)
            ixs.append(ix)
        if not await self.user_host_lifetime.check_if_uhl_latest_version():
            print(f"Creaing ix to update UHL from V{self.user_host_lifetime.user_host_lifetime_state.version} to V{get_version_of_account_type_in_program(AccountTypes.USER_HOST_LIFETIME, program)}")
            ix = await self.user_host_lifetime.make_update_user_host_lifetime_state_instruction()
            ixs.append(ix)
        if not await self.check_if_uma_latest_version():
            print(f"Creaing ix to UMA market from V{self.user_market_state.version} to V{get_version_of_account_type_in_program(AccountTypes.USER_MARKET, program)}")
            ix = await self.make_update_user_market_state_instruction(fee_payer)
            ixs.append(ix)
        
        return ixs

    async def update_all_accounts_if_required(self, fee_payer: Keypair = None, send_options: TxOpts = None):
        """
        Updates all accounts account to latest version if the smart contract has an update

        Sends instructions on chain

        Args:
            fee_payer (Keypair, optional): Pays transaction fees. Defaults to AverClient wallet
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.

        Returns:
            RPCResponse: Response
        """
        if(fee_payer == None):
            fee_payer = self.aver_client.owner

        ixs = await self.make_update_all_accounts_if_required_instructions(fee_payer.public_key)
        if len(ixs) > 0:
            print(f"Sending {len(ixs)} instructions to update states")
            return await sign_and_send_transaction_instructions(
                self.aver_client,
                [],
                fee_payer,
                ixs,
                send_options
            )
        else:
            return True

    

    async def check_if_uma_latest_version(self):
        """
        Returns true if market state does not need to be updated (using update_user_market_state)

        Returns false if update required

        Returns:
            Boolean: Is update required
        """
        program = await self.aver_client.get_program_from_program_id(self.market.program_id)
        if(self.user_market_state.version < get_version_of_account_type_in_program(AccountTypes.USER_MARKET, program)):
            print("User market account needs to be upgraded")
            return False
        return True

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



    def calculate_tokens_available_to_sell(self, outcome_index: int, price: float):
        """
        Calculates tokens available to sell on a particular outcome

        Args:
            outcome_index (int): Outcome ID
            price (float): Price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument

        Returns:
            float: Token amount
        """
        return self.user_market_state.outcome_positions[outcome_index].free + (1 - price) * self.user_balance_state.token_balance
    
    def calculate_tokens_available_to_buy(self, outcome_index: int, price: float):
        """
         Calculates tokens available to buy on a particular outcome

        Args:
            outcome_index (int): Outcome ID
            price (float): Price - in probability format i.e. in the range (0, 1). If you are using Decimal or other odds formats you will need to convert these prior to passing as an argument

        Returns:
            float: Token amount
        """
        filtered_outcomes = deepcopy(self.user_market_state.outcome_positions)
        del filtered_outcomes[outcome_index]
        min_free_tokens_except_outcome_index  = min([op.free for op in filtered_outcomes])

        return min_free_tokens_except_outcome_index + price * self.user_balance_state.token_balance
    
    def calculate_min_free_outcome_positions(self):
        return min([o.free for o in self.user_market_state.outcome_positions])

    def get_order_from_aaob_order_id(self, aaob_order_id):
        return next((order for order in self.user_market_state.orders if order.aaob_order_id and order.aaob_order_id == aaob_order_id), None)
