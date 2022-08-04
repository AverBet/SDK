import { ProgramError, Program } from "@project-serum/anchor"

export const parseError = (e: any, p: Program) => {
  const programError = ProgramError.parse(e, getAverIdlErrors(p))
  if (programError instanceof Error) {
    return programError
  } else {
    return e
  }
}

export const getAverIdlErrors = (p: Program) => {
  if (!p.idl.errors) return new Map()
  return new Map(p.idl.errors?.map((e) => [e.code, e.msg]))
}
