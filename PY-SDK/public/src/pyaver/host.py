from .aver_client import AverClient
from solana.publickey import PublicKey
from .data_classes import HostState
# from constants import AVER_PROGRAM_ID_DEVNET_2
from .constants import AVER_PROGRAM_ID
from .utils import sign_and_send_transaction_instructions
from solana.system_program import SYS_PROGRAM_ID
from anchorpy import Context
from solana.keypair import Keypair
from solana.rpc.types import TxOpts


class Host():
    """
    Host Class

    Hosts spinup their own frontends and collect fees in return
    """

    pubkey: PublicKey
    """
    Host public key
    """

    host_state: HostState
    """
    Host state containing parsed data
    """

    def __init__(self, pubkey: PublicKey, host_state: HostState):
        """
        Initialises Host object. Do not use this function; use Host.load() instead

        Args:
            pubkey (PublicKey): Host public key
            host_state (HostState): Host state containing parsed data
        """
        self.pubkey = pubkey
        self.host_state = host_state
    
    @staticmethod
    async def load(aver_client: AverClient, pubkey: PublicKey):
        """
        Initialises a Host object.

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): Public key of host

        Returns:
            Host: Host
        """
        host_result = await aver_client.program.account['Host'].fetch(pubkey)
        return Host(pubkey, host_result)


    @staticmethod
    def make_create_host_account_instruction(
        aver_client: AverClient,
        owner: Keypair,
        fee_payer: Keypair,
        referrer_fee_rate_offerer_bps: int = 0,
        program_id = AVER_PROGRAM_ID
    ):
        """
        Creates instruction for host account.

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            aver_client (AverClient): AverClient object
            owner (Keypair): Keypair of owner of host account
            fee_payer (Keypair): Keypair to pay fee for transaction
            referrer_fee_rate_offerer_bps (int, optional): Fees given to referrer. Defaults to 0.
            program_id (_type_, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        host_pubkey, bump = Host.derive_pubkey_and_bump(owner.public_key, program_id)
        return aver_client.program.instruction['init_host'](
            referrer_fee_rate_offerer_bps, 
            bump,
            ctx=Context(accounts={
                "payer": fee_payer.public_key,
                "owner": owner.public_key,
                "host": host_pubkey,
                "system_program": SYS_PROGRAM_ID,
                },
                signers=[fee_payer, owner]
            )
            
            )

    @staticmethod
    async def create_host_account(
        aver_client: AverClient,
        owner: Keypair,
        fee_payer: Keypair,
        send_options: TxOpts = None,
        referrer_fee_rate_offerer_bps: int = 0,
        program_id = AVER_PROGRAM_ID,
    ):
        """
        Creates host account.

        Sends an instructions to the on-chain program to create a new Host account.

        Args:
            aver_client (AverClient): AverClient object
            owner (Keypair): Keypair of owner of host account
            fee_payer (Keypair): Keypair to pay fee for transaction and rent cost
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            referrer_fee_rate_offerer_bps (int, optional): Fees given to referrer. Defaults to 0.
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            RPCResponse: Response
        """
        ix = Host.make_create_host_account_instruction(
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

    @staticmethod
    def parse_host_state(aver_client: AverClient, buffer: bytes):
        """
        Parses raw onchain data to HostState object

        Args:
            aver_client (AverClient): AverClient object
            buffer (bytes): Raw bytes coming from onchain

        Returns:
            HostState: HostState object
        """
        host_account_info = aver_client.program.account['Host'].coder.accounts.decode(buffer)
        return host_account_info
    
    @staticmethod
    def derive_pubkey_and_bump(owner: PublicKey, program_id: PublicKey = AVER_PROGRAM_ID):
        """
        Derives PDA for host public key

        Args:
            owner (PublicKey): Owner of host account
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            PublicKey: Host public key
        """
        return PublicKey.find_program_address([bytes('host', 'utf-8'), bytes(owner)], program_id)