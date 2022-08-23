import unittest
from solana.keypair import Keypair
import base58
from ...public.src.pyaver.aver_client import AverClient
from ...public.src.pyaver.constants import *
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import *
from solana.rpc import types
from solana.publickey import PublicKey

class TestSdkV2(unittest.IsolatedAsyncioTestCase):
  async def asyncSetUp(self) -> None:
    # constants we can adjust
    self.second_program_id = PublicKey('81aTPaDchxBxJSyZzw7TvVY3PcdAvrfTSQC58NpXtkTT')
    owner = Keypair.from_secret_key(base58.b58decode('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S'))

    # setup the client
    network = SolanaNetwork.DEVNET
    solana_endpoint = get_solana_endpoint(network)
    connection = AsyncClient(solana_endpoint, Confirmed)
    opts = types.TxOpts(False, False, Confirmed)
    self.client = await AverClient.load(connection, owner, opts, network)

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

  # run all the tests in order we want
  async def test_run_all(self):
    # aver client tests
    await self.get_program_from_program_id_test()

    # aver market tests

    # user host lifetime tests


# Executing the tests in the above test case class
if __name__ == "__main__":
  unittest.main()