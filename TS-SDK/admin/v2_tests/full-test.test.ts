import { PublicKey, Keypair, Connection } from "@solana/web3.js"
import { base58_to_binary } from "base58-js"
import {
  MarketStatus,
  Side,
  SizeFormat,
  SolanaNetwork,
} from "../../public/src/types"
import { getSolanaEndpoint } from "../../public/src/ids"
import { AverClient } from "../../public/src/aver-client"
import { Market } from "../../public/src/market"
import { UserMarket } from "../../public/src/user-market"
import { BN } from "@project-serum/anchor"
import { createMarket, InitMarketArgs } from "../utils/create-market"

jest.setTimeout(100000)

const args: InitMarketArgs = {
  numberOfOutcomes: 0,
  numberOfWinners: 1,
  vaultBump: 0,
  marketStoreBump: 0,
  permissionedMarketFlag: false,
  minOrderbookBaseSize: new BN(1),
  minNewOrderBaseSize: new BN(1),
  minNewOrderQuoteSize: new BN(1),
  maxQuoteTokensIn: new BN(100000000000000),
  maxQuoteTokensInPermissionCapped: new BN(100000000000000),
  crankerReward: new BN(0),
  feeTierCollectionBpsRates: [
    new BN(20),
    new BN(18),
    new BN(16),
    new BN(14),
    new BN(12),
    new BN(10),
    new BN(0),
  ],
  marketName: "Test market",
  goingInPlayFlag: true,
  activeImmediately: true,
  tradingCeaseTime: new BN(1682447605),
  inplayStartTime: new BN(1682447605),
}

describe("run all tests", () => {
  // constants we can adjust
  const firstProgramId = new PublicKey(
    "81aTPaDchxBxJSyZzw7TvVY3PcdAvrfTSQC58NpXtkTT"
  )

  const secondProgramId = new PublicKey(
    "81aTPaDchxBxJSyZzw7TvVY3PcdAvrfTSQC58NpXtkTT"
  )
  const owner = Keypair.fromSecretKey(
    base58_to_binary(
      "2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S"
    )
  )

  // values that will be set by the tests
  let client: AverClient
  let marketPubkey: PublicKey
  let market: Market
  let userMarket: UserMarket

  test("successfully load the client", async () => {
    const network = SolanaNetwork.Devnet
    const solanaEndpoint = getSolanaEndpoint(network)
    const connection = new Connection(solanaEndpoint, "confirmed")
    client = await AverClient.loadAverClient(
      connection,
      network,
      owner,
      undefined,
      []
    )
  })

  test("test aver client", async () => {
    console.log("-".repeat(10))
    console.log("TESTING AVER CLIENT")
    await client.getProgramFromProgramId(secondProgramId)
    const system_clock = await client.getSystemClockDatetime()
    console.log("System clock time: ", system_clock)
    const lamport_balance = await client.requestLamportBalance(client.owner)
    console.log("Lamport balance: ", lamport_balance)
    const token_balance = await client.requestTokenBalance()
    console.log("Token balance: ", token_balance)
    console.log("-".repeat(10))
  })

  test("create aver market", async () => {
    console.log("-".repeat(10))
    console.log("CREATING AVER MARKET")
    marketPubkey = (await createMarket(2, client, owner, args)).publicKey
    console.log("-".repeat(10))
  })

  function checkMarketIsAsExpected(market: Market) {
    console.log("TESTING MARKET CREATED AND LOADED CORRECTLY")
    expect(args.crankerReward).toBe(market.crankerReward)
    expect(args.goingInPlayFlag).toBe(market.goingInPlayFlag)
    expect(market.marketStatus).toBe(MarketStatus.ActivePreEvent)
    expect(args.maxQuoteTokensIn).toBe(market.maxQuoteTokensIn)
    expect(args.permissionedMarketFlag).toBe(market.permissionedMarketFlag)
  }

  test("successfully load and test aver market", async () => {
    console.log("-".repeat(10))
    market = (await Market.load(client, marketPubkey)) as Market
    checkMarketIsAsExpected(market)
    console.log("-".repeat(10))
  })

  test("get or create UMA", async () => {
    userMarket = await UserMarket.getOrCreateUserMarketAccount(
      client,
      owner,
      market
    )
  })

  test("place order", async () => {
    await userMarket.placeOrder(owner, 0, Side.Bid, 0.6, 5, SizeFormat.Stake)
  })

  test("cancel all orders", async () => {
    await userMarket.cancelAllOrders(owner, [0])
  })
})