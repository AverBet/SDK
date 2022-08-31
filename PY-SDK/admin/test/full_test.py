from asyncio import gather
from datetime import datetime
import math
from dateutil.relativedelta import relativedelta
import unittest
from solana.keypair import Keypair
import base58
from ...public.src.pyaver.aver_client import AverClient
from ...public.src.pyaver.constants import *
from ...public.src.pyaver.user_market import UserMarket
from solana.rpc.commitment import Confirmed
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.enums import MarketStatus, Side, SizeFormat
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import *
from solana.rpc import types
from solana.publickey import PublicKey
from ..instructions.init_market import init_market_tx, InitMarketArgs, InitMarketAccounts
from ..instructions.supplement_init_market import supplement_init_market_tx, SupplementInitMarketAccounts, SupplementInitMarketArgs

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
    first_program_id = PublicKey('81aTPaDchxBxJSyZzw7TvVY3PcdAvrfTSQC58NpXtkTT')
    self.second_program_id = PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ')
    owner = Keypair.from_secret_key(base58.b58decode('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S'))

    # setup the client
    network = SolanaNetwork.DEVNET
    solana_endpoint = get_solana_endpoint(network)
    connection = AsyncClient(solana_endpoint, Confirmed)
    opts = types.TxOpts(False, False, Confirmed)
    self.client = await AverClient.load(connection, owner, opts, network, [first_program_id])

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
    sig = await init_market_tx(self.client, self.init_market_args, accs)
    await self.client.connection.confirm_transaction(sig, Confirmed)
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
      sig = await supplement_init_market_tx(self.client, args, accs)
      await self.client.connection.confirm_transaction(sig, Confirmed)
      print(f"Successfully finished supplement init market")
    else:
        coroutines = []
        for i in range(number_of_outcomes):
            args = SupplementInitMarketArgs(
                event_capacity=10,
                nodes_capacity=10,
                outcome_id=i,
                outcome_names=range(number_of_outcomes))
            coroutine = supplement_init_market_tx(self.client, args, accs)
            coroutines.append(coroutine)
        sigs = await gather(*coroutines)
        await gather(*[self.client.connection.confirm_transaction(sig, "Confirmed") for sig in sigs])
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
      assert self.init_market_args.cranker_reward == market.market_state.cranker_reward
      assert self.init_market_args.going_in_play_flag == market.market_state.going_in_play_flag
      assert MarketStatus.ACTIVE_PRE_EVENT == market.market_state.market_status
      assert self.init_market_args.max_quote_tokens_in == market.market_state.max_quote_tokens_in
      assert self.init_market_args.permissioned_market_flag == market.market_state.permissioned_market_flag
      print('-'*10)

  async def create_uma_test(self):
    uma = await UserMarket.get_or_create_user_market_account(self.client, self.aver_market, self.client.owner)
    self.user_market = uma
    print(f"Successfully loaded UMA {uma.pubkey}")

  async def place_order_test(self):
    sig = await self.user_market.place_order(self.client.owner, 0, Side.BUY, 0.5, 5, SizeFormat.STAKE)
    print(f"Successfully placed order {sig}")

  async def cancel_all_orders_test(self):
    sig = await self.user_market.cancel_all_orders([0])
    print(f"Successfully cancelled all orders {sig}")

  async def cancel_specific_order(self, order_id = None):
    order_id = order_id if order_id else self.user_market.user_market_state.orders[0].order_id
    sig = await self.user_market.cancel_order(order_id, 0)
    print(f"Successfully cancelled the order: {sig}")


  # run all the tests in order we want
  async def test_run_all(self):
    # aver client tests
    await self.test_aver_client()

    # aver market tests
    await self.create_market(2)
    await self.load_market_test(self.market.public_key)
    self.check_market_is_as_expected(self.aver_market)
    
    # UMA tests
    # await self.create_uma_test()
    # await self.place_order_test()
    # # await self.cancel_all_orders_test()
    # await self.cancel_specific_order()


# Executing the tests in the above test case class
if __name__ == "__main__":
  unittest.main()