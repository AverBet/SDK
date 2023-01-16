import { Connection } from "@solana/web3.js";

export async function confirmTx(txSig: string, connection: Connection | undefined, timeMs: number) {
    if (!connection) return 

    await new Promise(done => setTimeout(() => done(undefined), timeMs))

    // const latestBlockHash = await connection.getLatestBlockhash()

    // await connection.confirmTransaction({
    //     blockhash: latestBlockHash.blockhash,
    //     lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    //     signature: txSig,
    // })
}