import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js"
import { Market } from "../../public/src/market"
import { AverClient } from "../../public/src/aver-client"
import { AVER_PROGRAM_IDS, USDC_DEVNET } from "../../public/src/ids"
import { BN } from "@project-serum/anchor"
import { signAndSendTransactionInstructions } from "../../public/src/utils"

export async function createMarket(
  numberOfOutcomes: number,
  client: AverClient,
  owner: Keypair,
  args: InitMarketArgs
) {
  console.log("Begin market creation")
  const market = new Keypair()
  const marketAuthority = new Keypair()

  const [marketStorePubkey, marketStoreBump] =
    await Market.deriveMarketStorePubkeyAndBump(market.publicKey)
  const marketStore = marketStorePubkey

  const [vaultAuthority, vaultBump] = await PublicKey.findProgramAddress(
    [market.publicKey.toBuffer()],
    AVER_PROGRAM_IDS[0]
  )
  const vaultQuoteAccount = (
    await client.getOrCreateTokenAta(owner, USDC_DEVNET, owner.publicKey)
  ).address

  args.vaultBump = vaultBump
  args.numberOfOutcomes = numberOfOutcomes
  args.marketStoreBump = marketStoreBump

  const accs = {
    payer: owner.publicKey,
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
    client,
    [market, marketAuthority],
    owner,
    [initMarketIx]
  )

  const confirmedSig = await client.connection.confirmTransaction(sig)
  console.log("Init market confirmed")
  console.log("Begin supplement init market")

  const numOfAobs = numberOfOutcomes === 2 ? 1 : numberOfOutcomes
  const outcomeNames = Array(numberOfOutcomes)
    .fill(0)
    .map((v) => `outcomeNameBla`)
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
      client,
      args,
      accs
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
  vaultBump: number
  marketStoreBump: number
  permissionedMarketFlag: boolean
  minOrderbookBaseSize: BN
  minNewOrderBaseSize: BN
  minNewOrderQuoteSize: BN
  maxQuoteTokensIn: BN
  maxQuoteTokensInPermissionCapped: BN
  crankerReward: BN
  feeTierCollectionBpsRates: BN[]
  marketName: string
  goingInPlayFlag: boolean
  activeImmediately: boolean
  tradingCeaseTime: BN
  inplayStartTime: BN | null
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
}

export const makeInitMarketInstruction = (
  averClient: AverClient,
  args: InitMarketArgs,
  accs: InitMarketAccounts
): TransactionInstruction =>
  averClient.program.instruction["initMarket"](args, {
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
  averClient: AverClient,
  args: SupplementInitMarketArgs,
  accs: SupplementInitMarketAccounts
) => {
  const [orderbook, orderbookBump] =
    await Orderbook.deriveOrderbookPubkeyAndBump(accs.market, args.outcomeId)

  const [eventQueue, eventQueueBump] =
    await Orderbook.deriveEventQueuePubkeyAndBump(accs.market, args.outcomeId)

  const [bids, bidsBump] = await Orderbook.deriveBidsPubkeyAndBump(
    accs.market,
    args.outcomeId
  )

  const [asks, asksBump] = await Orderbook.deriveAsksPubkeyAndBump(
    accs.market,
    args.outcomeId
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

  return averClient.program.instruction["supplementInitMarket"](ixArgs, {
    accounts: ixAccounts,
  })
}
