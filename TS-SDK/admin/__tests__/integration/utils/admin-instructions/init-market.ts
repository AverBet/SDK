import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { SystemProgram } from '@solana/web3.js'
import { AverClient, Orderbook } from 'aver-ts'
import BN from 'bn.js'

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
  averClient.program.instruction['initMarket'](args, {
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
  const [orderbook, orderbookBump] = await Orderbook.deriveOrderbookPubkeyAndBump(
    accs.market,
    args.outcomeId
  )

  const [eventQueue, eventQueueBump] = await Orderbook.deriveEventQueuePubkeyAndBump(
    accs.market,
    args.outcomeId
  )

  const [bids, bidsBump] = await Orderbook.deriveBidsPubkeyAndBump(accs.market, args.outcomeId)

  const [asks, asksBump] = await Orderbook.deriveAsksPubkeyAndBump(accs.market, args.outcomeId)

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

  return averClient.program.instruction['supplementInitMarket'](ixArgs, {
    accounts: ixAccounts,
  })
}
