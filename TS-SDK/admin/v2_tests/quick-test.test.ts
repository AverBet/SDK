import { PublicKey, Keypair, Connection } from '@solana/web3.js'
import { base58_to_binary } from 'base58-js'
import { Side, SizeFormat, SolanaNetwork } from '../../public/src/types'
import { getSolanaEndpoint } from '../../public/src/ids'
import { AverClient } from '../../public/src/aver-client'
import { Market } from '../../public/src/market'
import { UserMarket } from '../../public/src/user-market'

jest.setTimeout(100000)

describe('run all tests', () => {
  // constants we can adjust
  const secondProgramId = new PublicKey('81aTPaDchxBxJSyZzw7TvVY3PcdAvrfTSQC58NpXtkTT')
  const owner = Keypair.fromSecretKey(base58_to_binary('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S'))
  
  // values that will be set by the tests
  let client: AverClient
  let market: Market
  let userMarket: UserMarket

  test('successfully load the client', async () => {
    const network = SolanaNetwork.Devnet
    const solanaEndpoint = getSolanaEndpoint(network)
    const connection = new Connection(solanaEndpoint, "confirmed")
    client = await AverClient.loadAverClient(connection, network, owner, undefined)
  })

  test('successfully get program, if not add a program', async () => {
    await client.getProgramFromProgramId(secondProgramId)
  })

  test('successfully load aver market', async () => {
    market = await Market.load(client, new PublicKey('BufZRp1YonHVR8ZYXheRqqhnL1sAXZpoiMcPNnposBth')) as Market
  })

  test('get or create UMA', async () => {
    userMarket = await UserMarket.getOrCreateUserMarketAccount(client, owner, market)
  })

  test('place order', async () => {
    await userMarket.placeOrder(owner, 0, Side.Bid, 0.6, 5, SizeFormat.Stake)
  })

  test('cancel all orders', async () => {
    await userMarket.cancelAllOrders(owner, [0])
  })
})