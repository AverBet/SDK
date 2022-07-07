import unittest
from solana.rpc.async_api import AsyncClient
from solana.keypair import Keypair
from constants import AVER_PROGRAM_ID
from enums import SolanaNetwork
from tests.helpers.aver_client_setup_tests import aver_client_setup_tests
from tests.helpers.create_market_tests import create_init_market_smoke_tests
from tests.helpers.user_smoke_flow_tests import user_flow_smoke_tests
from aver_client import AverClient
from constants import get_solana_endpoint
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed
import base58 
import time

class BinaryMarketTest(unittest.IsolatedAsyncioTestCase):
    #To run all code from an entirely new set of keypairs and markets, set this to True
    full_test=True

    async def asyncSetUp(self):
        owner = Keypair()
        market = Keypair()
        market_authority = Keypair()
       
        if(not self.full_test): 
            market = Keypair.from_secret_key(base58.b58decode('34AdkHPGtmbAuwDBHXLA9UPSx5XAm2asEhTVdV71UmrZroxEjBQrYC7Ztxsk5MPpWYB3GcbidiG1APqRK6gRgGbk'))
            secret_key = base58.b58decode('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S')
            owner = Keypair.from_secret_key(secret_key)

        network = SolanaNetwork.DEVNET
        opts = TxOpts(preflight_commitment=Confirmed)
        connection = AsyncClient(
            get_solana_endpoint(network),
            'confirmed',
            timeout=30
        )
        client = await AverClient.load(connection, owner, opts, SolanaNetwork.DEVNET, AVER_PROGRAM_ID)

        self.owner = owner
        self.client = client
        self.market = market
        self.market_authority = market_authority

        return await super().asyncSetUp()
    
    async def test_setup_tests(self):

        if(self.full_test):
            await aver_client_setup_tests(self.owner, self.client)
            #Sleeping to prevent 'Too many requests'
            time.sleep(10)
            await create_init_market_smoke_tests(self.client, self.owner, 2, self.market, self.market_authority)
            time.sleep(10)
        await user_flow_smoke_tests(self.client, self.owner, self.market, self.full_test)

    async def asyncTearDown(self):
        await self.client.close()
        return await super().asyncTearDown()

if __name__ == '__main__':
    unittest.main()