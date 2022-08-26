import { Program, ProgramError } from "@project-serum/anchor"
import {
  Keypair,
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  SendOptions,
  SystemProgram,
  AccountInfo,
} from "@solana/web3.js"
import { chunk } from "lodash"
import { AverClient } from "./aver-client"
import { sha256 } from "js-sha256"
import camelcase from "camelcase"
import { parseError } from "./errors"
import {
  AVER_COMMUNITY_REWARDS_NFT,
  AVER_TOKEN,
  AVER_VERSION,
  getAverLaunchZeroFeesToken,
} from "./ids"
import { AccountType } from "./types"

/**
 * Cryptographically signs transaction and sends onchain
 *
 * @param {AverClient} client - AverClient object
 * @param {Keypair[]} signers - List of signing keypairs
 * @param {Keypair} feePayer - Keypair to pay fee for transaction
 * @param {TransactionInstruction[]} txInstructions - List of transaction instructions to pack into transaction to be sen
 * @param {SendOptions} sendOptions - Options to specify when broadcasting a transaction. Defaults to None.
 * @param {number} manualMaxRetry - No. of times to retry in case of failure
 *
 * @returns {Promise<String>} Transaction signature
 */
export const signAndSendTransactionInstructions = async (
  client: AverClient,
  signers: Array<Keypair>,
  feePayer: Keypair,
  txInstructions: Array<TransactionInstruction>,
  sendOptions?: SendOptions,
  manualMaxRetry?: number
): Promise<string> => {
  const tx = new Transaction()
  tx.feePayer = feePayer.publicKey
  signers.push(feePayer)
  tx.add(...txInstructions)
  let attempts = 0
  let errorThrown = new Error("Transaction failed")

  while (attempts <= (manualMaxRetry || 0)) {
    try {
      return await client.connection.sendTransaction(tx, signers, sendOptions)
    } catch (e) {
      errorThrown = parseError(e, client.programs[0])

      // if its a program error, throw it
      if (errorThrown instanceof ProgramError) {
        console.log("Program error!")
        console.log(errorThrown)
        break
        // otherwise try again
      } else {
        attempts += 1
      }
    }
  }

  throw errorThrown
}

export function throwIfNull<T>(
  value: T | null,
  message = "account not found"
): T {
  if (value === null) {
    throw new Error(message)
  }
  return value
}

// TODO remove generic return type and fix associated TS errors elsewhere
/**
 * Chunks requests to RPC node containing more than 100 pubkeys into blocks of size 100
 *
 * @param {Connection} connection - Solana Connection object
 * @param {PublicKey[]} pubkeys - List of account pubkeys
 * @returns {Promise<(AccountInfo<Buffer> | null)[]>} Raw onchain account data
 */
export const chunkAndFetchMultiple = async (
  connection: Connection,
  pubkeys: PublicKey[]
): Promise<any> => {
  const res = await Promise.all(
    chunk(pubkeys, 100).map((pubkeyChunk) =>
      connection.getMultipleAccountsInfo(pubkeyChunk)
    )
  ).then((responses) => responses.flat())

  return res
}

/**
 * Returns the tick size interval for the given limit price
 *
 * @param {number} limitPrice 1000 < limitPrice <= 990000 where limit price is in 6dp
 *
 * @returns {number} tick size for the given price
 */
export const calculateTickSizeForPrice = (limitPrice: number) => {
  switch (true) {
    case limitPrice < 1000:
      throw new Error("Limit price too low")
    case limitPrice <= 2000:
      return 100
    case limitPrice <= 5000:
      return 250
    case limitPrice <= 10000:
      return 500
    case limitPrice <= 20000:
      return 1000
    case limitPrice <= 50000:
      return 2500
    case limitPrice <= 100000:
      return 5000
    case limitPrice <= 999000:
      return 10000
    case limitPrice > 999000:
      throw new Error("Limit price too high")
    default:
      return limitPrice
  }
}

/**
 * Rounds price to the nearest tick size available
 *
 * @param {number} limitPrice - Limit price
 * @param {boolean} isBinary - True for markets with exactly 2 outcomes
 * @returns {number} Rounded price
 */
export const roundPriceToNearestTickSize = (
  limitPrice: number,
  isBinary?: boolean
) => {
  const factor = Math.pow(10, 6)
  const limitPriceTo6dp = limitPrice * factor
  // binary markets tick size is mirrored on both sides due to there only being one orderbook
  const tickSize = calculateTickSizeForPrice(
    isBinary ? factor - limitPriceTo6dp : limitPriceTo6dp
  )
  const roundedLimitPriceTo6dp =
    Math.round(limitPriceTo6dp / tickSize) * tickSize
  const finalLimitPrice = roundedLimitPriceTo6dp / factor

  return finalLimitPrice
}

