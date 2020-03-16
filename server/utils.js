const i_fs = require('fs');
const i_path = require('path');
const i_http = require('http');
const i_url = require('url');
const i_auth = require('./auth');
const i_env = require('./env');

const WebServer = {
   create: (router, options) => {
      if (!options) options = {};
      let server = null;
      router = Object.assign(router, WebServer.router_base);
      if (options.httpsDir) {
         const i_https = require('https');
         // openssl req -newkey rsa:2048 -new -nodes -x509 -days 365 -keyout ca.key -out ca.crt
         // NESBOX_HTTPS=./
         const https_config = {
            key: i_fs.readFileSync(i_path.join(options.httpsDir, 'ca.key')),
            cert: i_fs.readFileSync(i_path.join(options.httpsDir, 'ca.crt')),
         };
         server = i_https.createServer(https_config, (req, res) => {
            WebServer.route(req, res, router);
         });
      } else {
         server = i_http.createServer((req, res) => {
            WebServer.route(req, res, router);
         });
      }
      return server;
   },
   route: (req, res, router) => {
      let r = i_url.parse(req.url);
      let f = router;
      let origin_path = r.pathname.split('/');
      let path = origin_path.slice();
      let query = {};
      r.query && r.query.split('&').forEach((one) => {
         let key, val;
         let i = one.indexOf('=');
         if (i < 0) {
            key = one;
            val = '';
         } else {
            key = one.substring(0, i);
            val = one.substring(i+1);
         }
         if (key in query) {
            if(Array.isArray(query[key])) {
               query[key].push(val);
            } else {
               query[key] = [query[key], val];
            }
         } else {
            query[key] = val;
         }
      });
      path.shift();
      while (path.length > 0) {
         let key = path.shift();
         f = f[key];
         if (!f) break;
         if (typeof(f) === 'function') {
            return f(req, res, {
               path: path,
               query: query
            });
         }
      }
      WebServer.debug.serve_static(
         res, i_path.join(i_env.base, '..', 'client'), origin_path
      ) || router.code(req, res, 404, 'Not Found');
   },
   router_base: {
      test: (req, res, options) => {
         res.end('hello');
      },
      code: (req, res, code, text) => {
         res.writeHead(code || 404, text || '');
         res.end();
      }
   },
   debug: {
      static_cache: {
         max_size: 128 * 1024 * 1024, /* 128 MB */
         size: 0,
         pool: null
      },
      serve_static: (res, base, path) => {
         if (!i_env.debug) return false;
         if (path.indexOf('..') >= 0) return false;
         path = path.slice(1);
         if (!path.join('')) path = ['index.html'];
         let cache = WebServer.debug.static_cache;
         if (!cache.pool) cache.pool = {};
         path = path.map((x) => decodeURIComponent(x));
         let filename = i_path.join(base, ...path);
         let mimetype = Mime.lookup(filename);
         if (mimetype !== Mime._default) {
            res.setHeader('Content-Type', mimetype);
         }
         let buf = cache.pool[filename], state;
         if (buf) {
            if (!i_fs.existsSync(filename)) {
               delete buf[filename];
               return false;
            }
            state = i_fs.statSync(filename);
            if (buf.mtime === state.mtimeMs) {
               buf = buf.raw;
            } else {
               buf.mtime = state.mtimeMs;
               buf.raw = i_fs.readFileSync(filename);
               buf = buf.raw;
            }
         } else {
            if (!i_fs.existsSync(filename)) {
               return false;
            }
            buf = i_fs.readFileSync(filename);
            state = i_fs.statSync(filename);
            cache.pool[filename] = {
               mtime: state.mtimeMs,
               raw: buf
            };
            cache.size += buf.length + filename.length;
            while (cache.size > cache.max_size) {
               let keys = Object.keys(cache.pool);
               let key = keys[~~(Math.random() * keys.length)];
               let val = cache.pool[key];
               if (!key || !val) return false; // should not be
               delete cache.pool[key];
               cache.size -= val.raw.length + key.length;
            }
         }
         res.write(buf);
         res.end();
         return true;
      }
   }
};

