'use strict';

const net = require('node:net');

const bindHost = process.env.BINDERLEDGER_BIND_HOST;
const bindPort = Number(process.env.BINDERLEDGER_BIND_PORT);
const originalListen = net.Server.prototype.listen;

if (!bindHost || !Number.isInteger(bindPort) || bindPort < 1 || bindPort > 65535) {
  throw new Error('BINDERLEDGER_BIND_HOST and BINDERLEDGER_BIND_PORT must identify a listener');
}

net.Server.prototype.listen = function binderLedgerListen(...argumentsList) {
  const first = argumentsList[0];
  if (typeof first === 'object' && first !== null && Number(first.port) === bindPort) {
    argumentsList[0] = { ...first, host: bindHost };
  } else if (Number(first) === bindPort) {
    if (typeof argumentsList[1] === 'string') {
      argumentsList[1] = bindHost;
    } else {
      argumentsList.splice(1, 0, bindHost);
    }
  }
  return originalListen.apply(this, argumentsList);
};
