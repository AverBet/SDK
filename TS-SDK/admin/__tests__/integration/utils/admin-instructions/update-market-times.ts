import { PublicKey } from '@solana/web3.js'
import { AverClient } from 'aver-ts'
import BN from 'bn.js'

export const updateMarketTimes = (
  averClient: AverClient,
  market: PublicKey,
  marketAuthority: PublicKey,
  newTradingCeaseTime: BN | null = null,
  newInplayStartTime: BN | null = null
) =>
  averClient.program.instruction['updateMarketTimes'](newTradingCeaseTime, newInplayStartTime, {
    accounts: {
      market,
      marketAuthority,
    },
  })
