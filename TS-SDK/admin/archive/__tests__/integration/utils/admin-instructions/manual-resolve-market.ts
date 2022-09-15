import { Keypair, PublicKey } from '@solana/web3.js'
import { AverClient, Market } from 'aver-ts'

export const manualResolveMarket = async (
  averClient: AverClient,
  market: PublicKey,
  marketAuthority: Keypair,
  outcomeId: number
) => {
  const quoteVault = await Market.deriveQuoteVaultPubkey(market, averClient.solanaNetwork)

  return averClient.program.instruction['manualResolve'](outcomeId, {
    accounts: {
      market,
      marketAuthority: marketAuthority.publicKey,
      quoteVault,
    },
  })
}
