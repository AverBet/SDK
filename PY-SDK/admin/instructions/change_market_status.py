from solana.publickey import PublicKey
from solana.keypair import Keypair
from anchorpy import Program, Context
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.constants import AVER_PROGRAM_IDS, get_quote_token
from ...public.src.pyaver.aver_client import AverClient

async def change_market_status_tx(
  program: Program,
  market: AverMarket,
  market_authority: Keypair,
  new_market_status: int
):
  [market_store, _] = AverMarket.derive_market_store_pubkey_and_bump(market.market_pubkey, market.program_id)

  return await program.rpc["change_market_status"](
      new_market_status,
      ctx=Context(
          accounts={
              "market": market.market_pubkey,
              "market_authority": market_authority.public_key,
              "market_store": market_store,
          },
          signers=[market_authority],
      ),
  )