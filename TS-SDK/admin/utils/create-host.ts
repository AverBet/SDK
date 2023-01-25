import {
    Keypair,
    PublicKey,
    SendOptions,
    SystemProgram,
} from "@solana/web3.js"
import { AverClient } from "../../public/src/aver-client"
import { AVER_PROGRAM_IDS } from "../../public/src/ids"
import { signAndSendTransactionInstructions } from "../../public/src/utils"
import BN from 'bn.js'

export async function makeCreateHostAccountInstruction(
    averClient: AverClient,
    owner: Keypair,
    feePayer: Keypair,
    host: PublicKey,
    referrerFeeRateOffererBps: number = 0,
    programId = AVER_PROGRAM_IDS[0]
) {
    const program = await averClient.getProgramFromProgramId(programId)
    console.log(program.instruction)

    return program.instruction['initHost'](
        new BN(referrerFeeRateOffererBps), 
        {
            accounts: {
                payer: feePayer.publicKey,
                owner: owner.publicKey,
                host: host,
                systemProgram: SystemProgram.programId,
            },
            signers: [feePayer, owner]
        }
    )
}

export async function createHostAccount(
    averClient: AverClient,
    owner: Keypair,
    feePayer: Keypair,
    host: PublicKey,
    sendOptions?: SendOptions,
    referrerFeeRateOffererBps: number = 0,
    programId = AVER_PROGRAM_IDS[0],
) {
    console.log('CREATE HOST ACC IX')
    const ix = await makeCreateHostAccountInstruction(
        averClient,
        owner,
        feePayer,
        host,
        referrerFeeRateOffererBps,
        programId
    )

    console.log(ix)
    
    return await signAndSendTransactionInstructions(
        averClient,
        [owner, feePayer],
        feePayer,
        [ix],
        sendOptions
    )
}

export function derivePubkeyAndBump(owner: PublicKey, programId: PublicKey) {

    return PublicKey.findProgramAddressSync(
        [Buffer.from("host", "utf-8"), owner.toBuffer()],
        programId
      )
}