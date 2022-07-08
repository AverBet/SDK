import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { AverClient, signAndSendTransactionInstructions } from 'aver-ts'
import { AxiosResponse } from 'axios'
import { createAverClient } from './client'

export const getAverClientSetupTests = (owner: Keypair) => {
  describe('aver client setup tests', () => {
    let client: AverClient
    let keypair: Keypair
    let conn: Connection

    beforeAll(async () => {
      client = (await createAverClient(owner)) as AverClient
      keypair = owner
      conn = client.connection
    })

    test('test aver client', async () => {
      expect(client.owner.toBase58()).toBe(keypair.publicKey.toBase58())
      expect(client.program).toBeTruthy()
    })

    describe('health checks', () => {
      test('Health check is successful', async () => {
        const healthCheckResult = await client.checkHealth()
        expect(healthCheckResult.api).toBe(true)
        expect(healthCheckResult.solana).toBe(true)
      })
    })

    test('successfully airdrop Sol', async () => {
      const sig = await conn.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL * 2)
      await client.connection.confirmTransaction(sig)
      const balance = await conn.getBalance(keypair.publicKey)
      expect(balance).toBe(LAMPORTS_PER_SOL * 2)
    })

    test('successfully airdrop USDC', async () => {
      // create ATA and wait for confirmation
      const ix = await client.createTokenAtaInstruction()
      const sig = await signAndSendTransactionInstructions(client.connection, [], keypair, [ix])
      const confirmedTx1 = await client.connection.confirmTransaction(sig)
      expect(confirmedTx1.value.err).toBeFalsy()

      const { signature } = ((await client.requestTokenAirdrop()) as AxiosResponse).data
      const confirmedTx2 = await client.connection.confirmTransaction(signature)
      expect(confirmedTx2.value.err).toBeFalsy()
      const newBalance = parseInt((await client.requestTokenBalance()).amount)

      expect(newBalance).toBe(1000 * Math.pow(10, 6))
    })
  })
}