const Storage = {
   list_directories: (dir) => {
      dir = i_path.resolve(dir);
      return i_fs.readdirSync(dir).filter((name) => {
         let subdir = i_path.join(dir, name);
         let state = i_fs.lstatSync(subdir);
         return state.isDirectory();
      });
   },
   list_files: (dir) => {
      dir = i_path.resolve(dir);
      let queue = [dir], list = [];
      while (queue.length > 0) {
         list_dir(queue.shift(), queue, list);
      }
      return list;

      function list_dir(dir, queue, list) {
         i_fs.readdirSync(dir).forEach((name) => {
            let filename = i_path.join(dir, name);
            let state = i_fs.lstatSync(filename);
            if (state.isDirectory()) {
               queue.push(filename);
            } else {
               list.push(filename);
            }
         });
      }
   },
   list_files_without_nest: (dir) => {
      let list = [];
      dir = i_path.resolve(dir);
      if (!i_fs.existsSync(dir)) return [];
      i_fs.readdirSync(dir).forEach((name) => {
         let filename = i_path.join(dir, name);
         let state = i_fs.lstatSync(filename);
         if (state.isDirectory()) {
            list.push(name + '/');
         } else {
            list.push(name);
         }
      });
      return list;
   },
   make_directory: (dir) => {
      dir = i_path.resolve(dir);
      let parent_dir = i_path.dirname(dir);
      let state = true;
      if (dir !== parent_dir) {
         if (!i_fs.existsSync(parent_dir)) {
            state = Storage.make_directory(parent_dir);
         } else {
            if (!i_fs.lstatSync(parent_dir).isDirectory()) {
               state = false;
            }
         }
         if (!state) {
            return null;
         }
      }
      if (!i_fs.existsSync(dir)) {
         i_fs.mkdirSync(dir);
         return dir;
      } else if (!i_fs.lstatSync(dir).isDirectory()) {
         return null;
      } else {
         return dir;
      }
   },
   remove_directory: (dir, work_dir) => {
      if (work_dir) {
         if (dir.length < work_dir.length) {
            return false;
         }
         if (dir.indexOf(work_dir) !== 0) {
            return false;
         }
      }
      if (!i_fs.existsSync(dir)) {
         return false;
      }
      i_fs.readdirSync(dir).forEach(function(file, index){
         var curPath = i_path.join(dir, file);
         if (i_fs.lstatSync(curPath).isDirectory()) {
            // recurse
            Storage.remove_directory(curPath, work_dir);
         } else { // delete file
            i_fs.unlinkSync(curPath);
         }
      });
      i_fs.rmdirSync(dir);
      return true;
   },
   read_file: (filename) => {
      return i_fs.readFileSync(filename);
   }
};

const Mime = {
   '.html': 'text/html',
   '.css': 'text/css',
   '.js': 'text/javascript',
   '.svg': 'image/svg+xml',
   '.json': 'application/json',
   _default: 'text/plain',
   lookup: (filename) => {
      let ext = i_path.extname(filename);
      if (!ext) return Mime._default;
      let content_type = Mime[ext];
      if (!content_type) content_type = Mime._default;
      return content_type;
   }
};

const Database = {};

const Web = {
   check_admin: (username) => {
      return i_env.admins.indexOf(username) >= 0;
   },
   require_json: (fn /*req, res, options{json}*/) => {
      return (req, res, options) => {
         Web.read_request_json(req).then(
            (json) => {
               options.json = json;
               return fn(req, res, options);
            },
            () => Web.e400(res)
         );
      }
   },
   require_login: (fn /*req, res, options{json}*/) => {
      // TODO: man-in-the-middle attack issue
      return (req, res, options) => {
         Web.read_request_json(req).then(
            (json) => {
               if (!i_auth.check_login(json.username, json.uuid)) return Web.e401(res);
               options.json = json;
               return fn(req, res, options);
            },
            () => Web.e400(res)
         );
      };
   },
   require_admin_login: (fn /*req, res, options{json}*/) => {
      // TODO: man-in-the-middle attack issue
      return (req, res, options) => {
         Web.read_request_json(req).then(
            (json) => {
               if (!i_auth.check_login(json.username, json.uuid)) return Web.e401(res);
               if (!Web.check_admin(json.username)) return Web.e401(res);
               options.json = json;
               return fn(req, res, options);
            },
            () => Web.e400(res)
         );
      };
   },
   require_json_batch: (group) => {
      Object.keys(group).forEach((name) => {
         if (!group[name]) return;
         switch(typeof(group[name])) {
            case 'function':
            group[name] = Web.require_json(group[name]);
            break;
            case 'object':
            Web.require_json_batch(group[name]);
            break;
         }
      });
   },
   require_login_batch: (group) => {
      Object.keys(group).forEach((name) => {
         if (!group[name]) return;
         switch(typeof(group[name])) {
            case 'function':
            group[name] = Web.require_login(group[name]);
            break;
            case 'object':
            Web.require_login_batch(group[name]);
            break;
         }
      });
   },
   require_admin_login_batch: (group) => {
      Object.keys(group).forEach((name) => {
         if (!group[name]) return;
         switch(typeof(group[name])) {
            case 'function':
            group[name] = Web.require_admin_login(group[name]);
            break;
            case 'object':
            Web.require_admin_login_batch(group[name]);
            break;
         }
      });
   },
   get_request_ip: (req) => {
      let ip = null;
      if (req.headers['x-forwarded-for']) {
         ip = req.headers['x-forwarded-for'].split(",")[0];
      } else if (req.connection && req.connection.remoteAddress) {
         ip = req.connection.remoteAddress;
      } else {
         ip = req.ip;
      }
      return ip;
   },
   read_request_binary: (req) => {
      return new Promise((resolve, reject) => {
         let body = [];
         req.on('data', (chunk) => { body.push(chunk); });
         req.on('end', () => {
            body = Buffer.concat(body);
            resolve(body);
         });
         req.on('error', reject);
      });
   },
   read_request_json: (req) => {
      return new Promise((resolve, reject) => {
         Web.read_request_binary(req).then((buf) => {
            try {
               body = JSON.parse(buf.toString());
               resolve(body);
            } catch(e) {
               reject(e);
            }
         }, reject);
      });
   },
   rjson: (res, json) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(json?JSON.stringify(json):'{}');
   },
   r200: (res, text) => {
      res.writeHead(200, text || null);
      res.end();
   },
   e400: (res, text) => {
      res.writeHead(400, text || 'Bad Request');
      res.end();
   },
   e401: (res, text) => {
      res.writeHead(401, text || 'Not Authenticated');
      res.end();
   },
   e403: (res, text) => {
      res.writeHead(403, text || 'Forbbiden');
      res.end();
   },
   e404: (res, text) => {
      res.writeHead(404, text || 'Not Found');
      res.end();
   },
   e405: (res, text) => {
      res.writeHead(405, text || 'Not Allowed');
      res.end();
   }
};

