"use strict";
const P = require('pino').default || require('pino');
module.exports = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
module.exports.default = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
Object.defineProperty(module.exports, '__esModule', { value: true });