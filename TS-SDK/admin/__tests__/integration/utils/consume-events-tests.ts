import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransferParams,
} from '@solana/web3.js'
import { AverClient, Market, Side, signAndSendTransactionInstructions, SizeFormat, USDC_DEVNET, UserMarket } from 'aver-ts'
import BN from 'bn.js'
import { consumeEvents } from './admin-instructions/consume-events'
import { createAverClient } from './client'

jest.setTimeout(1000000)

export const getConsumeEventsTests = (owner: Keypair, marketPubkey: PublicKey) => {
  describe('consume events flow', () => {
    let client: AverClient
    let market: Market
    let user1: Keypair = new Keypair()
    let user2: Keypair = new Keypair()
    let userMarket1: UserMarket
    let userMarket2: UserMarket

    beforeAll(async () => {
      client = (await createAverClient(owner)) as AverClient
    })

    describe('create and fund user markets', () => {
      test('fund both users with Sol funds', async () => {
        const sig1 = await client.connection.requestAirdrop(user1.publicKey, LAMPORTS_PER_SOL)
        const confirmedSig1 = await client.connection.confirmTransaction(sig1)
        expect(confirmedSig1.value.err).toBeFalsy()

        const ix1 = SystemProgram.transfer({
          fromPubkey: user1.publicKey,
          lamports: LAMPORTS_PER_SOL / 2,
          toPubkey: user2.publicKey,
        } as TransferParams)

        const sig2 = await signAndSendTransactionInstructions(client.connection, [], user1, [ix1])
        const confirmedSig2 = await client.connection.confirmTransaction(sig2)
        expect(confirmedSig2.value.err).toBeFalsy()
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
        const ataResponses = await signAndSendTransactionInstructions(
          client.connection,
          [user1, user2],
          user1,
          [ix1, ix2]
        )
        await client.connection.confirmTransaction(ataResponses)

        // create requests to airdrop usdc
        const request1 = client.requestTokenAirdrop(1_000_000_000, USDC_DEVNET, user1.publicKey)
        const request2 = client.requestTokenAirdrop(1_000_000_000, USDC_DEVNET, user2.publicKey)
        const responses = await Promise.all([request1, request2])
        responses.forEach((response) => expect(response?.data?.signature).toBeTruthy())
      })
      test('load market', async () => {
        market = await Market.load(client, marketPubkey)

        expect(market.pubkey.toBase58()).toBe(marketPubkey.toBase58())
      })
      test('successfully create first user market account', async () => {
        userMarket1 = await UserMarket.getOrCreateUserMarketAccount(client, user1, market)

        const expectedUser1Pubkey = (
          await UserMarket.derivePubkeyAndBump(user1.publicKey, marketPubkey)
        )[0]
        expect(userMarket1.pubkey.toBase58()).toBe(expectedUser1Pubkey.toBase58())
      })

      test('successfully create second market account', async () => {
        userMarket2 = await UserMarket.getOrCreateUserMarketAccount(client, user2, market)

        const expectedUser2Pubkey = (
          await UserMarket.derivePubkeyAndBump(user2.publicKey, marketPubkey)
        )[0]
        expect(userMarket2.pubkey.toBase58()).toBe(expectedUser2Pubkey.toBase58())
      })
    })

    describe('place and crank orders', () => {
      const outcomeId = 3
      const size = 10
      const price = 0.5
      const stake = size * price
      const payout = size
      let factor

      describe('match between both users', () => {
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

        test('user2 matches entire order', async () => {
          const sig = await userMarket2.placeOrder(
            user2,
            outcomeId,
            Side.Bid,
            price,
            size,
            SizeFormat.Payout
          )
          const confirmedSig = await client.connection.confirmTransaction(sig)

          expect(confirmedSig.value.err).toBeFalsy()
        })

        test('check balances and exposures', async () => {
          await userMarket1.refresh()
          await userMarket2.refresh()

          expect(userMarket1.outcomePositions[outcomeId].free.toNumber()).toBe(0)
          expect(userMarket1.outcomePositions[outcomeId].locked.toNumber()).toBe(stake * factor)
          expect(userMarket2.outcomePositions[outcomeId].free.toNumber()).toBe(payout * factor)
          expect(userMarket2.outcomePositions[outcomeId].locked.toNumber()).toBe(0)

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
        })
      })

      describe('crank and consume events', () => {
        test('consume events successfully', async () => {
          // this is how to read from the orderbook and get the relevant pubkeys
          // const eventQueuePubkey = (
          //   await Orderbook.deriveEventQueuePubkeyAndBump(marketPubkey, 0)
          // )[0]
          // const eq = await EventQueue.load(client.connection, eventQueuePubkey, CALLBACK_INFO_LEN)
          // const event = eq.parseEvent(0) as EventFill // in reality this could also be an OUT event
          // const maker = new PublicKey(new Uint8Array(event.makerCallbackInfo.slice(0, 32)))
          // const taker = new PublicKey(new Uint8Array(event.takerCallbackInfo.slice(0, 32)))
          // const umas = [maker, taker].sort() // TODO check if correct sort

          const payer = user1
          const ix = await consumeEvents(
            client,
            market.pubkey,
            [userMarket1.pubkey, userMarket2.pubkey].sort(),
            outcomeId,
            new BN(2),
            payer.publicKey
          )

          const sig = await signAndSendTransactionInstructions(client.connection, [], payer, [ix])
          const confirmedSig = await client.connection.confirmTransaction(sig)

          expect(confirmedSig.value.err).toBeFalsy()
        })

        test('check balances post crank', async () => {
          await userMarket1.refresh()
          await userMarket2.refresh()

          expect(userMarket1.outcomePositions[outcomeId].free.toNumber()).toBe(0)
          expect(userMarket1.outcomePositions[outcomeId].locked.toNumber()).toBe(0)
          expect(userMarket2.outcomePositions[outcomeId].free.toNumber()).toBe(payout * factor)
          expect(userMarket2.outcomePositions[outcomeId].locked.toNumber()).toBe(0)

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

        test('check exposures', () => {
          const user1Exposures = userMarket1.calculateExposures().map((exp) => exp.toNumber())
          const user2Exposures = userMarket2.calculateExposures().map((exp) => exp.toNumber())

          expect(user1Exposures[outcomeId]).toBe((0 - stake) * factor)
          expect(user2Exposures[outcomeId]).toBe((size - stake) * factor)

          user1Exposures
            .filter((_, i) => i != outcomeId)
            .forEach((exp) => {
              expect(exp).toBe((size - stake) * factor)
            })

          user2Exposures
            .filter((_, i) => i != outcomeId)
            .forEach((exp) => {
              expect(exp).toBe((0 - stake) * factor)
            })
        })
      })

      // at this point user 1 should have all but 'outcomeId' with 'size' in free
      // and user 2 should only 'outcomeId' with 'size' in free
      // lets get user 2 to cash out to user 1 :P
      describe('neutralize position', () => {
        const newPrice = 0.8
        const newSize = 10
        const newPayout = newSize
        const newStake = newPrice * newSize

        test('place limit order to match neutralizing', async () => {
          const sig = await userMarket1.placeOrder(
            user1,
            outcomeId,
            Side.Bid,
            newPrice,
            newSize,
            SizeFormat.Payout
          )

          const confirmedSig = await client.connection.confirmTransaction(sig)
          expect(confirmedSig.value.err).toBeFalsy()
        })

        test('check new positions', async () => {
          await userMarket1.refresh()
          await userMarket2.refresh()

          expect(userMarket1.outcomePositions[outcomeId].free.toNumber()).toBe(0)
          expect(userMarket1.outcomePositions[outcomeId].locked.toNumber()).toBe(0)
          expect(userMarket2.outcomePositions[outcomeId].free.toNumber()).toBe(size * factor)
          expect(userMarket2.outcomePositions[outcomeId].locked.toNumber()).toBe(0)

          userMarket1.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber() / factor).toBeCloseTo(size - newStake, market.decimals - 1)
              expect(op.locked.toNumber() / factor).toBeCloseTo(newStake, market.decimals - 1)
            })
          userMarket2.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber()).toBe(0)
              expect(op.locked.toNumber()).toBe(0)
            })
        })

        test('neutralize position', async () => {
          const sig = await userMarket2.neutralizePosition(user2, outcomeId)

          const confirmedSig = await client.connection.confirmTransaction(sig)
          expect(confirmedSig.value.err).toBeFalsy()
        })

        test('refresh and check positions', async () => {
          userMarket1.refresh()

          expect(userMarket1.outcomePositions[outcomeId].free.toNumber()).toBe(0)
          expect(userMarket1.outcomePositions[outcomeId].locked.toNumber()).toBe(0)

          userMarket1.outcomePositions
            .filter((_op, i) => i != outcomeId)
            .forEach((op) => {
              expect(op.free.toNumber() / factor).toBeCloseTo(size - newStake, market.decimals - 1)
              expect(op.locked.toNumber() / factor).toBeCloseTo(newStake, market.decimals - 1)
            })
        })
      })
    })
  })
}
