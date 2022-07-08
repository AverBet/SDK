"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBestDiscountToken = exports.roundPriceToNearestTickSize = exports.calculateTickSizeForPrice = exports.chunkAndFetchMultiple = exports.throwIfNull = exports.signAndSendTransactionInstructions = void 0;
const anchor_1 = require("@project-serum/anchor");
const web3_js_1 = require("@solana/web3.js");
const lodash_1 = require("lodash");
const errors_1 = require("./errors");
const ids_1 = require("./ids");
const signAndSendTransactionInstructions = async (
// sign and send transaction
connection, signers, feePayer, txInstructions, sendOptions, manualMaxRetry) => {
    const tx = new web3_js_1.Transaction();
    tx.feePayer = feePayer.publicKey;
    signers.push(feePayer);
    tx.add(...txInstructions);
    let attempts = 0;
    let errorThrown = new Error('Transaction failed');
    while (attempts <= (manualMaxRetry || 0)) {
        try {
            return await connection.sendTransaction(tx, signers, sendOptions);
        }
        catch (e) {
            errorThrown = (0, errors_1.parseError)(e);
            // if its a program error, throw it
            if (errorThrown instanceof anchor_1.ProgramError) {
                break;
                // otherwise try again
            }
            else {
                attempts += 1;
            }
        }
    }
    throw errorThrown;
};
exports.signAndSendTransactionInstructions = signAndSendTransactionInstructions;
function throwIfNull(value, message = 'account not found') {
    if (value === null) {
        throw new Error(message);
    }
    return value;
}
exports.throwIfNull = throwIfNull;
// TODO remove generic return type and fix associated TS errors elsewhere
const chunkAndFetchMultiple = async (connection, pubkeys) => {
    const res = await Promise.all((0, lodash_1.chunk)(pubkeys, 100).map((pubkeyChunk) => connection.getMultipleAccountsInfo(pubkeyChunk))).then((responses) => responses.flat());
    return res;
};
exports.chunkAndFetchMultiple = chunkAndFetchMultiple;
/**
 * Returns the tick size interval for the given limit price
 * @param limitPrice 1000 < limitPrice <= 990000 where limit price is in 6dp
 * @returns tick size for the given price
 */
const calculateTickSizeForPrice = (limitPrice) => {
    switch (true) {
        case limitPrice < 1000:
            throw new Error('Limit price too low');
        case limitPrice <= 2000:
            return 100;
        case limitPrice <= 5000:
            return 250;
        case limitPrice <= 10000:
            return 500;
        case limitPrice <= 20000:
            return 1000;
        case limitPrice <= 50000:
            return 2500;
        case limitPrice <= 100000:
            return 5000;
        case limitPrice <= 999000:
            return 10000;
        case limitPrice > 999000:
            throw new Error('Limit price too high');
        default:
            return limitPrice;
    }
};
exports.calculateTickSizeForPrice = calculateTickSizeForPrice;
const roundPriceToNearestTickSize = (limitPrice, isBinary) => {
    const factor = Math.pow(10, 6);
    const limitPriceTo6dp = limitPrice * factor;
    // binary markets tick size is mirrored on both sides due to there only being one orderbook
    const tickSize = (0, exports.calculateTickSizeForPrice)(isBinary ? factor - limitPriceTo6dp : limitPriceTo6dp);
    const roundedLimitPriceTo6dp = Math.round(limitPriceTo6dp / tickSize) * tickSize;
    const finalLimitPrice = roundedLimitPriceTo6dp / factor;
    return finalLimitPrice;
};
exports.roundPriceToNearestTickSize = roundPriceToNearestTickSize;
const getBestDiscountToken = async (averClient, owner) => {
    const zeroFeesToken = (0, ids_1.getAverLaunchZeroFeesToken)(averClient.solanaNetwork);
    const averToken = ids_1.AVER_TOKEN;
    const zeroFeesTokenAccount = await averClient.connection.getParsedTokenAccountsByOwner(owner, {
        mint: zeroFeesToken,
    });
    if (zeroFeesTokenAccount.value.length > 0 &&
        zeroFeesTokenAccount.value[0].account.data.parsed.info.tokenAmount.uiAmount > 0) {
        return zeroFeesTokenAccount.value[0].pubkey;
    }
    const communityRewardsTokenAccount = await averClient.connection.getParsedTokenAccountsByOwner(owner, {
        mint: ids_1.AVER_COMMUNITY_REWARDS_NFT,
    });
    if (communityRewardsTokenAccount.value.length > 0 &&
        communityRewardsTokenAccount.value[0].account.data.parsed.info.tokenAmount.uiAmount > 0) {
        return communityRewardsTokenAccount.value[0].pubkey;
    }
    const averTokenAccount = await averClient.connection.getParsedTokenAccountsByOwner(owner, {
        mint: averToken,
    });
    if (averTokenAccount.value.length > 0 &&
        averTokenAccount.value[0].account.data.parsed.info.tokenAmount.uiAmount > 0) {
        return averTokenAccount.value[0].pubkey;
    }
    return web3_js_1.SystemProgram.programId;
};
exports.getBestDiscountToken = getBestDiscountToken;
//# sourceMappingURL=utils.js.map