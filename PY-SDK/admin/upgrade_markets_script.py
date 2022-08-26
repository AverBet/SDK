import requests
import base58
from solana.keypair import Keypair
from solana.rpc.async_api import AsyncClient
import asyncio
from ..public.src.pyaver.aver_client import AverClient
from ..public.src.pyaver.constants import get_solana_endpoint, SolanaNetwork
from ..public.src.pyaver.market import AverMarket

# variables to change
network = SolanaNetwork.DEVNET
owner = Keypair.from_secret_key(base58.b58decode('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S'))
api_endpoint = "https://aver-v12-test.herokuapp.com/"

async def upgrade_markets():
  endpoint = get_solana_endpoint(network)
  connection = AsyncClient(endpoint, "confirmed")
  client = await AverClient.load(connection, owner)
  markets_response = requests.get(api_endpoint + "v2/markets").json()
  # print(markets_response[0])
  market_pubkeys = [market_response["pubkey"] for market_response in markets_response if market_response["internal_status"] == "active"]
  aver_markets = await AverMarket.load_multiple(client, market_pubkeys)
  
  for market in aver_markets:
    try:
      await market.update_market_state(client, owner, client.programs[0].program_id)
      print(f"Successfully upgraded market: {market.market_pubkey}")
    except Exception as e:
      print(f"Error: could not upgrade market {market.market_pubkey}")
      print(e)




if __name__ ==  '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(upgrade_markets())
    loop.close()