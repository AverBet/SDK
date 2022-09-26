from solana.publickey import PublicKey
from solana.keypair import Keypair
from anchorpy import Program, Context
from ...public.src.pyaver.market import AverMarket
from spl.token.constants import TOKEN_PROGRAM_ID
from spl.token.instructions import get_associated_token_address
from ...public.src.pyaver.constants import AVER_MARKET_AUTHORITY


async def close_market_tx(
  program: Program,
  market: AverMarket,
  target_lamports_account: PublicKey,
  market_authority: Keypair = AVER_MARKET_AUTHORITY,
):
    aver_quote_token_account = get_associated_token_address(
        market_authority.public_key, market.market_state.quote_token_mint
    )
    return await program.rpc["close_market"](
        ctx=Context(
            accounts={
                "market": market.market_pubkey,
                "market_authority": market_authority.public_key,
                "quote_vault": market.market_state.quote_vault,
                "vault_authority": market.market_state.vault_authority,
                "target_lamports_account": target_lamports_account,
                "spl_token_program": TOKEN_PROGRAM_ID,
                "aver_quote_token_account": aver_quote_token_account
            },
            signers=[market_authority],
        ),
    )