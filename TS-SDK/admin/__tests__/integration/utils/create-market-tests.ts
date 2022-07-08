import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token'
import { Keypair, Connection, PublicKey, SystemProgram } from '@solana/web3.js'
import BN from 'bn.js'
import { TransactionInstruction } from '@solana/web3.js/lib/index.esm'
import {
  makeInitMarketInstruction,
  makeSupplementInitMarketInstruction,
  SupplementInitMarketArgs,
} from './admin-instructions/init-market'
import { createAverClient } from './client'
import { AverClient, AVER_PROGRAM_ID, Market, signAndSendTransactionInstructions, USDC_DEVNET } from 'aver-ts'

jest.setTimeout(1000000)

export const getInitMarketSmokeTests = (
  owner: Keypair,
  outcomeLength: number,
  market: Keypair,
  marketAuthority: Keypair
) => {
  let client: AverClient
  let conn: Connection
  let keypair: Keypair

  beforeAll(async () => {
    client = (await createAverClient(owner)) as AverClient
    keypair = owner
    conn = client.connection
  })

  describe('init market', () => {
    let marketStore: PublicKey
    // TODO fails if too many outcomes as it requires more than 2 SOL
    let numberOfOutcomes: number = outcomeLength

    test('create a market successfully', async () => {
      const oracle = new Keypair()

      const [marketStorePubkey, marketStoreBump] = await Market.deriveMarketStorePubkeyAndBump(
        market.publicKey
      )
      marketStore = marketStorePubkey

      const [vaultAuthority, vaultBump] = await PublicKey.findProgramAddress(
        [market.publicKey.toBuffer()],
        AVER_PROGRAM_ID
      )
      const vaultQuoteAccount = (
        await getOrCreateAssociatedTokenAccount(conn, keypair, USDC_DEVNET, vaultAuthority, true)
      ).address

      const args = {
        numberOfOutcomes: numberOfOutcomes,
        numberOfWinners: 1,
        vaultBump: vaultBump,
        marketStoreBump: marketStoreBump,
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
        marketName: 'Test market',
        goingInPlayFlag: true,
        activeImmediately: true,
        tradingCeaseTime: new BN(1682447605),
        inplayStartTime: new BN(1682447605),
      }
      const accs = {
        payer: keypair.publicKey,
        market: market.publicKey,
        marketAuthority: marketAuthority.publicKey,
        marketStore: marketStore,
        quoteTokenMint: USDC_DEVNET,
        vaultAuthority: vaultAuthority,
        quoteVault: vaultQuoteAccount,
        oracleFeed: SystemProgram.programId,
      }
      const initMarketIx = makeInitMarketInstruction(client, args, accs)

      const sig = await signAndSendTransactionInstructions(
        conn,
        [market, marketAuthority],
        keypair,
        [initMarketIx]
      )

      const confirmedSig = await conn.confirmTransaction(sig)

      expect(confirmedSig.value.err).toBeFalsy()
    })

    test('create supplement market correctly', async () => {
      // create the instructions
      const numOfAobs = numberOfOutcomes === 2 ? 1 : numberOfOutcomes
      const outcomeNames = Array(numberOfOutcomes)
        .fill(0)
        .map((v) => `outcomeNameBla`)
      const supplementIxs: TransactionInstruction[] = []

      for (let i = 0; i < numOfAobs; i++) {
        const outcomeName = numberOfOutcomes === 2 ? outcomeNames : [outcomeNames[i]]

        const args = {
          eventCapacity: 100,
          nodesCapacity: 100,
          outcomeId: i,
          outcomeNames: outcomeName,
        } as SupplementInitMarketArgs
        const accs = {
          market: market.publicKey,
          marketAuthority: marketAuthority.publicKey,
          marketStore: marketStore,
          payer: keypair.publicKey,
        }
        const initSupplementMarketIx = await makeSupplementInitMarketInstruction(client, args, accs)

        supplementIxs.push(initSupplementMarketIx)
      }

      let aobsToInit = supplementIxs

      do {
        const sigs = await Promise.all(
          aobsToInit.map((ix) =>
            signAndSendTransactionInstructions(conn, [marketAuthority], keypair, [ix])
          )
        )

        const aobSigs = await Promise.all(sigs.map((sig) => conn.confirmTransaction(sig)))

        aobsToInit = aobsToInit.filter((_aob, i) => !!aobSigs[i].value.err)
      } while (aobsToInit.length > 0)
    })

    test('check if market has been created correctly', async () => {
      const marketObject = await Market.load(client, market.publicKey)

      const [expectedMarketStorePubkey, _] = await Market.deriveMarketStorePubkeyAndBump(
        marketObject.pubkey
      )

      expect(marketObject.pubkey.toBase58()).toBe(market.publicKey.toBase58())
      expect(marketObject.marketAuthority.toBase58()).toBe(marketAuthority.publicKey.toBase58())
      expect(marketObject.marketStore.toBase58()).toBe(expectedMarketStorePubkey.toBase58())
      expect(marketObject?.orderbooks).toHaveLength(marketObject.numberOfOutcomes)
      marketObject?.orderbooks?.map((oo) => {
        expect(oo.slabAsks).toBeTruthy()
        expect(oo.slabBids).toBeTruthy()
      })
    })
  })
}
