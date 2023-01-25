from asyncio import gather
from .aver_client import AverClient
from solana.publickey import PublicKey
from .data_classes import UserHostLifetimeState
from .constants import AVER_HOST_ACCOUNT, AVER_PROGRAM_IDS
from .utils import get_version_of_account_type_in_program, load_multiple_bytes_data, parse_with_version, sign_and_send_transaction_instructions
from solana.system_program import SYS_PROGRAM_ID
from solana.rpc.commitment import Finalized
from anchorpy import Context
from solana.transaction import AccountMeta
from solana.keypair import Keypair
from solana.rpc.types import TxOpts
from .enums import AccountTypes, FeeTier

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

    def __init__(self, aver_client: AverClient, pubkey: PublicKey, user_host_lifetime_state: UserHostLifetimeState, program_id: PublicKey = AVER_PROGRAM_IDS[0]):
        """
        Initialise an UserHostLifetime object. Do not use this function; use UserHostLifetime.load() instead

        Args:
            pubkey (PublicKey): UserHostLifetime public key
            user_host_lifetime_state (UserHostLifetimeState): UserHostLifetimeState public key
            program_id (PublicKey): Program public key. Defaults to AVER_PROGRAM_ID.
        """
        self.pubkey = pubkey
        self.user_host_lifetime_state = user_host_lifetime_state
        self.program_id = program_id
        self.aver_client = aver_client

    @staticmethod
    async def load(aver_client: AverClient, pubkey: PublicKey):
        """
        Initialises an UserHostLifetime Account (UHLA) object.

        A UHLA is an account which is initialized when a wallet interacts with Aver via a particular Host for the first time. It is used to store values related to 
        a wallet's interactions with Aver Markets via this Host. It is required to be initialized before a wallet can interact with any Markets via a given Host.

        Args:
            aver_client (AverClient): AverClient object
            pubkey (PublicKey): UserHostLifetime public key

        Returns:
            UserHostLifetime: UserHostLifetime object
        """
        return (await UserHostLifetime.load_multiple(aver_client, [pubkey]))[0]

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
        res = await load_multiple_bytes_data(aver_client.connection, pubkeys, [], False)
        programs = await gather(*[aver_client.get_program_from_program_id(PublicKey(r['owner'])) for r in res])
        uhls: list[UserHostLifetime] = []
        for i, pubkey in enumerate(pubkeys):
            state = parse_with_version(programs[i], AccountTypes.USER_HOST_LIFETIME, res[i]['data'])
            program = programs[i]
            uhls.append(UserHostLifetime(aver_client, pubkey, state, program.program_id))
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
        program_id: PublicKey = AVER_PROGRAM_IDS[0]
    ):
        """
        Attempts to load a UserHostLifetime account and creates one if not found

        Args:
            client (AverClient): AverClient object
            owner (Keypair): Owner of UserHostLifetime account. Pays transaction and rent costs
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
    async def make_create_user_host_lifetime_instruction(
        aver_client: AverClient,
        user_quote_token_ata: PublicKey,
        owner: PublicKey,
        host: PublicKey = AVER_HOST_ACCOUNT,
        referrer: PublicKey = SYS_PROGRAM_ID,
        discount_token: PublicKey = SYS_PROGRAM_ID,
        program_id = AVER_PROGRAM_IDS[0]
    ):
        """
        Creates instruction for UserHostLifetime account creation

        Returns TransactionInstruction object only. Does not send transaction.

        Args:
            aver_client (AverClient): AverClient object
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            owner (Keypair): Keypair of owner of UserHostLifetime account. Pays transaction and rent costs
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            referrer (PublicKey, optional): Referrer account public key. Defaults to SYS_PROGRAM_ID.
            discount_token (PublicKey, optional): _description_. Defaults to SYS_PROGRAM_ID.
            program_id (_type_, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            TransactionInstruction: TransactionInstruction object
        """
        user_host_lifetime, bump = UserHostLifetime.derive_pubkey_and_bump(owner, host, program_id)

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

        program = await aver_client.get_program_from_program_id(program_id)

        return program.instruction['init_user_host_lifetime'](
            ctx=Context(
                accounts={
                "user": owner,
                "user_host_lifetime": user_host_lifetime,
                "user_quote_token_ata": user_quote_token_ata,
                "host": host,
                "system_program": SYS_PROGRAM_ID,
                },
                remaining_accounts=[discount_token_account, referrer_account],
                
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
        program_id: PublicKey = AVER_PROGRAM_IDS[0],
    ):
        """
        Creates UserHostLifetime account

        Sends instructions on chain

        Args:
            aver_client (AverClient): AverClient object
            owner (Keypair): Keypair of owner of UserHostLifetime account. Pays transaction and rent costs
            user_quote_token_ata (PublicKey): Quote token ATA public key (holds funds for this user)
            send_options (TxOpts, optional): Options to specify when broadcasting a transaction. Defaults to None.
            host (PublicKey, optional): Host account public key. Defaults to AVER_HOST_ACCOUNT.
            referrer (PublicKey, optional): Referrer account public key. Defaults to SYS_PROGRAM_ID.
            discount_token (PublicKey, optional): _description_. Defaults to SYS_PROGRAM_ID.
            program_id (PublicKey, optional):  Program public key. Defaults to AVER_PROGRAM_ID.

        Returns:
            RPCResponse: Response
        """
        ix = await UserHostLifetime.make_create_user_host_lifetime_instruction(
            aver_client,
            user_quote_token_ata,
            owner.public_key,
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
    def derive_pubkey_and_bump(owner: PublicKey, host: PublicKey, program_id: PublicKey = AVER_PROGRAM_IDS[0]):
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
    
    async def make_update_nft_pfp_instruction(
        self,
        display_name: str,
        nft_pubkey: PublicKey
    ):
        program = await self.aver_client.get_program_from_program_id(self.program_id)

        return program.instruction['update_nft_pfp_display_name'](
            nft_pubkey, 
            display_name,
            ctx=Context(
                accounts={
                    "user": self.user_host_lifetime_state.user,
                    "user_host_lifetime": self.pubkey,
                }
            )
        )
  
    async def update_nft_pfp_display_name(
        self,
        user: Keypair,
        display_name: str,
        nft_pubkey: PublicKey,
        send_options: TxOpts = None
    ):
        ix = await self.make_update_nft_pfp_instruction(display_name = display_name, nft_pubkey = nft_pubkey)
    
        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [user],
            user,
            [ix],
            send_options = send_options
        )

    async def make_update_user_host_lifetime_state_instruction(self):
        program = await self.aver_client.get_program_from_program_id(self.program_id)
        # TODO
        return None

    async def update_user_host_lifetime_state(self, fee_payer: Keypair = None, send_options: TxOpts = None):
        if(fee_payer == None):
            fee_payer = self.aver_client.owner

        ix = await self.make_update_user_host_lifetime_state_instruction()

        return await sign_and_send_transaction_instructions(
            self.aver_client,
            [],
            fee_payer,
            [ix],
            send_options
        )

    async def check_if_uhl_latest_version(self):
        """
        Returns true if UHL does not need to be updated (using update_user_host_lifetime_state)

        Returns false if update required

        Returns:
            Boolean: Is update required
        """
        program = await self.aver_client.get_program_from_program_id(self.program_id)
        if(self.user_host_lifetime_state.version < get_version_of_account_type_in_program(AccountTypes.USER_HOST_LIFETIME, program)):
            print("User host lifetime needs to be upgraded")
            return False
        return True


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

        
