#### This file checks the loaded program against the SDK's latest instructions
#### It is used to prevent the user from sending instructions when they will inevitably fail (due to out of date SDK)

import json
import os
import re
from .constants import USER_FACING_INSTRUCTIONS_TO_CHECK_IN_IDL

from anchorpy import Program
from anchorpy.idl import _IdlInstruction


def camel_to_snake(name: str):
    """
    Converts from CamelCase to snake_case

    Args:
        name (str): Camel case name

    Returns:
        name: Snake case name
    """
    name = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', name).lower()

def load_idl_from_json(program_id: str):
    file_path = os.path.join(os.path.dirname(__file__), f'idl/{program_id}.json')
    try:
        with open(file_path) as file:
            file_idl = json.load(file)
            return file_idl
    except:
        print(f'THE LOADED PROGRAM ID {program_id} DOES NOT MATCH ANY KNOWN PROGRAM_ID')
        print('THIS IS LIKELY EITHER DUE TO AN OUT OF DATE SDK OR USING AN UNKNOWN PROGRAM_ID')
        print('... SKIPPING VERSIONING CHECKS AS A RESULT ...')
        return None

def check_idl_has_same_instructions_as_sdk(program: Program):
    """
    Checks the idl json file's instructions against the instructions in the program

    Warns the user incase their SDK version may be out of date

    Args:
        program (Program): AnchorPy Program
    """
    file_idl = load_idl_from_json(program.program_id.__str__())
    if(file_idl is None):
        return
    file_instructions = file_idl['instructions']

    #Check Instructions
    for i in USER_FACING_INSTRUCTIONS_TO_CHECK_IN_IDL:
        file_instruction = next((x for x in file_instructions if camel_to_snake(x['name']) == i), None)
        program_instruction = next((x for x in program.idl.instructions if x.name == i), None)
        if(program_instruction is None):
            print(f'INSTRUCTION {i} IS NOT FOUND...')
            print('PLEASE UPDATE YOUR SDK')
            continue
        if(file_instruction is None):
            print(f'INSTRUCTION {program_instruction} IS NOT FOUND')
            print('PLEASE UPDATE YOUR SDK')
            continue
        get_differences_between_idl_and_program_instruction(file_instruction, program_instruction, True)


def get_differences_between_idl_and_program_instruction(file_instruction, program_instruction: _IdlInstruction or None, verbose: bool = False):
    are_they_the_same = []

    #Check accounts
    file_account_names = [camel_to_snake(f['name']) for f in file_instruction['accounts']]
    idl_account_names = [a.name for a in program_instruction.accounts]
    differences = set(file_account_names) ^ set(idl_account_names)
    if(len(differences) > 0):
        if(verbose):
            print('-'*10)
        for d in differences:
            are_they_the_same.append(d)
            if(verbose):
                print(f'INSTRUCTION {program_instruction.name}: THE ACCOUNT {d} IS IN THE IDL WHEN IT SHOULD NOT BE')
                print('THIS MEANS YOUR VERSION OF THE SDK MAY NEEDED TO BE UPDATED')
        if(verbose):
            print('-'*10)

    #Check arguments
    file_args_names = [camel_to_snake(f['name']) for f in file_instruction['args']]
    idl_args_names = [a.name for a in program_instruction.args]
    differences = set(file_args_names) ^ set(idl_args_names)
    if(len(differences) > 0):
        if(verbose):
            print('-'*10)
        for d in differences:
            are_they_the_same.append(d)
            if(verbose):
                print(f'INSTRUCTION {program_instruction.name}: THE ARGUMENT {d} IS IN THE IDL WHEN IT SHOULD NOT BE')
                print('THIS MEANS YOUR VERSION OF THE SDK MAY NEEDED TO BE UPDATED')
        if(verbose):
            print('-'*10)

    return are_they_the_same

def check_if_instruction_is_out_of_date_with_idl(instruction: str, program: Program):
    file_idl = load_idl_from_json(program.program_id.__str__())
    if(file_idl is None):
        print('CANNOT FIND IDL FOR THIS PROGRAM_ID IN PRE-FLIGHT CHECK')
        return
    file_instructions = file_idl['instructions']

    file_instruction = next((x for x in file_instructions if camel_to_snake(x['name']) == instruction), None)
    program_instruction = next((x for x in program.idl.instructions if x.name == instruction), None)

    differences = get_differences_between_idl_and_program_instruction(file_instruction, program_instruction, False)
    if(len(differences) > 0):
        print('PRE FLIGHT CHECK FAILED AS SDK VERSION IS OUT OF DATE')
        print('PLEASE UPDATE YOUR SDK VERSION TO RECTIFy')
        print('THE FOLLOWING ACCOUNTS / ARGUMENTS ARE INCORRECT: ')
        [print(d) for d in differences]
        raise Exception('SDK VERSION OUT OF DATE')

