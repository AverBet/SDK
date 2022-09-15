import { PublicKey, Keypair, Connection } from "@solana/web3.js"
import { base58_to_binary } from "base58-js"
import {
  MarketStatus,
  Side,
  SizeFormat,
  SolanaNetwork,
} from "../../public/src/types"
import { getQuoteToken, getSolanaEndpoint } from "../../public/src/ids"
import { AverClient } from "../../public/src/aver-client"
import { Market } from "../../public/src/market"
import { UserMarket } from "../../public/src/user-market"
import { BN } from "@project-serum/anchor"
import { createMarket, InitMarketArgs } from "../utils/create-market"
import { changeMarketStatusTx } from "../utils/change-market-status"
import { closeAaobTx } from "../utils/close-aaob"
import { manualResolveMarketTx } from "../utils/resolve-market"
import { UserHostLifetime } from "../../public/src/user-host-lifetime"

jest.setTimeout(100000)

//Change this to change test
const numberOfOutcomes = 3

const args: InitMarketArgs = {
  numberOfOutcomes: 0,
  numberOfWinners: 1,
  vaultBump: 0,
  permissionedMarketFlag: false,
  minOrderbookBaseSize: new BN(1_000_000),
  minNewOrderBaseSize: new BN(1_000_000),
  minNewOrderQuoteSize: new BN(1_000_000),
  maxQuoteTokensIn: new BN(100000000000000),
  maxQuoteTokensInPermissionCapped: new BN(100000000000000),
  crankerReward: new BN(5000),
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
  goingInPlayFlag: false,
  activeImmediately: true,
  tradingCeaseTime: new BN(1682447605),
  inPlayStartTime: null,
  roundingFormat: 0,
  series: 0,
  category: 0,
  subCategory: 0,
  event: 0,
  maxInPlayCrankOrders: null,
  inPlayDelaySeconds: null,
}

