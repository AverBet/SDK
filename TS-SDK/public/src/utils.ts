import { ProgramError } from "@project-serum/anchor"
import {
  Keypair,
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  SendOptions,
  SystemProgram,
} from "@solana/web3.js"
import { chunk } from "lodash"
import { AverClient } from "./aver-client"
import { parseError } from "./errors"
import {
  AVER_COMMUNITY_REWARDS_NFT,
  AVER_TOKEN,
  getAverLaunchZeroFeesToken,
} from "./ids"

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
      errorThrown = parseError(e, client.program)

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

  return SystemProgram.programId
}
