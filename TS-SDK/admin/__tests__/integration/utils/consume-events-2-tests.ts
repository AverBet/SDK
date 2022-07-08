import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransferParams,
} from '@solana/web3.js'
import { AverClient, Host, Market, Referrer, Side, signAndSendTransactionInstructions, SizeFormat, USDC_DEVNET, UserMarket } from 'aver-ts'
import BN from 'bn.js'
import { consumeEvents } from './admin-instructions/consume-events'
import { createAverClient } from './client'

jest.setTimeout(1000000)

export const getConsumeEventsTests = (
  owner: Keypair,
  marketPubkey: PublicKey,
  outcomeToTrade = 0
) => {
  describe('consume events flow', () => {
    let client: AverClient
    let market: Market
    let user1: Keypair = new Keypair()
    let user2: Keypair = new Keypair()
    let user3: Keypair = new Keypair()
    let userMarket1: UserMarket
    let userMarket2: UserMarket
    let userMarket3: UserMarket

    let host: PublicKey
    let referrer: PublicKey

    beforeAll(async () => {
      client = (await createAverClient(owner)) as AverClient

      host = (await Host.derivePubkeyAndBump(owner.publicKey))[0]
      referrer = (await Referrer.derivePubkeyAndBump(owner.publicKey, host))[0]
    })

    describe('create and fund user markets', () => {
      test('fund all three users with Sol funds', async () => {
        const sig1 = await client.connection.requestAirdrop(user1.publicKey, LAMPORTS_PER_SOL)
        const confirmedSig1 = await client.connection.confirmTransaction(sig1)
        expect(confirmedSig1.value.err).toBeFalsy()
        const lamportsPerUser = Math.floor(LAMPORTS_PER_SOL / 3)

        const ix1 = SystemProgram.transfer({
          fromPubkey: user1.publicKey,
          lamports: lamportsPerUser,
          toPubkey: user2.publicKey,
        } as TransferParams)

        const sig2 = await signAndSendTransactionInstructions(client.connection, [], user1, [ix1])
        const confirmedSig2 = await client.connection.confirmTransaction(sig2)
        expect(confirmedSig2.value.err).toBeFalsy()

        const ix2 = SystemProgram.transfer({
          fromPubkey: user1.publicKey,
          lamports: lamportsPerUser,
          toPubkey: user3.publicKey,
        } as TransferParams)

        const sig3 = await signAndSendTransactionInstructions(client.connection, [], user1, [ix2])
        const confirmedSig3 = await client.connection.confirmTransaction(sig3)
        expect(confirmedSig3.value.err).toBeFalsy()
      })
      test('fund both users with owners USDC funds', async () => {
        // create atas for users
        const ix1 = await client.createTokenAtaInstruction(
          USDC_DEVNET,
          user1.publicKey,
          user1.publicKey
        )
        const ix2 = await client.createTokenAtaInstruction(
          USDC_DEVNET,
          user2.publicKey,
          user2.publicKey
        )
        const ix3 = await client.createTokenAtaInstruction(
          USDC_DEVNET,
          user3.publicKey,
          user3.publicKey
        )
        const ataResponses = await signAndSendTransactionInstructions(
          client.connection,
          [user1, user2, user3],
          user1,
          [ix1, ix2, ix3]
        )
        await client.connection.confirmTransaction(ataResponses)

        // create requests to airdrop usdc
        const request1 = client.requestTokenAirdrop(1_000_000_000, USDC_DEVNET, user1.publicKey)
        const request2 = client.requestTokenAirdrop(1_000_000_000, USDC_DEVNET, user2.publicKey)
        const request3 = client.requestTokenAirdrop(1_000_000_000, USDC_DEVNET, user3.publicKey)
        const responses = await Promise.all([request1, request2, request3])
        responses.forEach((response) => expect(response?.data?.signature).toBeTruthy())
      })
      test('load market', async () => {
        market = await Market.load(client, marketPubkey)

        expect(market.pubkey.toBase58()).toBe(marketPubkey.toBase58())
      })
      test('successfully create first user market account', async () => {
        userMarket1 = await UserMarket.getOrCreateUserMarketAccount(
          client,
          user1,
          market,
          undefined,
          undefined,
          host,
          undefined,
          referrer
        )

        const expectedUser1Pubkey = (
          await UserMarket.derivePubkeyAndBump(user1.publicKey, marketPubkey, host)
        )[0]
        expect(userMarket1.pubkey.toBase58()).toBe(expectedUser1Pubkey.toBase58())
      })

      test('successfully create second market account', async () => {
        userMarket2 = await UserMarket.getOrCreateUserMarketAccount(
          client,
          user2,
          market,
          undefined,
          undefined,
          host,
          undefined,
          referrer
        )

        const expectedUser2Pubkey = (
          await UserMarket.derivePubkeyAndBump(user2.publicKey, marketPubkey, host)
        )[0]
        expect(userMarket2.pubkey.toBase58()).toBe(expectedUser2Pubkey.toBase58())
      })

      test('successfully create third market account', async () => {
        userMarket3 = await UserMarket.getOrCreateUserMarketAccount(
          client,
          user3,
          market,
          undefined,
          undefined,
          host,
          undefined,
          referrer
        )

        const expectedUser3Pubkey = (
          await UserMarket.derivePubkeyAndBump(user3.publicKey, marketPubkey, host)
        )[0]
        expect(userMarket3.pubkey.toBase58()).toBe(expectedUser3Pubkey.toBase58())
      })
    })

    describe('place and crank orders', () => {
      const outcomeId = outcomeToTrade
      const size = 20
      const price = 0.5
      const stake = size * price
      const payout = size
      let factor

      describe('user 1 sells to user 2 and user 3', () => {
        beforeAll(() => {
          factor = Math.pow(10, market.decimals)
        })

        test('check balances before placing an order', () => {
          expect(userMarket1.orders).toHaveLength(0)
          expect(userMarket2.orders).toHaveLength(0)

          userMarket1.outcomePositions.forEach((op) => {
            expect(op.free.toNumber()).toBe(0)
            expect(op.locked.toNumber()).toBe(0)
          })
        })

        test('user1 places an order', async () => {
          const sig = await userMarket1.placeOrder(
            user1,
            outcomeId,
            Side.Ask,
            price,
            size,
            SizeFormat.Payout
          )
          const confirmedSig = await client.connection.confirmTransaction(sig)

          expect(confirmedSig.value.err).toBeFalsy()

          await userMarket1.refresh()
        })

        test('user2 matches half the order', async () => {
          const sig = await userMarket2.placeOrder(
            user2,
            outcomeId,
            Side.Bid,
            price,
            size / 2,
            SizeFormat.Payout
          )
          const confirmedSig = await client.connection.confirmTransaction(sig)

          expect(confirmedSig.value.err).toBeFalsy()
        })

        test('user 3 matches half the order', async () => {
          const sig = await userMarket3.placeOrder(
            user3,
            outcomeId,
            Side.Bid,
            price,
            size / 2,
            SizeFormat.Payout
          )
          const confirmedSig = await client.connection.confirmTransaction(sig)

          expect(confirmedSig.value.err).toBeFalsy()
        })

        test('check balances and exposures', async () => {
          await userMarket1.refresh()
          await userMarket2.refresh()
          await userMarket3.refresh()

          expect(userMarket1.outcomePositions[outcomeId].free.toNumber()).toBe(0)
          expect(userMarket1.outcomePositions[outcomeId].locked.toNumber()).toBe(stake * factor)
          expect(userMarket2.outcomePositions[outcomeId].free.toNumber()).toBe(
            (payout / 2) * factor
          )
          expect(userMarket2.outcomePositions[outcomeId].locked.toNumber()).toBe(0)
          expect(userMarket3.outcomePositions[outcomeId].free.toNumber()).toBe(
            (payout / 2) * factor
          )
          expect(userMarket3.outcomePositions[outcomeId].locked.toNumber()).toBe(0)

          userMarket1.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber()).toBe(stake * factor)
              expect(op.locked.toNumber()).toBe(0)
            })
          userMarket2.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber()).toBe(0)
              expect(op.locked.toNumber()).toBe(0)
            })
          userMarket3.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber()).toBe(0)
              expect(op.locked.toNumber()).toBe(0)
            })
        })
      })

      describe('crank and consume events', () => {
        test('consume events successfully', async () => {
          const payer = user1
          const ix = await consumeEvents(
            client,
            market.pubkey,
            [userMarket1.pubkey, userMarket2.pubkey, userMarket3.pubkey].sort(),
            outcomeId,
            new BN(3),
            payer.publicKey
          )

          const sig = await signAndSendTransactionInstructions(client.connection, [], payer, [ix])
          const confirmedSig = await client.connection.confirmTransaction(sig)

          expect(confirmedSig.value.err).toBeFalsy()
        })

        test('check balances post crank', async () => {
          await userMarket1.refresh()
          await userMarket2.refresh()
          await userMarket3.refresh()

          expect(userMarket1.outcomePositions[outcomeId].free.toNumber()).toBe(0)
          expect(userMarket1.outcomePositions[outcomeId].locked.toNumber()).toBe(0)
          expect(userMarket2.outcomePositions[outcomeId].free.toNumber()).toBe(
            (payout / 2) * factor
          )
          expect(userMarket2.outcomePositions[outcomeId].locked.toNumber()).toBe(0)
          expect(userMarket3.outcomePositions[outcomeId].free.toNumber()).toBe(
            (payout / 2) * factor
          )
          expect(userMarket3.outcomePositions[outcomeId].locked.toNumber()).toBe(0)

          userMarket1.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber()).toBe(payout * factor)
              expect(op.locked.toNumber()).toBe(0)
            })
          userMarket2.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber()).toBe(0)
              expect(op.locked.toNumber()).toBe(0)
            })
        })

        // at this point user 1 should have all but 'outcomeId' with 'size' in free
        // and user 2 should only 'outcomeId' with 'size / 2' in free
        // and user 3 should only 'outcomeId' with 'size / 2' in free
        test('check exposures', () => {
          const user1Exposures = userMarket1.calculateExposures().map((exp) => exp.toNumber())
          const user2Exposures = userMarket2.calculateExposures().map((exp) => exp.toNumber())
          const user3Exposures = userMarket3.calculateExposures().map((exp) => exp.toNumber())

          expect(user1Exposures[outcomeId]).toBe((0 - stake) * factor)
          expect(user2Exposures[outcomeId]).toBe((size / 2 - stake / 2) * factor)
          expect(user3Exposures[outcomeId]).toBe((size / 2 - stake / 2) * factor)

          user1Exposures
            .filter((_, i) => i != outcomeId)
            .forEach((exp) => {
              expect(exp).toBe((size - stake) * factor)
            })

          user2Exposures
            .filter((_, i) => i != outcomeId)
            .forEach((exp) => {
              expect(exp).toBe((0 - stake / 2) * factor)
            })

          user3Exposures
            .filter((_, i) => i != outcomeId)
            .forEach((exp) => {
              expect(exp).toBe((0 - stake / 2) * factor)
            })

          console.log('market: ', market.pubkey.toBase58())
          console.log('host: ', host.toBase58())
          console.log('referrer: ', referrer.toBase58())
          console.log('user1: ', user1.publicKey.toBase58())
          console.log('user2: ', user2.publicKey.toBase58())
          console.log('user3: ', user3.publicKey.toBase58())
        })
      })
    })
  })
}
