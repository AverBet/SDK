from .aver_client import AverClient
from solana.publickey import PublicKey
from .data_classes import ReferrerState
from .constants import AVER_PROGRAM_ID, AVER_HOST_ACCOUNT
from .utils import sign_and_send_transaction_instructions
from solana.system_program import SYS_PROGRAM_ID
from spl.token.constants import TOKEN_PROGRAM_ID
from anchorpy import Context
from solana.keypair import Keypair
from solana.rpc.types import TxOpts

class Referrer():
    """
    Referrer account for a particular host

    Earn fees for referring users to host
    """

    pubkey: PublicKey
    """
    Referrer public key
    """
    referrer_state: ReferrerState
    """
    ReferrerState object
    """

    def __init__(self, pubkey: PublicKey, referrer_state: ReferrerState):
        """
        Initialise an Referrer object. Do not use this function; use Referrer.load() instead

        Args:
            pubkey (PublicKey): Referrer public key
            referrer_state (ReferrerState): ReferrerState object
        """
        self.pubkey = pubkey
        self.referrer_state = referrer_state

    @staticmethod
    async def load(aver_client: AverClient, pubkey: PublicKey):
        """
        Initialises a Refferer object

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): Referrer public key

        Returns:
            Referrer: ReferrerObject
        """
        referrer_state = await aver_client.program.account['Referrer'].fetch(pubkey)
        return Referrer(pubkey, referrer_state)
    
    @staticmethod
    def make_create_referrer_account_instruction(
        aver_client: AverClient,
        host: PublicKey,
        owner: Keypair,
        fee_payer: Keypair,
        program_id: PublicKey = AVER_PROGRAM_ID
    ):
        """
        Creates instruction for referrer account creation

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            aver_client (AverClient): AverClient object
            host (PublicKey): Host account public key
            owner (Keypair): Keypair of owner of referrer account
            fee_payer (Keypair): Keypair to pay fee for transaction and rent cost
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        referrer, bump = Referrer.derive_pubkey_and_bump(owner.public_key, host, program_id)
        return aver_client.program.instruction['init_referrer'](bump, ctx=Context(
            accounts={
                "payer": fee_payer.public_key,
                "owner": owner.public_key,
                "referrer": referrer,
                "host": host,
                "system_program": SYS_PROGRAM_ID,
            },
            signers=[fee_payer, owner]
        ))
    
    @staticmethod
    async def create_referrer_account(
        aver_client: AverClient,
        host: PublicKey,
        owner: Keypair,
        fee_payer: Keypair,
        send_options: TxOpts = None,
        program_id: PublicKey = AVER_PROGRAM_ID
        ):
            """
            Creates host account.

            Sends instructions on chain

            Args:
                aver_client (AverClient): AverClient object
                host (PublicKey): Host account public key
                owner (Keypair): Keypair of owner of referrer account
                fee_payer (Keypair): Keypair to pay fee for transaction and rent cost
                send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
                program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

            Returns:
                RPCResponse: Response
            """

            ix = Referrer.make_create_referrer_account_instruction(
                aver_client,
                host,
                owner,
                fee_payer,
                program_id
            )

            return await sign_and_send_transaction_instructions(
                aver_client,
                [],
                fee_payer,
                [ix],
                send_options
            )

    @staticmethod
    def make_collect_revenue_share_instruction(
        aver_client: AverClient,
        referrer: PublicKey,
        third_party_token_vault: PublicKey,
        third_party_vault_authority: Keypair,
        referrer_token_account: PublicKey,
        fee_payer: Keypair,
    ):
        """
        Creates instruction for to collect revenue share for referrals.

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            aver_client (AverClient): AverClient object
            referrer (PublicKey): Referrer account public key
            third_party_token_vault (PublicKey): _description_
            third_party_vault_authority (Keypair): _description_
            referrer_token_account (PublicKey): _description_
            fee_payer (Keypair): Keypair to pay fee for transaction

        Returns:
            TransactionInstrunction: TransactionInstruction object
        """
        return aver_client.program.instruction['referrer_collect_revenue_share'](ctx=Context(
            accounts={
                "referrer": referrer,
                "third_party_token_vault": third_party_token_vault,
                "third_party_vault_authority": third_party_vault_authority.public_key,
                "referrer_token_account": referrer_token_account,
                "spl_token_program": TOKEN_PROGRAM_ID,
            },
            signers=[fee_payer]
        ))
    
    @staticmethod
    async def collect_revenue_share(
        aver_client: AverClient,
        referrer: PublicKey,
        third_party_token_vault: PublicKey,
        third_party_vault_authority: Keypair,
        referrer_token_account: PublicKey,
        fee_payer: Keypair,
        send_options: TxOpts = None,
        ):
            """
            Collects revenue share for referrals

            Sends instructions on chain

            Args:
                aver_client (AverClient): AverClient object
                referrer (PublicKey): Referrer account public key
                third_party_token_vault (PublicKey): _description_
                third_party_vault_authority (Keypair): _description_
                referrer_token_account (PublicKey): _description_
                fee_payer (Keypair): Keypair to pay fee for transaction
                send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.

            Returns:
                RPCResponse: Response
            """
            ix = Referrer.make_collect_revenue_share_instruction(
                aver_client,
                referrer,
                third_party_token_vault,
                third_party_vault_authority,
                referrer_token_account,
                fee_payer,
            )

            return await sign_and_send_transaction_instructions(
                aver_client,
                [],
                fee_payer,
                [ix],
                send_options
            )


    @staticmethod 
    def parse_referrer_state(aver_client: AverClient, buffer):
        """
        Parses raw onchain data to ReferrerState object

        Args:
            aver_client (AverClient): AverClient object
            buffer (bytes): Raw bytes coming from onchain

        Returns:
            ReferrerState: ReferrerState object
        """
        referrer_account_info = aver_client.program.account['Referrer'].coder.accounts.decode(buffer)
        return referrer_account_info

    @staticmethod
    def derive_pubkey_and_bump(owner: PublicKey, host: PublicKey = AVER_HOST_ACCOUNT,program_id: PublicKey = AVER_PROGRAM_ID):
        """
        Derives PDA for referrer public key

        Args:
            owner (PublicKey): Owner of host account
            host (PublicKey, optional): Public key of corresponding Host account. Defaults to AVER_HOST_ACCOUNT.
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            PublicKey: Public key of Referrer account
        """
        return PublicKey.find_program_address([bytes('referrer', 'utf-8'), bytes(host), bytes(owner)], program_id)