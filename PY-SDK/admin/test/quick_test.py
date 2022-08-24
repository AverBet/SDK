from datetime import datetime
import math
from dateutil.relativedelta import relativedelta
import unittest
from solana.keypair import Keypair
import base58
from ...public.src.pyaver.aver_client import AverClient
from ...public.src.pyaver.constants import *
from ...public.src.pyaver.user_market import UserMarket
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.enums import Side, SizeFormat
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import *
from solana.rpc import types
from solana.publickey import PublicKey
from ..instructions.init_market import init_market_tx, InitMarketArgs, InitMarketAccounts
from ..instructions.supplement_init_market import supplement_init_market_tx, SupplementInitMarketAccounts, SupplementInitMarketArgs

class TestSdkV2(unittest.IsolatedAsyncioTestCase):
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
  
  # these are setters and getters to be shared
  # @property
  # def client(self) -> AverClient:
  #   return self.__class__.client

  # @client.setter
  # def client(self, value):
  #   self.__class__.client = value

  async def get_program_from_program_id_test(self):
    second_program = await self.client.get_program_from_program_id(self.second_program_id)
    
    self.assertEqual(self.second_program_id, second_program.program_id)
    print("Successfully got program from program id")

  
  async def create_market_test(self, number_of_outcomes):
    market = Keypair()
    args = InitMarketArgs(
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
      number_of_outcomes=number_of_outcomes,
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
    accs = InitMarketAccounts(
      market=market,
      market_authority=self.client.owner,
      payer=self.client.owner,
    )
    await init_market_tx(self.client, args, accs)
    self.market = market
    print(f"Market created: {market.public_key}")

  async def supplement_init_market_test(self, number_of_outcomes):
    if number_of_outcomes == 2:
      args = SupplementInitMarketArgs(
        event_capacity=10,
        nodes_capacity=10,
        outcome_id=0,
        outcome_names=["one", "two"])
      accs = SupplementInitMarketAccounts(
        market=self.market.public_key,
        market_authority=self.client.owner.public_key,
        payer=self.client.owner
      )
      await supplement_init_market_tx(self.client, args, accs)
      print(f"Successfully finished supplement init market")
    else:
      #TODO
      pass

  async def load_market_test(self, pubkey=None):
    market_pubkey = pubkey if pubkey else self.market.public_key
    aver_market = await AverMarket.load(self.client, market_pubkey)
    self.aver_market = aver_market
    print(f"Successfully loaded a market {market_pubkey}")

  async def create_uma_test(self):
    uma = await UserMarket.get_or_create_user_market_account(self.client, self.aver_market, self.client.owner)
    self.user_market = uma
    print(f"Successfully loaded UMA {uma.pubkey}")

  async def place_order_test(self):
    await self.user_market.place_order(self.client.owner, 0, Side.BUY, 0.5, 5, SizeFormat.STAKE)
    print(f"Successfully placed order")

  async def cancel_all_orders_test(self):
    await self.user_market.cancel_all_orders([0])
    print(f"Successfully cancelled all orders")


  # run all the tests in order we want
  async def test_run_all(self):
    # aver client tests
    await self.get_program_from_program_id_test()

    # aver market tests
    # await self.create_market_test(2)
    # await self.supplement_init_market_test(2)
    await self.load_market_test(PublicKey('BufZRp1YonHVR8ZYXheRqqhnL1sAXZpoiMcPNnposBth'))
    
    # UMA tests
    await self.create_uma_test()
    await self.place_order_test()
    await self.cancel_all_orders_test()


# Executing the tests in the above test case class
if __name__ == "__main__":
  unittest.main()