const Promise = require("bluebird");
const Client = require("lightrpc");

Promise.promisifyAll(Client.prototype);
const address = process.env.STEEMD_URL || "https://api.steemit.com";
const client = new Client(address, { timeout: 10000 });

module.exports = client;
