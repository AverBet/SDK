import { Program } from "@project-serum/anchor"
import { Keypair, AccountMeta } from "@solana/web3.js"
import { Market } from "../../public/src/market"
import { Orderbook } from "../../public/src/orderbook"

export async function closeAaobTx(
  program: Program,
  market: Market,
  market_authority: Keypair,
  outcomes: number[]
) {
  const marketStore = market.marketStore
  const orderbooks = (
    await Promise.all(
      outcomes.map((o) =>
        Orderbook.deriveOrderbookPubkeyAndBump(
          market.pubkey,
          o,
          market.programId
        )
      )
    )
  ).map((a) => a[0])
  const eventQueues = (
    await Promise.all(
      outcomes.map((o) =>
        Orderbook.deriveEventQueuePubkeyAndBump(
          market.pubkey,
          o,
          market.programId
        )
      )
    )
  ).map((a) => a[0])
  const bids = (
    await Promise.all(
      outcomes.map((o) =>
        Orderbook.deriveBidsPubkeyAndBump(market.pubkey, o, market.programId)
      )
    )
  ).map((a) => a[0])
  const asks = (
    await Promise.all(
      outcomes.map((o) =>
        Orderbook.deriveAsksPubkeyAndBump(market.pubkey, o, market.programId)
      )
    )
  ).map((a) => a[0])

  const inPlayQueue = market.inPlayQueue

  const remainingAccounts = outcomes
    .map((o) => {
      const orderbook = {
        pubkey: orderbooks[o],
        isSigner: false,
        isWritable: true,
      } as AccountMeta
      const eventQueue = {
        pubkey: eventQueues[o],
        isSigner: false,
        isWritable: true,
      } as AccountMeta
      const bid = {
        pubkey: bids[o],
        isSigner: false,
        isWritable: true,
      } as AccountMeta
      const ask = {
        pubkey: asks[o],
        isSigner: false,
        isWritable: true,
      } as AccountMeta
      return [orderbook, eventQueue, bid, ask]
    })
    .flat()

  //pass in random keypair for in play queue if old market
  // if not in_play_queue or in_play_queue == SYS_PROGRAM_ID:
  //   in_play_queue = Keypair().public_key

  return await program.rpc["closeAaob"](outcomes, {
    accounts: {
      market: market.pubkey,
      marketAuthority: market_authority.publicKey,
      marketStore: marketStore,
      targetLamportsAccount: market_authority.publicKey,
      inPlayQueue: inPlayQueue,
    },
    remainingAccounts: remainingAccounts,
    signers: [market_authority],
  })
}
