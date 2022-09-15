import { Program } from "@project-serum/anchor"
import { Keypair, SystemProgram } from "@solana/web3.js"
import { Market } from "../../public/src/market"

export async function manualResolveMarketTx(
  program: Program,
  market: Market,
  market_authority: Keypair,
  outcome_id: number
) {
  const quoteVault = market.quoteVault

  return await program.rpc["resolveMarket"](outcome_id, {
    accounts: {
      market: market.pubkey,
      marketAuthority: market_authority.publicKey,
      quoteVault: quoteVault,
      resolutionAccount: SystemProgram.programId,
    },
    signers: [market_authority],
  })
}
