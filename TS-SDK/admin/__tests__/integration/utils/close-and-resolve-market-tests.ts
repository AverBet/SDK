import { Keypair, PublicKey } from '@solana/web3.js'
import { createAverClient } from './client'
import { changeMarketStatus } from './admin-instructions/change-market-status'
import { closeAaob } from './admin-instructions/close-aaob'
import { manualResolveMarket } from './admin-instructions/manual-resolve-market'
import { AverClient, Market, MarketStatus, signAndSendTransactionInstructions } from 'aver-ts'

jest.setTimeout(1000000)

export const closeAaobAndResolveMarket = (
  market: PublicKey,
  marketAuthority: Keypair,
  winningOutcome: number
) => {
  describe('close aaob and resolve market tests', () => {
    let client: AverClient
    let marketObject: Market

    beforeAll(async () => {
      client = (await createAverClient(new Keypair())) as AverClient
    })

    test('load market', async () => {
      marketObject = await Market.load(client, market)

      expect(marketObject.pubkey.toBase58()).toBe(market.toBase58())
      expect(marketObject.marketAuthority.toBase58()).toBe(marketAuthority.publicKey.toBase58())
    })

    test('cease trading', async () => {
      const ix = await changeMarketStatus(
        client,
        market,
        marketAuthority.publicKey,
        MarketStatus.TradingCeased
      )
      const sig = await signAndSendTransactionInstructions(client.connection, [], marketAuthority, [
        ix,
      ])

      const confirmedTx = await client.connection.confirmTransaction(sig)
      expect(confirmedTx.value.err).toBeFalsy()
    })

    test('refresh and check market status', async () => {
      await marketObject.refresh()

      expect(marketObject.marketStatus).toBe(MarketStatus.TradingCeased)
    })

    // TODO chunk to close 5 at a time
    test('close aaob', async () => {
      const ix = await closeAaob(client, market, marketAuthority, [
        ...Array(marketObject.numberOfOutcomes).keys(),
      ])

      const sig = await signAndSendTransactionInstructions(client.connection, [], marketAuthority, [
        ix,
      ])

      const confirmedTx = await client.connection.confirmTransaction(sig)
      expect(confirmedTx.value.err).toBeFalsy()
    })

    test('refresh and check market status', async () => {
      await marketObject.refresh()

      expect(marketObject.marketStatus).toBe(MarketStatus.CeasedCrankedClosed)
    })

    test('resolve market', async () => {
      const ix = await manualResolveMarket(client, market, marketAuthority, winningOutcome)

      const sig = await signAndSendTransactionInstructions(client.connection, [], marketAuthority, [
        ix,
      ])

      const confirmedTx = await client.connection.confirmTransaction(sig)
      expect(confirmedTx.value.err).toBeFalsy()
    })

    test('refresh and check market status', async () => {
      await marketObject.refresh()

      expect(marketObject.marketStatus).toBe(MarketStatus.Resolved)
      expect(marketObject.winningOutcome).toBe(winningOutcome)
    })
  })
}
