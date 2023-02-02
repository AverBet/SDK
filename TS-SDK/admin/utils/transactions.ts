import { Connection, TransactionConfirmationStrategy } from "@solana/web3.js";

export async function confirmTx(txSig: string, connection: Connection | undefined, timeMs: number) {
    if (!connection) return 

    await new Promise(done => setTimeout(() => done(undefined), timeMs))

    const latestBlockHash = await connection.getLatestBlockhash()

    const strategy: TransactionConfirmationStrategy = {
        signature: txSig,
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    }

    await connection.confirmTransaction(strategy)
}