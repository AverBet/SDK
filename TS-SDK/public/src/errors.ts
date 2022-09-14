import { ProgramError, Program } from "@project-serum/anchor"

/**
 * Tests whether RPCException is a Program Error or other RPC error.
 *
 * Program Errors refer to an error thrown by the smart contract
 *
 * @param {RPCException} e - Exception
 * @param {Program} p - Aver program AnchorPy
 * @returns {ProgramError | RPCException} - Program Error or RPC Excpeption
 */
export const parseError = (e: any, p: Program) => {
  const programError = ProgramError.parse(e, getAverIdlErrors(p))
  if (programError instanceof Error) {
    return programError
  } else {
    return e
  }
}

/**
 * Fetches a dictionary of all IDL errors from Program
 *
 * @param {Program} p - Aver program AnchorPy
 * @returns {Map<Int, string>} - Errors with error codes as keys and error messages as values
 */
export const getAverIdlErrors = (p: Program) => {
  if (!p.idl.errors) return new Map()
  return new Map(p.idl.errors?.map((e) => [e.code, e.msg]))
}
