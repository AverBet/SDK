from email.mime import base
import requests
import base58
from solana.keypair import Keypair
from solana.publickey import PublicKey
from solana.rpc.async_api import AsyncClient
import asyncio
from ..public.src.pyaver.aver_client import AverClient
from ..public.src.pyaver.constants import get_solana_endpoint, SolanaNetwork
from ..public.src.pyaver.market import AverMarket
from ..public.src.pyaver.user_market import UserMarket
from ..public.src.pyaver.enums import Side, SizeFormat


network = SolanaNetwork.DEVNET
owner = Keypair.from_secret_key(base58.b58decode('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S'))
markets = [
  PublicKey('9vzuUMXLbzqBHGH4hyPKyfCtCCnzQqdewe83f5kLZpuX'),
  PublicKey('cyS6DMfVhM2xwo6LP5G5hbGDsmKby3unjKo3T1Uh2qf'),
  PublicKey('5xCWC3xtnoDXKAXRK9Ubmfd3DRzrudo4282PBZ95EyGu'),
  PublicKey('56AEJJfkeDemWcWpRFNDR4XEutt7VKVQe5pNB4QF7y8X'),
  PublicKey('EdnDstui5zn1huVJFCnCkyqB9eDmepfP2f3Ay8XE65m5'),
  PublicKey('Heakoiy9Sf5v2XxkXsYKJaeiyfcM2nC3Ft8ANRt9v4b2')
]
keypairs = [
  # HSuD2hdfqi8nsaw6Se5qsYr1BoLq3izC2s4qicfLyTRE
  Keypair.from_secret_key(base58.b58decode('3GEjPnDjKuNp2bJdXYxVaDwz92BkXZKT77rFpef8JCKTww3VcP4abRJF1a3Yj5DFxtX4AojUdZt4UH41aPNRtHz')),
  # GMZvni1U8inbGhmiEmCrgqcgp1QahFo9X3hCgj574DzU
  Keypair.from_secret_key(base58.b58decode('3cLLLZtkC3V7RuDZJo4ioeSyQRHRfWdgxxr2VCdmcmvr5Q2qXhqEm2U5oQaGwrvwfGPzPEBh2N3nW2uQGVd3PtZJ')),
  # 35hnjwrLBJVmFXXPLHXFtJ7kUAH5XgM4UjW7mnqiCoPR
  Keypair.from_secret_key(base58.b58decode('5RwbMTmXs69xAX5ADRKmA3AaK4TKTmqx3Q8jK1wrgALTSnFhKJT2M94CK885kNfodVva6d2t9ZRxBDCXHXqc5rDh')),
  # Aa3BweHRjn2hi3BzJ3MUkoRivuDazrV8YdDQ6YvubdAc
  Keypair.from_secret_key(base58.b58decode('5y3uSFARyUddfWwXJMY8xCxXF6VAVShbNzjkHCMEbNW1nhPfKZxX9dYkooNfQBXJgM76GycncJ37mJ74KjpLHset')),
  # 5iCDrvVnQhDhC82NUJJKc7w52xwBJQerq2LQc2WMq7ZY
  Keypair.from_secret_key(base58.b58decode('tNxvM2j1qxvPQP8ZWi2AU1e26iPWPD4gpWM6G88GShBancti4DvieLx9cRJ6ZJUcLP3bVEbWGaC2K4HRNVd5UeA')),
]

async def main():
  # await create_wallets()
  await place_bets_across_markets()

async def create_wallets():
  for i in range(0, 5):
    keypair = Keypair()
    print(keypair.public_key)
    print(base58.b58encode(keypair.secret_key))
    print("=============================")

async def place_bets_across_markets():
  endpoint = get_solana_endpoint(network)
  connection = AsyncClient(endpoint, "confirmed")
  client = await AverClient.load(connection, owner)
  loaded_markets = await AverMarket.load_multiple(client, markets)

  for market in loaded_markets:
    for keypair in keypairs:
      for outcome in range(0,2):
        uma = await UserMarket.get_or_create_user_market_account(client, market, keypair)
        await uma.place_order(keypair, outcome, Side.BUY, 0.4, 10, SizeFormat.STAKE)
        await uma.place_order(keypair, outcome, Side.SELL, 0.4, 10, SizeFormat.STAKE)
        print(f'placed orders for {market.market_pubkey} and outcome {outcome} for keypair {keypair.public_key}')


async def match_bets():
  pass

if __name__ ==  '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
    loop.close()