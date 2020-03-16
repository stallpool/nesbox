const i_env = require('./env');

const api = {
   debug: (...args) => {
      if (!i_env.debug) return;
      process.stdout.write(`[${new Date().toISOString()}] `);
      console.debug(...args);
   },
   log: (...args) => {
      process.stdout.write(`[${new Date().toISOString()}] `);
      console.log(...args);
   }
};

module.exports = api;