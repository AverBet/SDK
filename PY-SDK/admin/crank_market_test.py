import unittest
from anchorpy import Wallet 
from solana.keypair import Keypair
from solana.rpc.async_api import AsyncClient
from pyaver.constants import AVER_PROGRAM_ID
from pyaver.enums import SolanaNetwork
from helpers.aver_client_setup_tests import aver_client_setup_tests
from helpers.create_market_tests import create_init_market_smoke_tests
from helpers.place_orders_for_crank_test import place_orders_for_crank_test
from pyaver.aver_client import AverClient
from solana.rpc.types import TxOpts
from pyaver.constants import get_solana_endpoint
from solana.rpc.commitment import Confirmed
import base58 

class CrankMarketTest(unittest.IsolatedAsyncioTestCase):
    #To run all code from an entirely new set of keypairs and markets, set this to True
    full_test=True

    async def asyncSetUp(self):
        owner_1 = Keypair()
        owner_2 = Keypair()
        market = Keypair()
        market_authority = Keypair()

        network = SolanaNetwork.DEVNET
        opts = TxOpts(preflight_commitment=Confirmed)
        connection = AsyncClient(
            get_solana_endpoint(network),
            'confirmed',
            timeout=30
        )
        client = await AverClient.load(connection, owner_1, opts, SolanaNetwork.DEVNET, AVER_PROGRAM_ID)


        print(base58.b58encode(owner_1.secret_key))
        print(base58.b58encode(owner_2.secret_key))
        print(base58.b58encode(market.secret_key))

        self.owner_1 = owner_1
        self.owner_2 = owner_2
        self.client = client
        self.market = market
        self.market_authority = market_authority

        if(not self.full_test):
            self.owner_1 = Keypair.from_secret_key(base58.b58decode('1p5Bhigmz4n6JW6ZRRLvuanrp5HQcGHKj8crHB5Dk1Xa81ZGoLXF76MKDKysnMLNyFQN9GbFWcNJAHkJaeSueii'))
            self.owner_2 = Keypair.from_secret_key(base58.b58decode('oLVjw6RURcVvVpNFT2FrCDyPEjyKNcntiECzXmjTHEgMd5WB5Pk1hqmNXFMqVEZvezgb2NBraHx9RKSxbfHZ26f'))
            self.market = Keypair.from_secret_key(base58.b58decode('JSZuBzYzZQdgTaF7ZkRj581DFZ2sK1bb2kNdCBANWFcKyNUgKsRHtmZeJtw25wVAmSTuwFu8jLn9UEU1NLVinjG'))
            self.client.owner = self.owner_1
            self.client.provider.wallet = Wallet(self.owner_1)
        return await super().asyncSetUp()
    
    async def test_setup_tests(self):
        if self.full_test:
            await aver_client_setup_tests(self.owner_1, self.client)
            await aver_client_setup_tests(self.owner_2, self.client)
            await create_init_market_smoke_tests(self.client, self.owner_1, 2, self.market, self.market_authority)
        await place_orders_for_crank_test(self.client, self.owner_1, self.owner_2, self.market, self.full_test)


    async def asyncTearDown(self):
        await self.client.close()
        return await super().asyncTearDown()

if __name__ == '__main__':
    unittest.main()