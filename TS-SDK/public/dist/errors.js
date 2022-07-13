"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAverIdlErrors = exports.parseError = void 0;
const anchor_1 = require("@project-serum/anchor");
const parseError = (e, p) => {
    if (!p)
        return e;
    const programError = anchor_1.ProgramError.parse(e, (0, exports.getAverIdlErrors)(p));
    if (programError instanceof Error) {
        return programError;
    }
    else {
        return e;
    }
};
exports.parseError = parseError;
const getAverIdlErrors = (p) => {
    var _a, _b;
    if (!p)
        return new Map();
    return new Map((_b = (_a = p === null || p === void 0 ? void 0 : p.idl) === null || _a === void 0 ? void 0 : _a.errors) === null || _b === void 0 ? void 0 : _b.map((e) => [e.code, e.msg]));
};
exports.getAverIdlErrors = getAverIdlErrors;
// const AverProgramError = [
//   {
//     code: 6000,
//     name: 'TooManyWinners',
//     msg: 'Number of winners is greater than or equal to the number of outcomes',
//   },
//   {
//     code: 6001,
//     name: 'InvalidQuoteTokenMint',
//     msg: 'ATA has an invalid quote token mint',
//   },
//   {
//     code: 6002,
//     name: 'UncollectedFees',
//     msg: 'Fees need to be swept before closing the market',
//   },
//   {
//     code: 6003,
//     name: 'InvalidAccountOwner',
//     msg: 'Account owner is not as expected',
//   },
//   {
//     code: 6004,
//     name: 'MarketVaultNotEmpty',
//     msg: 'Market vault needs to be empty to close the market',
//   },
//   {
//     code: 6005,
//     name: 'InvalidWinningOutcome',
//     msg: 'Failed to get valid winning outcome from oracle',
//   },
//   {
//     code: 6006,
//     name: 'MarketStoreOrderbookAccountsError',
//     msg: 'Orderbook accounts already exist for this outcome',
//   },
//   {
//     code: 6007,
//     name: 'InvalidAverQuoteATA',
//     msg: 'Invalid Aver quote token account provided',
//   },
//   {
//     code: 6008,
//     name: 'IncorrectNumberOfOutcomes',
//     msg: 'Number of outcomes must at least be 2 or greater',
//   },
//   {
//     code: 6009,
//     name: 'InvalidAccountLength',
//     msg: 'Account length not as expected',
//   },
//   {
//     code: 6010,
//     name: 'InvalidMarketAuthority',
//     msg: 'Market authority is not as expected',
//   },
//   {
//     code: 6011,
//     name: 'InvalidThirdPartyTokenVault',
//     msg: 'Third party token vault is not as expected',
//   },
//   {
//     code: 6012,
//     name: 'InvalidUserAuthority',
//     msg: 'User authority is not as expected',
//   },
//   {
//     code: 6013,
//     name: 'InvalidVaultAccount',
//     msg: 'Vault address is not as expected for pda and token',
//   },
//   {
//     code: 6014,
//     name: 'InvalidSweepAuthority',
//     msg: 'Invalid sweep authority',
//   },
//   {
//     code: 6015,
//     name: 'InvalidMarketStatus',
//     msg: 'Market status is invalid for operation',
//   },
//   {
//     code: 6016,
//     name: 'MarketNotInPlay',
//     msg: 'Market does not allow for going in-play',
//   },
//   {
//     code: 6017,
//     name: 'MaxWinnersExceeded',
//     msg: 'Max possible number of winners exceeded',
//   },
//   {
//     code: 6018,
//     name: 'MaxOutcomesExceeded',
//     msg: 'Max possible number of outcomes exceeded',
//   },
//   {
//     code: 6019,
//     name: 'TradeSizeTooLow',
//     msg: 'Trade size below minimum amount allowed',
//   },
//   {
//     code: 6020,
//     name: 'CreateMarketAOBError',
//     msg: 'There was an error when creating an orderbook/market on the aob',
//   },
//   {
//     code: 6021,
//     name: 'PlaceOrderAOBError',
//     msg: 'There was an error when trying to place an order on the aob',
//   },
//   {
//     code: 6022,
//     name: 'CancelOrderAOBError',
//     msg: 'There was an error when trying to cancel an order on the aob',
//   },
//   {
//     code: 6023,
//     name: 'ConsumeEventsAOBError',
//     msg: 'There was an error when consuming events on the aob',
//   },
//   {
//     code: 6024,
//     name: 'InsufficientFunds',
//     msg: 'Payer has insufficient funds',
//   },
//   {
//     code: 6025,
//     name: 'FailedToInitTokenBalances',
//     msg: 'Failed to init token balances',
//   },
//   {
//     code: 6026,
//     name: 'InvalidOrderIndex',
//     msg: 'The given order index is invalid.',
//   },
//   {
//     code: 6027,
//     name: 'InvalidOutcomeIndex',
//     msg: 'The given outcome token index is invalid.',
//   },
//   {
//     code: 6028,
//     name: 'UserAccountFull',
//     msg: 'The user account has reached its maximum capacity for open orders.',
//   },
//   {
//     code: 6029,
//     name: 'OrderNotFound',
//     msg: 'The specified order has not been found.',
//   },
//   {
//     code: 6030,
//     name: 'NotEnoughFreeOutcomePositions',
//     msg: 'Not enough free outcome tokens to lock outcome position.',
//   },
//   {
//     code: 6031,
//     name: 'NotEnoughLockedOutcomePositions',
//     msg: 'Not enough locked outcome tokens to lock outcome position.',
//   },
//   {
//     code: 6032,
//     name: 'IncorrectAverMarketInUserMarket',
//     msg: 'Aver Market is not as expected when placing order',
//   },
//   {
//     code: 6033,
//     name: 'IncorrectPDA',
//     msg: 'Incorrect PDA',
//   },
//   {
//     code: 6034,
//     name: 'TransactionAborted',
//     msg: 'The transaction has been aborted',
//   },
//   {
//     code: 6035,
//     name: 'VaultAmountNotCorrect',
//     msg: 'The amount in the Quote Token Vault account is not as expected',
//   },
//   {
//     code: 6036,
//     name: 'WithdrawAmountTooHigh',
//     msg: 'The amount that is being withdrawn is too high.',
//   },
//   {
//     code: 6037,
//     name: 'SerumAccountsDontMatchForOutcome',
//     msg: "Serum accounts don't match for the outcome id provided.",
//   },
//   {
//     code: 6038,
//     name: 'SerumAccountsIncorrectlyRelated',
//     msg: 'Serum accounts not correctly related to each other.',
//   },
//   {
//     code: 6039,
//     name: 'OutcomePositionAmountError',
//     msg: 'Free outcome positions error after user process',
//   },
//   {
//     code: 6040,
//     name: 'NoOp',
//     msg: 'The operation is a no-op',
//   },
//   {
//     code: 6041,
//     name: 'MarketUMAsNeedSettlement',
//     msg: 'UMAs remain for this market, need to settle',
//   },
//   {
//     code: 6042,
//     name: 'OutcomeOutsideOutcomeSpace',
//     msg: 'Given outcome is outside the outcome space for this market',
//   },
//   {
//     code: 6043,
//     name: 'IncorrectOrderTypeForMarketOrder',
//     msg: 'Market order type needs to be IOC or KOF',
//   },
//   {
//     code: 6044,
//     name: 'DuplicateOrderbooksError',
//     msg: 'There are duplicating AOB instances for this market',
//   },
//   {
//     code: 6045,
//     name: 'InPlayStartTimeInThePast',
//     msg: 'In-play start time given is in the past',
//   },
//   {
//     code: 6046,
//     name: 'TradingCeaseTimeInThePast',
//     msg: 'Trading cease time given is in the past',
//   },
//   {
//     code: 6047,
//     name: 'NoOracleForMarket',
//     msg: 'Market has no set oracle feed',
//   },
//   {
//     code: 6048,
//     name: 'EventQueueZero',
//     msg: 'Event queue header count is zero',
//   },
//   {
//     code: 6049,
//     name: 'ReferrerAccountError',
//     msg: 'Referrer account provided is not as expected',
//   },
//   {
//     code: 6050,
//     name: 'MissingUserAccount',
//     msg: 'A required user account is missing.',
//   },
//   {
//     code: 6051,
//     name: 'BaseSizeTooSmall',
//     msg: 'The base order size is too small.',
//   },
//   {
//     code: 6052,
//     name: 'QuoteSizeTooSmall',
//     msg: 'The quote order size is too small.',
//   },
//   {
//     code: 6053,
//     name: 'InvalidOrderIdForIndex',
//     msg: 'Order id does not match with the order at the given index!',
//   },
//   {
//     code: 6054,
//     name: 'InvalidOutcomeIdForIndex',
//     msg: 'Outcome id does not match with the order at the given index!',
//   },
//   {
//     code: 6055,
//     name: 'MakerTakerRateIssue',
//     msg: 'Min taker fee has to be greater than max maker rebate',
//   },
//   {
//     code: 6056,
//     name: 'IncorrectMarketBalancesAfterConsumeEvents',
//     msg: 'Incorrect market balances after consume events',
//   },
//   {
//     code: 6057,
//     name: 'CloseMarketAOBError',
//     msg: 'There was an error when trying to close AOB accounts',
//   },
//   {
//     code: 6058,
//     name: 'UserAccountStillActive',
//     msg: 'The user account cannot be closed as it has pending orders or unsettled funds.',
//   },
//   {
//     code: 6059,
//     name: 'OrdersPendingForOutcome',
//     msg: 'Cannot neutralize outcome position as UMA still has pending orders for outcome_id',
//   },
//   {
//     code: 6060,
//     name: 'UserMustCollectWinnings',
//     msg: 'User must collect winnings',
//   },
//   {
//     code: 6061,
//     name: 'UserMustCollectAvailableDeposits',
//     msg: 'User must collect free outcome positions',
//   },
//   {
//     code: 6062,
//     name: 'IncorrectOutcomeNames',
//     msg: 'Error in outcome names',
//   },
//   {
//     code: 6063,
//     name: 'FreeOutcomePositionsRemain',
//     msg: 'Free outcome positions remain in the UMA.',
//   },
//   {
//     code: 6064,
//     name: 'UserHasNoWinnings',
//     msg: 'User market has no winnings to collect.',
//   },
//   {
//     code: 6065,
//     name: 'EventQueueNotEmpty',
//     msg: 'Event queue must be empty in order to close serum accounts.',
//   },
//   {
//     code: 6066,
//     name: 'InvalidAutoCollectClose',
//     msg: 'User account did not have auto collect or auto close set true.',
//   },
//   {
//     code: 6067,
//     name: 'InvalidUMAConfiguration',
//     msg: 'User market account has invalid configurations',
//   },
//   {
//     code: 6068,
//     name: 'UserPermissioningError',
//     msg: 'Something went wrong with user permissioning',
//   },
//   {
//     code: 6069,
//     name: 'QuoteTokenLimitExceeded',
//     msg: 'Permissioned quote token limit exceeded',
//   },
//   {
//     code: 6070,
//     name: 'LimitPriceError',
//     msg: 'Limit price too high for market decimals',
//   },
//   {
//     code: 6071,
//     name: 'SideError',
//     msg: 'Side error',
//   },
//   {
//     code: 6072,
//     name: 'PriceError',
//     msg: 'If buy: price must be stricly greater than zero, sell: price striclty less than 1',
//   },
// ]
//# sourceMappingURL=errors.js.map