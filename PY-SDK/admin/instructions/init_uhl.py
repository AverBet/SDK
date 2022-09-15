from anchorpy import Context
from ...public.src.pyaver.aver_client import AverClient
from ...public.src.pyaver.market import AverMarket
from ...public.src.pyaver.constants import AVER_PROGRAM_IDS
from ...public.src.pyaver.utils import sign_and_send_transaction_instructions
from solana.keypair import Keypair
from solana.publickey import PublicKey
from solana.rpc.types import TxOpts
from solana.system_program import SYS_PROGRAM_ID

def make_create_host_account_instruction(
    aver_client: AverClient,
    owner: Keypair,
    fee_payer: Keypair,
    referrer_fee_rate_offerer_bps: int = 0,
    program_id = AVER_PROGRAM_IDS[0]
):
    """
    Creates instruction for host account.

    Returns TransactionInstruction object only. Does not send transaction.

    Args:
        aver_client (AverClient): AverClient object
        owner (Keypair): Keypair of owner of host account
        fee_payer (Keypair): Keypair to pay fee for transaction.
        referrer_fee_rate_offerer_bps (int, optional): Fees given to referrer. Defaults to 0.
        program_id (_type_, optional): Program public key. Defaults to AVER_PROGRAM_ID.

    Returns:
        TransactionInstruction: TransactionInstruction object
    """
    host_pubkey, bump = derive_pubkey_and_bump(owner.public_key, program_id)
    return aver_client.programs[0].instruction['init_host'](
        referrer_fee_rate_offerer_bps, 
        # bump,
        ctx=Context(accounts={
            "payer": fee_payer.public_key,
            "owner": owner.public_key,
            "host": host_pubkey,
            "system_program": SYS_PROGRAM_ID,
            },
            signers=[fee_payer, owner]
        )
        
        )

async def create_host_account(
    aver_client: AverClient,
    owner: Keypair,
    fee_payer: Keypair = None,
    send_options: TxOpts = None,
    referrer_fee_rate_offerer_bps: int = 0,
    program_id = AVER_PROGRAM_IDS[0],
):
    """
    Creates host account.

    Sends an instructions to the on-chain program to create a new Host account.

    Args:
        aver_client (AverClient): AverClient object
        owner (Keypair): Keypair of owner of host account
        fee_payer (Keypair): Keypair to pay fee for transaction and rent cost. Defaults to AverClient Wallet
        send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
        referrer_fee_rate_offerer_bps (int, optional): Fees given to referrer. Defaults to 0.
        program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

    Returns:
        RPCResponse: Response
    """
    if(fee_payer is None):
        fee_payer = aver_client.provider.wallet.payer

    ix = make_create_host_account_instruction(
        aver_client,
        owner,
        fee_payer,
        referrer_fee_rate_offerer_bps,
        program_id
    )

    return await sign_and_send_transaction_instructions(
        aver_client,
        [owner],
        fee_payer,
        [ix,],
        send_options
    )

def derive_pubkey_and_bump(owner: PublicKey, program_id: PublicKey = AVER_PROGRAM_IDS[0]):
    """
    Derives PDA for host public key

    Args:
        owner (PublicKey): Owner of host account
        program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

    Returns:
        PublicKey: Host public key
    """
    return PublicKey.find_program_address([bytes('host', 'utf-8'), bytes(owner)], program_id)