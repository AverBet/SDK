from anchorpy import Provider, Wallet, Program
from solana.rpc.commitment import Finalized, Confirmed
from solana.rpc import types
from solana.rpc.async_api import AsyncClient
from solana.publickey import PublicKey
from solana.transaction import Transaction
from solana.rpc.api import Client
# from constants import AVER_API_URL_DEVNET, DEVNET_SOLANA_URL, DEFAULT_QUOTE_TOKEN_DEVNET, AVER_PROGRAM_ID_DEVNET_2
from .constants import get_aver_api_endpoint, get_quote_token, get_solana_endpoint, AVER_PROGRAM_ID
from solana.keypair import Keypair
from requests import get, post
from spl.token.instructions import get_associated_token_address, create_associated_token_account
from solana.rpc.commitment import Commitment, Finalized
from .enums import SolanaNetwork

class AverClient():
    """
    Aver Client Class

    Use AverClient to interact with the Aver Program
    """

    connection: AsyncClient
    """AsyncClient"""
    program: Program
    """Program"""
    provider: Provider
    """Provider"""
    aver_api_endpoint: str
    """Endpoint is used to make requests to Aver"""
    solana_network: SolanaNetwork
    """Devnet or Mainnet"""
    quote_token: PublicKey
    """"""
    solana_client: Client
    """"""
    owner: Keypair
    """Pays for transactions onchain"""

    def __init__(
        self, 
        program: Program,
        aver_api_endpoint: str,
        solana_network: SolanaNetwork,
        ):
        """
        Initialises AverClient object. Do not use this function; use AverClient.load() instead

        Args:
            program (Program): Aver program
            aver_api_endpoint (str): Endpoint for Aver API (to be removed soon)
            solana_network (SolanaNetwork): Solana network
        """
        self.connection = program.provider.connection
        self.program = program
        self.provider = program.provider
        self.aver_api_endpoint = aver_api_endpoint
        self.solana_network = solana_network
        self.quote_token = get_quote_token(solana_network)
        self.solana_client = Client(get_solana_endpoint(solana_network))
        self.owner = program.provider.wallet.payer

    @staticmethod
    async def load(
        connection: AsyncClient,
        owner: Keypair or Wallet, 
        opts: types.TxOpts,
        network: SolanaNetwork,
        program_id: PublicKey = AVER_PROGRAM_ID,
        ):
            """
            Initialises an AverClient object

            Args:
                connection (AsyncClient): Solana AsyncClient object
                owner (KeypairorWallet): Keypair to pay transaction costs (and rent costs)
                opts (types.TxOpts): Default options for sending transactions
                network (SolanaNetwork): Solana network
                program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

            Raises:
                Exception: Invalid owner argument

            Returns:
                AverClient: Aver Client
            """
            if(isinstance(owner, Wallet)):
                wallet = owner
            elif(isinstance(owner, Keypair)):
                wallet = Wallet(owner)
            else:
                raise Exception('Invalid Owner Passed. Must be Wallet or Keypair')

            provider = Provider(
                connection,
                wallet,
                opts
            )
            api_endpoint = get_aver_api_endpoint(network)
            program = await AverClient.load_program(provider, program_id)

            aver_client = AverClient(program, api_endpoint, network)    
            return aver_client

    @staticmethod
    async def load_program(provider: Provider, program_id: PublicKey = AVER_PROGRAM_ID):
        """
        Loads Aver Program

        Args:
            provider (Provider): Provider
            program_id (PublicKey, optional): Program public key. Defaults to AVER_PROGRAM_ID.

        Raises:
            Exception: Program IDL not loaded

        Returns:
            Program: Program
        """
        idl = await Program.fetch_idl(program_id,provider)
        if(idl):
            program = Program(idl, program_id, provider)
            return program
        else:
            raise Exception('Program IDL not loaded')


    async def close(self):
        """
        Closes connection.

        You should call this in your program's clean-up function(s)
        """
        await self.provider.close()

    #TODO - Move to admin
    async def check_health(self):
        url = self.aver_api_endpoint + '/health?format=json'
        aver_health_response = get(url)

        solana_health_response = await self.provider.connection.get_version()

        return {'api': aver_health_response.json(), 'solana': solana_health_response}


    async def get_or_create_associated_token_account(
            self,
            owner: PublicKey,
            payer: Keypair,
            token_mint: PublicKey = None,
        ):
        """
        Attempts to load an ATA and creates one if not found.

        Args:
            owner (PublicKey): Owner of ATA
            payer (Keypair): Payer of transaction fee and ATA rent (this is recoverable)
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

    async def request_lamport_airdrop(self, amount: int, owner: PublicKey):
        """
        Request lamport airdrop. Only works on devnet

        Args:
            amount (int): Lamports requested
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
        Fetches ATA Balance

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

    async def request_token_balance(self, mint: PublicKey, owner: PublicKey):
        """"""
        ata = get_associated_token_address(owner, mint)
        return await self.request_ata_balance(ata)

    async def request_lamport_balance(self, owner: PublicKey):
        """
        Fetches Lamport balance

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







