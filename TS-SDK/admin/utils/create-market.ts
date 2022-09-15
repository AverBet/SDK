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

  const [marketStorePubkey, marketStoreBump] =
    await Market.deriveMarketStorePubkeyAndBump(market.publicKey, programId)
  const marketStore = marketStorePubkey

  const [vaultAuthority, vaultBump] = await PublicKey.findProgramAddress(
    [market.publicKey.toBuffer()],
    programId
  )
  const vaultQuoteAccount = (
    await client.getOrCreateTokenAta(
      owner,
      client.quoteTokenMint,
      vaultAuthority
    )
  ).address

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

  const initMarketIx = makeInitMarketInstruction(args, accs, program)

  const sig = await signAndSendTransactionInstructions(
    client,
    [market, marketAuthority, inPlayQueue],
    owner,
    [initMarketIx]
  )

  const confirmedSig = await client.connection.confirmTransaction(sig)
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
    const initSupplementMarketIx = await makeSupplementInitMarketInstruction(
      args,
      accs,
      program
    )

    supplementIxs.push(initSupplementMarketIx)
  }

  let aobsToInit = supplementIxs

  do {
    const sigs = await Promise.all(
      aobsToInit.map((ix) =>
        signAndSendTransactionInstructions(client, [marketAuthority], owner, [
          ix,
        ])
      )
    )

    const aobSigs = await Promise.all(
      sigs.map((sig) => client.connection.confirmTransaction(sig))
    )

    aobsToInit = aobsToInit.filter((_aob, i) => !!aobSigs[i].value.err)
  } while (aobsToInit.length > 0)
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
