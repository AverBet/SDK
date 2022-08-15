import unittest
from solana.rpc.async_api import AsyncClient
from solana.keypair import Keypair
from solana.publickey import PublicKey
from pyaver.enums import SolanaNetwork
from helpers.aver_client_setup_tests import aver_client_setup_tests
from helpers.create_market_tests import create_init_market_smoke_tests
from helpers.user_smoke_flow_tests import user_flow_smoke_tests
from pyaver.aver_client import AverClient
from helpers.update_account_states import update_market_state
from pyaver.market import AverMarket
from pyaver.constants import get_solana_endpoint, AVER_PROGRAM_ID
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed
import base58 

#####
# This test is for the V1_1 upgrade
# To use:
# 1. Have a new program id (on V1.0) and input it below. Set Variable v1_1 to False
# 2. Run the test. A new market should be created and read. Write down the market secret key
# 3. Upgrade the same program id to V1.1 on chain
# 4. Input the same market secret key to read from onchain on line 40.
# 5. Run the test again with v1_1 as True. Now it should try to read the old market, upgrade it and read it again.
# 6. If all this works without issues, V1_1 is successful
#####

#To run all code from an entirely new set of keypairs and markets, set this to True
program_id = AVER_PROGRAM_ID

#Set to TRUE if Public Key is on V1.1 - This will try to read and upgrade an old market and then read it again
#Set to FALSE o/w - This will try to create a new market and read it
v1_1 = False

class V1_1_Market_Test(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        secret_key = base58.b58decode('3onYh3TSCg92X3kD9gD7RCZF1N8JFVSDp39eSkRswsQb5YwWuyMnzuCN2wuPb52XEnPzjVrCtkYe5Xo8Czd3CDyV')
        owner = Keypair.from_secret_key(secret_key)
        market = Keypair()
        market_authority = Keypair()

        if(v1_1):
            market = Keypair.from_secret_key(base58.b58decode(''))
        else:
            print('-'*10)
            print('NEW MARKET IS BEING CREATED... NOTE DOWN SECRET KEY')
            print('Market: ', base58.b58encode(market.secret_key))
            print('Market pubkey: ', market.public_key)
            print('-'*10)

        network = SolanaNetwork.DEVNET
        opts = TxOpts(preflight_commitment=Confirmed)
        connection = AsyncClient(
            get_solana_endpoint(network),
            'confirmed',
            timeout=30
        )
        client = await AverClient.load(connection, owner, opts, SolanaNetwork.DEVNET, program_id)

        self.owner = owner
        self.client = client
        self.market = market
        self.market_authority = market_authority

        return await super().asyncSetUp()
    
    async def test_setup_tests(self):

        if(not v1_1):
            await create_init_market_smoke_tests(self.client, self.owner, 2, self.market, self.market_authority)
            market = await AverMarket.load(self.client, self.market.public_key)
            print('MARKET CREATED AND LOADED')
            print('MARKET STATE:')
            print(market.market_state)
            print('MARKET STORE STATE: ')
            print(market.market_store_state)
            print('-'*10)
        else:
            print('LOADING OLD MARKET')
            market = await AverMarket.load(self.client, self.market.public_key)
            print('MARKET CREATED AND LOADED')
            print('MARKET STATE:')
            print(market.market_state)
            print('MARKET STORE STATE: ')
            print(market.market_store_state)
            print('-'*10)

            print('UPGRADING MARKET BEGIN')
            sig = await update_market_state(market, self.client, self.owner)
            con = await self.client.provider.connection.confirm_transaction(sig, Confirmed)
            print('MARKET UPGRADED')
            print('LOADING OLD MARKET')
            market = await AverMarket.load(self.client, self.market.public_key)
            print('MARKET CREATED AND LOADED')
            print('MARKET STATE:')
            print(market.market_state)
            print('MARKET STORE STATE: ')
            print(market.market_store_state)
            print('-'*10)



    async def asyncTearDown(self):
        await self.client.close()
        return await super().asyncTearDown()

if __name__ == '__main__':
    unittest.main()