"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALLBACK_INFO_LEN = exports.getAverLaunchZeroFeesToken = exports.getQuoteToken = exports.getSolanaEndpoint = exports.getAverApiEndpoint = exports.AVER_LAUNCH_ZERO_FEES_MAINNET = exports.AVER_THIRD_PARTY_REWARD_VAULT_BUMP_MAINNET = exports.AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_MAINNET = exports.AVER_THIRD_PARTY_REWARD_VAULT_MAINNET = exports.AVER_MARKET_AUTHORITY_VAULT_MAINNET = exports.USDC_MAINNET = exports.SOLANA_ENDPOINT_MAINNET = exports.AVER_API_ENDPOINT_MAINNET = exports.AVER_LAUNCH_ZERO_FEES_DEVNET = exports.AVER_THIRD_PARTY_REWARD_VAULT_BUMP_DEVNET = exports.AVER_THIRD_PARTY_REWARD_VAULT_DEVNET = exports.AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_DEVNET = exports.AVER_MARKET_AUTHORITY_VAULT_DEVNET = exports.USDC_DEVNET = exports.SOLANA_ENDPOINT_DEVNET = exports.AVER_API_ENDPOINT_DEVNET = exports.AVER_COMMUNITY_REWARDS_NFT = exports.AVER_HOST_ACCOUNT = exports.AVER_MARKET_AUTHORITY = exports.AVER_TOKEN = exports.AVER_PROGRAM_ID = void 0;
const web3_js_1 = require("@solana/web3.js");
const types_1 = require("./types");
// Devnet and Mainnet constants
exports.AVER_PROGRAM_ID = new web3_js_1.PublicKey('6q5ZGhEj6kkmEjuyCXuH4x8493bpi9fNzvy9L8hX83HQ');
exports.AVER_TOKEN = new web3_js_1.PublicKey('AVERsCxn9wr9YZ4WVavPbjm13hrLTPAkdnu1QqK9ZL1y');
exports.AVER_MARKET_AUTHORITY = new web3_js_1.PublicKey('EEg375Q8wEsPTyaQ4jG4hmNsMojmMHs6gB58iVWUXSwF');
exports.AVER_HOST_ACCOUNT = new web3_js_1.PublicKey('5xhmqK1Dh48TiqvHxoZi6WWWKL6THtsUjh3GoiVEbbR8');
exports.AVER_COMMUNITY_REWARDS_NFT = new web3_js_1.PublicKey('AVERojzZ8649E1oLPvcgG2SSbVECxs8PcG5JkpuK2Dvq');
// Devnet constants
exports.AVER_API_ENDPOINT_DEVNET = 'https://dev.api.aver.exchange';
exports.SOLANA_ENDPOINT_DEVNET = 'https://api.devnet.solana.com';
exports.USDC_DEVNET = new web3_js_1.PublicKey('BWvbxUTAxevm1NG8RHe1LhKmca9nz5ym2xqafTxr6ybj');
// ATA for market authority with USDC
exports.AVER_MARKET_AUTHORITY_VAULT_DEVNET = new web3_js_1.PublicKey('TxyectLDHmkzidS6RCat6uuZ385xaNbxg7R7vrfhTAD');
// PDA derivation of 'third-party-token-vault' + USDC + AVER_PROGRAM_ID
exports.AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_DEVNET = new web3_js_1.PublicKey('Gb6DFbnMUdA1ReJqzfN7oeBpTNtz347bzgKUXgzzA58F');
// ATA of vault authority PDA with USDC
exports.AVER_THIRD_PARTY_REWARD_VAULT_DEVNET = new web3_js_1.PublicKey('DrWWingQnsb46bJg6ms5xPhnFz2YCuc9sihqeFFqGVXK');
// bump of third party vault authority PDA
exports.AVER_THIRD_PARTY_REWARD_VAULT_BUMP_DEVNET = 253;
exports.AVER_LAUNCH_ZERO_FEES_DEVNET = new web3_js_1.PublicKey('BqSFP5CbfBfZeQqGbzYEipfzTDptTYHFL9AzZA8TBXjn');
// Mainnet constants
exports.AVER_API_ENDPOINT_MAINNET = 'https://api.aver.exchange';
exports.SOLANA_ENDPOINT_MAINNET = 'https://ssc-dao.genesysgo.net/';
exports.USDC_MAINNET = new web3_js_1.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // (USDC)
exports.AVER_MARKET_AUTHORITY_VAULT_MAINNET = new web3_js_1.PublicKey('8M33TSnT9qDnTS2nSiECtfn7uhxNYZ9oJRVumYqgo2NX');
exports.AVER_THIRD_PARTY_REWARD_VAULT_MAINNET = new web3_js_1.PublicKey('2FMt5pb8oJGAyvSN6Ytw1nD3Np6MUJ2jRZrv63Zy4nqT');
exports.AVER_THIRD_PARTY_REWARD_VAULT_AUTHORITY_MAINNET = new web3_js_1.PublicKey('5sRuNV4LqvroWF1EiUmPuUYAzti4Biikou8jRYMuxVaR');
exports.AVER_THIRD_PARTY_REWARD_VAULT_BUMP_MAINNET = 250;
exports.AVER_LAUNCH_ZERO_FEES_MAINNET = new web3_js_1.PublicKey('4QwFUyLKtHZqbHvxZQqLGPz8eMjXBgedaWvuQTdKwKJx');
// helpers
const getAverApiEndpoint = (solanaNetwork) => solanaNetwork == types_1.SolanaNetwork.Devnet ? exports.AVER_API_ENDPOINT_DEVNET : exports.AVER_API_ENDPOINT_MAINNET;
exports.getAverApiEndpoint = getAverApiEndpoint;
const getSolanaEndpoint = (solanaNetwork) => solanaNetwork == types_1.SolanaNetwork.Devnet ? exports.SOLANA_ENDPOINT_DEVNET : exports.SOLANA_ENDPOINT_MAINNET;
exports.getSolanaEndpoint = getSolanaEndpoint;
const getQuoteToken = (solanaNetwork) => solanaNetwork == types_1.SolanaNetwork.Devnet ? exports.USDC_DEVNET : exports.USDC_MAINNET;
exports.getQuoteToken = getQuoteToken;
const getAverLaunchZeroFeesToken = (solanaNetwork) => solanaNetwork == types_1.SolanaNetwork.Devnet
    ? exports.AVER_LAUNCH_ZERO_FEES_DEVNET
    : exports.AVER_LAUNCH_ZERO_FEES_MAINNET;
exports.getAverLaunchZeroFeesToken = getAverLaunchZeroFeesToken;
// other constants
exports.CALLBACK_INFO_LEN = 33;
//# sourceMappingURL=ids.js.map