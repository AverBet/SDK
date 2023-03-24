from enum import IntEnum
from solana.publickey import PublicKey
from solana.transaction import TransactionInstruction

# LOGIC ALLOWING MORE COMPUTE UNITS / TX FOR MINIMAL SOL
class ComputeBudgetInstructionType(IntEnum):
    RequestUnits = 0
    RequestHeapFrame = 1
    SetComputeUnitLimit = 2
    SetComputeUnitPrice = 3

compute_budget_program_id = PublicKey('ComputeBudget111111111111111111111111111111')


def set_compute_unit_limit_ixn(
    units: int = 1000000
):
    data = ComputeBudgetInstructionType.SetComputeUnitLimit.to_bytes(1, "little") + units.to_bytes(4, "little")
    return TransactionInstruction(
      keys=[],
      program_id = compute_budget_program_id,
      data = data
    )


def set_compute_unit_price_ixn(
    micro_lamports: int = 1 
):
    data = ComputeBudgetInstructionType.SetComputeUnitPrice.to_bytes(1, "little") + micro_lamports.to_bytes(8, "little")
    return TransactionInstruction(
      keys = [],
      program_id = compute_budget_program_id,
      data = data
    )