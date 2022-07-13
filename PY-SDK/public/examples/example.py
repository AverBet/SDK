import asyncio
import base58
from solana.rpc.async_api import AsyncClient
from solana.keypair import Keypair
from pyaver.enums import SolanaNetwork
from pyaver.aver_client import AverClient
from pyaver.constants import get_solana_endpoint, AVER_PROGRAM_ID, get_aver_api_endpoint
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed
import base58 
from pyaver.enums import Side, SizeFormat
from pyaver.refresh import refresh_user_market
from solana.publickey import PublicKey
from pyaver.market import AverMarket
from pyaver.user_market import UserMarket
from requests import get
from token_airdrop import request_token_airdrop

#DEVNET EXAMPLE

async def main():
    #Decoding the secret key from base58 to bytes
    secret_key = base58.b58decode('zSaKmpRbsJQQjmMRQsADRQ1vss8P2SQLbxGiiL8LFf9rJ8bFT8S1jAqj8Fkwg9hyq6vb97rR8EDkyu5EFD2tFbj')
    owner = Keypair.from_secret_key(secret_key)

    #Default Transaction Options
    opts = TxOpts(preflight_commitment=Confirmed)
    connection = AsyncClient(
            get_solana_endpoint(SolanaNetwork.DEVNET),
            'confirmed',
            timeout=30
    )
    client = await AverClient.load(
        connection=connection, 
        owner=owner, 
        opts=opts, 
        network=SolanaNetwork.DEVNET, 
        program_id=AVER_PROGRAM_ID
        )

    all_markets = get(get_aver_api_endpoint(SolanaNetwork.DEVNET) + '/v2/markets')
    #Just pick the first active market
    chosen_market = ''
    for m in all_markets.json():
        print(m)
        if m['internal_status'] != 'test':
            chosen_market = m
            break
    print(chosen_market)
    market_pubkey = PublicKey(chosen_market['pubkey'])
    ###
    #Example warning
    #Sometimes, the markets loaded above may have already been resolved
    #Therefore, I've copied and pasted a market public key from https://dev.app.aver.exchange/
    ###
    market_pubkey = PublicKey('Bq8wyvvWbSLcodH3DjamHZCnRZ4XzGCg4UTCGi8tZhvL')

    #Load market
    market = await AverMarket.load(client, market_pubkey)

    #Print market data
    print(market.market_state)

    #Obtain orderbook
    outcome_1_orderbook = market.orderbooks[0]
    #Print orderbook data
    print('Best Ask Price', outcome_1_orderbook.get_best_ask_price(True))
    print('Best Bid Price', outcome_1_orderbook.get_best_bid_price(True))

    #Gets Solana Airdrop and USDC Token Airdrop
    #Only available on devnet
    await client.request_lamport_airdrop(1_000_000, owner.public_key)
    print('New Balance: ', await client.request_lamport_balance(owner.public_key))
    #Creates Associated Token Account where tokens will be stored
    ata = await client.get_or_create_associated_token_account(
        owner.public_key,
        owner,
    )
    signature = request_token_airdrop(client.aver_api_endpoint, client.quote_token,owner.public_key, 1_000_000_000)['signature']
    #Wait to ensure transaction has been confirmed before moving on
    await client.provider.connection.confirm_transaction(signature, Confirmed) 
    token_balance = await client.request_token_balance(client.quote_token, owner.public_key)
    print('New token balance: ', token_balance)

    #Create User Market Account
    #This function also automatically gets_or_creates a UserHostLifetime account
    uma = await UserMarket.get_or_create_user_market_account(
        client,
        owner,
        market
    )

    #Place order
    #This order a BUY side on outcome 1 at a price of 0.5 and size 10
    #This means it will cost 5 tokens and we will win 10 (once the bet is matched and if we win)
    signature = await uma.place_order(
        owner,
        0, #Outcome 1
        Side.BUY,
        limit_price=0.5,
        size=10,
        size_format=SizeFormat.PAYOUT
    )
    #Wait to ensure transaction has been confirmed before moving on
    await client.provider.connection.confirm_transaction(signature['result'], Confirmed)

    #Refresh market information efficiently
    #Refreshing a User Market also automatically refreshes the market
    uma = await refresh_user_market(client, uma)
    market = uma.market
    
    #Cancel order
    #We should only have 1 order, so we'll cancel the first in the array
    my_order_id = uma.user_market_state.orders[0].order_id
    signature = await uma.cancel_order(
        owner,
        my_order_id,
        0, #We placed an order on outcome 1
        active_pre_flight_check=True
    )
    #Wait to ensure transaction has been confirmed before moving on
    await client.provider.connection.confirm_transaction(signature['result'], Confirmed) 

    #Finally close the client
    await client.close()

    

asyncio.run(main())