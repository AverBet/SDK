from anchorpy import Program
from anchorpy.error import ProgramError, _ExtendedRPCError
from solana.rpc.core import RPCException
import ast

def get_idl_errors(program: Program):
    idl_dict = dict()
    for e in program.idl.errors:
        idl_dict[e.code] = e.msg
    return idl_dict

def parse_error(e: RPCException, program: Program):
    error_json = ast.literal_eval(e.__str__())
    error_extended = _ExtendedRPCError(code=error_json['code'], message=error_json['message'], data=error_json['data'])
    p = ProgramError.parse(error_extended, get_idl_errors(program))
    print(isinstance(e, RPCException))
    print(p)
    if(p is not None):
        return p
    else:
        return e