const Functools = {
   attribute: (obj, keychain, bydefault) => {
      // keychain: e.g. .test.hello.world
      if (!bydefault) bydefault = null;
      let cur = obj;
      let keys = keychain.split('.');
      for (let i = 0, n = keys.length; i < n; i++) {
         let key = keys[i];
         if (!cur[key]) return bydefault;
         cur = cur[key];
      }
      return cur;
   },
   delay: (fn, duration) => {
      var timer = null;
      return (...args) => {
         if (timer) {
            clearTimeout(timer);
            timer = null;
         }
         timer = setTimeout(fn, duration, ...args);
      };
   }
};

const Codec = {
   base64: {
      encode: (plain) => Buffer.from(plain).toString('base64'),
      decode: (crypt) => Buffer.from(crypt, 'base64').toString('utf-8')
   }
}

const List = {
   last: (list, n) => list[list.length-(n || 1)],
   contains: (list, val, key_fn) => {
      if (key_fn)
         return list.map((x) => key_fn(x)).indexOf(val) >= 0;
      else
         return list.indexOf(val) >= 0;
   },
   random_pick: (list) => list[~~(list.length*Math.random())],
   unique_push: (list, val, key_fn) => {
      if (key_fn) {
         if (list.map((x) => key_fn(x)).indexOf(key_fn(val)) < 0) {
            list.push(val);
            return true;
         }
         return false;
      } else {
         if (list.indexOf(val) < 0) {
            list.push(val);
            return true;
         }
         return false;
      }
   },
   unique_push_or_update: (list, val, key_fn, update_fn) => {
      if (key_fn) {
         let index = list.map((x) => key_fn(x)).indexOf(key_fn(val));
         if (index < 0) {
            list.push(val);
            return true;
         }
         update_fn && update_fn(list[index], val);
         return false;
      } else {
         if (list.indexOf(val) < 0) {
            list.push(val);
            return true;
         }
         return false;
      }
   },
   unique: (list, key_fn) => {
      let map = {};
      let r = [];
      if (key_fn) {
         return list.filter((x) => {
            let key = key_fn(x);
            if (key in map) return false;
            map[key] = 1;
            return true;
         });
      } else {
         return list.filter((x) => {
            if (x in map) return false;
            map[x] = 1;
            return true;
         })
      }
   },
   sorted_merge: (lists, w_fn, reversed) => {
      let indexes = [];
      let merged = [];
      let i, k, n, change;
      n = lists.length;
      reversed = !!reversed;
      for (i = 0; i < n; i++) {
         if (lists[i].length) {
            indexes.push(0);
         } else {
            indexes.push(-1);
         }
      }
      change = true;
      while (change) {
         change = false;
         k = 0;
         for (i = 1; i < n; i++) {
            if (indexes[i] < 0) continue;
            if (indexes[k] < 0) {
               k = i;
               continue;
            }
            if (w_fn(lists[i][indexes[i]]) < w_fn(lists[k][indexes[k]])) {
               k = i;
            }
         }
         if (indexes[k] >= 0) {
            change = true;
            merged.push(lists[k][indexes[k]]);
            if (indexes[k] >= lists[k].length-1) indexes[k] = -1; else indexes[k] ++;
         }
      }
      if (reversed) merged = merged.reverse();
      return merged;
   },
};

module.exports = {
   WebServer,
   Storage,
   Mime,
   Database,
   Web,
   Functools,
   Codec,
   List,
};
