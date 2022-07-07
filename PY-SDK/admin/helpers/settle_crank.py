import requests
from pyaver.market import AverMarket
from pyaver.aver_client import AverClient
from pyaver.enums import MarketStatus
from solana.rpc.types import MemcmpOpts, RPCResponse
from .ids import *
import base58
import base64


# get aver markets
async def get_aver_settlable_market_accounts(client: AverClient):
    # MarketStatus.RESOLVED, MarketStatus.VOIDED
    settleable_statuses = [MarketStatus.RESOLVED,
                        MarketStatus.VOIDED]
    try:
        all_aver_markets_db = requests.get(
            AVER_API_URL + '/v2/markets').json()
        if len(all_aver_markets_db) == 0:
            print(f'Error: No markets returned from Aver DB')
            return []
    except Exception as e:
        print(f'failed to get markets from DB: {e}')
        return []
    
    all_aver_markets_pubkeys = [m['pubkey'] for m in all_aver_markets_db]
    aver_market_data = await AverMarket.load_multiple_market_states(client, all_aver_markets_pubkeys)

    aver_market_valid_pubkeys = [all_aver_markets_pubkeys[i] for i, m in enumerate(aver_market_data) if bool(m) and m.market_status in settleable_statuses and m.number_of_umas > 0]
    print(f'settlable markets (>0 UMAS): {len(aver_market_valid_pubkeys)}')
    
    return aver_market_valid_pubkeys


# get all markets
def get_all_settleable_market_accounts(client: AverClient):
  # MarketStatus.RESOLVED, MarketStatus.VOIDED
  settleable_statuses = [MarketStatus.RESOLVED,
                        MarketStatus.VOIDED]
  market_buffers = {}
  all_settlable_market_pubkeys = []
  for status in settleable_statuses:
      market_buffers = get_all_market_accounts_by_status(client, status=status)

      status_text = 'Resolved' if status == MarketStatus.RESOLVED else 'Voided'
      print(f'{status_text} markets: {len(market_buffers.keys())}')

      settlable_market_pubkeys = [m for m in list(market_buffers.keys()) if market_buffers[m][12] != 0]
      print(f'{status_text} settleable markets (>0 UMAs): {len(settlable_market_pubkeys)}')

      all_settlable_market_pubkeys.extend(settlable_market_pubkeys)

  return all_settlable_market_pubkeys


def get_all_market_accounts_by_status(
  client: AverClient,
  status: MarketStatus = MarketStatus.RESOLVED
):
  # Filter for MARKET type accounts with Market State as specified
  filters = [
      MemcmpOpts(
          offset=0,
          bytes=base58.b58encode(
              MARKET_ACCOUNT_DISCRIMINATOR).decode("utf-8"),
      ),
      MemcmpOpts(
          offset=9,
          bytes=base58.b58encode(int.to_bytes(
              status, length=1, byteorder='little', signed=False)).decode("utf-8"),
      ),
  ]
  response = client.solana_client.get_program_accounts(
      pubkey=AVER_PROGRAM_ID,
      commitment=COMMITMENT,
      encoding="base64",
      data_slice=None,
      data_size=None,
      memcmp_opts=filters,
  )
  market_parsed_buffers = {x['pubkey']: base64.decodebytes(
      x['account']['data'][0].encode("ascii")) for x in response['result']}
  return market_parsed_buffers


def get_uma_accounts_for_market(
        client: AverClient,
        market_pubkey: PublicKey,
    ):

    # Filter for UMA type accounts for this market
    filters = [
        MemcmpOpts(
            offset=0,
            bytes=base58.b58encode(
                USER_MARKET_ACCOUNT_DISCRIMINATOR).decode("utf-8"),
        ),
        MemcmpOpts(
            offset=9, #offset for discriminator (u64) and version (u8)
            bytes=str(market_pubkey),
        ),
    ]

    response = client.solana_client.get_program_accounts(
        pubkey=AVER_PROGRAM_ID,
        commitment=COMMITMENT,
        encoding="base64",
        data_slice=None,
        data_size=None,
        memcmp_opts=filters,
    )

    uma_buffers = {x['pubkey']: base64.decodebytes(
        x['account']['data'][0].encode("ascii")) for x in response['result']}

    return uma_buffers

def get_uhl_accounts_for_market(
        client: AverClient,
        market_pubkey: PublicKey,
    ):

    # Filter for UMA type accounts for this market
    filters = [
        MemcmpOpts(
            offset=0,
            bytes=base58.b58encode(
                USER_MARKET_ACCOUNT_DISCRIMINATOR).decode("utf-8"),
        ),
        MemcmpOpts(
            offset=9, #offset for discriminator (u64) and version (u8)
            bytes=str(market_pubkey),
        ),
    ]

    response = client.solana_client.get_program_accounts(
        pubkey=AVER_PROGRAM_ID,
        commitment=COMMITMENT,
        encoding="base64",
        data_slice=None,
        data_size=None,
        memcmp_opts=filters,
    )

    uma_buffers = {x['pubkey']: base64.decodebytes(
        x['account']['data'][0].encode("ascii")) for x in response['result']}

    return uma_buffers