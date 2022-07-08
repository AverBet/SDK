import { AccountMeta, PublicKey } from '@solana/web3.js'
import { AverClient, Market, Orderbook } from 'aver-ts'
import BN from 'bn.js'

export const consumeEvents = async (
  averClient: AverClient,
  market: PublicKey,
  userMarketAccounts: PublicKey[],
  outcomeId: number,
  maxIterations: BN,
  rewardTarget: PublicKey
) => {
  const marketStore = (await Market.deriveMarketStorePubkeyAndBump(market))[0]
  const orderbook = (await Orderbook.deriveOrderbookPubkeyAndBump(market, outcomeId))[0]
  const eventQueue = (await Orderbook.deriveEventQueuePubkeyAndBump(market, outcomeId))[0]
  const remainingAccounts = userMarketAccounts.map(
    (uma) =>
      ({
        isSigner: false,
        isWritable: true,
        pubkey: uma,
      } as AccountMeta)
  )

  return averClient.program.instruction['consumeEvents'](maxIterations, outcomeId, {
    accounts: {
      market: market,
      marketStore: marketStore,
      orderbook: orderbook,
      eventQueue: eventQueue,
      rewardTarget: rewardTarget,
    },
    remainingAccounts: remainingAccounts,
  })
}
