from asyncio import gather
from datetime import datetime
import math
from dateutil.relativedelta import relativedelta
import unittest
from solana.keypair import Keypair
import base58
from ...public.src.pyaver.data_classes import UserHostLifetimeState, UserMarketState
from ...public.src.pyaver.aver_client import AverClient
from ...public.src.pyaver.constants import *
from ...public.src.pyaver.user_market import UserMarket
from solana.rpc.commitment import Confirmed, Finalized
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.enums import MarketStatus, Side, SizeFormat
from solana.rpc.async_api import AsyncClient
from ..instructions.init_uhl import derive_pubkey_and_bump
from solana.rpc.commitment import *
from solana.rpc import types
from ...public.src.pyaver.refresh import refresh_user_market
from solana.publickey import PublicKey
from ..instructions.init_market import init_market_tx, InitMarketArgs, InitMarketAccounts
from ..instructions.supplement_init_market import supplement_init_market_tx, SupplementInitMarketAccounts, SupplementInitMarketArgs

#Change this to change test
NUMBER_OF_OUTCOMES = 2

class TestSdkV3(unittest.IsolatedAsyncioTestCase):
  init_market_args = InitMarketArgs(
        active_immediately=True,
        cranker_reward=5000,
        fee_tier_collection_bps_rates=[0,0,0,0,0,0,0],
        going_in_play_flag=False,
        market_name="Test market",
        max_quote_tokens_in=1_000_000_000_000,
        max_quote_tokens_in_permission_capped=1_000_000_000_000,
        min_new_order_base_size=1_000_000,
        min_new_order_quote_size=1_000_000,
        min_orderbook_base_size=1_000_000,
        number_of_outcomes=0,
        number_of_winners=1,
        permissioned_market_flag=False,
        trading_cease_time=math.floor((datetime.now() + relativedelta(months=1)).timestamp()),
        rounding_format=0,
        category=0,
        sub_category=0,
        event=0,
        series=0,
        in_play_delay_seconds=None,
        in_play_start_time=None,
        max_in_play_crank_orders=None,
    )

    #### CLIENT TESTS ####
  async def asyncSetUp(self) -> None:
    # constants we can adjust
    self.first_program_id = PublicKey('DfMQPAuAeECP7iSCwTKjbpzyx6X1HZT6rz872iYWA8St')
    self.second_program_id = PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ')
    owner = Keypair.from_secret_key(base58.b58decode('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S'))
    self.owner_2 = Keypair.from_secret_key(base58.b58decode('3onYh3TSCg92X3kD9gD7RCZF1N8JFVSDp39eSkRswsQb5YwWuyMnzuCN2wuPb52XEnPzjVrCtkYe5Xo8Czd3CDyV'))

    # setup the client
    network = SolanaNetwork.DEVNET
    solana_endpoint = get_solana_endpoint(network)
    connection = AsyncClient(solana_endpoint, Finalized)
    opts = types.TxOpts(False, False, Finalized)
    self.client = await AverClient.load(connection, owner, opts, network, [self.second_program_id, self.first_program_id])
    self.user_markets: list[UserMarket] = []
    self.host = derive_pubkey_and_bump(owner.public_key, self.first_program_id)[0]

    print(f"Successfully loaded client with owner: {self.client.owner.public_key}")

    return await super().asyncSetUp()

  async def addAsyncCleanup(self) -> None:
    return super().addAsyncCleanup()

  async def get_program_from_program_id_test(self):
    second_program = await self.client.get_program_from_program_id(self.second_program_id)
    self.assertEqual(self.second_program_id, second_program.program_id)
    print("Successfully got program from program id")

  async def test_aver_client(self):
      client = self.client
      print('-'*10)
      print('TESTING AVER CLIENT')
      await self.get_program_from_program_id_test()
      system_clock = await client.get_system_clock_datetime()
      print('System clock time: ', system_clock)
      lamport_balance = await client.request_lamport_balance(client.owner.public_key)
      print('Lamport balance: ', lamport_balance)
      token_balance = await client.request_token_balance(mint=client.quote_token, owner=client.owner.public_key)
      print('Token balance: ', token_balance)
      print('-'*10)
  
    #### MARKET TESTS #### 

  async def create_market(self, number_of_outcomes):
    print('-'*10)
    print('TESTING MARKET CREATION')
    #Init market
    market = Keypair()
    accs = InitMarketAccounts(
      market=market,
      market_authority=self.client.owner,
      payer=self.client.owner,
    )
    self.init_market_args = self.init_market_args._replace(number_of_outcomes=number_of_outcomes)
    sig = await init_market_tx(self.client, self.init_market_args, accs, self.first_program_id)
    #await self.client.connection.confirm_transaction(sig, Finalized)
    self.market = market
    print(f"Market created: {market.public_key}")

    #Supplement init market
    print('Creating supplement init market txs')
    accs = SupplementInitMarketAccounts(
        market=self.market.public_key,
        market_authority=self.client.owner.public_key,
        payer=self.client.owner
    )
    if number_of_outcomes == 2:
      args = SupplementInitMarketArgs(
        event_capacity=10,
        nodes_capacity=10,
        outcome_id=0,
        outcome_names=["one", "two"])
      sig = await supplement_init_market_tx(self.client, args, accs, self.first_program_id)
      #await self.client.connection.confirm_transaction(sig, Finalized)
      print(f"Successfully finished supplement init market")
    else:
        coroutines = []
        for i in range(number_of_outcomes):
            args = SupplementInitMarketArgs(
                event_capacity=10,
                nodes_capacity=10,
                outcome_id=i,
                outcome_names=[str(i) + 'aa'])
            coroutine = supplement_init_market_tx(self.client, args, accs, self.first_program_id)
            coroutines.append(coroutine)
        sigs = await gather(*coroutines)
        await gather(*[self.client.connection.confirm_transaction(sig, Finalized) for sig in sigs])
        print(f"Successfully finished supplement init market")
    print('-'*10)


  async def load_market_test(self, pubkey=None):
    print('-'*10)
    print('TESTING MARKET LOADING')
    market_pubkey = pubkey if pubkey else self.market.public_key
    aver_market = await AverMarket.load(self.client, market_pubkey)
    self.aver_market = aver_market
    print(f"Successfully loaded a market {market_pubkey}")
    print('-'*10)

  def check_market_is_as_expected(self, market: AverMarket):
      print('-'*10)
      print('TESTING MARKET CREATED AND LOADED CORRECTLY')
      assert market.program_id.to_base58() == self.first_program_id.to_base58()
      assert self.init_market_args.cranker_reward == market.market_state.cranker_reward
      assert self.init_market_args.going_in_play_flag == market.market_state.going_in_play_flag
      assert MarketStatus.ACTIVE_PRE_EVENT == market.market_state.market_status
      assert self.init_market_args.max_quote_tokens_in == market.market_state.max_quote_tokens_in
      assert self.init_market_args.max_quote_tokens_in_permission_capped == market.market_state.max_quote_tokens_in_permission_capped
      assert self.init_market_args.permissioned_market_flag == market.market_state.permissioned_market_flag
      assert self.init_market_args.market_name == market.market_state.market_name
      assert self.init_market_args.trading_cease_time == market.market_state.trading_cease_time
      for i, fee_tier in enumerate(self.init_market_args.fee_tier_collection_bps_rates):
          assert fee_tier == market.market_state.fee_tier_collection_bps_rates[i] 
      print('-'*10)

  def check_uma_state(self, uma_state: UserMarketState):
    assert uma_state.market.to_base58() == self.aver_market.market_pubkey.to_base58()
    assert uma_state.user.to_base58() == self.client.owner.public_key.to_base58()

  def check_uhl_state(self, uhl: UserHostLifetimeState):
    assert uhl.host.to_base58() == self.host.to_base58()
    assert not uhl.is_self_excluded_until
    assert uhl.user.to_base58() == self.client.owner.public_key.to_base58()

  async def create_uma_test(self, owner):
    print('-'*10)
    print('CREATING UMA')
    uma = await UserMarket.get_or_create_user_market_account(self.client, self.aver_market, owner, host=self.host)
    self.user_markets.append(uma)
    print(f"Successfully loaded UMA {uma.pubkey}")
    print('-'*10)

  async def place_order_test(self, uma: UserMarket, bids: bool = True):
    if(bids):
      sig = await uma.place_order(self.client.owner, 0, Side.BUY, 0.6, 5, SizeFormat.PAYOUT)
    else:
      sig = await uma.place_order(self.owner_2, 0, Side.SELL, 0.4, 5, SizeFormat.PAYOUT)
    #await self.client.connection.confirm_transaction(sig['result'], Finalized)
    uma = await refresh_user_market(self.client, uma)
    print(f"Successfully placed order {sig}")
    return uma

  async def cancel_all_orders_test(self, uma: UserMarket):
    sigs = await uma.cancel_all_orders([0])
    #await gather(*[self.client.connection.confirm_transaction(sig['result'], Finalized) for sig in sigs])
    uma = await refresh_user_market(self.client, uma)
    print(f"Successfully cancelled all orders")
    return uma

  async def cancel_specific_order(self, uma: UserMarket, order_id = None):
    order_id = order_id if order_id else uma.user_market_state.orders[0].order_id
    sig = await uma.cancel_order(order_id, 0, program_id=uma.market.program_id)
    #await self.client.connection.confirm_transaction(sig['result'], Finalized)
    uma = await refresh_user_market(self.client, uma)
    print(f"Successfully cancelled the order: {sig}")
    return uma


  # run all the tests in order we want
  async def test_run_all(self):
    # aver client tests
    await self.test_aver_client()

    # Create host
    #sig = await create_host_account(self.client, self.client.owner, self.client.owner, program_id=self.first_program_id)
    #await self.client.provider.connection.confirm_transaction(sig['result'], Finalized)

    # aver market tests
    await self.create_market(NUMBER_OF_OUTCOMES)
    await self.load_market_test(self.market.public_key)
    self.check_market_is_as_expected(self.aver_market)
  
    # UMA / UHL tests
    await self.create_uma_test(self.client.owner)
    uma = self.user_markets[0]
    assert len(uma.user_market_state.orders) == 0
    assert len(uma.market.orderbooks) == NUMBER_OF_OUTCOMES
    uhl = uma.user_host_lifetime.user_host_lifetime_state
    self.check_uhl_state(uhl)
    self.check_uma_state(uma.user_market_state)

    uma = await self.place_order_test(uma)
    assert len(uma.user_market_state.orders) == 1
    #Orderbook
    bids_l2 = uma.market.orderbooks[0].get_bids_l2(10, True)
    assert abs(bids_l2[0].price - 0.6) < 0.00001
    assert abs(bids_l2[0].size - 5) < 0.00001
    bids_l3 = uma.market.orderbooks[0].get_bids_L3()
    assert abs(bids_l3[0].base_quantity_ui - 5) < 0.00001
    assert abs(bids_l3[0].price_ui - 0.6) < 0.00001
    assert (bids_l3[0].user_market.to_base58() == uma.pubkey.to_base58())
    self.check_uhl_state(uhl) #checking if UHL still loads after refresh
    self.check_uma_state(uma.user_market_state)
    order = uma.user_market_state.orders[0]
    price = uma.market.orderbooks[0].get_bid_price_by_order_id(order)
    assert abs(price.size - 5) < 0.00001
    assert abs(price.price - 0.6) < 0.0001

    uma = await self.cancel_specific_order(uma)
    assert len(uma.user_market_state.orders) == 0

    uma = await self.place_order_test(uma)
    uma = await self.place_order_test(uma)
    assert len(uma.user_market_state.orders) == 2

    uma = await self.cancel_all_orders_test(uma)
    assert len(uma.user_market_state.orders) == 0

    #Order matching
    await self.create_uma_test(self.owner_2)
    uma_2 = self.user_markets[1]
    uma = await self.place_order_test(uma)
    uma_2 = await self.place_order_test(uma_2, False)
    #Cranking
    sig = await uma.market.crank_market([0,1], None, self.client.owner)
    #await self.client.connection.confirm_transaction(sig, Finalized)
    uma = await refresh_user_market(self.client, uma)
    uma_2 = await refresh_user_market(self.client, uma_2)
    assert len(uma.user_market_state.orders) == 0
    assert len(uma_2.user_market_state.orders) == 0
    assert abs(uma.market.market_state.matched_count - 3 * (10 ** 6)) <= 1 #Sometimes there is a roudning error on the matched count


# Executing the tests in the above test case class
if __name__ == "__main__":
  unittest.main()