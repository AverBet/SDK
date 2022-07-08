import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token'
import { Keypair, PublicKey } from '@solana/web3.js'
import { AverClient, AVER_PROGRAM_ID, USDC_DEVNET } from 'aver-ts'

export const voidMarket = async (
  averClient: AverClient,
  market: PublicKey,
  marketAuthority: Keypair
) => {
  const [vaultAuthority, vaultBump] = await PublicKey.findProgramAddress(
    [market.toBuffer()],
    AVER_PROGRAM_ID
  )
  const quoteVault = (
    await getOrCreateAssociatedTokenAccount(
      averClient.connection,
      marketAuthority,
      USDC_DEVNET,
      vaultAuthority,
      true
    )
  ).address

  return averClient.program.instruction['voidMarket']({
    accounts: {
      market,
      marketAuthority: marketAuthority.publicKey,
      quoteVault,
    },
  })
}
