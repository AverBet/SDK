import { Connection, PublicKey } from "@solana/web3.js"
import { CALLBACK_INFO_LEN } from "./ids"
import { chunkAndFetchMultiple } from "./utils"
import { EventQueue } from "@bonfida/aaob"

export async function loadAllEventQueues(
  conn: Connection,
  event_queues: PublicKey[]
): Promise<EventQueue[]> {
  const data = await chunkAndFetchMultiple(conn, event_queues)
  console.log(data)
  return data.map((d) => readEventQueuFromBytes(d.data))
}

export function readEventQueuFromBytes(buffer: Buffer) {
  const eventQueue = EventQueue.parse(CALLBACK_INFO_LEN, buffer)

  return eventQueue
}

//TODO - Check if this sort fucntion is the same as python
export function prepareUserAccountsList(
  user_account: PublicKey[]
): PublicKey[] {
  return user_account.sort((a, b) => {
    return a.toString().localeCompare(b.toString())
  })
}
