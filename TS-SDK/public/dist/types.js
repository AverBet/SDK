"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaNetwork = exports.SizeFormat = exports.Side = exports.OrderType = exports.FeeTier = exports.MarketStatus = void 0;
// Note: This is called MarketState in the contract. However, it conflicts with the market state property of the market
var MarketStatus;
(function (MarketStatus) {
    MarketStatus[MarketStatus["Uninitialised"] = 0] = "Uninitialised";
    MarketStatus[MarketStatus["Initialised"] = 1] = "Initialised";
    MarketStatus[MarketStatus["ActivePreEvent"] = 2] = "ActivePreEvent";
    MarketStatus[MarketStatus["ActiveInPlay"] = 3] = "ActiveInPlay";
    MarketStatus[MarketStatus["HaltedPreEvent"] = 4] = "HaltedPreEvent";
    MarketStatus[MarketStatus["HaltedInPlay"] = 5] = "HaltedInPlay";
    MarketStatus[MarketStatus["TradingCeased"] = 6] = "TradingCeased";
    MarketStatus[MarketStatus["CeasedCrankedClosed"] = 7] = "CeasedCrankedClosed";
    MarketStatus[MarketStatus["Resolved"] = 8] = "Resolved";
    MarketStatus[MarketStatus["Voided"] = 9] = "Voided";
})(MarketStatus = exports.MarketStatus || (exports.MarketStatus = {}));
var FeeTier;
(function (FeeTier) {
    FeeTier["Base"] = "base";
    FeeTier["Aver1"] = "aver1";
    FeeTier["Aver2"] = "aver2";
    FeeTier["Aver3"] = "aver3";
    FeeTier["Aver4"] = "aver4";
    FeeTier["Aver5"] = "aver5";
    FeeTier["Free"] = "zeroFees";
})(FeeTier = exports.FeeTier || (exports.FeeTier = {}));
var OrderType;
(function (OrderType) {
    OrderType[OrderType["Limit"] = 0] = "Limit";
    OrderType[OrderType["Ioc"] = 1] = "Ioc";
    OrderType[OrderType["KillOrFill"] = 2] = "KillOrFill";
    OrderType[OrderType["PostOnly"] = 3] = "PostOnly";
})(OrderType = exports.OrderType || (exports.OrderType = {}));
var Side;
(function (Side) {
    Side[Side["Bid"] = 0] = "Bid";
    Side[Side["Ask"] = 1] = "Ask";
})(Side = exports.Side || (exports.Side = {}));
var SizeFormat;
(function (SizeFormat) {
    SizeFormat[SizeFormat["Payout"] = 0] = "Payout";
    SizeFormat[SizeFormat["Stake"] = 1] = "Stake";
})(SizeFormat = exports.SizeFormat || (exports.SizeFormat = {}));
var SolanaNetwork;
(function (SolanaNetwork) {
    SolanaNetwork["Devnet"] = "devnet";
    SolanaNetwork["Mainnet"] = "mainnet-beta";
})(SolanaNetwork = exports.SolanaNetwork || (exports.SolanaNetwork = {}));
//# sourceMappingURL=types.js.map