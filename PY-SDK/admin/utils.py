from solana.rpc.async_api import AsyncClient
from solana.publickey import PublicKey
from solana.keypair import Keypair
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Processed
from solana.system_program import transfer, TransferParams
from spl.token.constants import TOKEN_PROGRAM_ID
from spl.token.client import Token
from spl.token.instructions import get_associated_token_address, create_associated_token_account
from spl.token._layouts import MINT_LAYOUT
from solana.transaction import Transaction

async def get_or_create_associated_token_address(client: AsyncClient, owner: PublicKey, mint: PublicKey, fee_payer: Keypair) -> PublicKey:
  ata = get_associated_token_address(owner, mint)
  associated_token_account_info = await client.get_account_info(ata)
  account_info = associated_token_account_info['result']['value']
  if account_info is None: 
      ata_ix = create_associated_token_account(
          payer=fee_payer.public_key,
          owner=owner,
          mint=mint,
      )
      await client.send_transaction(
        Transaction().add(ata_ix),
        *[fee_payer],
        opts=TxOpts(
          skip_confirmation=False,
          preflight_commitment=client.commitment
        )
      )
  return ata