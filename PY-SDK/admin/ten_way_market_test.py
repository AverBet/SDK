import unittest 
from solana.keypair import Keypair
from pyaver.enums import SolanaNetwork
from helpers.aver_client_setup_tests import aver_client_setup_tests
from helpers.create_market_tests import create_init_market_smoke_tests
from helpers.user_smoke_flow_tests import user_flow_smoke_tests
from pyaver.aver_client import AverClient
import base58 
from solana.rpc.async_api import AsyncClient
from pyaver.constants import AVER_PROGRAM_ID
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts
import time
from pyaver.constants import get_solana_endpoint

class TenWayMarketTest(unittest.IsolatedAsyncioTestCase):
    #To run all code from an entirely new set of keypairs and markets, set this to True
    full_test=True

    async def asyncSetUp(self):
        owner = Keypair()
        market = Keypair()
        market_authority = Keypair()

        print(base58.b58encode(market.secret_key))
       
        if(not self.full_test): 
            market = Keypair.from_secret_key(base58.b58decode('44aENtxSmHUeKTkE3ix5yAiLWp4hKV6KhMtbKGSPG2kHT2jtNopEg1T5iER93mxEDCByecaDhoPbvVHB2YX7ExmC'))
            secret_key = base58.b58decode('5kaPbsANMg5sCbc4Uq6EkgQd8wHoNfe3Zvv8a8ERaQG5dbXoXMgPt3CDUrWecCv2a6MUExFB6bfrS3gFSwokHXgV')
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
            await create_init_market_smoke_tests(self.client, self.owner, 10, self.market, self.market_authority)
            time.sleep(10)
            #await host_test(self.client, self.owner, self.market, self.full_test)
        await user_flow_smoke_tests(self.client, self.owner, self.market, self.full_test)

    async def asyncTearDown(self):
        await self.client.close()
        return await super().asyncTearDown()

if __name__ == '__main__':
    unittest.main()