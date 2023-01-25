import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js"
import { Market } from "../../public/src/market"
import { AverClient } from "../../public/src/aver-client"
import { BN, Program } from "@project-serum/anchor"
import { signAndSendTransactionInstructions } from "../../public/src/utils"
import { Orderbook } from "../../public/src/orderbook"
import { confirmTx } from './transactions'

export async function createMarket(
  numberOfOutcomes: number,
  client: AverClient,
  owner: Keypair,
  args: InitMarketArgs,
  programId: PublicKey
) {
  console.log("Begin market creation")
  const market = new Keypair()
  const marketAuthority = owner
  console.log('The market authority is', marketAuthority.publicKey)

  console.log('MARKET STORE')
  const [marketStorePubkey, marketStoreBump] =
    await Market.deriveMarketStorePubkeyAndBump(market.publicKey, programId)
  const marketStore = marketStorePubkey

  console.log('MARKET STORE', marketStorePubkey)

  const [vaultAuthority, vaultBump] = PublicKey.findProgramAddressSync(
    [market.publicKey.toBuffer()],
    programId
  )
  console.log('VAULT AUTH', vaultAuthority)

  try {
    await client.getOrCreateTokenAta(
      owner,
      client.quoteTokenMint,
      vaultAuthority
    )
  } catch (e) {
    console.error('ERROR creating the ATA', e)
  }

  const vaultQuoteAccount = (
    await client.getOrCreateTokenAta(
      owner,
      client.quoteTokenMint,
      vaultAuthority
    )
  ).address

  console.log('VAULT QUOTE', vaultQuoteAccount)

  args.numberOfOutcomes = numberOfOutcomes
  args.vaultBump = vaultBump

  const inPlayQueue = new Keypair()

  const accs = {
    payer: owner.publicKey,
    market: market.publicKey,
    marketAuthority: marketAuthority.publicKey,
    marketStore: marketStore,
    quoteTokenMint: client.quoteTokenMint,
    vaultAuthority: vaultAuthority,
    quoteVault: vaultQuoteAccount,
    oracleFeed: SystemProgram.programId,
    inPlayQueue: inPlayQueue.publicKey,
  }

  const program = await client.getProgramFromProgramId(programId)
  console.log('INIT MARKET IX')
  const initMarketIx = makeInitMarketInstruction(args, accs, program)
  console.log('INIT MARKET IX', initMarketIx)

  await new Promise(done => setTimeout(() => done(undefined), 15000)); 

  const sig = await signAndSendTransactionInstructions(
    client,
    [market, marketAuthority, inPlayQueue],
    owner,
    [initMarketIx]
  )

  console.log('The market has been initalised -> ', sig)

  await confirmTx(sig, client.connection, 15000)

  console.log("Init market confirmed")
  console.log("Begin supplement init market")

  const numOfAobs = numberOfOutcomes === 2 ? 1 : numberOfOutcomes
  const outcomeNames = Array(numberOfOutcomes)
    .fill(0)
    .map((v, i) => `outcomeNameBla${i}`)
  const supplementIxs: TransactionInstruction[] = []

  for (let i = 0; i < numOfAobs; i++) {
    const outcomeName =
      numberOfOutcomes === 2 ? outcomeNames : [outcomeNames[i]]

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
      payer: owner.publicKey,
    }

    console.log('Got the ACCS', accs)

    const initSupplementMarketIx = await makeSupplementInitMarketInstruction(
      args,
      accs,
      program
    )

    supplementIxs.push(initSupplementMarketIx)
  }

  let aobsToInit = supplementIxs

 
  const sigs = await Promise.all(
    aobsToInit.map((ix) =>
      signAndSendTransactionInstructions(client, [marketAuthority], owner, [
        ix,
      ])
    )
  )

  await Promise.all(
    sigs.map((sig) => confirmTx(sig, client.connection, 5000))
  )

  console.log("Supplement init market confirmed")
  return market
}

export type InitMarketArgs = {
  numberOfOutcomes: number
  numberOfWinners: number
  permissionedMarketFlag: boolean
  minOrderbookBaseSize: BN
  minNewOrderBaseSize: BN
  vaultBump: number
  minNewOrderQuoteSize: BN
  maxQuoteTokensIn: BN
  maxQuoteTokensInPermissionCapped: BN
  crankerReward: BN
  feeTierCollectionBpsRates: BN[]
  marketName: string
  goingInPlayFlag: boolean
  activeImmediately: boolean
  tradingCeaseTime: BN
  inPlayStartTime: BN | null
  roundingFormat: number
  category: number
  subCategory: number
  series: number
  event: number
  maxInPlayCrankOrders: number | null
  inPlayDelaySeconds: number | null
}

export type InitMarketAccounts = {
  payer: PublicKey
  market: PublicKey
  marketAuthority: PublicKey
  marketStore: PublicKey
  quoteTokenMint: PublicKey
  vaultAuthority: PublicKey
  quoteVault: PublicKey
  oracleFeed: PublicKey
  inPlayQueue: PublicKey
}

export const makeInitMarketInstruction = (
  args: InitMarketArgs,
  accs: InitMarketAccounts,
  program: Program
): TransactionInstruction =>
  program.instruction["initMarket"](args, {
    accounts: Object.assign(
      {
        systemProgram: SystemProgram.programId,
      },
      accs
    ),
  })

export type SupplementInitMarketArgs = {
  outcomeId: number
  outcomeNames: string[]
  eventCapacity: number
  nodesCapacity: number
}

export type SupplementInitMarketAccounts = {
  payer: PublicKey
  market: PublicKey
  marketStore: PublicKey
  marketAuthority: PublicKey
}

export const makeSupplementInitMarketInstruction = async (
  args: SupplementInitMarketArgs,
  accs: SupplementInitMarketAccounts,
  program: Program
) => {
  const [orderbook, orderbookBump] =
    await Orderbook.deriveOrderbookPubkeyAndBump(
      accs.market,
      args.outcomeId,
      program.programId
    )

  const [eventQueue, eventQueueBump] =
    await Orderbook.deriveEventQueuePubkeyAndBump(
      accs.market,
      args.outcomeId,
      program.programId
    )

  const [bids, bidsBump] = await Orderbook.deriveBidsPubkeyAndBump(
    accs.market,
    args.outcomeId,
    program.programId
  )

  const [asks, asksBump] = await Orderbook.deriveAsksPubkeyAndBump(
    accs.market,
    args.outcomeId,
    program.programId
  )

  const ixAccounts = Object.assign(
    {
      orderbook,
      eventQueue,
      bids,
      asks,
      systemProgram: SystemProgram.programId,
    },
    accs
  )
  const ixArgs = Object.assign(
    {
      orderbookBump,
      eventQueueBump,
      bidsBump,
      asksBump,
    },
    args
  )

  return program.instruction["supplementInitMarket"](ixArgs, {
    accounts: ixAccounts,
  })
}