/**
 * Obtains public key of best available discount token
 *
 * @param {AverClient} averClient - AverClient object
 * @param {PublicKey} owner - Owner of token
 * @returns {Promise<PublicKey>} Public key of discount token
 */
export const getBestDiscountToken = async (
  averClient: AverClient,
  owner: PublicKey
) => {
  const zeroFeesToken = getAverLaunchZeroFeesToken(averClient.solanaNetwork)
  const averToken = AVER_TOKEN

  try {
    const zeroFeesTokenAccount =
      await averClient.connection.getParsedTokenAccountsByOwner(owner, {
        mint: zeroFeesToken,
      })
    if (
      zeroFeesTokenAccount.value.length > 0 &&
      zeroFeesTokenAccount.value[0].account.data.parsed.info.tokenAmount
        .uiAmount > 0
    ) {
      return zeroFeesTokenAccount.value[0].pubkey
    }
  } catch (e) {
    console.log("Zero fees token mint does not exist on the network / program ID")
  }

  try {
    const communityRewardsTokenAccount =
      await averClient.connection.getParsedTokenAccountsByOwner(owner, {
        mint: AVER_COMMUNITY_REWARDS_NFT,
      })
    if (
      communityRewardsTokenAccount.value.length > 0 &&
      communityRewardsTokenAccount.value[0].account.data.parsed.info.tokenAmount
        .uiAmount > 0
    ) {
      return communityRewardsTokenAccount.value[0].pubkey
    }
  } catch (e) {
    console.log("Community rewards token mint does not exist on the network / program ID")
  }

  try {
    const averTokenAccount =
      await averClient.connection.getParsedTokenAccountsByOwner(owner, {
        mint: averToken,
      })
    if (
      averTokenAccount.value.length > 0 &&
      averTokenAccount.value[0].account.data.parsed.info.tokenAmount.uiAmount > 0
    ) {
      return averTokenAccount.value[0].pubkey
    }
  } catch (e) {
    console.log("Aver token mint does not exist on the network / program ID")
  }

  return SystemProgram.programId
}

/**
 * Parses objects taking into account the Aver Version.
 *
 * Rewrites first 8 bytes of discriminator
 *
 * @param {Program} program - AnchorPy Program
 * @param {AccountType} account_type - Account Type (e.g., MarketStore)
 * @param {AccountInfo<Buffer | null>} bytes - Raw data from onchain
 * @returns Parsed object
 */
export function parseWithVersion(
  program: Program,
  account_type: AccountType,
  bytes: AccountInfo<Buffer | null>
) {
  if (!bytes?.data) throw new Error("Buffer not found")
  //Version is 9th byte
  const version = bytes && bytes.data ? bytes.data[8] : null
  if (version == null) throw new Error(`Error parsing ${account_type}`)

  const latestVersion = getVersionOfAccountTypeInProgram(account_type, program)

  //Checks if this is reading the correct version OR if it is not possible to read an old version
  if (
    version === latestVersion ||
    !program.account[`${account_type}V${version}`]
  ) {
    const firstLetterUppercase = `${account_type}`[0].toUpperCase()
    return program.account[`${account_type}`].coder.accounts.decode(
      firstLetterUppercase + `${account_type}`.substring(1),
      bytes.data
    )
  } else {
    //Reads old version
    console.log(
      `THE ${account_type} BEING READ HAS NOT BEEN UPDATED TO THE LATEST VERSION`
    )
    console.log(
      "PLEASE CALL THE UPDATE INSTRUCTION FOR THE CORRESPONDING ACCOUNT TYPE TO RECTIFY, IF POSSIBLE"
    )
    //We need to replace the discriminator on the bytes data to prevent anchor errors
    const account_discriminator = accountDiscriminator(account_type, version, latestVersion)
    account_discriminator.map((v, i, a) => {
      bytes.data[i] = v
      return 1
    })

    const firstLetterUppercase = `${account_type}V${version}`[0].toUpperCase()
    return program.account[`${account_type}V${version}`].coder.accounts.decode(
      firstLetterUppercase + `${account_type}V${version}`.substring(1),
      bytes.data
    )
  }
}

/**
 * Calculates and returns a unique 8 byte discriminator prepended to all anchor accounts.
 *
 * @param {AccountType} account_type - The name of the account to calculate the discriminator.
 * @param {number} version - Aver version of account
 */
function accountDiscriminator(
  account_type: AccountType,
  version: number,
  latestVersion: number
): Buffer {
  const name = version == latestVersion ? account_type : `${account_type}V${version}`
  return Buffer.from(
    sha256.digest(
      `account:${camelcase(`${name}`, { pascalCase: true })}`
    )
  ).slice(0, 8)
}


// Latest version according to the program
export function getVersionOfAccountTypeInProgram(accountType: AccountType, program: Program){
  let version = 0
  while (true){
    const account = program.account[`${accountType}V${version}`]
    if(account == null){
      break
    } else {
      version = version + 1
    }
  }

  return version
}