from requests import get
from asyncio import gather
import base64
import datetime
from anchorpy import Provider, Wallet, Program
from solana.rpc import types
from .version_checks import check_idl_has_same_instructions_as_sdk
from solana.rpc.async_api import AsyncClient
from solana.publickey import PublicKey
from solana.transaction import Transaction
from solana.rpc.api import Client
from .constants import AVER_PROGRAM_IDS, SYS_VAR_CLOCK, get_quote_token, get_solana_endpoint
from solana.keypair import Keypair
from spl.token.instructions import get_associated_token_address, create_associated_token_account
from .enums import SolanaNetwork
from .layouts import CLOCK_STRUCT

class AverClient():
    """
    Aver Client Class

    Use AverClient to interact with the Aver Program, Solana network and Aver API
    """

    connection: AsyncClient
    """Solana AsyncClient"""
    programs: list[Program]
    """AnchorPy Programs"""
    provider: Provider
    """AnchorPy Provider"""
    solana_network: SolanaNetwork
    """Devnet or Mainnet - must correspond to the network provided in the connection AsyncClient"""
    quote_token: PublicKey
    """The token mint of the default quote token for markets on this network (i.e. USDC)"""
    solana_client: Client
    """Solana Client"""
    owner: Keypair
    """The default payer for transactions on-chain, unless one is specified"""

    def __init__(
            self, 
            programs: list[Program],
            solana_network: SolanaNetwork,
            connection: AsyncClient
        ):
        """
        Initialises AverClient object. Do not use this function; use AverClient.load() instead

        Args:
            program (Program): Aver program AnchorPy
            solana_network (SolanaNetwork): Solana network
        """
        self.connection = connection
        self.programs = programs
        self.provider = programs[0].provider
        self.solana_network = solana_network
        self.quote_token = get_quote_token(solana_network)
        self.solana_client = Client(connection._provider.endpoint_uri)
        self.owner = programs[0].provider.wallet.payer

    @staticmethod
    async def load(
            connection: AsyncClient,
            owner: Keypair or Wallet = None, 
            opts: types.TxOpts = None,
            network: SolanaNetwork = SolanaNetwork.DEVNET,
            program_ids: list[PublicKey] = AVER_PROGRAM_IDS,
        ):
            """
            Initialises an AverClient object

            Args:
                connection (AsyncClient): Solana AsyncClient object
                owner (KeypairorWallet): Default keypair to pay transaction costs (and rent costs) unless one is otherwise specified for a given transaction.
                opts (types.TxOpts): Default options for sending transactions. 
                network (SolanaNetwork): Solana network
                program_id (PublicKey, optional): Program public key. Defaults to latest AVER_PROGRAM_ID specified in constants.py.

            Returns:
                AverClient: AverClient
            """
            if(isinstance(owner, Wallet)):
                wallet = owner
            elif(isinstance(owner, Keypair)):
                wallet = Wallet(owner)
            elif(owner is None):
                wallet = Wallet(Keypair()) # create random keypair if none

            provider = Provider(
                connection,
                wallet,
                opts if opts else types.TxOpts(
                    preflight_commitment=connection.commitment,
                    skip_confirmation=False,
                    skip_preflight=False
                )
            )
            programs = await gather(*[AverClient.load_program(provider, p) for  p in program_ids])

            return AverClient(programs, network, connection)    

    @staticmethod
    async def load_program(
            provider: Provider,
            program_id: PublicKey
        ):
        """
        Loads Aver Program

        Args:
            provider (Provider): Provider
            program_id (PublicKey, optional): Program public key.

        Raises:
            Exception: Program IDL not loaded

        Returns:
            Program: Program
        """
        idl = await Program.fetch_idl(program_id,provider)
        if(idl):
            program = Program(idl, program_id, provider)
            check_idl_has_same_instructions_as_sdk(program)
            return program
        else:
            raise Exception('Program IDL not loaded')

    async def add_program(self, program_id: PublicKey):
        """
        Loads and adds a program to the list of programs

        Args:
            program_id (PublicKey): Program public key

        Returns:
            Program: Program
        """
        program = await AverClient.load_program(self.provider, program_id)
        self.programs.append(program)
        return program
    
    async def get_program_from_program_id(self, program_id: PublicKey):
        """
        Checks if a program is already loaded and returns it. If not, it loads it, saves it and returns it.

        Args:
            program_id (PublicKey): Program public key

        Returns:
            Program: Program
        """
        for p in self.programs:
            if(p.program_id.to_base58() == program_id.to_base58()):
                return p
        return await self.add_program(program_id)

    ####
