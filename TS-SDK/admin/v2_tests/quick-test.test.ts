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
  let client: AverClient | undefined
  let market: Market
  let userMarket: UserMarket | undefined

  test('successfully load the client', async () => {
    const network = SolanaNetwork.Devnet
    const solanaEndpoint = getSolanaEndpoint(network)
    const connection = new Connection(solanaEndpoint, "confirmed")
    
    client = await AverClient.loadAverClient(connection, network, owner, undefined)
  })

  test('successfully get program, if not add a program', async () => {
    if (client) {
      await client.getProgramFromProgramId(secondProgramId)
    }
  })

  test('successfully load aver market', async () => {
    if (client) {
      market = await Market.load(client, new PublicKey('BufZRp1YonHVR8ZYXheRqqhnL1sAXZpoiMcPNnposBth')) as Market
    }
  })

  test('get or create UMA', async () => {
    if (client) {
      userMarket = await UserMarket.getOrCreateUserMarketAccount(client, owner, market)
    }

    console.log('Got the UMA!! -> ', userMarket)
  })

//   test('place order', async () => {
//     if (userMarket) {
//       await userMarket.placeOrder(owner, 0, Side.Bid, 0.6, 5, SizeFormat.Stake)
//     } else {
//       console.log('The UMA is NULL!!', userMarket)
//     }
//   })

//   test('cancel all orders', async () => {
//     if (userMarket) {
//       await userMarket.cancelAllOrders(owner, [0])
//     } else {
//       console.log('The UMA is NULL!!', userMarket)
//     }
//   })
})