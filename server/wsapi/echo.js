const i_logger = require('../logger');

const api = {
   initialize: () => {
      i_logger.debug('[plugin] "echo" plugin loaded ...');
   },
   process: (ws, m, env) => {
      let obj = {};
      switch(m.cmd) {
         case 'echo':
            obj.id = m.id;
            obj.echo = m.echo;
            ws.send(JSON.stringify(obj));
            return 1;
      }
   },
};

module.exports = api;