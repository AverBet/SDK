import { Keypair, PublicKey, AccountMeta } from '@solana/web3.js'
import { AverClient, Market, Orderbook } from 'aver-ts'

export const closeAaob = async (
  averClient: AverClient,
  market: PublicKey,
  marketAuthority: Keypair,
  outcomes: number[]
) => {
  const [marketStore, _] = await Market.deriveMarketStorePubkeyAndBump(market)
  const orderbooks = (
    await Promise.all(outcomes.map((o) => Orderbook.deriveOrderbookPubkeyAndBump(market, o)))
  ).map((oo) => oo[0])
  const eventQueues = (
    await Promise.all(outcomes.map((o) => Orderbook.deriveEventQueuePubkeyAndBump(market, o)))
  ).map((oo) => oo[0])
  const bids = (
    await Promise.all(outcomes.map((o) => Orderbook.deriveBidsPubkeyAndBump(market, o)))
  ).map((oo) => oo[0])
  const asks = (
    await Promise.all(outcomes.map((o) => Orderbook.deriveAsksPubkeyAndBump(market, o)))
  ).map((oo) => oo[0])

  const remainingAccounts = outcomes.flatMap((_, i) => [
    { isSigner: false, isWritable: true, pubkey: orderbooks[i] } as AccountMeta,
    { isSigner: false, isWritable: true, pubkey: eventQueues[i] } as AccountMeta,
    { isSigner: false, isWritable: true, pubkey: bids[i] } as AccountMeta,
    { isSigner: false, isWritable: true, pubkey: asks[i] } as AccountMeta,
  ])

  return averClient.program.instruction['closeAaob'](outcomes, {
    accounts: {
      market: market,
      marketAuthority: marketAuthority.publicKey,
      marketStore: marketStore,
      targetLamportsAccount: marketAuthority.publicKey,
    },
    remainingAccounts: remainingAccounts,
  })
}
