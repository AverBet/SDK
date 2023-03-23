from solana.rpc.async_api import AsyncClient
from solana.transaction import AccountMeta
from .constants import AVER_HOST_ACCOUNT, SYSVAR_RENT_PUBKEY, get_quote_token
from .event_queue import load_all_event_queues, prepare_user_accounts_list
from .aver_client import AverClient
from solana.publickey import PublicKey
from .event_queue import consume_events
from solana.system_program import SYS_PROGRAM_ID
from spl.token.instructions import get_associated_token_address
from solana.keypair import Keypair
from .enums import AccountTypes, Fill, MarketStatus
from .constants import AVER_PROGRAM_IDS
from .utils import get_version_of_account_type_in_program, load_multiple_bytes_data, parse_with_version, sign_and_send_transaction_instructions
from .data_classes import MarketState, MarketStoreState, OrderbookAccountsState
from .orderbook import Orderbook
from .slab import Slab
from anchorpy import Context
from spl.token.instructions import get_associated_token_address
from spl.token.constants import TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
from solana.rpc.types import TxOpts

class AverMarket():
    """
    AverMarket object

    Contains information, references and and orderbooks on a particular market
    """

    market_pubkey: PublicKey
    """Market pubkey"""
    market_state: MarketState
    """MarketState object holding data about the market"""
    market_store_state: MarketStoreState
    """MarketStoreStateobject holding data about the market required during active trading. 
    
    This does not exist if the market has stopped trading, voided or resolved"""
    orderbooks: list[Orderbook]
    """
    Ordered list of Orderbooks for this market.

    Note: Binary (two-outcome0) markets only have 1 orderbook.
    """
    aver_client: AverClient
    """AverClient object"""

    program_id: PublicKey
    """Program ID for this Market"""

    def __init__(
        self, 
        aver_client: AverClient, 
        market_pubkey: PublicKey,
        market_state: MarketState,
        program_id: PublicKey, 
        market_store_state: MarketStoreState = None,
        orderbooks: list[Orderbook] = None,
       
        ):
        """
        Initialise an AverMarket object. Do not use this function; use AverMarket.load() instead.

        Args:
            aver_client (AverClient): AverClient object
            market_pubkey (PublicKey): Market public key
            market_state (MarketState): MarketState object
            program_id(PublicKey): Program ID Public Key
            market_store_state (MarketStoreState, optional): MarketStoreState object. Defaults to None.
            orderbooks (list[Orderbook], optional): List of Orderbook objects. Defaults to None.
        """
        self.market_pubkey = market_pubkey
        self.market_state = market_state
        self.market_store_state = market_store_state
        self.orderbooks = orderbooks
        self.aver_client = aver_client
        self.program_id = program_id

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
        return (await AverMarket.load_multiple(aver_client, [market_pubkey]))[0]

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
        market_states_and_program_ids = await AverMarket.load_multiple_market_states_and_program_ids(aver_client, market_pubkeys)
        market_states: list[MarketState] = [m['state'] for m in market_states_and_program_ids]
        program_ids: list[PublicKey] = [m['program_id'] for m in market_states_and_program_ids]
        are_market_statuses_closed = [AverMarket.is_market_status_closed(market_state.market_status) if market_state else True for market_state in market_states]

        market_store_pubkeys = [AverMarket.derive_market_store_pubkey_and_bump(m, program_ids[i] if program_ids[i] is not None else AVER_PROGRAM_IDS[0])[0] for i,m in enumerate(market_pubkeys)]
        market_stores: list[MarketStoreState] = await AverMarket.load_multiple_market_store_states(aver_client, market_store_pubkeys)

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
                program_ids[index],
                market_stores[index],
                orderbooks_market_list[index]
                ) if market_states[index] else None
            markets.append(market)
        
        return markets

    @staticmethod
    async def load_market_state_and_program_id(aver_client: AverClient, market_pubkey: PublicKey) -> MarketState:
        """
        Loads onchain data for a MarketState

        Args:
            aver_client (AverClient): AverClient object
            market_pubkey (PublicKey): Market public key

        Returns:
            MarketState: MarketState object
        """
        return (await AverMarket.load_multiple_market_states_and_program_ids(aver_client, [market_pubkey]))[0]

 
    @staticmethod
    async def load_multiple_market_states_and_program_ids(aver_client: AverClient, market_pubkeys: list[PublicKey]) -> list[MarketState]:
        """
        Loads onchain data for multiple MarketStates

        Args:
            aver_client (AverClient): AverClient object
            market_pubkeys (list[PublicKey]): List of market public keys

        Returns:
            list[MarketState]: List of MarketState objects
        """
        res = await load_multiple_bytes_data(aver_client.connection, market_pubkeys, [], False)
        programs = [await aver_client.get_program_from_program_id(PublicKey(r['owner'])) if r is not None else None for r in res]
        market_states_and_program_ids = []
        for i, m in enumerate(res):
            state = parse_with_version(programs[i], AccountTypes.MARKET, m['data']) if m else None
            program_id = programs[i].program_id if programs[i] is not None else None
            market_states_and_program_ids.append({'state': state, 'program_id': program_id})
        return market_states_and_program_ids

    @staticmethod
    def derive_market_store_pubkey_and_bump(market_pubkey: PublicKey, program_id: PublicKey = AVER_PROGRAM_IDS[0]):
        """
        Derives PDA (Program Derived Account) for MarketStore public key.
        MarketStore account addresses are derived deterministically using the market's pubkey.

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
        program_ids: list[PublicKey]
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
            program_ids (list[PublicKey]): List of each market's corresponding program_id

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
                program_ids[i],
                market_stores[i],
                all_orderbooks[i]
                )
            )

        return markets


    @staticmethod
    async def load_market_store_state(
        aver_client: AverClient, 
        market_store_pubkey: PublicKey, 
        ) -> MarketStoreState:
        """
        Loads onchain data for a MarketStore State

        Args:
            aver_client (AverClient): AverClient object
            market_store_pubkey (PublicKey): MarketStore public key

        Returns:
            MarketStoreState: MarketStoreStateobject
        """
        return (await AverMarket.load_multiple_market_store_states(aver_client, [market_store_pubkey]))[0]
        


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
        response = await load_multiple_bytes_data(aver_client.connection, market_store_pubkeys, [], False)
        market_stores = []
        for r in response:
            if r:
                program = await aver_client.get_program_from_program_id(PublicKey(r['owner']))
                state = parse_with_version(program, AccountTypes.MARKET_STORE, r['data'])
                market_stores.append(state)
            else:
                market_stores.append(None)
        return market_stores

    @staticmethod
    def is_market_status_closed(market_status: MarketStatus):
        """
        Checks if a market no longer in a trading status, and therefore will have no Orderbook or MarketStore accounts.
        Note: Once trading has ceased for a market, these accounts are closed.

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
        Returns Orderbook objects from Orderbook Account objects, by fetching and parsing. 

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
        Returns Orderbook objects from MarketState and MarketStoreStateobjects,
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
            orderbooks = []
            #Market is closed
            if(market_state is None or market_stores[index] is None or are_market_statuses_closed[index]):
                orderbooks_market_list.append(None)
                continue
            number_of_outcomes = market_state.number_of_outcomes
            #Binary markets only have 1 orderbook
            if(number_of_outcomes == 2):
                orderbooks.append(all_orderbooks.pop(0))
            else:
                orderbooks = []
                for i in range(number_of_outcomes):
                    orderbooks.append(all_orderbooks.pop(0))
            orderbooks_market_list.append(orderbooks)
        
        return orderbooks_market_list

    
    async def make_sweep_fees_instruction(self):
        """
        Creates instruction to sweeps fees and sends to relevant accounts

        Returns TransactionInstruction object only. Does not send transaction.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        quote_token = self.aver_client.quote_token
        third_party_vault_authority, bump = PublicKey.find_program_address(
            [b"third-party-token-vault", bytes(quote_token)], self.program_id)

        third_party_vault_token_account = get_associated_token_address(
            third_party_vault_authority, quote_token)

        aver_quote_token_account = get_associated_token_address(
            self.market_state.market_authority, quote_token
        )

        program = await self.aver_client.get_program_from_program_id(self.program_id)

        return program.instruction["sweep_fees"](
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
    
    async def sweep_fees(self, fee_payer: Keypair = None, send_options: TxOpts = None,):
        """
        Sweeps fees and sends to relevant accounts

        Sends instructions on chain

        Args:
            fee_payer (Keypair): Pays transaction fees. Defaults to AverClient wallet
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.

        Returns:
            RPCResponse: Response
        """
        if(fee_payer == None):
            fee_payer = self.aver_client.owner

        ix = await self.make_sweep_fees_instruction()

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            fee_payer,
            [ix],
            send_options
        )

    async def make_update_market_state_instruction(self, fee_payer: PublicKey):
        """
        Creates instruction to update market state to new version if the smart contract has an update

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            fee_payer (PublicKey): Pays transaction fees. Defaults to AverClient wallet

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        program = await self.aver_client.get_program_from_program_id(self.program_id)
        remaining_accounts = [AccountMeta(self.market_state.market_store, False, True)] if self.market_store_state is not None else []
        return program.instruction['update_market_state'](
            ctx=Context(accounts={
                "payer": fee_payer,
                "market_authority": self.market_state.market_authority,
                "market_store": self.market_state.market_store,
                "market": self.market_pubkey,
                "system_program": SYS_PROGRAM_ID 
            },
                remaining_accounts=remaining_accounts
            ),
        )

    
    async def update_market_state(self, fee_payer: Keypair = None, send_options: TxOpts = None):
        """
        Updates market state account to latest version if the smart contract has an update

        Sends instructions on chain

        Args:
            fee_payer (Keypair, optional): Pays transaction fees. Defaults to AverClient wallet
            send_options (TxOpts, optional): 

        Returns:
            RPCResponse: Response
        """
        if(fee_payer == None):
            fee_payer = self.aver_client.owner

        ix = await self.make_update_market_state_instruction(fee_payer.public_key)

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            fee_payer,
            [ix],
            send_options
        )

    async def check_if_market_latest_version(self):
        """
        Returns true if market state does not need to be updated (using update_market_state)

        Returns false if update required

        Returns:
            Boolean: Is update required
        """
        program = await self.aver_client.get_program_from_program_id(self.program_id)
        if(self.market_state.version < get_version_of_account_type_in_program(AccountTypes.MARKET, program)):
            print("Market needs to be upgraded")
            return False
        return True

    def list_all_pubkeys(self):
        """
        Returns all pubkeys used in AverMarket object

        Returns:
            list[PublicKey]: List of public keys
        """
        list_of_pubkeys = [self.market_pubkey, self.market_state.quote_vault, self.market_state.oracle_feed]
        if not self.is_market_status_closed:
            for ob in self.orderbooks:
                list_of_pubkeys += [ob.pubkey, ob.slab_asks_pubkey, ob.slab_asks_pubkey]
        return list_of_pubkeys
    
    async def get_implied_market_status(
            self
        ) -> MarketStatus:
        """
        Returns what we believe the market status ought to be (rather than what is stored in the market's state on-chain)

        Note: As a fail safe, markets have specified times beyond which the market will react as if it is in another Status until it is formally cranked to that Status.
        For example, if Solana were to have issues and it was not possible for the market's authority to crank it into In-Play status or to Cease Trading in time,
        the market would use the System Time as a trigger to treat new requests as if it were in the later Status.

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

    async def crank_market(
            self,
            outcome_idxs: list[int] = None,
            reward_target: PublicKey = None,
            payer: Keypair = None,
            max_iterations_for_consume_events: int = 3
        ):
        """
        Refresh market before cranking
        If no outcome_idx are passed, all outcomes are cranked if they meet the criteria to be cranked.

        Args:
            fee_payer (Keypair, optional): Pays transaction fees. Defaults to AverClient wallet
            reward_target (PublicKey, optional): Reward Target. Defaults to payer
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
        """
        if outcome_idxs == None:
            # For binary markets, there is only one orderbook
            outcome_idxs = [idx for idx in range(
                1 if self.market_state.number_of_outcomes == 2 else self.market_state.number_of_outcomes)]
        if self.market_state.number_of_outcomes == 2 and (0 in outcome_idxs or 1 in outcome_idxs):
            outcome_idxs = [0]
        if reward_target == None:
            reward_target = self.aver_client.owner.public_key
        if payer == None:
            payer = self.aver_client.owner

        # refreshed_market = await refresh_market(self.aver_client, self)

        event_queues = [o.event_queue for o in self.market_store_state.orderbook_accounts]
        loaded_event_queues = await load_all_event_queues(
            self.aver_client.provider.connection,
            event_queues 
            )

        sig = ''
        for idx in outcome_idxs:
            if loaded_event_queues[idx]["header"].count == 0:
                continue

            print(f'Cranking market {str(self.market_pubkey)} for outcome {idx} - {loaded_event_queues[idx]["header"].count} events left to crank')
            if loaded_event_queues[idx]['header'].count > 0:
                user_accounts = []
                for j, event in enumerate(loaded_event_queues[idx]['nodes']):
                    if type(event) == Fill:
                        user_accounts += [event.maker_user_market]
                    else:  # Out
                        user_accounts += [event.user_market]
                    if j == max_iterations_for_consume_events:
                        break
                user_accounts = prepare_user_accounts_list(user_accounts)
                events_to_crank = min(
                    loaded_event_queues[idx]['header'].count, max_iterations_for_consume_events)

                sig = await consume_events(
                    market=self,
                    outcome_idx=idx,
                    max_iterations=events_to_crank,
                    user_accounts=user_accounts,
                    reward_target=reward_target,
                    payer=payer
                )

        return sig

    async def settle_market(self, remaining_accounts: list[AccountMeta] = [], host: PublicKey = AVER_HOST_ACCOUNT, reward_target: PublicKey = SYS_PROGRAM_ID):
        program = await self.aver_client.get_program_from_program_id(self.program_id)
        quote_token_mint = get_quote_token(self.aver_client.solana_network)

        return await program.rpc["settle"](
        ctx=Context(
            accounts={
                'market': self.market_pubkey,
                'reward_target': reward_target,
                'vault_authority': self.market_state.vault_authority,
                'quote_vault': self.market_state.quote_vault,
                'spl_token_program': TOKEN_PROGRAM_ID,
                'host': host,
                'system_program': SYS_PROGRAM_ID,
                'associated_token_program': ASSOCIATED_TOKEN_PROGRAM_ID,
                'quote_token_mint': quote_token_mint,
                'rent': SYSVAR_RENT_PUBKEY
            },
            remaining_accounts=remaining_accounts
        ),
    )




