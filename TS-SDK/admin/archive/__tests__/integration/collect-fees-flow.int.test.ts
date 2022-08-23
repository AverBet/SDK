import { Keypair } from '@solana/web3.js'
import { getAverClientSetupTests } from './utils/aver-client-setup-tests'
import { getInitMarketSmokeTests } from './utils/create-market-tests'
import { getConsumeEventsTests } from './utils/consume-events-2-tests'
import { closeAaobAndResolveMarket } from './utils/close-and-resolve-market-tests'
import { getCreateHostAndReferrerTests } from './create-host-and-referrer'

// TODO add tests to see if discount token works

jest.setTimeout(1000000)

describe('tests', () => {
  const market = new Keypair()
  const marketAuthority = new Keypair()
  const winningOutcome = 0

  getAverClientSetupTests(marketAuthority)
  getInitMarketSmokeTests(marketAuthority, 3, market, marketAuthority)
  getCreateHostAndReferrerTests(marketAuthority)
  getConsumeEventsTests(marketAuthority, market.publicKey, winningOutcome)
  closeAaobAndResolveMarket(market.publicKey, marketAuthority, winningOutcome)
})
