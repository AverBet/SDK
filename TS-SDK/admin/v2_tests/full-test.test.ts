import { PublicKey, Keypair, Connection } from "@solana/web3.js"
import { base58_to_binary } from "base58-js"
import {
  MarketStatus,
  Side,
  SizeFormat,
  SolanaNetwork,
} from "../../public/src/types"
import { getQuoteToken } from "../../public/src/ids"
import { AverClient } from "../../public/src/aver-client"
import { Market } from "../../public/src/market"
import { UserMarket } from "../../public/src/user-market"
import { BN } from "@project-serum/anchor"
import { createMarket, InitMarketArgs } from "../utils/create-market"
import { changeMarketStatusTx } from "../utils/change-market-status"
import { closeAaobTx } from "../utils/close-aaob"
import { manualResolveMarketTx } from "../utils/resolve-market"
import { UserHostLifetime } from "../../public/src/user-host-lifetime"
import { confirmTx } from "../utils/transactions"
import { getAverHostAccount } from "aver-ts"
import { derivePubkeyAndBump, createHostAccount } from '../../admin/utils/create-host'
import { closeOrdersOom } from '../../admin/utils/close-orders-oom'

jest.setTimeout(1000000)

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
  const programId = new PublicKey(
    "6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ"
  )

  // const programId = new PublicKey('81aTPaDchxBxJSyZzw7TvVY3PcdAvrfTSQC58NpXtkTT')
  const IS_TEST_PROGRAM = false
  
  // Account used to create the market
  const market_auth = Keypair.fromSecretKey(
    base58_to_binary(
      "5CtV5tUMmbMxsEoobfYYB9tXB9PMpoTvH2SmmqzeCUDXqQucNndVwBjYT7NVCjuvFhcEEYPnkEEtFqxedwoss1Gy"
    )
  )

  console.log('The market auth is=', market_auth.publicKey)

  // Accounts used to place bets...
  const owner = Keypair.fromSecretKey(
    base58_to_binary(
      "3onYh3TSCg92X3kD9gD7RCZF1N8JFVSDp39eSkRswsQb5YwWuyMnzuCN2wuPb52XEnPzjVrCtkYe5Xo8Czd3CDyV"
    )
  )

  const owner2 = Keypair.fromSecretKey(
    base58_to_binary(
      "hDDieEbL6opz2MNwU9r9aeXzRg5iMBgPVNdfsDDrZhyFrZSGeREbkD5DH4CAVQpqHNuGkDurqWt6vG5eQqmeRZg"
    )
  )

  console.log('Owner 1=', owner.publicKey)
  console.log('Owner 2=', owner2.publicKey)

  // values that will be set by the tests
  let marketClient: AverClient | undefined
  let ownerClient: AverClient | undefined
  let owner2Client: AverClient | undefined
  let marketPubkey: PublicKey
  let market: Market
  let userMarket: UserMarket | undefined
  let userMarket2: UserMarket | undefined
  let host: PublicKey

  test("load clients and check ATAs/Lamports", async () => {
    console.log('CHECKING ATA FOR MARKET AUTH')
    const network = SolanaNetwork.Devnet
    const solanaEndpoint = 'https://wispy-weathered-pine.solana-devnet.quiknode.pro/04c4c99f6016f213135b53eedefb53049ebe0b3f/'
    const connection = new Connection(solanaEndpoint, "confirmed")
    
    marketClient = await AverClient.loadAverClient(
      connection,
      network,
      market_auth,
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      },
      [programId]
    )
    const marketAta = await marketClient.getOrCreateTokenAta(market_auth, getQuoteToken(SolanaNetwork.Devnet), market_auth.publicKey)
    console.log('Got the market auth ATA', marketAta)
    console.log('Checking if there are lamports and quote tokens')
    // await marketClient.requestLamportAirdrop()
    // await marketClient.requestTokenAirdrop()

    ownerClient = await AverClient.loadAverClient(
      connection,
      network,
      owner,
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      },
      [programId]
    )
    const ownerAta = await ownerClient.getOrCreateTokenAta(owner, getQuoteToken(SolanaNetwork.Devnet), owner.publicKey)
    console.log('Got the owner ATA', ownerAta)
    // await ownerClient.requestLamportAirdrop()
    // await ownerClient.requestTokenAirdrop()

    owner2Client = await AverClient.loadAverClient(
      connection,
      network,
      owner2,
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      },
      [programId]
    )
    const owner2Ata = await owner2Client.getOrCreateTokenAta(owner2, getQuoteToken(SolanaNetwork.Devnet), owner2.publicKey)
    console.log('Got the owner 2 ATA', owner2Ata)
  })

  test("test aver client", async () => {
    console.log("-".repeat(10))
    console.log("TESTING AVER CLIENT")
    if (!marketClient) return 

    await marketClient.getProgramFromProgramId(programId)
    const system_clock = await marketClient.getSystemClockDatetime()
    console.log("System clock time: ", system_clock)
    const lamport_balance = await marketClient.requestLamportBalance(marketClient.owner)
    console.log("Lamport balance: ", lamport_balance)
    const ata = await marketClient.getOrCreateTokenAta(market_auth, getQuoteToken(SolanaNetwork.Devnet), market_auth.publicKey)
    console.log('Got the ATA', ata)
    const token_balance = await marketClient.requestTokenBalance(getQuoteToken(SolanaNetwork.Devnet), market_auth.publicKey)
    console.log("Token balance: ", token_balance)
    console.log("-".repeat(10))
  })

  test("get or create the host", async () => {
    if (!marketClient) {
      console.error('Issue with the client when testing the host account', marketClient)
      return
    }

    host = IS_TEST_PROGRAM ? derivePubkeyAndBump(market_auth.publicKey, programId)[0]: getAverHostAccount(SolanaNetwork.Devnet)
 
    const program = await marketClient.getProgramFromProgramId(programId)
    if (!program) return

    const hostResult = await program.account["host"].fetchNullable(
      host
    )

    if (!hostResult) {
      await createHostAccount(marketClient, owner, owner, host, undefined, 0, programId)
    }
  })

  test("load a market that does not exist", async () => {
    if (!marketClient) return 

    const fakeMarket = await Market.load(marketClient, new Keypair().publicKey)
    expect(fakeMarket).toBeNull()
  })

  test("create aver market", async () => {
    if (!marketClient) return 

    console.log("-".repeat(10))
    console.log("CREATING AVER MARKET")
    marketPubkey = (
      await createMarket(numberOfOutcomes, marketClient, market_auth, args, programId)
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
    status: MarketStatus
  ) {
    if (!marketClient) return 
    await market.refresh()
    checkMarketIsAsExpected(market, status)
    const market2 = await Market.load(marketClient, market.pubkey)
    expect(market2).toBeTruthy()
    //@ts-ignore
    checkMarketIsAsExpected(market2, status)
  }

  function checkUMAState(uma: UserMarket, market: Market, umaOwner: PublicKey) {
    expect(uma.market.pubkey.toBase58()).toBe(market.pubkey.toBase58())
    expect(uma.user.toBase58()).toBe(umaOwner.toBase58())
    expect(uma.tokenBalanceUi).toBeGreaterThan(10) //Make sure trades can be placed
    expect(uma.lamportBalanceUi).toBeGreaterThan(0.01) //Make sure trades can be placed
  }

  function checkUHLState(uhl: UserHostLifetime, uhlOwner: Keypair) {
    expect(uhl.host.toBase58()).toBe(host.toBase58())
    expect(uhl.isSelfExcluded).toBeFalsy()
    expect(uhl.user.toBase58()).toBe(uhlOwner.publicKey.toBase58())
  }

  test("successfully load and test aver market", async () => {
    console.log("-".repeat(10))
    if (!marketClient) return 

    market = (await Market.load(marketClient, marketPubkey)) as Market
    checkMarketIsAsExpected(market)
    market = market
    console.log("-".repeat(10))
  })

  test("UMA / UHL tests", async () => {
    if (!ownerClient) {
      console.error('Issue with owner client', ownerClient)
      return
    }

    //@ts-ignore
    userMarket = await UserMarket.getOrCreateUserMarketAccount(
      ownerClient,
      owner,
      market,
      undefined,
      getQuoteToken(SolanaNetwork.Devnet),
      host
    )
    console.log('Got UMA 1', userMarket)
    if (userMarket == null) {
      console.error('---- Issue with UMA 1 ----', userMarket)
      return
    }

    // console.log('Airdropping tokens...')
    // const airdropTokens = await ownerClient.requestTokenAirdrop(1_000_000_000, getQuoteToken(SolanaNetwork.Devnet), owner.publicKey)
    // console.log('Airdropped tokens...', airdropTokens)

    // console.log('Airdropping sol...')
    // const airdropSol = await ownerClient.requestLamportAirdrop(LAMPORTS_PER_SOL, owner.publicKey)
    // console.log('Airdropped tokens...', airdropSol)

    await userMarket.refresh()

    expect(userMarket.orders.length).toBe(0)
    expect(userMarket.market.orderbooks?.length).toBe(numberOfOutcomes)

    checkUHLState(userMarket.userHostLifetime, owner)
    checkUMAState(userMarket, market, owner.publicKey)
  })

  test("update the UHL Display name and NFT PFP", async () => {
    const UPDATED_DISPLAY_NAME: string = 'Aver Username'
    const NFT_PUBKEY: PublicKey = new PublicKey('BqSFP5CbfBfZeQqGbzYEipfzTDptTYHFL9AzZA8TBXjn')

    if (!userMarket || !ownerClient) {
      console.error('Issue with the user market', userMarket, ownerClient)
      return 
    }

    const uhl = userMarket.userHostLifetime
    const sig = await uhl.updateNftPfpDisplayName(owner, UPDATED_DISPLAY_NAME, NFT_PUBKEY)
    confirmTx(sig, ownerClient.connection, 25000)
    await userMarket.refresh()
    const uhlUpdated = await UserHostLifetime.getOrCreateUserHostLifetime(ownerClient, owner, undefined, getQuoteToken(SolanaNetwork.Devnet), host, undefined, programId)

    expect(uhlUpdated.displayName).toBeDefined()
    expect(uhlUpdated.displayName).toEqual(UPDATED_DISPLAY_NAME)
    expect(uhlUpdated.nftPfp).toBeDefined()
    expect(uhlUpdated.nftPfp?.toString()).toEqual(NFT_PUBKEY.toString())
  })

  test("place and cancel orders; orderbook checks", async () => {
    if (!userMarket || !ownerClient) {
      console.error(`Issue with the userMarket=${userMarket} or ownerClient=${ownerClient}`)
      return
    }

    console.log('Placing first order')
    await placeOrder(userMarket, owner)
    console.log('Placed first order', userMarket.orders.length)
    expect(userMarket.orders.length).toBe(1)
    //@ts-ignore
    let bids_l2 = userMarket.market.orderbooks[0].getBidsL2(10, true)
    expect(bids_l2[0].price).toBeCloseTo(0.6)
    expect(bids_l2[0].size).toBeCloseTo(5)
    //@ts-ignore
    const bids_l3 = userMarket.market.orderbooks[0].getBidsL3(10, true)
    expect(bids_l3[0].price_ui).toBeCloseTo(0.6)
    expect(bids_l3[0].base_quantity_ui).toBeCloseTo(5)
    checkUHLState(userMarket.userHostLifetime, owner) //Check if accounts still correct after refresh
    checkUMAState(userMarket, market, owner.publicKey)

    console.log('Cancel first order')
    await cancelOrder(userMarket, owner, ownerClient)
    expect(userMarket.orders.length).toBe(0)

    console.log('Place 2 more orders')
    await placeOrder(userMarket, owner)
    await placeOrder(userMarket, owner)
    expect(userMarket.orders.length).toBe(2)

    console.log('Cancelling all orders')
    await cancelAllOrders(userMarket, ownerClient, owner)
    expect(userMarket.orders.length).toBe(0)

    console.log('Finished with the orders')
  })

  test("market crank and matching", async () => {
    if (!owner2Client) {
      console.error('Issue with owner 2 client', owner2Client)
      return
    }

    //Create 2nd UMA
    userMarket2 = await UserMarket.getOrCreateUserMarketAccount(
      owner2Client,
      owner2,
      market,
      undefined,
      getQuoteToken(SolanaNetwork.Devnet),
      host
    )

    if (!userMarket || !userMarket2) {
      console.error(`Issue with UMA 1=${userMarket}, or UMA 2=${userMarket2}`)
      return
    }

    // console.log('Airdropping tokens...')
    // const airdropTokens = await owner2Client.requestTokenAirdrop(1_000_000_000, getQuoteToken(SolanaNetwork.Devnet), owner2.publicKey)
    // console.log('Airdropped tokens...', airdropTokens)

    // console.log('Airdropping sol...')
    // const airdropSol = await owner2Client.requestLamportAirdrop(LAMPORTS_PER_SOL, owner2.publicKey)
    // console.log('Airdropped tokens...', airdropSol)

    await userMarket2.refresh()

    console.log('Got UMA 2', userMarket2, owner2.publicKey)
    //@ts-ignore
    checkUMAState(userMarket2, market, owner2.publicKey)

    console.log('Place order 1')
    await placeOrder(userMarket, owner)
    console.log('Place order 2')
    await placeOrder(userMarket2, owner2, false)
    console.log('Cranking the market')
    const sig = await market.crankMarket(market_auth, [0, 1])

    await confirmTx(sig, owner2Client.connection, 15000)

    await userMarket.refresh()
    await userMarket2.refresh()

    console.log('Refreshed the umas')
    console.log(userMarket)
    console.log(userMarket2)

    expect(userMarket.orders.length).toBe(0)
    expect(userMarket2.orders.length).toBe(0)
    expect(userMarket.market.volumeMatched).toBeCloseTo(3 * 10 ** 6, -1)
  })

  test("Place more orders so they can be cancelled", async () => {
    if (!userMarket || !ownerClient) {
      console.error('Issue with the UMA', userMarket, ownerClient)
      return 
    }

    console.log('Place order 1')
    await placeOrder(userMarket, owner)

    console.log('Place order 2')
    await placeOrder(userMarket, owner)
  })

  test("resolve market and check it loads correctly", async () => {
    if (!marketClient) return 

    const program = await marketClient.getProgramFromProgramId(market.programId)
    
    console.log('Change the market status')
    let sig = await changeMarketStatusTx(
      program,
      market,
      market_auth,
      MarketStatus.TradingCeased
    )
    await confirmTx(sig, marketClient.connection, 20000)
    console.log('Trading ceased for the market')
    await checkMarketLoadsCorrectlyAfterOrderbooksClosed(
      market,
      MarketStatus.TradingCeased
    )
    console.log('Close the orderbooks...')
    sig = await closeAaobTx(
      program,
      market,
      market_auth,
      //@ts-ignore
      numberOfOutcomes == 2 ? [0] : Array.from(Array(numberOfOutcomes).keys())
    )
    await confirmTx(sig, marketClient.connection, 20000)
    console.log('6')
    await checkMarketLoadsCorrectlyAfterOrderbooksClosed(market, MarketStatus.CeasedCrankedClosed) //Seems to be an error with the MarketStatus naming
    console.log('7')
    sig = await manualResolveMarketTx(program, market, market_auth, 1)
    console.log('8')
    await confirmTx(sig, marketClient.connection, 20000)
    console.log('9')
    await checkMarketLoadsCorrectlyAfterOrderbooksClosed(market, MarketStatus.Resolved) //Seems to be an error with the MarketStatus naming
  })

  test("Cancel all order", async () => {
    if (!userMarket || !ownerClient) {
      console.error('Issue with the UMA', userMarket, ownerClient)
      return 
    }

    const sig = await closeOrdersOom(ownerClient, owner, userMarket.pubkey, userMarket.market.pubkey, host, programId)
    
    confirmTx(sig, ownerClient.connection, 50000)
    userMarket = await UserMarket.getOrCreateUserMarketAccount(ownerClient, owner, market, undefined, getQuoteToken(SolanaNetwork.Devnet), host, undefined, undefined)

    if (!userMarket) return
    
    console.log('Cancel orders OOM', sig, userMarket.orders.length)
    
    expect(userMarket.orders.length).toEqual(0)
  })

  async function placeOrder(uma: UserMarket, umaOwner: Keypair, bids: boolean = true) {
    let sig = ""
    if (bids) {
      sig = await uma.placeOrder(umaOwner, 0, Side.Bid, 0.6, 5, SizeFormat.Payout)
    } else {
      sig = await uma.placeOrder(umaOwner, 0, Side.Ask, 0.4, 5, SizeFormat.Payout)
    }
    if (!ownerClient) return 

    await confirmTx(sig, ownerClient.connection, 25000)
    await uma.refresh()
  }

  async function cancelOrder(uma: UserMarket, umaOwner: Keypair, umaClient: AverClient) {
    const sig = await uma.cancelOrder(
      umaOwner,
      uma.orders[0].orderId,
      uma.orders[0].outcomeId
    )
    if (!umaClient) return 

    await confirmTx(sig, umaClient.connection, 25000)

    await uma.refresh()
  }

  async function cancelAllOrders(uma: UserMarket, umaClient: AverClient, umaOwner: Keypair) {
    if (umaClient == undefined) return 

    const sigs = await uma.cancelAllOrders(umaOwner, [0])

    await Promise.all(
      sigs.map((sig) => confirmTx(sig, umaClient?.connection, 10000))
    )
    await uma.refresh()
  }
})
