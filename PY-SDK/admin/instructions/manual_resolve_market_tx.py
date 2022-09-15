from solana.publickey import PublicKey
from solana.keypair import Keypair
from anchorpy import Program, Context
from ...public.src.pyaver.market import AverMarket
from solana.system_program import SYS_PROGRAM_ID


async def manual_resolve_market_tx(
  program: Program,
  market: AverMarket,
  market_authority: Keypair,
  outcome_id: int
):
  quote_vault = market.market_state.quote_vault

  return await program.rpc["resolve_market"](
      outcome_id,
      ctx=Context(
          accounts={
              "market": market.market_pubkey,
              "market_authority": market_authority.public_key,
              "quote_vault": quote_vault,
              "resolution_account": SYS_PROGRAM_ID
          },
          signers=[market_authority],
      ),
  )