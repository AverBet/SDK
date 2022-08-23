import { PublicKey, Keypair, Connection } from '@solana/web3.js'
import { base58_to_binary } from 'base58-js'
import { SolanaNetwork } from 'aver-ts/src/types'
import { getSolanaEndpoint } from 'aver-ts/src/ids'
import { AverClient } from 'aver-ts/src/aver-client'

jest.setTimeout(100000)

describe('run all tests', () => {
  // constants we can adjust
  const secondProgramId = new PublicKey('DfMQPAuAeECP7iSCwTKjbpzyx6X1HZT6rz872iYWA8St')
  const owner = Keypair.fromSecretKey(base58_to_binary('2S1DDiUZuqFNPHx2uzX9pphxynV1CgpLXnT9QrwPoWwXaGrqAP88XNEh9NK7JbFByJFDsER7PQgsNyacJyCGsH8S'))
  
  // values that will be set by the tests
  let client: AverClient

  test('successfully load the client', async () => {
    const network = SolanaNetwork.Devnet
    const solanaEndpoint = getSolanaEndpoint(network)
    const connection = new Connection(solanaEndpoint, "confirmed")
    client = await AverClient.load(connection, owner)
    console.log(`Successfully loaded client with owner: ${client.owner.publicKey.toBase58()}`)
  })
  
})