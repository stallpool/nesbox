const i_fs = require('fs');
const i_path = require('path');

const i_ws = require('ws');
const i_logger = require('./logger');

const system = {
   processor: [],
};

function process_cmd(ws, m, env, type) {
   for (let i = 0, n = system.processor.length; i < n; i++) {
      let processor = system.processor[i];
      let r = processor(ws, m, env, type);
      if (r) return r;
   }
}

const api = {
   send_error: (ws, code, text) => {
      ws.send(JSON.stringify({error: text, code: code}));
   },
   send: (ws, json) => {
      ws.send(JSON.stringify(json));
   },
   start_query: (ws, query, env) => {},
   stop_query: (ws, query, env) => {}
};

const service = {
   server: null,
   init: (server, path) => {
      service.server = new i_ws.Server({ server, path });
      service.server.on('connection', service.client);
   },
   init_plugins: () => {
      i_logger.log('initialize plugins ...');
      let base = i_path.join(
         i_path.resolve(i_path.dirname(process.argv[1])),
         'wsapi'
      );
      let files = i_fs.readdirSync(base);
      let count = 0;
      files.forEach((x) => {
         let filename = i_path.join(base, x);
         let stat = i_fs.statSync(filename);
         if (!stat.isFile()) return;
         let extname = i_path.extname(x);
         if (extname !== '.js') return;
         x = x.substring(0, x.length - extname.length);
         let plugin = require('./wsapi/' + x);
         if (!plugin.process) {
            delete require.cache[require.resolve(filename)];
            return;
         }
         if (plugin.initialize) plugin.initialize();
         service.register(plugin.process);
         count ++;
         i_logger.log(`[plugin] ${filename}`);
      });
      i_logger.log(`[plugin: count=${count}]`);
   },
   register: (fn) => {
      if (system.processor.indexOf(fn) >= 0) return false;
      system.processor.push(fn);
      return true;
   },
   unregister: (fn) => {
      let index = system.processor.indexOf(fn);
      if (index < 0) return false;
      system.processor.splice(index, 1);
      return true;
   },
   client: (ws, req) => {
      let env = {
         authenticated: false,
         username: null,
         uuid: null,
         query: null,
         query_tasks: []
      };
      ws.on('message', (m) => {
         try {
            m = JSON.parse(m);
         } catch(e) {
            api.send_error(ws, 400, 'Bad Request');
            return;
         }
         process_cmd(ws, m, env, 'message');
      });
      ws.on('close', () => {
         process_cmd(ws, {}, env, 'close');
      });
      ws.on('error', (error) => {
         process_cmd(ws, { error }, env, 'error');
      });
   }
};

module.exports = service;
