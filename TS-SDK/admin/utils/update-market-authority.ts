import {
    Keypair,
    PublicKey,
    SendOptions,
} from "@solana/web3.js"
import { AverClient } from "../../public/src/aver-client"
import { AVER_PROGRAM_IDS } from "../../public/src/ids"
import { signAndSendTransactionInstructions } from "../../public/src/utils"

export async function makeUpdateMarketAuthorityInstruction(
    averClient: AverClient,
    marketAuthority: Keypair,
    newMarketAuthority: Keypair,
    market: PublicKey,
    programId = AVER_PROGRAM_IDS[0]
) {
    const program = await averClient.getProgramFromProgramId(programId)

    return program.instruction['updateMarketAuthority'](
        {
            accounts: {
                marketAuthority: marketAuthority.publicKey,
                market: market,
                newMarketAuthority: newMarketAuthority.publicKey
            }
        }
    )
}

export async function updateMarketAuthority(
    averClient: AverClient,
    marketAuthority: Keypair,
    newMarketAuthority: Keypair,
    market: PublicKey,
    programId = AVER_PROGRAM_IDS[0],
    sendOptions?: SendOptions
) {
    const ix = await makeUpdateMarketAuthorityInstruction(
        averClient,
        marketAuthority,
        newMarketAuthority,
        market,
        programId
    )
    
    return await signAndSendTransactionInstructions(
        averClient,
        [marketAuthority, newMarketAuthority],
        newMarketAuthority,
        [ix],
        sendOptions
    )
}