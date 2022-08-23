import { Keypair } from '@solana/web3.js'
import { getCreateHostAndReferrerTests } from './create-host-and-referrer'
import { getAverClientSetupTests } from './utils/aver-client-setup-tests'
import { getInitMarketSmokeTests } from './utils/create-market-tests'
import { getUserFlowSmokeTests } from './utils/user-flow-tests'

jest.setTimeout(1000000)

describe('binary market test', () => {
  const owner = new Keypair()
  const market = new Keypair()
  const marketAuthority = new Keypair()

  getAverClientSetupTests(owner)
  getInitMarketSmokeTests(owner, 2, market, marketAuthority)
  getCreateHostAndReferrerTests(owner)
  getUserFlowSmokeTests(owner, market.publicKey)
})
