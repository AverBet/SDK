"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAverIdlErrors = exports.parseError = void 0;
const anchor_1 = require("@project-serum/anchor");
const parseError = (e, p) => {
    console.log("ERROR", e.toString());
    console.log("Errors", (0, exports.getAverIdlErrors)(p));
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
    var _a;
    if (!p.idl.errors)
        return new Map();
    return new Map((_a = p.idl.errors) === null || _a === void 0 ? void 0 : _a.map((e) => [e.code, e.msg]));
};
exports.getAverIdlErrors = getAverIdlErrors;
//# sourceMappingURL=errors.js.map