describe("run all tests", () => {
  // constants we can adjust
  const firstProgramId = new PublicKey(
    "DfMQPAuAeECP7iSCwTKjbpzyx6X1HZT6rz872iYWA8St"
  )

  const secondProgramId = new PublicKey(
    "6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ"
  )
  const owner = Keypair.fromSecretKey(
    base58_to_binary(
      "2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S"
    )
  )
  const owner2 = Keypair.fromSecretKey(
    base58_to_binary(
      "3onYh3TSCg92X3kD9gD7RCZF1N8JFVSDp39eSkRswsQb5YwWuyMnzuCN2wuPb52XEnPzjVrCtkYe5Xo8Czd3CDyV"
    )
  )

  const umas: UserMarket[] = []

  // values that will be set by the tests
  let client: AverClient
  let marketPubkey: PublicKey
  let market: Market
  let userMarket: UserMarket
  let host: PublicKey

  test("successfully load the client", async () => {
    const network = SolanaNetwork.Devnet
    const solanaEndpoint = getSolanaEndpoint(network)
    const connection = new Connection(solanaEndpoint, "confirmed")
    client = await AverClient.loadAverClient(
      connection,
      network,
      owner,
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      },
      [secondProgramId, firstProgramId]
    )
    host = (
      await PublicKey.findProgramAddress(
        [Buffer.from("host", "utf-8"), owner.publicKey.toBuffer()],
        firstProgramId
      )
    )[0]
  })

  test("test aver client", async () => {
    console.log("-".repeat(10))
    console.log("TESTING AVER CLIENT")
    await client.getProgramFromProgramId(secondProgramId)
    const system_clock = await client.getSystemClockDatetime()
    console.log("System clock time: ", system_clock)
    const lamport_balance = await client.requestLamportBalance(client.owner)
    console.log("Lamport balance: ", lamport_balance)
    const token_balance = await client.requestTokenBalance(
      getQuoteToken(SolanaNetwork.Devnet),
      owner.publicKey
    )
    console.log("Token balance: ", token_balance)
    console.log("-".repeat(10))
  })

  test("load a market that does not exist", async () => {
    const fakeMarket = await Market.load(client, new Keypair().publicKey)
    expect(fakeMarket).toBeNull()
  })

  test("create aver market", async () => {
    console.log("-".repeat(10))
    console.log("CREATING AVER MARKET")
    marketPubkey = (
      await createMarket(numberOfOutcomes, client, owner, args, firstProgramId)
    ).publicKey
    console.log("-".repeat(10))
  })

  function checkMarketIsAsExpected(
    market: Market,
    status: MarketStatus = MarketStatus.ActivePreEvent
  ) {
    console.log("TESTING MARKET CREATED AND LOADED CORRECTLY")
    expect(args.crankerReward.toString()).toBe(market.crankerReward.toString())
    expect(args.goingInPlayFlag).toBe(market.goingInPlayFlag)
    expect(market.marketStatus).toBe(status)
    expect(args.maxQuoteTokensIn.toString()).toBe(
      market.maxQuoteTokensIn.toString()
    )
    expect(args.permissionedMarketFlag).toBe(market.permissionedMarketFlag)
    expect(args.marketName).toBe(market.name)
    args.feeTierCollectionBpsRates.map((value, i) => {
      expect(value.toString()).toBe(
        market.feeTierCollectionBpsRates[i].toString()
      )
    })
    if (
      status != MarketStatus.Resolved &&
      status != MarketStatus.Voided &&
      status != MarketStatus.CeasedCrankedClosed
    ) {
      expect(args.numberOfOutcomes).toBe(market.orderbooks?.length)
    }
  }

  async function checkMarketLoadsCorrectlyAfterOrderbooksClosed(
    market: Market,
    uma: UserMarket,
    status: MarketStatus
  ) {
    await market.refresh()
    checkMarketIsAsExpected(market, status)
    const market2 = await Market.load(client, market.pubkey)
    expect(market2).toBeTruthy()
    //@ts-ignore
    checkMarketIsAsExpected(market2, status)

    await uma.refresh()
    checkUMAState(uma, market, owner.publicKey)
    checkUHLState(uma.userHostLifetime)
  }

  function checkUMAState(uma: UserMarket, market: Market, owner: PublicKey) {
    expect(uma.market.pubkey.toBase58()).toBe(market.pubkey.toBase58())
    expect(uma.user.toBase58()).toBe(owner.toBase58())
    expect(uma.tokenBalanceUi).toBeGreaterThan(10) //Make sure trades can be placed
    expect(uma.lamportBalanceUi).toBeGreaterThan(0.01) //Make sure trades can be placed
  }

  function checkUHLState(uhl: UserHostLifetime) {
    expect(uhl.host.toBase58()).toBe(host.toBase58())
    expect(uhl.isSelfExcluded).toBeFalsy()
    expect(uhl.user.toBase58()).toBe(owner.publicKey.toBase58())
  }

  test("successfully load and test aver market", async () => {
    console.log("-".repeat(10))
    market = (await Market.load(client, marketPubkey)) as Market
    checkMarketIsAsExpected(market)
    market = market
    console.log("-".repeat(10))
  })

  test("UMA / UHL tests", async () => {
    //@ts-ignore
    userMarket = await UserMarket.getOrCreateUserMarketAccount(
      client,
      owner,
      market,
      undefined,
      undefined,
      host
    )
    umas.push(userMarket)

    const uma = umas[0]
    expect(uma.orders.length).toBe(0)
    expect(uma.market.orderbooks?.length).toBe(numberOfOutcomes)
    checkUHLState(uma.userHostLifetime)
    checkUMAState(uma, market, owner.publicKey)
  })

  test("place and cancel orders; orderbook checks", async () => {
    const uma = umas[0]

    await placeOrder(uma)
    expect(uma.orders.length).toBe(1)
    //@ts-ignore
    let bids_l2 = uma.market.orderbooks[0].getBidsL2(10, true)
    expect(bids_l2[0].price).toBeCloseTo(0.6)
    expect(bids_l2[0].size).toBeCloseTo(5)
    //@ts-ignore
    const bids_l3 = uma.market.orderbooks[0].getBidsL3(10, true)
    expect(bids_l3[0].price_ui).toBeCloseTo(0.6)
    expect(bids_l3[0].base_quantity_ui).toBeCloseTo(5)
    checkUHLState(uma.userHostLifetime) //Check if accounts still correct after refresh
    checkUMAState(uma, market, owner.publicKey)

    await cancelOrder(uma)
    expect(uma.orders.length).toBe(0)
    await placeOrder(uma)
    await placeOrder(uma)
    expect(uma.orders.length).toBe(2)
    await cancelAllOrders(uma)
    expect(uma.orders.length).toBe(0)
  })

  test("market crank and matching", async () => {
    //Create 2nd UMA
    const userMarket2 = await UserMarket.getOrCreateUserMarketAccount(
      client,
      owner2,
      market,
      undefined,
      undefined,
      host
    )
    //@ts-ignore
    umas.push(userMarket2)
    const uma1 = umas[0]
    const uma2 = umas[1]
    checkUMAState(uma2, market, owner2.publicKey)
    await placeOrder(uma1)
    await placeOrder(uma2, false)
    const sig = await market.crankMarket(owner, [0, 1])
    await client.connection.confirmTransaction(sig, "confirmed")
    await uma1.refresh()
    await uma2.refresh()
    expect(uma1.orders.length).toBe(0)
    expect(uma2.orders.length).toBe(0)
    expect(uma1.market.volumeMatched).toBeCloseTo(3 * 10 ** 6, -1)
  })

  test("resolve market and check it loads correctly", async () => {
    const program = await client.getProgramFromProgramId(market.programId)
    const uma = umas[0]
    let sig = await changeMarketStatusTx(
      program,
      market,
      owner,
      MarketStatus.TradingCeased
    )
    await client.connection.confirmTransaction(sig, "confirmed")
    await checkMarketLoadsCorrectlyAfterOrderbooksClosed(
      market,
      uma,
      MarketStatus.TradingCeased
    )

    sig = await closeAaobTx(
      program,
      market,
      owner,
      //@ts-ignore
      numberOfOutcomes == 2 ? [0] : Array.from(Array(numberOfOutcomes).keys())
    )
    await client.connection.confirmTransaction(sig, "confirmed")
    await checkMarketLoadsCorrectlyAfterOrderbooksClosed(market, uma, 8) //Seems to be an error with the MarketStatus naming

    sig = await manualResolveMarketTx(program, market, owner, 1)
    await client.connection.confirmTransaction(sig, "confirmed")
    await checkMarketLoadsCorrectlyAfterOrderbooksClosed(market, uma, 9) //Seems to be an error with the MarketStatus naming
  })

  async function placeOrder(uma: UserMarket, bids: boolean = true) {
    let sig = ""
    if (bids) {
      sig = await uma.placeOrder(owner, 0, Side.Bid, 0.6, 5, SizeFormat.Payout)
    } else {
      sig = await uma.placeOrder(owner2, 0, Side.Ask, 0.4, 5, SizeFormat.Payout)
    }
    await client.connection.confirmTransaction(sig, "confirmed")
    await uma.refresh()
  }

  async function cancelOrder(uma: UserMarket) {
    const sig = await uma.cancelOrder(
      owner,
      uma.orders[0].orderId,
      uma.orders[0].outcomeId
    )
    await client.connection.confirmTransaction(sig, "confirmed")
    await uma.refresh()
  }

  async function cancelAllOrders(uma: UserMarket) {
    const sigs = await uma.cancelAllOrders(owner, [0])
    await Promise.all(
      sigs.map((sig) => client.connection.confirmTransaction(sig, "confirmed"))
    )
    await uma.refresh()
  }
})
