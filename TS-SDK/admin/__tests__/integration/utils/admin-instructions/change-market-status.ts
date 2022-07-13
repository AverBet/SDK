import { PublicKey } from '@solana/web3.js'
import { AverClient, Market, MarketStatus } from 'aver-ts'

export const changeMarketStatus = async (
  averClient: AverClient,
  market: PublicKey,
  marketAuthority: PublicKey,
  marketStatus: MarketStatus
) => {
  const [marketStore, _marketStoreBump] = await Market.deriveMarketStorePubkeyAndBump(market)
  return averClient.program.instruction['changeMarketStatus'](marketStatus, {
    accounts: {
      marketAuthority: marketAuthority,
      market: market,
      marketStore: marketStore,
    },
  })
}
