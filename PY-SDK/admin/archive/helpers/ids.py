from solana.publickey import PublicKey
from solana.keypair import Keypair
import base58
from hashlib import sha256
from solana.rpc.commitment import Confirmed
from dotenv import load_dotenv
import os

from pyaver.enums import SolanaNetwork

load_dotenv()

AVER_PROGRAM_ID_DEVNET = PublicKey("6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ")
DEFAULT_NETWORK_URL = "https://api.devnet.solana.com"
DEFAULT_QUOTE_TOKEN_DEVNET = PublicKey('BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj')
AVER_PROGRAM_ID = PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ')
AVER_HOST_ACCOUNT = PublicKey('5xhmqK1Dh48TiqvHxoZi6WWWKL6THtsUjh3GoiVEbbR8')

ACCOUNT_DISCRIMINATOR_SIZE = 8
MARKET_ACCOUNT_DISCRIMINATOR = sha256(f"account:Market".encode()).digest()[
    :ACCOUNT_DISCRIMINATOR_SIZE]
MARKET_STORE_ACCOUNT_DISCRIMINATOR = sha256(
    f"account:MarketStore".encode()).digest()[:ACCOUNT_DISCRIMINATOR_SIZE]
USER_MARKET_ACCOUNT_DISCRIMINATOR = sha256(
    f"account:UserMarket".encode()).digest()[:ACCOUNT_DISCRIMINATOR_SIZE]
TRANSACTION_EVENT_DISCRIMINATOR = sha256(
    f"event:TransactionEvent".encode()).digest()[:ACCOUNT_DISCRIMINATOR_SIZE]

# these are all network specific
DEFAULT_NETWORK = os.getenv('ENV_NAME') or 'DEVNET'

if DEFAULT_NETWORK.upper() == 'MAINNET': # TODO update these values
  # SOLANA_URL = 'https://api.mainnet-beta.solana.com'
  SOLANA_URL = 'https://ssc-dao.genesysgo.net/'
  AVER_API_URL = 'https://api.aver.exchange'
  QUOTE_TOKEN = PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  COMMITMENT = "confirmed"
  # 41khcMewKCeB8Ek4gGGhJ4sPUM5FiCykpHQaH2TyJ33V
  PAYER = Keypair(base58.b58decode('2DEXbpZ9SKtkBwYnSBiDEfNN7okvMFFAPFdjgqd3VwtPbrfnXeWDPkMTeBCxnHJgT3aDBFQkNyJR19WwTZtnGuEw')[:32])
  NETWORK = SolanaNetwork.MAINNET
elif DEFAULT_NETWORK == 'LOCALNET':
  SOLANA_URL = 'https://api.devnet.solana.com'
  AVER_API_URL = 'http://localhost:8000'
  QUOTE_TOKEN = PublicKey('BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj')
  COMMITMENT = Confirmed
  PAYER = Keypair(base58.b58decode('2DEXbpZ9SKtkBwYnSBiDEfNN7okvMFFAPFdjgqd3VwtPbrfnXeWDPkMTeBCxnHJgT3aDBFQkNyJR19WwTZtnGuEw')[:32])
  NETWORK = SolanaNetwork.DEVNET
else:
  SOLANA_URL = 'https://api.devnet.solana.com'
  AVER_API_URL = 'https://dev.api.aver.exchange'
  AVER_PROGRAM_ID = PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ')
  QUOTE_TOKEN = PublicKey('BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj')
  COMMITMENT = Confirmed
  PAYER = Keypair(base58.b58decode('2DEXbpZ9SKtkBwYnSBiDEfNN7okvMFFAPFdjgqd3VwtPbrfnXeWDPkMTeBCxnHJgT3aDBFQkNyJR19WwTZtnGuEw')[:32])
  NETWORK = SolanaNetwork.DEVNET