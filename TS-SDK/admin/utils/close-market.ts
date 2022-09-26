import { Program } from "@project-serum/anchor"
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token"
import { Keypair, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"
import { Market } from "../../public/src/market"

export async function closeMarketTx(
  program: Program,
  market: Market,
  market_authority: Keypair,
  targetLamportsAccount: PublicKey
) {
  const quoteVault = market.quoteVault

  const averQuoteTokenAccount = await getAssociatedTokenAddress(
    market.quoteTokenMint,
    market_authority.publicKey
  )

  return await program.rpc["closeMarket"]({
    accounts: {
      market: market.pubkey,
      marketAuthority: market_authority.publicKey,
      quoteVault: quoteVault,
      vaultAuthority: market.vaultAuthority,
      targetLamportsAccount: targetLamportsAccount,
      splTokenProgram: TOKEN_PROGRAM_ID,
      averQuoteTokenAccount: averQuoteTokenAccount,
    },
    signers: [market_authority],
  })
}
