import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token"
import BN from "bn.js"
import { createAverClient } from "./client"
import {
  AverClient,
  Host,
  Market,
  Referrer,
  roundPriceToNearestTickSize,
  Side,
  signAndSendTransactionInstructions,
  SizeFormat,
  USDC_DEVNET,
  UserHostLifetime,
  UserMarket,
} from "aver-ts"

jest.setTimeout(1000000)

export const getUserFlowSmokeTests = (
  owner: Keypair,
  marketPubkey: PublicKey
) => {
  describe("updated program tests 2", () => {
    let client: AverClient
    let keypair: Keypair
    let conn: Connection

    // pubkeys
    let host: PublicKey
    let referrer: PublicKey
    let userHostLifetime: PublicKey
    let userQuoteTokenAta: PublicKey
    let market: PublicKey = marketPubkey
    let userMarket: PublicKey

    // objects
    let marketObject: Market
    let userMarketObject: UserMarket

    const MINUTE = 1000 * 60

    // utility test functions

    const testUmaValues = async (uma?: UserMarket) => {
      if (!uma) {
        fail("Uma is undefine")
      }
      expect(uma.maxNumberOfOrders).toBe(uma.numberOfOutcomes * 5)
      expect(uma.pubkey.toBase58()).toBe(userMarket.toBase58())
      expect(uma.userHostLifetime.toBase58()).toBe(userHostLifetime.toBase58())
      expect(uma.user.toBase58()).toBe(keypair.publicKey.toBase58())
    }

    beforeAll(async () => {
      client = (await createAverClient(owner)) as AverClient
      keypair = owner
      conn = client.connection

      host = (await Host.derivePubkeyAndBump(keypair.publicKey))[0]
      referrer = (
        await Referrer.derivePubkeyAndBump(keypair.publicKey, host)
      )[0]
      userHostLifetime = (
        await UserHostLifetime.derivePubkeyAndBump(keypair.publicKey, host)
      )[0]
    })

    describe("user lifetime account", () => {
      test("get or create user quote token ata", async () => {
        userQuoteTokenAta = (
          await getOrCreateAssociatedTokenAccount(
            conn,
            keypair,
            USDC_DEVNET,
            keypair.publicKey,
            undefined
          )
        ).address

        expect(userQuoteTokenAta).toBeTruthy()
      })

      test("create user lifetime account", async () => {
        const sig = await UserHostLifetime.createUserHostLifetime(
          client,
          keypair,
          userQuoteTokenAta,
          undefined,
          undefined,
          host,
          referrer
        )
        const confirmedTx = await client.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()

        expect(sig).toBeTruthy()
      })

      test("load user lifetime account", async () => {
        const loadedLifeTimeAccount = await UserHostLifetime.load(
          client,
          userHostLifetime
        )

        // TODO check all fields
        expect(loadedLifeTimeAccount.creationDate.getTime()).toBeLessThan(
          new Date().getTime() + MINUTE
        )
        expect(loadedLifeTimeAccount.creationDate.getTime()).toBeGreaterThan(
          new Date().getTime() - MINUTE
        )
        expect(loadedLifeTimeAccount.host.toBase58()).toBe(host.toBase58())
        expect(loadedLifeTimeAccount.referrer?.toBase58()).toBe(
          referrer.toBase58()
        )
        expect(loadedLifeTimeAccount.pubkey.toBase58()).toBe(
          userHostLifetime.toBase58()
        )
      })
    })

    describe("market account", () => {
      test("load market", async () => {
        const loadedMarket = await Market.load(client, market)
        marketObject = loadedMarket

        // TODO check all fields
        expect(loadedMarket.pubkey.toBase58()).toBe(market.toBase58())
        expect(loadedMarket.quoteTokenMint.toBase58()).toBe(
          USDC_DEVNET.toBase58()
        )
        expect(loadedMarket.orderbooks).toHaveLength(
          loadedMarket.numberOfOutcomes
        )
      })

      test("load multiple markets", async () => {
        const loadedMarkets = await Market.loadMultiple(client, [
          market,
          market,
        ])

        // TODO check all fields
        loadedMarkets.forEach((m) => {
          expect(m?.pubkey.toBase58()).toBe(market.toBase58())
        })
      })
    })

    describe("user market account", () => {
      test("create user market account", async () => {
        userMarket = (
          await UserMarket.derivePubkeyAndBump(keypair.publicKey, market, host)
        )[0]

        const sig = await UserMarket.createUserMarketAccount(
          client,
          marketObject,
          keypair,
          undefined,
          undefined,
          host
        )

        const confirmedTx = await client.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()

        expect(sig).toBeTruthy()
      })

      test("load user market account", async () => {
        const uma = await UserMarket.load(
          client,
          marketObject,
          keypair.publicKey,
          host
        )

        testUmaValues(uma)
      })

      test("load multiple user market accounts", async () => {
        const umas = await UserMarket.loadMultiple(
          client,
          [marketObject, marketObject],
          keypair.publicKey,
          host
        )

        umas.forEach((uma) => testUmaValues(uma))
      })

      test("load by uma", async () => {
        userMarketObject = await UserMarket.loadByUma(
          client,
          userMarket,
          marketObject
        )

        testUmaValues(userMarketObject)
      })
    })

    describe("deposit and withdraw", () => {
      const depositAmount = new BN(10000)
      test("deposit tokens correctly", async () => {
        const sig = await userMarketObject.depositTokens(keypair, depositAmount)
        const confirmedTx = await client.connection.confirmTransaction(sig)

        expect(confirmedTx.value.err).toBeFalsy()
      })

      test("update UMA then check balances", async () => {
        await userMarketObject.refresh()

        userMarketObject.outcomePositions.forEach((op) =>
          expect(op.free.toNumber()).toBe(depositAmount.toNumber())
        )
        expect(userMarketObject.calculateFundsAvailableToWithdraw()).toBe(
          depositAmount.toNumber()
        )
      })

      test("withdraw tokens correctly", async () => {
        const sig = await userMarketObject.withdrawIdleFunds(keypair)
        const confirmedTx = await client.connection.confirmTransaction(sig)

        expect(confirmedTx.value.err).toBeFalsy()
      })

      test("update UMA then check balances", async () => {
        await userMarketObject.refresh()

        userMarketObject.outcomePositions.forEach((op) =>
          expect(op.free.toNumber()).toBe(0)
        )
        expect(userMarketObject.calculateFundsAvailableToWithdraw()).toBe(0)
      })
    })

    describe("Place and cancel orders", () => {
      const outcomeNumber = 0
      const price = 0.123456
      const size = 100
      let tokenBalance
      let lamportBalance

      test("refresh user market", async () => {
        const userMarkets = (await UserMarket.refreshMultipleUserMarkets(
          client,
          [userMarketObject]
        )) as UserMarket[]

        userMarkets.forEach((uma) => testUmaValues(uma))
        userMarketObject = userMarkets[0]
        tokenBalance = userMarkets[0].tokenBalance
        lamportBalance = userMarkets[0].lamportBalance

        expect(userMarketObject.orders).toHaveLength(0)
        expect(lamportBalance).toBeGreaterThan(0)
        expect(tokenBalance).toBeGreaterThan(0)
      })

      test("place bid order successfully", async () => {
        const sig = await userMarketObject.placeOrder(
          keypair,
          outcomeNumber,
          Side.Bid,
          price,
          size,
          SizeFormat.Payout
        )
        const confirmedTx = await client.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test("refresh and check order", async () => {
        const userMarkets = (await UserMarket.refreshMultipleUserMarkets(
          client,
          [userMarketObject]
        )) as UserMarket[]
        userMarkets.forEach((uma) => testUmaValues(uma))
        userMarketObject = userMarkets[0]

        const bidL2 = userMarketObject.market.orderbooks?.[
          outcomeNumber
        ].getBidsL2(1, true)
        const roundedPrice = roundPriceToNearestTickSize(price)
        expect(userMarketObject.orders).toHaveLength(1)
        expect(bidL2).toHaveLength(1)
        expect(bidL2?.[0].price).toBe(roundedPrice)
        expect(Math.round(bidL2?.[0].size || 0)).toBe(size)
        expect(userMarketObject.lamportBalance).toBeLessThan(lamportBalance)
        expect(userMarketObject.tokenBalance).toBeLessThan(tokenBalance)
      })

      test("cancel order successfully", async () => {
        const sig = await userMarketObject.cancelOrder(
          keypair,
          userMarketObject.orders[0].orderId,
          outcomeNumber
        )

        const confirmedTx = await client.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test("refresh and check orderbook", async () => {
        const userMarkets = (await UserMarket.refreshMultipleUserMarkets(
          client,
          [userMarketObject]
        )) as UserMarket[]
        userMarketObject = userMarkets[0]

        const bidL2 = userMarketObject.market.orderbooks?.[
          outcomeNumber
        ].getBidsL2(1, true)
        expect(bidL2).toHaveLength(0)
        expect(userMarketObject.orders).toHaveLength(0)
      })
    })

    describe("place and cancel multiple orders", () => {
      // Can adjust prices below but ensure they are strictly ascending as in the example
      // Otherwise run the risk of it getting matched and failing the tests
      const bid1 = 0.03423 // first orderbook
      const bid2 = 0.244978 // second orderbook
      const ask2 = 0.529764 // first orderbook
      const ask1 = 0.899999 // second orderbook
      const size = 50

      test("place bid and ask on orderbook 0 and 1", async () => {
        const ix1 = await userMarketObject.makePlaceOrderInstruction(
          0,
          Side.Bid,
          bid1,
          size,
          SizeFormat.Payout
        )
        const ix2 = await userMarketObject.makePlaceOrderInstruction(
          1,
          Side.Bid,
          bid2,
          size,
          SizeFormat.Payout
        )
        const ix3 = await userMarketObject.makePlaceOrderInstruction(
          0,
          Side.Ask,
          ask1,
          size,
          SizeFormat.Payout
        )
        const ix4 = await userMarketObject.makePlaceOrderInstruction(
          1,
          Side.Ask,
          ask2,
          size,
          SizeFormat.Payout
        )

        const sig = await signAndSendTransactionInstructions(
          conn,
          [],
          keypair,
          [ix1, ix2, ix3, ix4]
        )
        const confirmedTx = await client.connection.confirmTransaction(sig)
        expect(confirmedTx.value.err).toBeFalsy()
      })

      test("refresh orderbooks", async () => {
        const userMarkets = (await UserMarket.refreshMultipleUserMarkets(
          client,
          [userMarketObject]
        )) as UserMarket[]
        userMarketObject = userMarkets[0]

        testUmaValues(userMarketObject)
      })

      test("check the first orderbook values for NON BINARY market", () => {
        if (marketObject.orderbooks?.length === 2) return

        expect(userMarketObject.orders).toHaveLength(4)

        const bidL2 = userMarketObject.market.orderbooks?.[0].getBidsL2(2, true)
        const roundedBidPrice = roundPriceToNearestTickSize(bid1)

        expect(bidL2).toHaveLength(1)
        expect(bidL2?.[0].price).toBe(roundedBidPrice)
        expect(Math.round(bidL2?.[0].size || 0)).toBe(size)

        const askL2 = userMarketObject.market.orderbooks?.[0].getAsksL2(2, true)
        const roundedAskPrice = roundPriceToNearestTickSize(ask1)

        expect(askL2).toHaveLength(1)
        expect(askL2?.[0].price).toBe(roundedAskPrice)
        expect(Math.round(askL2?.[0].size || 0)).toBe(size)
      })

      test("check the first orderbook values for BINARY market", () => {
        if (marketObject.orderbooks?.length != 2) return

        expect(userMarketObject.orders).toHaveLength(4)

        const expectedBid1 = roundPriceToNearestTickSize(bid1)
        const expectedBid2 = roundPriceToNearestTickSize(1 - ask2)
        const expectedAsk2 = roundPriceToNearestTickSize(1 - bid2)
        const expectedAsk1 = roundPriceToNearestTickSize(ask1)

        const bidL2 = userMarketObject.market.orderbooks?.[0].getBidsL2(2, true)
        const askL2 = userMarketObject.market.orderbooks?.[0].getAsksL2(2, true)

        expect(bidL2).toHaveLength(2)
        expect(askL2).toHaveLength(2)

        expect(bidL2?.[1].price).toBe(expectedBid1)
        expect(bidL2?.[0].price).toBe(expectedBid2)
        expect(askL2?.[0].price).toBe(expectedAsk2)
        expect(askL2?.[1].price).toBe(expectedAsk1)

        expect(Math.round(bidL2?.[0].size || 0)).toBe(size)
        expect(Math.round(askL2?.[0].size || 0)).toBe(size)
      })

      test("check the second orderbook values for NON BINARY markets", () => {
        if (marketObject.orderbooks?.length === 2) return

        expect(userMarketObject.orders).toHaveLength(4)

        const bidL2 = userMarketObject.market.orderbooks?.[1].getBidsL2(2, true)
        const roundedBidPrice = roundPriceToNearestTickSize(bid2)

        // binary markets have one orderbook
        const expectedBidL2Length = marketObject.numberOfOutcomes === 2 ? 2 : 1
        expect(bidL2).toHaveLength(expectedBidL2Length)
        expect(bidL2?.[0].price).toBe(roundedBidPrice)
        expect(Math.round(bidL2?.[0].size || 0)).toBe(size)

        const askL2 = userMarketObject.market.orderbooks?.[1].getAsksL2(2, true)
        const roundedAskPrice = roundPriceToNearestTickSize(ask2)

        expect(askL2).toHaveLength(1)
        expect(askL2?.[0].price).toBe(roundedAskPrice)
        expect(Math.round(askL2?.[0].size || 0)).toBe(size)
      })

      test("check the second orderbook values for BINARY market", () => {
        if (marketObject.orderbooks?.length != 2) return

        expect(userMarketObject.orders).toHaveLength(4)

        const factor = Math.pow(10, 6)
        const expectedBid1 =
          Math.round((1 - roundPriceToNearestTickSize(ask1)) * factor) / factor
        const expectedBid2 = roundPriceToNearestTickSize(bid2)
        const expectedAsk2 = roundPriceToNearestTickSize(ask2)
        const expectedAsk1 =
          Math.round((1 - roundPriceToNearestTickSize(bid1)) * factor) / factor

        const bidL2 = userMarketObject.market.orderbooks?.[1].getBidsL2(2, true)
        const askL2 = userMarketObject.market.orderbooks?.[1].getAsksL2(2, true)

        expect(bidL2).toHaveLength(2)
        expect(askL2).toHaveLength(2)

        expect(bidL2?.[1].price).toBe(expectedBid1)
        expect(bidL2?.[0].price).toBe(expectedBid2)
        expect(askL2?.[0].price).toBe(expectedAsk2)
        expect(askL2?.[1].price).toBe(expectedAsk1)

        expect(Math.round(bidL2?.[0].size || 0)).toBe(size)
        expect(Math.round(askL2?.[0].size || 0)).toBe(size)
      })

      test("cancel all orders", async () => {
        const sigs = await userMarketObject.cancelAllOrders(
          keypair,
          Array(marketObject.numberOfOutcomes)
            .fill(0)
            .map((_i, j) => j)
        )

        const confirmedTxs = await Promise.all(
          sigs.map((sig) => client.connection.confirmTransaction(sig))
        )
        confirmedTxs.forEach((confirmedTx) =>
          expect(confirmedTx.value.err).toBeFalsy()
        )
      })

      test("refresh and check orderbooks to make sure theyre empty", async () => {
        const userMarkets = (await UserMarket.refreshMultipleUserMarkets(
          client,
          [userMarketObject]
        )) as UserMarket[]
        userMarketObject = userMarkets[0]

        const bidsL2_1 = userMarketObject.market.orderbooks?.[0].getBidsL2(
          10,
          true
        )
        const bidsL2_2 = userMarketObject.market.orderbooks?.[1].getBidsL2(
          10,
          true
        )
        const asksL2_1 = userMarketObject.market.orderbooks?.[0].getAsksL2(
          10,
          true
        )
        const asksL2_2 = userMarketObject.market.orderbooks?.[1].getAsksL2(
          10,
          true
        )

        expect(bidsL2_1).toHaveLength(0)
        expect(bidsL2_2).toHaveLength(0)
        expect(asksL2_1).toHaveLength(0)
        expect(asksL2_2).toHaveLength(0)
      })
    })
  })
}
