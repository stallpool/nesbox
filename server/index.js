const i_utils = require('./utils');
const i_ws = require('./websocket');
const i_api = require('./api');

const server = i_utils.WebServer.create(
   { api: i_api, }, { httpsDir: process.env.NESBOX_HTTPS }
);

i_ws.init(server, '/ws');
i_ws.init_plugins();

const server_port = parseInt(process.env.NESBOX_PORT || 20203);
const server_host = process.env.NESBOX_HOST || '127.0.0.1';

const _ = server.listen(server_port, server_host, () => {
   console.log(`NES Box is listening at ${server_host}:${server_port}`);
})
