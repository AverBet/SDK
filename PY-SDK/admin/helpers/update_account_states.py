from anchorpy import Context
from pyaver.aver_client import AverClient
from solana.keypair import Keypair
from pyaver.utils import sign_and_send_transaction_instructions
from solana.rpc.types import TxOpts
from solana.system_program import SYS_PROGRAM_ID
from solana.publickey import PublicKey
from pyaver.market import AverMarket


async def update_market_state(market: AverMarket, client: AverClient, account_owner: Keypair, program_id: PublicKey, opts: TxOpts = None):
    program = await client.get_program_from_program_id(program_id)
    ix = program.instruction['update_market_state'](
        ctx=Context(accounts={
            "payer": account_owner.public_key,
            "market_authority": market.market_state.market_authority,
            "market": market.market_pubkey,
            "system_program": SYS_PROGRAM_ID 
        })
    )

    return await sign_and_send_transaction_instructions(
        client,
        [],
        account_owner,
        [ix],
        opts
    )