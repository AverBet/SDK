from solana.rpc.async_api import AsyncClient
from .aver_client import AverClient
from solana.publickey import PublicKey
from solana.keypair import Keypair
from .enums import MarketStatus
# from constants import DEFAULT_QUOTE_TOKEN_DEVNET, DEFAULT_MARKET_AUTHORITY, AVER_PROGRAM_ID_DEVNET_2
from .constants import AVER_MARKET_AUTHORITY, AVER_PROGRAM_ID
from .utils import load_multiple_bytes_data, sign_and_send_transaction_instructions
from .data_classes import MarketState, MarketStoreState, OrderbookAccountsState
from .orderbook import Orderbook
from .slab import Slab
from anchorpy import Context
from spl.token.instructions import get_associated_token_address
from spl.token.constants import TOKEN_PROGRAM_ID
from solana.rpc.types import TxOpts

class AverMarket():
    """
    AverMarket object

    Contains information and orderbooks on a particular market
    """

    market_pubkey: PublicKey
    """Market pubkey"""
    market_state: MarketState
    """MarketState object holding data about the market"""
    market_store_state: MarketStoreState
    """MarketStoreStateobject holding data about the market. 
    
    This does not exist if the market has stopped trading, voided or resolved"""
    orderbooks: list[Orderbook]
    """
    All Orderbooks for this market.

    Binary markets only have 1 orderbook
    """
    aver_client: AverClient
    """AverClient object"""

    def __init__(
        self, 
        aver_client: AverClient, 
        market_pubkey: PublicKey,
        market_state: MarketState,
        market_store_state: MarketStoreState = None,
        orderbooks: list[Orderbook] = None,
        ):
        """
        Initialise an AverMarket object. Do not use this function; use AverMarket.load() instead

        Args:
            aver_client (AverClient): AverClient object
            market_pubkey (PublicKey): Market public key
            market_state (MarketState): MarketState object
            market_store_state (MarketStoreState, optional): MarketStoreState object. Defaults to None.
            orderbooks (list[Orderbook], optional): List of Orderbook objects. Defaults to None.
        """
        self.market_pubkey = market_pubkey
        self.market_state = market_state
        self.market_store_state = market_store_state
        self.orderbooks = orderbooks
        self.aver_client = aver_client

        if(market_state.number_of_outcomes == 2 and orderbooks is not None and len(orderbooks) == 1):
            orderbooks.append(orderbooks[0].invert())
    
    @staticmethod
    async def load(aver_client: AverClient, market_pubkey: PublicKey):
        """
        Initialises an AverMarket object

        To refresh data on an already loaded market use src.refresh.refresh_markets()

        Args:
            aver_client (AverClient): AverClient object
            market_pubkey (PublicKey): Market public key

        Returns:
            AverMarket: AverMarket object
        """
        market_state_and_store = await AverMarket.load_market_state_and_store(aver_client, market_pubkey)
        market_state: MarketState = market_state_and_store['market_states'][0]
        market_store_state = None
        orderbooks = None
        is_market_status_closed = AverMarket.is_market_status_closed(market_state.market_status)
        market_store_state: MarketStoreState = await market_state_and_store['market_stores'][0]

        if(not is_market_status_closed):
            orderbooks = await AverMarket.get_orderbooks_from_orderbook_accounts(
                aver_client.provider.connection,
                market_store_state.orderbook_accounts,
                [market_state.decimals] * len(market_store_state.orderbook_accounts)
            )

        return AverMarket(aver_client, market_pubkey, market_state, market_store_state, orderbooks)

    @staticmethod
    async def load_multiple(aver_client: AverClient, market_pubkeys: list[PublicKey]):
        """
        Initialises multiple AverMarket objects

        This method is quicker that using Market.load() multiple times

        To refresh data on already loaded markets use src.refresh.refresh_multiple_markets()

        Args:
            aver_client (AverClient): AverClient object
            market_pubkeys (list[PublicKey]): List of Market public keys

        Returns:
            list[AverMarket]: List of AverMarket objects
        """
        market_states_and_stores = await AverMarket.load_multiple_market_states_and_stores(aver_client, market_pubkeys)
        market_states: list[MarketState] = market_states_and_stores['market_states']

        are_market_statuses_closed = []
        for market_state in market_states:
            are_market_statuses_closed.append(AverMarket.is_market_status_closed(market_state.market_status))

        market_stores: list[MarketStoreState] = market_states_and_stores['market_stores']

        orderbooks_market_list = await AverMarket.get_orderbooks_from_orderbook_accounts_multiple_markets(
            aver_client.provider.connection,
            market_states,
            market_stores,
            are_market_statuses_closed,
        )
        
        markets: list[AverMarket] = []
        for index, market_pubkey in enumerate(market_pubkeys):
            market = AverMarket(
                aver_client, 
                market_pubkey,
                market_states[index], 
                market_stores[index], 
                orderbooks_market_list[index]
                )
            markets.append(market)
        
        return markets

    @staticmethod
    async def load_market_state(aver_client: AverClient, market_pubkey: PublicKey) -> MarketState:
        """
        Loads onchain data for a MarketState

        Args:
            aver_client (AverClient): AverClient object
            market_pubkey (PublicKey): Market public key

        Returns:
            MarketState: MarketState object
        """
        res = await aver_client.program.account['Market'].fetch(market_pubkey)
        return res
 
    @staticmethod
    async def load_multiple_market_states(aver_client: AverClient, market_pubkeys: list[PublicKey]) -> list[MarketState]:
        """
        Loads onchain data for multiple MarketStates

        Args:
            aver_client (AverClient): AverClient object
            market_pubkeys (list[PublicKey]): List of market public keys

        Returns:
            list[MarketState]: List of MarketState objects
        """
        res = await aver_client.program.account['Market'].fetch_multiple(market_pubkeys)
        return res
   
    @staticmethod
    async def load_market_state_and_store(aver_client: AverClient, market_pubkey: PublicKey):
        """
        Loads onchain data for multiple MarketStates and MarketStoreStates at once

        Args:
            aver_client (AverClient): AverClient object
            market_pubkey (PublicKey]: Market public key

        Returns:
            dict[str, list[MarketState] or list[MarketStoreState]]: Keys are market_states or market_stores
        """
        return await AverMarket.load_multiple_market_states_and_stores(aver_client, [market_pubkey])

    @staticmethod
    async def load_multiple_market_states_and_stores(aver_client: AverClient, market_pubkeys: list[PublicKey]):
        """
        Loads onchain data for multiple MarketStates and MarketStoreStates at once

        Args:
            aver_client (AverClient): AverClient object
            market_pubkeys (list[PublicKey]): List of market public keys

        Returns:
            dict[str, list[MarketState] or list[MarketStoreState]]: Keys are market_states or market_stores
        """
        market_store_pubkeys = [AverMarket.derive_market_store_pubkey_and_bump(m, AVER_PROGRAM_ID)[0] for m in market_pubkeys]

        data = await load_multiple_bytes_data(aver_client.connection, market_pubkeys + market_store_pubkeys)
        market_states_data = data[0:len(market_pubkeys)]
        market_stores_data = data[len(market_pubkeys):]

        market_states = [AverMarket.parse_market_state(d, aver_client) for d in market_states_data]
        market_stores = [AverMarket.parse_market_store(d, aver_client) if d is not None else None for d in market_stores_data]

        return {'market_states': market_states, 'market_stores': market_stores}

    @staticmethod
    def derive_market_store_pubkey_and_bump(market_pubkey: PublicKey, program_id: PublicKey = AVER_PROGRAM_ID):
        """
        Derives PDA for MarketStore public key 

        Args:
            market_pubkey (PublicKey): Market public key
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            PublicKey: MarketStore public key
        """
        return PublicKey.find_program_address(
            [bytes('market-store', 'utf-8'), bytes(market_pubkey)], 
            program_id
        )

    @staticmethod
    def get_markets_from_account_states(
        aver_client: AverClient,
        market_pubkeys: list[PublicKey], 
        market_states: list[MarketState], 
        market_stores: list[MarketStoreState],
        slabs: list[Slab],
        ):
        """
        Returns multiple AverMarket objects from their respective MarketStates, stores and orderbook objects

        Used in refresh.py

        Args:
            aver_client (AverClient): AverClient object
            market_pubkeys (list[PublicKey]): List of market public keys
            market_states (list[MarketState]): List of MarketState objects
            market_stores (list[MarketStoreState]): List of MarketStoreState objects
            slabs (list[Slab]): List of slab objects (used in orderbooks)

        Returns:
            lst[AverMarket]: List of AverMarket objects
        """
        slab_position_counter = 0
        all_orderbooks = []
        for j, market_store in enumerate(market_stores):
            all_orderbooks_for_market = []
            if(market_store is None):
                all_orderbooks.append(None)
                continue
            for i, orderbook in enumerate(market_store.orderbook_accounts):
                orderbook = Orderbook(
                    orderbook.orderbook, 
                    slabs[slab_position_counter + i * 2],
                    slabs[slab_position_counter + i * 2 + 1],
                    orderbook.bids,
                    orderbook.asks,
                    market_states[j].decimals
                    )
                all_orderbooks_for_market.append(orderbook)
            slab_position_counter += len(market_store.orderbook_accounts) * 2
            all_orderbooks.append(all_orderbooks_for_market)
        
        markets: list[AverMarket] = []
        for i, m in enumerate(market_pubkeys):
            markets.append(AverMarket(
                aver_client, 
                m, 
                market_states[i],
                market_stores[i],
                all_orderbooks[i]
                )
            )

        return markets


    @staticmethod
    def parse_market_state(buffer: bytes, aver_client: AverClient) -> MarketState:
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

    @staticmethod
    async def load_market_store_state(
        aver_client: AverClient, 
        is_market_status_closed: bool,
        market_store_pubkey: PublicKey, 
        ) -> MarketStoreState:
        """
        Loads onchain data for a MarketStore State

        Args:
            aver_client (AverClient): AverClient object
            is_market_status_closed (bool): True if market status is closed, voided or resolved
            market_store_pubkey (PublicKey): MarketStore public key

        Returns:
            MarketStoreState: MarketStoreStateobject
        """
        #Closed markets do not have orderbooks
        if(is_market_status_closed):
            return None
        res = await aver_client.program.account['MarketStore'].fetch(market_store_pubkey)
        return res


    @staticmethod
    async def load_multiple_market_store_states(
        aver_client: AverClient, 
        market_store_pubkeys: list[PublicKey], 
        ) -> list[MarketStoreState]:
        """
        Loads onchain data for multiple MarketStore States

        Args:
            aver_client (AverClient): AverClient object
            market_store_pubkeys (list[PublicKey]): List of MarketStore public keys

        Returns:
            list[MarketStoreState]: List of MarketStore public keys
        """
        res = await aver_client.program.account['MarketStore'].fetch_multiple(market_store_pubkeys)
        return res
    
    @staticmethod
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

    @staticmethod
    def is_market_status_closed(market_status: MarketStatus):
        """
        Checks if a market no longer has orderbooks / MarketStore state

        Args:
            market_status (MarketStatus): Market status (find in MarketState object)

        Returns:
            bool: Market status closed
        """
        return market_status in [MarketStatus.CEASED_CRANKED_CLOSED, MarketStatus.RESOLVED, MarketStatus.VOIDED]

    @staticmethod
    async def get_orderbooks_from_orderbook_accounts(
        conn: AsyncClient, 
        orderbook_accounts: list[OrderbookAccountsState],
        decimals_list: list[int]
        ) -> list[Orderbook]:
        """
        Returns orderbook objects from orderbook account objects, by fetching and parsing. 

        Args:
            conn (AsyncClient): Solana AsyncClient object
            orderbook_accounts (list[OrderbookAccountsState]): List of orderbook account objects
            decimals_list (list[int]): List of decimal precision for each orderbook account state. Variable normally found in MarketState object

        Raises:
            Exception: Decimals list and orderbook accounts do not have the same length

        Returns:
            list[Orderbook]: List of orderbook objects
        """
        if(len(decimals_list) != len(orderbook_accounts)):
            raise Exception('decimals_list and orderbook_accounts should have the same length')
        
        all_bids_and_asks_accounts = []
        for o in orderbook_accounts:
            all_bids_and_asks_accounts.append(o.bids)
            all_bids_and_asks_accounts.append(o.asks)

        
        all_slabs = await Orderbook.load_multiple_slabs(conn, all_bids_and_asks_accounts)
        orderbooks = []

        for i, o in enumerate(orderbook_accounts):
            orderbook = Orderbook(
                o.orderbook, 
                all_slabs[i*2], 
                all_slabs[i*2 + 1], 
                o.bids,o.asks,
                decimals_list[i]
                )
            orderbooks.append(orderbook)
        return orderbooks



    @staticmethod
    async def get_orderbooks_from_orderbook_accounts_multiple_markets(
        conn: AsyncClient,
        market_states: list[MarketState],
        market_stores: list[MarketStoreState],
        are_market_statuses_closed: list[bool],
    ):
        """
        Returns orderbook objects from MarketState and MarketStoreStateobjects,
        by fetching and parsing for multiple markets.

        Use when fetching orderbooks for multiple markets 

        Args:
            conn (AsyncClient): Solana AsyncClient object
            market_states (list[MarketState]): List of MarketState objects
            market_stores (list[MarketStoreState]): List of MarketStoreStateobjects
            are_market_statuses_closed (list[bool]): Lists if each market is closed or not

        Returns:
            list[list[Orderbook]]: List of orderbooks for each market
        """
        #Create list of accounts and the decimals for each account
        orderbook_accounts = []
        decimals_list = []
        for index, market_store in enumerate(market_stores):
            if(market_store is None):
                continue
            orderbook_accounts.extend(market_store.orderbook_accounts)
            for i in range(len(market_store.orderbook_accounts)):
                decimals_list.append(market_states[index].decimals)
        
        #Load all orderbooks
        all_orderbooks: list[Orderbook] = await AverMarket.get_orderbooks_from_orderbook_accounts(conn, orderbook_accounts, decimals_list)
        orderbooks_market_list = []

        #Create a list for each market we received. The list contains all orderbooks for that market
        for index, market_state in enumerate(market_states):
            number_of_outcomes = market_state.number_of_outcomes
            orderbooks = []
            #Market is closed
            if(are_market_statuses_closed[index]):
                orderbooks_market_list.append(None)
                continue
            #Binary markets only have 1 orderbook
            if(number_of_outcomes == 2):
                orderbooks.append(all_orderbooks.pop(0))
            else:
                orderbooks = []
                for i in range(number_of_outcomes):
                    orderbooks.append(all_orderbooks.pop(0))
            orderbooks_market_list.append(orderbooks)
        
        return orderbooks_market_list

    
    # TODO adjust the accounts being passed in correctly
    def make_sweep_fees_instruction(self):
        """
        NOT FINISHED

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        quote_token = self.aver_client.quote_token
        third_party_vault_authority, bump = PublicKey.find_program_address(
            [b"third-party-token-vault", bytes(quote_token)], AVER_PROGRAM_ID)

        third_party_vault_token_account = get_associated_token_address(
            third_party_vault_authority, quote_token)

        aver_quote_token_account = get_associated_token_address(
            AVER_MARKET_AUTHORITY, quote_token
        )

        return self.aver_client.program.instruction["sweep_fees"](
            ctx=Context(
                accounts={
                    "market": self.market_pubkey,
                    "quote_vault": self.market_state.quote_vault,
                    "vault_authority": self.market_state.vault_authority,
                    "third_party_token_vault": third_party_vault_token_account,
                    "aver_quote_token_account": aver_quote_token_account,
                    "spl_token_program": TOKEN_PROGRAM_ID,
                },
                signers=[],
            ),
        )
    
    #TODO - Move to admin????
    async def sweep_fees(self, owner: Keypair, send_options: TxOpts = None,):
        """
        NOT FINISHED

        Args:
            owner (Keypair): _description_
            send_options (TxOpts, optional): _description_. Defaults to None.

        Returns:
            _type_: _description_
        """
        ix = self.make_sweep_fees_instruction()

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    def list_all_pubkeys(self):
        """
        Returns all pubkeys used in AverMarket object

        Returns:
            list[PublicKey]: List of public keys
        """
        list_of_pubkeys = [self.market_pubkey, self.market_state.quote_vault, self.market_state.oracle_feed]
        if not self.is_market_status_closed:
            for ob in self.orderbooks:
                list_of_pubkeys += [ob.pubkey, ob.slab_asks_pubkey, ob.slab_asks_pubkey] # TODO: Event Queue?
        return list_of_pubkeys
    
    async def get_implied_market_status(self) -> MarketStatus:
        """
        Returns what we believe the market status ought to be (rather than is)

        If Solana clock time is beyond TradingCeaseTime, market is TradingCeased
        If Solana clock time is beyond InPlayStartTime but before TradingCeaseTime, market is ActiveInPlay

        Returns:
            MarketStatus: Implied market status
        """
        solana_datetime = await self.aver_client.get_system_clock_datetime()
        if solana_datetime.timestamp() > self.market_state.trading_cease_time:
            return MarketStatus.TRADING_CEASED
        if self.market_state.inplay_start_time is not None and solana_datetime.timestamp() > self.market_state.inplay_start_time :
            return MarketStatus.ACTIVE_IN_PLAY
        return self.market_state.market_status
        

#TODO - Market Listener
