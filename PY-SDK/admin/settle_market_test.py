import unittest 
from solana.keypair import Keypair
from pyaver.enums import SolanaNetwork
from pyaver.aver_client import AverClient
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed
from solana.rpc.async_api import AsyncClient
from pyaver.constants import get_solana_endpoint
from pyaver.constants import AVER_PROGRAM_ID
from pyaver.market import AverMarket
from helpers.settle_market import settle_market
import base58 

class SettleMarketTest(unittest.IsolatedAsyncioTestCase):
    #To run all code from an entirely new set of keypairs and markets, set this to True
    full_test=False

    async def asyncSetUp(self):
        owner = Keypair()
        market = Keypair()
        market_authority = Keypair()
       
        if(not self.full_test): 
            market = Keypair.from_secret_key(base58.b58decode('5KZbYTLo2NjLMSwqFga2sdYmePhNv86Y7HMuK193Z3kVRnnY73AhfZjiJLeTLxpUzmw3VA1h7CadBtCcbATwLvdT'))
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
        loaded_market = await AverMarket.load(self.client, self.market.public_key)
        print(await settle_market(loaded_market))

    async def asyncTearDown(self):
        await self.client.close()
        return await super().asyncTearDown()

if __name__ == '__main__':
    unittest.main()