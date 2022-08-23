import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { AverClient, Market, MarketStatus, signAndSendTransactionInstructions } from 'aver-ts'
import BN from 'bn.js'
import { changeMarketStatus } from './admin-instructions/change-market-status'
import { updateMarketTimes } from './admin-instructions/update-market-times'
import { voidMarket } from './admin-instructions/void-market'
import { createAverClient } from './client'

jest.setTimeout(1000000)

export const getMarketFlowTests = (
  owner: Keypair,
  marketPubkey: PublicKey,
  marketAuthority: Keypair
) => {
  describe('go through market flow', () => {
    let averClient: AverClient
    let keypair: Keypair
    let conn: Connection
    let market: Market

    beforeAll(async () => {
      averClient = (await createAverClient(owner)) as AverClient
      keypair = owner
      conn = averClient.connection
    })

    describe('setup', () => {
      test('load market', async () => {
        market = await Market.load(averClient, marketPubkey)

        expect(market.pubkey.toBase58()).toBe(marketPubkey.toBase58())
        expect(market.marketAuthority.toBase58()).toBe(marketAuthority.publicKey.toBase58())
      })

      test('airdrop market authority', async () => {
        const sig = await averClient.connection.requestAirdrop(
          marketAuthority.publicKey,
          LAMPORTS_PER_SOL
        )

        const confirmedSig = await averClient.connection.confirmTransaction(sig)
        expect(confirmedSig.value.err).toBeFalsy()
      })
    })

    describe('change market status', () => {
      test('halt market', async () => {
        const ix = await changeMarketStatus(
          averClient,
          market.pubkey,
          market.marketAuthority,
          MarketStatus.HaltedPreEvent
        )
        const sig = await signAndSendTransactionInstructions(
          averClient.connection,
          [],
          marketAuthority,
          [ix]
        )

        const confirmedTx = await averClient.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test('refresh and check market status', async () => {
        await market.refresh()

        expect(market.marketStatus).toBe(MarketStatus.HaltedPreEvent)
      })

      test('resume market', async () => {
        const ix = await changeMarketStatus(
          averClient,
          market.pubkey,
          market.marketAuthority,
          MarketStatus.ActivePreEvent
        )
        const sig = await signAndSendTransactionInstructions(
          averClient.connection,
          [],
          marketAuthority,
          [ix]
        )

        const confirmedTx = await averClient.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test('refresh and check market status', async () => {
        await market.refresh()

        expect(market.marketStatus).toBe(MarketStatus.ActivePreEvent)
      })
    })

    describe('update market times', () => {
      const nextDay = new BN(new Date().setDate(new Date().getDate() + 1))
      const nextMonth = new BN(new Date().setMonth(new Date().getMonth() + 1))
      const nextYear = new BN(new Date().setFullYear(new Date().getFullYear() + 1))

      test('update both trading cease and in play times', async () => {
        const ix = updateMarketTimes(
          averClient,
          market.pubkey,
          marketAuthority.publicKey,
          nextMonth,
          nextDay
        )

        const sig = await signAndSendTransactionInstructions(
          averClient.connection,
          [],
          marketAuthority,
          [ix]
        )

        const confirmedTx = await averClient.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test('update only one time', async () => {
        const ix = updateMarketTimes(averClient, market.pubkey, marketAuthority.publicKey, nextYear)

        const sig = await signAndSendTransactionInstructions(
          averClient.connection,
          [],
          marketAuthority,
          [ix]
        )

        const confirmedTx = await averClient.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test('refresh and check cease and in play times', async () => {
        await market.refresh()

        expect(Math.floor(market.tradingCeaseTime.getTime() / 1000)).toBe(nextYear.toNumber())
        expect(
          market.inplayStartTime ? Math.floor(market.inplayStartTime.getTime() / 1000) : -1
        ).toBe(market.goingInPlayFlag ? nextDay.toNumber() : -1)
      })
    })

    describe('void market', () => {
      test('successfully void market', async () => {
        const ix = await voidMarket(averClient, market.pubkey, marketAuthority)

        const sig = await signAndSendTransactionInstructions(
          averClient.connection,
          [],
          marketAuthority,
          [ix]
        )

        const confirmedTx = await averClient.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test('check if market has been voided', async () => {
        await market.refresh()

        expect(market.marketStatus).toBe(MarketStatus.Voided)
      })
    })
  })
}
