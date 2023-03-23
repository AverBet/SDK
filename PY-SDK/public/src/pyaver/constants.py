from solana.publickey import PublicKey
from .enums import SolanaNetwork


##### SHARED DEVNET AND MAINNET CONSTANTS
AVER_PROGRAM_IDS = [
  PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ'),
]
AVER_TOKEN = PublicKey('AVERsCxn9wr9YZ4WVavPbjm13hrLTPAkdnu1QqK9ZL1y')
AVER_MARKET_AUTHORITY = PublicKey('6vV5GT5xZdNEsc4vLqPvVa1gVsHytz8gZGTprdSSYFva')
AVER_HOST_ACCOUNT = PublicKey('5xhmqK1Dh48TiqvHxoZi6WWWKL6THtsUjh3GoiVEbbR8')
AVER_COMMUNITY_REWARDS_NFT = PublicKey(
  'AVERojzZ8649E1oLPvcgG2SSbVECxs8PcG5JkpuK2Dvq'
)

##### DEVNET ONLY CONSTANTS
SOLANA_ENDPOINT_DEVNET = 'https://api.devnet.solana.com' 
USDC_DEVNET = PublicKey('BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj')

# ATA for market authority with USDC
AVER_MARKET_AUTHORITY_VAULT_DEVNET = PublicKey(
  'GnWB9jd6Dgv3uZXqi9Cuf6yYjWiT44ciXLKQeJZdLFGP'
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



##### MAINNET ONLY CONSTANTS
SOLANA_ENDPOINT_MAINNET = 'https://api.mainnet-beta.solana.com/'
USDC_MAINNET = PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') # (USDC)

AVER_MARKET_AUTHORITY_VAULT_MAINNET = PublicKey(
  'HzAN13rsvWrPdPu1XG7HTcmWfmjKDtUbLSwAw3bUtnUP'
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

SYSVAR_RENT_PUBKEY = PublicKey("SysvarRent111111111111111111111111111111111")
"""Public key of the synthetic account that serves the network fee resource consumption."""

##### OTHER CONSTANTS

SYS_VAR_CLOCK = PublicKey('SysvarC1ock11111111111111111111111111111111')

CALLBACK_INFO_LEN = 33

CANCEL_ALL_ORDERS_INSTRUCTION_CHUNK_SIZE = 5

USER_FACING_INSTRUCTIONS_TO_CHECK_IN_IDL = [
  'init_user_market', 
  'place_order', 
  'cancel_order', 
  'cancel_all_orders', 
  'withdraw_tokens', 
  'neutralize_outcome_position', 
  'update_user_market_orders',
  'init_user_host_lifetime',
  'update_market_state',
  'sweep_fees'
  ]


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