## IDL Checks

    async def close(self):
        """
        Closes connection.

        Call this in your program's clean-up function(s)
        """
        await self.provider.close()


    async def get_or_create_associated_token_account(
            self,
            owner: PublicKey,
            payer: Keypair,
            token_mint: PublicKey = None,
        ):
        """
        Attempts to load an Associate Token Account (ATA) or creates one if not found.

        Args:
            owner (PublicKey): Public key of the owner of Associated Token Account
            payer (Keypair): Payer of transaction fee and ATA rent (rent is recoverable)
            token_mint (PublicKey, optional): ATA token mint public key. Defaults to USDC token according to chosen solana network.

        Returns:
            PublicKey: ATA PublicKey
        """
        token_mint = token_mint if token_mint is not None else self.quote_token
        associated_token_account = get_associated_token_address(owner=owner, mint=token_mint)
        response = await self.provider.connection.get_token_account_balance(associated_token_account)

        if not 'result' in response.keys(): 
            tx = Transaction()
            tx.add(
                create_associated_token_account(
                    payer=payer.public_key,
                    owner=owner,
                    mint=token_mint,
                ),
            )
            signers = [payer]
            response = await self.provider.connection.send_transaction(tx, *signers, opts=self.provider.opts)
            await self.provider.connection.confirm_transaction(response['result'])
            return associated_token_account
        else:
            return associated_token_account

    async def request_lamport_airdrop(
            self,
            amount: int,
            owner: PublicKey
        ):
        """
        Request an airdrop of lamports (SOL). This method is only supported on devnet.

        Args:
            amount (int): Lamports to airdrop. Note 1 lamport = 10^-9 SOL. Max of 1 SOL (10^9 lamports) applies.
            owner (PublicKey): Public key of account to be airdropped

        Returns:
            RPCResponse: Response
        """
        return await self.provider.connection.request_airdrop(
            pubkey=owner, 
            lamports=amount, 
            commitment=self.provider.opts
            )
    

    async def request_ata_balance(self, ata: PublicKey):
        """
        Fetches the balance for an Associated Token Account (ATA). 
        Note: the value returned is the integer representation of the balance, where a unit is the smallest possible increment of the token.
        For example, USDC is a 6 decimal place token, so a value of 1,000,000 here = 1 USDC.

        Args:
            ata (PublicKey): ATA public key

        Raises:
            Exception: Error from response

        Returns:
            int: Token balance
        """
        response = await self.provider.connection.get_token_account_balance(ata, self.provider.opts.preflight_commitment)
        if 'error' in response:
            raise Exception(response['error'])
        return int(response['result']['value']['amount'])

    async def request_token_balance(
            self,
            mint: PublicKey,
            owner: PublicKey
        ):
        """
        Fetches a wallet's token balance, given the wallet's owner and the token mint's public key.
        Note: the value returned is the integer representation of the balance, where a unit is the smallest possible increment of the token.
        For example, USDC is a 6 decimal place token, so a value of 1,000,000 here = 1 USDC.

        Args:
            mint: The public key of the token mint
            owner: The public key of the wallet

        Returns:
            int: Token balance

        """
        ata = get_associated_token_address(owner, mint)
        return await self.request_ata_balance(ata)

    async def request_lamport_balance(
            self,
            owner: PublicKey
        ):
        """
        Fetches Lamport (SOL) balance for a given wallet
        Note: the value returned is the integer representation of the balance, where a unit is one lamport (=10^-9 SOL)
        For example, a value of 1,000,000,000 (lamports) = 1 SOL.

        Args:
            owner (PublicKey): Owner public key

        Raises:
            Exception: Error from response

        Returns:
            int: Lamport balance
        """
        response = await self.provider.connection.get_balance(owner, self.provider.opts.preflight_commitment)
        if 'error' in response:
            raise Exception(response['error'])
        return response['result']['value']

    async def get_system_clock_datetime(
            self
        ):
        """
        Loads current solana system datetime

        Returns:
            datetime: Current Solana Clock Datetime
        """
        raw_data = await self.connection.get_account_info(SYS_VAR_CLOCK)
        data = raw_data["result"]["value"]["data"][0]
        parsed_data = CLOCK_STRUCT.parse(base64.decodebytes(data.encode("ascii")))
        return datetime.datetime.utcfromtimestamp(parsed_data['unix_timestamp'])
        

    # DEPRECATED
    async def check_health(self):
        url = "https://dev.api.aver.exchange" + '/health?format=json'
        aver_health_response = get(url)

        solana_health_response = await self.provider.connection.get_version()

        return {'api': aver_health_response.json(), 'solana': solana_health_response}

