import { Slab } from "@bonfida/aaob"
import { Idl, IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl"
import {
  IdlTypes,
  TypeDef,
} from "@project-serum/anchor/dist/cjs/program/namespace/types"
import {
  AccountLayout,
  ACCOUNT_SIZE,
  getAssociatedTokenAddress,
} from "@solana/spl-token"
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js"
import { AverClient } from "./aver-client"
import { AVER_PROGRAM_ID, CALLBACK_INFO_LEN, getQuoteToken } from "./ids"
import { Orderbook } from "./orderbook"
import {
  MarketState,
  MarketStatus,
  MarketStoreState,
  OrderbookAccountsState,
  SolanaNetwork,
  UserBalanceState,
  UserMarketState,
} from "./types"
import { UserMarket } from "./user-market"
import { chunkAndFetchMultiple } from "./utils"
import { EventQueue, EventQueueHeader } from "@bonfida/aaob"

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
