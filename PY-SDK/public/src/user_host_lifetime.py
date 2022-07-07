from .aver_client import AverClient
from solana.publickey import PublicKey
from .data_classes import UserHostLifetimeState
# from constants import AVER_PROGRAM_ID, DEFAULT_HOST_ACCOUNT_DEVNET, DEFAULT_QUOTE_TOKEN_DEVNET
from .constants import AVER_PROGRAM_ID, AVER_HOST_ACCOUNT
from .utils import sign_and_send_transaction_instructions
from solana.system_program import SYS_PROGRAM_ID
from spl.token.constants import TOKEN_PROGRAM_ID
from solana.rpc.commitment import Finalized
from anchorpy import Context
from solana.transaction import AccountMeta
from solana.keypair import Keypair
from solana.rpc.types import TxOpts
from .enums import FeeTier

class UserHostLifetime():
    """
    User data and statistics for a particular host

    Contains aggregated lifetime data on a user's trades for a particular host
    """

    pubkey: PublicKey
    """
    UserHostLifetime public key
    """

    user_host_lifetime_state: UserHostLifetimeState
    """
    UserHostLifetimeState object
    """

    def __init__(self, pubkey: PublicKey, user_host_lifetime_state: UserHostLifetimeState):
        """
        Initialise an UserHostLifetime object. Do not use this function; use UserHostLifetime.load() instead

        Args:
            pubkey (PublicKey): UserHostLifetime public key
            user_host_lifetime_state (UserHostLifetimeState): UserHostLifetimeState public key
        """
        self.pubkey = pubkey
        self.user_host_lifetime_state = user_host_lifetime_state

    @staticmethod
    async def load(aver_client: AverClient, pubkey: PublicKey):
        """
        Initialises an UserHostLifetime object

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): UserHostLifetime public key

        Returns:
            UserHostLifetime: UserHostLifetime object
        """
        user_host_lifetime_result = await aver_client.program.account['UserHostLifetime'].fetch(pubkey)
        return UserHostLifetime(pubkey, user_host_lifetime_result)

    @staticmethod
    async def load_multiple(aver_client: AverClient, pubkeys: list[PublicKey]):
        """
         Initialised multiple UserHostLifetime objects

        Args:
            aver_client (AverClient): AverClient object
            pubkeys (list[PublicKey]): List of UserHostLifetime public keys

        Returns:
            list[UserHostLifetime]: List of UserHostLifetime objects
        """
        res = await aver_client.program.account['UserHostLifetime'].fetch_multiple(pubkeys)
        uhls: list[UserHostLifetime] = []
        for i, pubkey in enumerate(pubkeys):
            uhls.append(UserHostLifetime(pubkey, res[i]))
        return uhls

    @staticmethod
    async def get_or_create_user_host_lifetime(
        client: AverClient,
        owner: Keypair,
        send_options: TxOpts = None,
        quote_token_mint: PublicKey = None,
        host: PublicKey = AVER_HOST_ACCOUNT,
        referrer: PublicKey = SYS_PROGRAM_ID,
        discount_token: PublicKey = SYS_PROGRAM_ID,
        program_id: PublicKey = AVER_PROGRAM_ID
    ):
        """
        Attempts to load a UserHostLifetime account and creates one if not found

        Args:
            client (AverClient): AverClient object
            owner (Keypair): Owner of UserHostLifetime account
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            quote_token_mint (PublicKey, optional): Quote token mint public key. Defaults to Defaults to USDC token according to chosen solana network in AverClient.
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            referrer (PublicKey, optional): Referrer account public key. Defaults to SYS_PROGRAM_ID.
            discount_token (PublicKey, optional): _description_. Defaults to SYS_PROGRAM_ID.
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            UserHostLifetime: UserHostLifetime object
        """
        quote_token_mint = quote_token_mint if quote_token_mint is not None else client.quote_token
        user_host_lifetime = UserHostLifetime.derive_pubkey_and_bump(owner.public_key, host, program_id)[0]

        try:
            uhl = await UserHostLifetime.load(client, user_host_lifetime)
            return uhl
        except:
            user_quote_token_ata = await client.get_or_create_associated_token_account(
                owner.public_key, 
                owner, 
                quote_token_mint
            )

            sig = await UserHostLifetime.create_user_host_lifetime(
                client,
                owner,
                user_quote_token_ata,
                send_options,
                host,
                referrer,
                discount_token,
                program_id,
            )

            await client.provider.connection.confirm_transaction(
                sig['result'],
                commitment=Finalized
            )

            return await UserHostLifetime.load(client, user_host_lifetime)
    
    @staticmethod
    def make_create_user_host_lifetime_instruction(
        aver_client: AverClient,
        user_quote_token_ata: PublicKey,
        owner: Keypair,
        host: PublicKey = AVER_HOST_ACCOUNT,
        referrer: PublicKey = SYS_PROGRAM_ID,
        discount_token: PublicKey = SYS_PROGRAM_ID,
        program_id = AVER_PROGRAM_ID
    ):
        """
        Creates instruction for UserHostLifetime account creation

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            aver_client (AverClient): AverClient object
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            owner (Keypair): Keypair of owner of UserHostLifetime account
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            referrer (PublicKey, optional): Referrer account public key. Defaults to SYS_PROGRAM_ID.
            discount_token (PublicKey, optional): _description_. Defaults to SYS_PROGRAM_ID.
            program_id (_type_, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        user_host_lifetime, bump = UserHostLifetime.derive_pubkey_and_bump(owner.public_key, host, program_id)

        discount_token_account = AccountMeta(
            is_signer=False,
            is_writable=False,
            pubkey=discount_token,
        )
        referrer_account = AccountMeta(
            is_signer=False,
            is_writable=True,
            pubkey=referrer,
        )
        return aver_client.program.instruction['init_user_host_lifetime']( 
            bump,
            ctx=Context(
                accounts={
                "user": owner.public_key,
                "user_host_lifetime": user_host_lifetime,
                "user_quote_token_ata": user_quote_token_ata,
                "host": host,
                "system_program": SYS_PROGRAM_ID,
                },
                remaining_accounts=[discount_token_account, referrer_account],
                signers=[owner]
            )
            )

    @staticmethod
    async def create_user_host_lifetime(
        aver_client: AverClient,
        owner: Keypair,
        user_quote_token_ata: PublicKey,
        send_options: TxOpts = None,
        host: PublicKey = AVER_HOST_ACCOUNT,
        referrer: PublicKey = SYS_PROGRAM_ID,
        discount_token: PublicKey = SYS_PROGRAM_ID,
        program_id: PublicKey = AVER_PROGRAM_ID,
    ):
        """
        Creates UserHostLifetime account

        Sends instructions on chain

        Args:
            aver_client (AverClient): AverClient object
            owner (Keypair): Keypair of owner of UserHostLifetime account
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            referrer (PublicKey, optional): Referrer account public key. Defaults to SYS_PROGRAM_ID.
            discount_token (PublicKey, optional): _description_. Defaults to SYS_PROGRAM_ID.
            program_id (PublicKey, optional):  Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            RPCResponse: Response
        """
        ix = UserHostLifetime.make_create_user_host_lifetime_instruction(
            aver_client,
            user_quote_token_ata,
            owner,
            host,
            referrer,
            discount_token,
            program_id
        )

        if(send_options is None):
            send_options = TxOpts()
        else:
            send_options = TxOpts(
                skip_confirmation=send_options.skip_confirmation,
                skip_preflight=send_options.skip_confirmation,
                preflight_commitment=Finalized,
                max_retries=send_options.max_retries)


        return await sign_and_send_transaction_instructions(
            aver_client,
            [],
            owner,
            [ix],
            send_options
        )

    @staticmethod
    def derive_pubkey_and_bump(owner: PublicKey, host: PublicKey, program_id: PublicKey = AVER_PROGRAM_ID):
        """
        Derives PDA for UserHostLifetime public key

        Args:
            owner (PublicKey): Owner of host account
            host (PublicKey, optional): Public key of corresponding Host account. Defaults to AVER_HOST_ACCOUNT.
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            PublicKey: Public key of UserHostLifetime account
        """
        return PublicKey.find_program_address(
            [bytes('user-host-lifetime', 'utf-8'), bytes(owner), bytes(host)],
            program_id
        )

    @staticmethod
    def parse_user_host_lifetime_state(aver_client: AverClient, buffer):
        """
        Parses raw onchain data to UserHostLifetime object

        Args:
            aver_client (AverClient): AverClient object
            buffer (bytes): Raw bytes coming from onchain

        Returns:
            UserHostLifetime: UserHostLifetime object
        """
        user_host_lifetime_info = aver_client.program.account['UserHostLifetime'].coder.accounts.decode(buffer)
        return user_host_lifetime_info

    def get_fee_tier_postion(self):
        """
        Gets user's fee tier position

        This determines the percentage fee taken by the host on winnings

        Returns:
            FeeTier: FeeTier for user
        """
        last_fee_tier_check = self.user_host_lifetime_state.last_fee_tier_check
        if(last_fee_tier_check == FeeTier.BASE):
            return 0
        if(last_fee_tier_check == FeeTier.AVER1):
            return 1
        if(last_fee_tier_check == FeeTier.AVER2):
            return 2
        if(last_fee_tier_check == FeeTier.AVER3):
            return 3
        if(last_fee_tier_check == FeeTier.AVER4):
            return 4
        if(last_fee_tier_check == FeeTier.AVER5):
            return 5
        if(last_fee_tier_check == FeeTier.FREE):
            return 6

        
