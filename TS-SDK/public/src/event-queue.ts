import { Connection, PublicKey } from "@solana/web3.js"
import { CALLBACK_INFO_LEN } from "./ids"
import { chunkAndFetchMultiple } from "./utils"
import { EventQueue } from "@bonfida/aaob"

/**
 * Loads onchain data for multiple Event Queues
 *
 * @param {Connection} conn - Connection object
 * @param {PublicKey[]} event_queues - Solana AsyncClient object
 * @returns {Promise<EventQueue[]>} - List of EventQueues
 */
export async function loadAllEventQueues(
  conn: Connection,
  event_queues: PublicKey[]
): Promise<EventQueue[]> {
  const data = await chunkAndFetchMultiple(conn, event_queues)
  return data.map((d) => {
    if (!d) throw new Error("Event Queue Cant be loaded")
    return readEventQueueFromBytes(d.data)
  })
}

/**
 * Parses raw event queue data into Event objects
 *
 * @param {Bufer} buffer - Raw bytes coming from onchain
 * @returns {EventQueue} - EventQueue
 */
export function readEventQueueFromBytes(buffer: Buffer) {
  const eventQueue = EventQueue.parse(CALLBACK_INFO_LEN, buffer)

  return eventQueue
}

//TODO - Check if this sort fucntion is the same as python
/**
 * Sorts list of user accounts by public key (alphabetically)
 *
 * @param {PublicKey[]} userAccounts - List of User Account account pubkeys
 * @returns {PublicKey[]} - Sorted list of User Account account pubkeys
 */
export function prepareUserAccountsList(
  userAccounts: PublicKey[]
): PublicKey[] {
  return userAccounts.sort((a, b) => {
    return a.toString().localeCompare(b.toString())
  })
}
