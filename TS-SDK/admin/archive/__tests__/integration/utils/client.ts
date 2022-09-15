import { Connection, Keypair } from '@solana/web3.js'
import { AverClient, SolanaNetwork, SOLANA_ENDPOINT_DEVNET } from 'aver-ts'

export const createAverClient = async (owner: Keypair) => {
  // create solana connection
  const conn = new Connection(SOLANA_ENDPOINT_DEVNET, { commitment: 'confirmed' })

  // create keypair
  const keypair = owner

  // create aver client
  const client = (await AverClient.loadAverClient(conn, SolanaNetwork.Devnet, owner)) as AverClient

  return client
}
