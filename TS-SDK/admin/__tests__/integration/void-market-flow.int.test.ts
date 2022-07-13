import { Keypair } from '@solana/web3.js'
import { getAverClientSetupTests } from './utils/aver-client-setup-tests'
import { getInitMarketSmokeTests } from './utils/create-market-tests'
import { getMarketFlowTests } from './utils/void-market-tests'

jest.setTimeout(1000000)

describe('tests', () => {
  const owner = new Keypair()
  const market = new Keypair()
  const marketAuthority = new Keypair()

  getAverClientSetupTests(owner)
  getInitMarketSmokeTests(owner, 2, market, marketAuthority)
  getMarketFlowTests(owner, market.publicKey, marketAuthority)
})
