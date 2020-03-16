'use strict';

(function () {

const idInc = { id: 0 };
function generate_id() {
   idInc.id ++;
   return idInc.id;
}

function nesboxWsClientOnline(client, fn_list) {
   client.online = true;
   fn_list.forEach(function (fn) {
      fn && fn(client);
   });
}

function nesboxWsClientOffline(client, fn_list) {
   client.online = false;
   fn_list.forEach(function (fn) {
      fn && fn(client);
   });
}

function NesBoxWsClient(url, room) {
   if (url.indexOf('://') < 0) {
      url = (location.protocol === 'http:'?'ws://':'wss://') + location.host + url;
   }
   this.url = url;
   this.online = false;
   this._onClientOnline = [];
   this._onClientOffline = [];
   this._onMessage = {};
   this._onRoomMessage = null;
   this.bindRoom(room);

   var _this = this;
   this.event = {
      open: function (evt) {
         console.log('open', evt);
         nesboxWsClientOnline(_this, _this._onClientOnline);
      },
      close: function (evt) {
         // evt.wasClean, evt.code
         // normal: true,  1005; server side close
         // crash:  false, 1006; server side crash
         console.log('close', evt);
         _this._cleanup();
         nesboxWsClientOffline(_this, _this._onClientOffline);
      },
      error: function (evt) {
         // server refused:
         // - new WebSocket --> console.error
         // - error
         // - close (false, 1006)
         console.log('error', evt);
         _this._cleanup();
         nesboxWsClientOffline(_this, _this._onClientOffline);
      },
      message: function (evt) {
         console.log('message', evt);
         var json = null;
         try {
            json = JSON.parse(evt.data);
         } catch(err) {
            // TODO: error + cleanup
            return;
         }
         if (json.error || json.code) {
            // TODO: error + cleanup
            nesboxWsClientOffline(_this, _this._onClientOffline);
            return;
         }
         var id = json.id;
         var timestamp = new Date().getTime();
         var fnObj = _this._onMessage[id];
         var stat = fnObj && fnObj.act && fnObj.act(json);
         if (stat) {
            fnObj.timestamp = timestamp;
         } else {
            delete _this._onMessage[id];
         }

         if (_this._onRoomMessage) {
            _this._onRoomMessage(json);
         }

         // clean up fnObj
         Object.keys(_this._onMessage).forEach(function (id) {
            var fnObj = _this._onMessage[id];
            if (!fnObj) return;
            if (timestamp - fnObj.timestamp > 1000 * 60 * 5) {
               delete _this._onMessage[id];
            }
         });
      }
   };
   this._client = null;
   this.connect();
}
NesBoxWsClient.prototype = {
   _cleanup: function () {
      this.online = false;
      this._client.removeEventListener('open', this.event.open);
      this._client.removeEventListener('close', this.event.close);
      this._client.removeEventListener('error', this.event.error);
      this._client.removeEventListener('message', this.event.message);
   },
   getReadyState: function () {
      return this._client.readyState;
   },
   bindRoom: function (room) {
      this._room = room;
   },
   connect: function (room) {
      this.bindRoom(room);
      this._client = new WebSocket(this.url);
      this._client.addEventListener('open', this.event.open);
      this._client.addEventListener('close', this.event.close);
      this._client.addEventListener('error', this.event.error);
      this._client.addEventListener('message', this.event.message);
   },
   disconnect: function () {
      if (!this._client) return;
      this._client.close();
   },
   dispose: function () {
      this.disconnect();
   },
   isOnline: function () {
      return this.online;
   },
   request: function (data, fn) {
      if (!this._client) return null;
      if (!this.isOnline()) return null;
      var id = generate_id();
      var obj = Object.assign({ id: id }, data);
      if (fn) this._onMessage[id] = {
         timestamp: new Date().getTime(),
         act: fn
      };
      this._client.send(JSON.stringify(obj));
      return id;
   },
   onRoomMessage: function (fn) {
      this._onRoomMessage = fn;
   },
   onOnline: function(fn) {
      if (this._onClientOnline.indexOf(fn) >= 0) return;
      this._onClientOnline.push(fn);
   },
   onOffline: function (fn) {
      if (this._onClientOffline.indexOf(fn) >= 0) return;
      this._onClientOffline.push(fn);
   },
   waitForConnected: function (timeout) {
      var _this = this;
      return new Promise(function (r, e) {
         var isTimeout = false;
         setTimeout(function () {
            isTimeout = true;
         }, timeout);
         wait();
         function wait() {
            if (isTimeout) return e();
            if (_this._client.readyState === WebSocket.OPEN) return r();
            setTimeout(wait);
         }
      });
   }
};

if (!window.nesbox) window.nesbox = {};
window.nesbox.WebsocketClient = NesBoxWsClient;

})();
