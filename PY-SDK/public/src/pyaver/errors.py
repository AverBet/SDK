from anchorpy import Program
from anchorpy.error import ProgramError, _ExtendedRPCError
from solana.rpc.core import RPCException
import ast

def get_idl_errors(program: Program):
    """
    Fetches a dictionary of all IDL errors from Program

    Args:
        program (Program): Aver program AnchorPy

    Returns:
        dict[int, str]: Errors with error codes as keys and error messages as values 
    """
    idl_dict = dict()
    for e in program.idl.errors:
        idl_dict[e.code] = e.msg
    return idl_dict

def parse_error(e: RPCException, program: Program):
    """
    Tests whether RPCException is a Program Error or other RPC error.

    Program Errors refer to an error thrown by the smart contract

    Args:
        e (RPCException): Exception
        program (Program): Aver program AnchorPy

    Returns:
        (ProgramError | RPCException): Program Error or RPC Excpeption
    """
    error_json = ast.literal_eval(e.__str__())
    error_extended = _ExtendedRPCError(code=error_json['code'], message=error_json['message'], data=error_json['data'])
    p = ProgramError.parse(error_extended, get_idl_errors(program))
    print(isinstance(e, RPCException))
    print(p)
    if(p is not None):
        return p
    else:
        return e


