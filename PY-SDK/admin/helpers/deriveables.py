from solana.publickey import PublicKey
from pyaver.constants import AVER_PROGRAM_ID
from solana.utils.helpers import to_uint8_bytes

def derive_market_store(market: PublicKey, program_id = AVER_PROGRAM_ID):
  return PublicKey.find_program_address(
    [bytes('market-store', 'utf-8'), bytes(market)], program_id
  )


def derive_orderbook(market: PublicKey, outcome_id: int, program_id = AVER_PROGRAM_ID):
  return PublicKey.find_program_address(
    [bytes('orderbook', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
  )


def derive_event_queue(market: PublicKey, outcome_id: int, program_id = AVER_PROGRAM_ID):
  return PublicKey.find_program_address(
    [bytes('event-queue', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
  )


def derive_bids(market: PublicKey, outcome_id: int, program_id = AVER_PROGRAM_ID):
  return PublicKey.find_program_address(
    [bytes('bids', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
  )


def derive_asks(market: PublicKey, outcome_id: int, program_id = AVER_PROGRAM_ID):
  return PublicKey.find_program_address(
    [bytes('asks', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
  )