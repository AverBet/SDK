import { Keypair } from '@solana/web3.js'
import { getAverClientSetupTests } from './utils/aver-client-setup-tests'
import { getConsumeEventsTests } from './utils/consume-events-tests'
import { getInitMarketSmokeTests } from './utils/create-market-tests'

jest.setTimeout(1000000)

describe('close market flow', () => {
  const owner = new Keypair()
  const market = new Keypair()
  const marketAuthority = new Keypair()

  getAverClientSetupTests(owner)
  getInitMarketSmokeTests(owner, 5, market, marketAuthority)
  getConsumeEventsTests(owner, market.publicKey)
})
