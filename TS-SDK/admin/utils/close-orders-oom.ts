import {
    Keypair,
    PublicKey,
    SendOptions,
} from "@solana/web3.js"
import { AverClient } from "../../public/src/aver-client"
import { AVER_PROGRAM_IDS } from "../../public/src/ids"
import { signAndSendTransactionInstructions } from "../../public/src/utils"

export async function makeCloseOrdersOomInstruction(
    averClient: AverClient,
    user: Keypair,
    uma: PublicKey,
    market: PublicKey,
    host: PublicKey,
    programId = AVER_PROGRAM_IDS[0]
) {
    const program = await averClient.getProgramFromProgramId(programId)

    return program.instruction['cancelOrdersOom'](
        {
            accounts: {
                payer: user.publicKey,
                user: user.publicKey,
                userMarket: uma,
                market: market,
                host: host

            }
        }
    )
}

export async function closeOrdersOom(
    averClient: AverClient,
    user: Keypair,
    uma: PublicKey,
    market: PublicKey,
    host: PublicKey,
    programId = AVER_PROGRAM_IDS[0],
    sendOptions?: SendOptions
) {
    console.log('Update NFT PFP DisplayName')
    const ix = await makeCloseOrdersOomInstruction(
        averClient,
        user,
        uma,
        market,
        host,
        programId
    )
    
    return await signAndSendTransactionInstructions(
        averClient,
        [user],
        user,
        [ix],
        sendOptions
    )
}