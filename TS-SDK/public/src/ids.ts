import { PublicKey } from "@solana/web3.js";
import { SolanaNetwork } from "./types";

// Devnet and Mainnet constants
export const AVER_PROGRAM_IDS = [
  new PublicKey("6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ"),
];

export const AVER_TOKEN = new PublicKey(
  "AVERsCxn9wr9YZ4WVavPbjm13hrLTPAkdnu1QqK9ZL1y"
);
export const AVER_MARKET_AUTHORITY = new PublicKey(
  "EEg375Q8wEsPTyaQ4jG4hmNsMojmMHs6gB58iVWUXSwF"
);
export const AVER_HOST_ACCOUNT = new PublicKey(
  "5xhmqK1Dh48TiqvHxoZi6WWWKL6THtsUjh3GoiVEbbR8"
);
export const AVER_COMMUNITY_REWARDS_NFT = new PublicKey(
  "AVERojzZ8649E1oLPvcgG2SSbVECxs8PcG5JkpuK2Dvq"
);

// Devnet constants
export const AVER_API_ENDPOINT_DEVNET = "https://dev.api.aver.exchange";
export const SOLANA_ENDPOINT_DEVNET = "https://api.devnet.solana.com";
export const USDC_DEVNET = new PublicKey(
  "BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj"
);
export const AVER_HOST_ACCOUNT_DEVNET = new PublicKey(
  "2eGTu9d4hdGvwvFDGG34a3JRLFiQ2Ar92LjJpb4vyQFw"
);

// ATA for market authority with USDC
export const AVER_MARKET_AUTHORITY_VAULT_DEVNET = new PublicKey(
  "TxyectLDHmkzidS6RCat6uuZ385xaNbxg7R7vrfhTAD"
);

// PDA derivation of 'third-party-token-vault' + USDC + AVER_PROGRAM_ID
export const AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_DEVNET = new PublicKey(
  "Gb6DFbnMUdA1ReJqzfN7oeBpTNtz347bzgKUXgzzA58F"
);

// ATA of vault authority PDA with USDC
export const AVER_THIRD_PARTY_REWARD_VAULT_DEVNET = new PublicKey(
  "DrWWingQnsb46bJg6ms5xPhnFz2YCuc9sihqeFFqGVXK"
);

// bump of third party vault authority PDA
export const AVER_THIRD_PARTY_REWARD_VAULT_BUMP_DEVNET = 253;

export const AVER_LAUNCH_ZERO_FEES_DEVNET = new PublicKey(
  "BqSFP5CbfBfZeQqGbzYEipfzTDptTYHFL9AzZA8TBXjn"
);

// Mainnet constants
export const AVER_API_ENDPOINT_MAINNET = "https://api.aver.exchange";
export const SOLANA_ENDPOINT_MAINNET = "https://api.mainnet-beta.solana.com";
export const USDC_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
); // (USDC)

export const AVER_MARKET_AUTHORITY_VAULT_MAINNET = new PublicKey(
  "8M33TSnT9qDnTS2nSiECtfn7uhxNYZ9oJRVumYqgo2NX"
);

export const AVER_THIRD_PARTY_REWARD_VAULT_MAINNET = new PublicKey(
  "2FMt5pb8oJGAyvSN6Ytw1nD3Np6MUJ2jRZrv63Zy4nqT"
);

export const AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_MAINNET = new PublicKey(
  "5sRuNV4LqvroWF1EiUmPuUYAzti4Biikou8jRYMuxVaR"
)

export const AVER_THIRD_PARTY_REWARD_VAULT_BUMP_MAINNET = 250

export const AVER_LAUNCH_ZERO_FEES_MAINNET = new PublicKey(
  "4QwFUyLKtHZqbHvxZQqLGPz8eMjXBgedaWvuQTdKwKJx"
)

export const MAX_ITERATIONS_FOR_CONSUME_EVENTS = 5

// helpers
/**
 * Returns URL for solana endpoint based on solana network
 *
 * @param {SolanaNetwork} solanaNetwork - Solana network
 * @returns {string} - URL
 */
export const getSolanaEndpoint = (solanaNetwork: SolanaNetwork) =>
  solanaNetwork == SolanaNetwork.Devnet
    ? SOLANA_ENDPOINT_DEVNET
    : SOLANA_ENDPOINT_MAINNET

/**
 * Returns default quote token public key based on solana network
 *
 * @param {SolanaNetwork} solanaNetwork - Solana network
 * @returns {PublicKey} - PublicKey
 */
export const getQuoteToken = (solanaNetwork: SolanaNetwork) =>
  solanaNetwork == SolanaNetwork.Devnet ? USDC_DEVNET : USDC_MAINNET

/**
 *
 * @param {SolanaNetwork} solanaNetwork - Solana network
 * @returns {PublicKey} - Public key of zero fees token
 */
export const getAverLaunchZeroFeesToken = (solanaNetwork: SolanaNetwork) =>
  solanaNetwork == SolanaNetwork.Devnet
    ? AVER_LAUNCH_ZERO_FEES_DEVNET
    : AVER_LAUNCH_ZERO_FEES_MAINNET

// other constants
export const CALLBACK_INFO_LEN = 33

export const CANCEL_ALL_ORDERS_INSTRUCTION_CHUNK_SIZE = 5

export const AVER_VERSION = 1

export const USER_FACING_INSTRUCTIONS_TO_CHECK_IN_IDL = [
  "initUserMarket",
  "placeOrder",
  "cancelOrder",
  "cancelAllOrders",
  "withdrawTokens",
  "neutralizeOutcomePosition",
  "updateUserMarketOrders",
  "initUserHostLifetime",
  "updateMarketState",
  "sweepFees",
];
