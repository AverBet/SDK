import { Program } from "@project-serum/anchor"
import { Keypair } from "@solana/web3.js"
import { Market } from "../../public/src/market"

export async function changeMarketStatusTx(
  program: Program,
  market: Market,
  market_authority: Keypair,
  new_market_status: number
) {
  const market_store = (
    await Market.deriveMarketStorePubkeyAndBump(market.pubkey, market.programId)
  )[0]

  return await program.rpc["changeMarketStatus"](new_market_status, {
    accounts: {
      market: market.pubkey,
      marketAuthority: market_authority.publicKey,
      marketStore: market_store,
    },
    signers: [market_authority],
  })
}
