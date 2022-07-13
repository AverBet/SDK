import { Program } from '@project-serum/anchor';
import { Keypair, Connection, TransactionInstruction, PublicKey, SendOptions } from '@solana/web3.js';
import { AverClient } from './aver-client';
export declare const signAndSendTransactionInstructions: (connection: Connection, signers: Array<Keypair>, feePayer: Keypair, txInstructions: Array<TransactionInstruction>, sendOptions?: SendOptions, manualMaxRetry?: number, program?: Program) => Promise<string>;
export declare function throwIfNull<T>(value: T | null, message?: string): T;
export declare const chunkAndFetchMultiple: (connection: Connection, pubkeys: PublicKey[]) => Promise<any>;
/**
 * Returns the tick size interval for the given limit price
 * @param limitPrice 1000 < limitPrice <= 990000 where limit price is in 6dp
 * @returns tick size for the given price
 */
export declare const calculateTickSizeForPrice: (limitPrice: number) => number;
export declare const roundPriceToNearestTickSize: (limitPrice: number, isBinary?: boolean) => number;
export declare const getBestDiscountToken: (averClient: AverClient, owner: PublicKey) => Promise<PublicKey>;
