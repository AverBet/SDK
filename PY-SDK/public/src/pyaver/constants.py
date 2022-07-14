from solana.publickey import PublicKey
from solana.keypair import Keypair
from base58 import b58decode
from .enums import SolanaNetwork

## OLD VARIABLES
# DEVNET_SOLANA_URL = "https:#api.devnet.solana.com"
# AVER_API_URL_DEVNET = 'https:#dev.api.aver.exchange'
# AVER_MARKET_CONTRACT_PROGRAM_ID_OLD = '2vu7nbkQtEZq7gCBEQZnfsdnxFLf5Do8FzvMZRSmvCXY'

# DEFAULT_QUOTE_TOKEN_DEVNET = PublicKey('BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj')

# TEST_WALLET_PUBLICKEY = PublicKey('29gzGByYnUYj6AuLuKfFJv21kBRv4vUonJSN1wBjxu6x')
# TEST_WALLET_KEYPAIR = Keypair(b58decode('qKeiqdB45yXiAo7wfMTCJaDcuePoFuJH9SEfT4A9PL2PdNobGQuaWgwqcXpoHvpxdFbn5Akb1BQsbt98KGjbbsv')[:32])

# AVER_PROGRAM_ID_DEVNET_2 = PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ')

# DEFAULT_HOST_ACCOUNT_DEVNET = PublicKey('5xhmqK1Dh48TiqvHxoZi6WWWKL6THtsUjh3GoiVEbbR8')

# MARKET_STATE_LEN = 192

# DEFAULT_MARKET_AUTHORITY = PublicKey('EEg375Q8wEsPTyaQ4jG4hmNsMojmMHs6gB58iVWUXSwF')

# NEW VARIABLES

# Devnet and Mainnet constants
AVER_PROGRAM_ID = PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ')
AVER_TOKEN = PublicKey('AVERsCxn9wr9YZ4WVavPbjm13hrLTPAkdnu1QqK9ZL1y')
AVER_MARKET_AUTHORITY = PublicKey('EEg375Q8wEsPTyaQ4jG4hmNsMojmMHs6gB58iVWUXSwF')
AVER_HOST_ACCOUNT = PublicKey('5xhmqK1Dh48TiqvHxoZi6WWWKL6THtsUjh3GoiVEbbR8')
AVER_COMMUNITY_REWARDS_NFT = PublicKey(
  'AVERojzZ8649E1oLPvcgG2SSbVECxs8PcG5JkpuK2Dvq'
)

# Devnet constants
AVER_API_ENDPOINT_DEVNET = 'https://dev.api.aver.exchange'
# SOLANA_ENDPOINT_DEVNET = 'https://devnet.genesysgo.net/'
SOLANA_ENDPOINT_DEVNET = 'https://api.devnet.solana.com' #Tests fail with genesysgo because of airdrop

USDC_DEVNET = PublicKey('BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj')

# ATA for market authority with USDC
AVER_MARKET_AUTHORITY_VAULT_DEVNET = PublicKey(
  'TxyectLDHmkzidS6RCat6uuZ385xaNbxg7R7vrfhTAD'
)

# PDA derivation of 'third-party-token-vault' + USDC + AVER_PROGRAM_ID
AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_DEVNET = PublicKey(
  'Gb6DFbnMUdA1ReJqzfN7oeBpTNtz347bzgKUXgzzA58F'
)

# ATA of vault authority PDA with USDC
AVER_THIRD_PARTY_REWARD_VAULT_DEVNET = PublicKey(
  'DrWWingQnsb46bJg6ms5xPhnFz2YCuc9sihqeFFqGVXK'
)

# bump of third party vault authority PDA
AVER_THIRD_PARTY_REWARD_VAULT_BUMP_DEVNET = 253

AVER_MAINNET_LAUNCH_NFT_DEVNET = PublicKey(
  '4QwFUyLKtHZqbHvxZQqLGPz8eMjXBgedaWvuQTdKwKJx'
)

# Mainnet constants
AVER_API_ENDPOINT_MAINNET = 'https://api.aver.exchange'
SOLANA_ENDPOINT_MAINNET = 'https://holy-cold-glade.solana-mainnet.quiknode.pro/'
# SOLANA_ENDPOINT_MAINNET = 'https://ssc-dao.genesysgo.net/'
# SOLANA_ENDPOINT_MAINNET = 'https://api.mainnet-beta.solana.com'
USDC_MAINNET = PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') # (USDC)

AVER_MARKET_AUTHORITY_VAULT_MAINNET = PublicKey(
  '8M33TSnT9qDnTS2nSiECtfn7uhxNYZ9oJRVumYqgo2NX'
)

AVER_THIRD_PARTY_REWARD_VAULT_MAINNET = PublicKey(
  '2FMt5pb8oJGAyvSN6Ytw1nD3Np6MUJ2jRZrv63Zy4nqT'
)

AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_MAINNET = PublicKey(
  '5sRuNV4LqvroWF1EiUmPuUYAzti4Biikou8jRYMuxVaR'
)

AVER_THIRD_PARTY_REWARD_VAULT_BUMP_MAINNET = 250

AVER_MAINNET_LAUNCH_NFT_MAINNET = PublicKey(
  'BqSFP5CbfBfZeQqGbzYEipfzTDptTYHFL9AzZA8TBXjn'
)

SYS_VAR_CLOCK = PublicKey('SysvarC1ock11111111111111111111111111111111')

# helpers
def get_aver_api_endpoint(solanaNetwork: SolanaNetwork):
  """
  Returns URL for Aver API based on solana network

  Args:
      solanaNetwork (SolanaNetwork): Solana network

  Returns:
      string: URL 
  """
  return AVER_API_ENDPOINT_DEVNET if solanaNetwork == SolanaNetwork.DEVNET else AVER_API_ENDPOINT_MAINNET
def get_solana_endpoint(solanaNetwork: SolanaNetwork):
  """
  Returns URL for solana endpoint based on solana network

  Args:
      solanaNetwork (SolanaNetwork): Solana network

  Returns:
      string: URL
  """
  return SOLANA_ENDPOINT_DEVNET if solanaNetwork == SolanaNetwork.DEVNET else SOLANA_ENDPOINT_MAINNET
def get_quote_token(solanaNetwork: SolanaNetwork):
  """
  Returns default quote token public key based on solana network

  Args:
      solanaNetwork (SolanaNetwork): _description_

  Returns:
      PublicKey: Quote token public key
  """
  return USDC_DEVNET if solanaNetwork == SolanaNetwork.DEVNET else USDC_MAINNET

# other constants
CALLBACK_INFO_LEN = 33
