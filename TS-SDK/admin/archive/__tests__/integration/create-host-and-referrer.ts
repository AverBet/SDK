import { Keypair, PublicKey, Connection } from '@solana/web3.js'
import { AverClient, Host, Referrer } from 'aver-ts'
import BN from 'bn.js'
import { createAverClient } from './utils/client'

export const getCreateHostAndReferrerTests = (owner: Keypair) => {
  let client: AverClient
  let keypair: Keypair
  let conn: Connection

  // pubkeys
  let host: PublicKey
  let referrer: PublicKey

  const MINUTE = 1000 * 60
  const referrerFees = 1000

  beforeAll(async () => {
    client = (await createAverClient(owner)) as AverClient
    keypair = owner
    conn = client.connection

    host = (await Host.derivePubkeyAndBump(keypair.publicKey))[0]
    referrer = (await Referrer.derivePubkeyAndBump(keypair.publicKey, host))[0]
  })

  describe('host account', () => {
    test('create host account', async () => {
      const sig = await Host.createHostAccount(client, keypair, keypair, new BN(referrerFees))
      const confirmedTx = await client.connection.confirmTransaction(sig)
      expect(confirmedTx.value.err).toBeFalsy()
      expect(sig).toBeTruthy()
    })

    test('load host account', async () => {
      const loadedHost = await Host.load(client, host)

      // TODO check all fields
      expect(loadedHost.creationDate.getTime()).toBeLessThan(new Date().getTime() + MINUTE)
      expect(loadedHost.creationDate.getTime()).toBeGreaterThan(new Date().getTime() - MINUTE)
      expect(loadedHost.owner.toBase58()).toBe(keypair.publicKey.toBase58())
      expect(loadedHost.pubkey.toBase58()).toBe(host.toBase58())
      expect(loadedHost.referrerFeeRateOfferedBps.toNumber()).toBe(1000)
    })
  })

  describe('referrer account', () => {
    test('create referrer account', async () => {
      const sig = await Referrer.createReferrerAccount(client, host, keypair, keypair)
      const confirmedTx = await client.connection.confirmTransaction(sig)
      expect(confirmedTx.value.err).toBeFalsy()

      expect(sig).toBeTruthy()
    })

    test('load referrer account', async () => {
      const loadedReferrer = await Referrer.load(client, referrer)

      // TODO check all fields
      expect(loadedReferrer.creationDate.getTime()).toBeLessThan(new Date().getTime() + MINUTE)
      expect(loadedReferrer.creationDate.getTime()).toBeGreaterThan(new Date().getTime() - MINUTE)
      expect(loadedReferrer.host.toBase58()).toBe(host.toBase58())
      expect(loadedReferrer.pubkey.toBase58()).toBe(referrer.toBase58())
      expect(loadedReferrer.referrerFeeRateBps.toNumber()).toBe(referrerFees)
    })
  })
}
