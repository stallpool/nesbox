const i_fs = require('fs');
const i_path = require('path');
const i_uuid = require('uuid');
const i_logger = require('../logger');

const api = {
   rooms: {},
   initialize: () => {
      i_logger.debug('[plugin] "nesroom" plugin loaded ...');
   },
   process: (ws, m, env) => {
      let obj = {}, room_obj, i;
      switch(m.cmd) {
         case 'nes.game':
            obj.id = m.id;
            i = i_path.resolve(__dirname);
            i = i_path.join(i, '..', '..', 'client', 'rom');
            obj.games = i_fs.readdirSync(i);
            ws.send(JSON.stringify(obj));
            return 1;
         case 'nes.room':
            obj.id = m.id;
            obj.name = m.name;
            obj.room = i_uuid.v4();
            while (api.rooms[obj.room]) obj.room = i_uuid.v4();
            api.rooms[obj.room] = {
               name: obj.name,
               view: ws,
               p1: null,
               p2: null
            };
            ws.send(JSON.stringify(obj));
            return 1;
         case 'nes.list':
            obj.id = m.id;
            obj.rooms = Object.keys(api.rooms).map((room) => ({
               room: room, name: api.rooms[room].name
            })).filter((room_out_obj) => {
               room_obj = api.rooms[room_out_obj.room];
               if (room_obj.view.readyState !== room_obj.view.OPEN) {
                  return false;
               }
               return true;
            });
            ws.send(JSON.stringify(obj));
            return 1;
         case 'nes.player':
            room_obj = api.rooms[m.room];
            obj.id = m.id;
            obj.room = m.room;
            try {
               if (!room_obj) throw 'invalid';
               if (room_obj.view.readyState !== room_obj.view.OPEN) throw 'invalid';
               if (room_obj.p1 && room_obj.p1.readyState === room_obj.p1.OPEN) {
                  if (room_obj.p2 && room_obj.p2.readyState === room_obj.p2.OPEN) {
                     throw 'invalid';
                  } else {
                     obj.p = 2;
                     room_obj.p2 = ws;
                  }
               } else {
                  obj.p = 1;
                  room_obj.p1 = ws;
               }
               ws.send(JSON.stringify(obj));
            } catch(err) {
               obj.p = -1;
               ws.send(JSON.stringify(obj));
            }
            return 1;
         case 'nes.key':
            room_obj = api.rooms[m.room];
            obj. id = m.id;
            if (!room_obj) return 1;
            if (room_obj.view.readyState !== room_obj.view.OPEN) return 1;
            if (room_obj.p1 === ws) {
               i = 1;
            } else if (room_obj.p2 === ws) {
               i = 2;
            } else {
               return 1;
            }
            obj.player = i;
            obj.type = m.type;
            obj.key = m.key;
            room_obj.view.send(JSON.stringify(obj));
            return 1;
      }
   },
};

function cronJob() {
   Object.keys(api.rooms).forEach((room) => {
      let room_obj = api.rooms[room];
      if (room_obj.view.readyState === room_obj.view.OPEN) {
         room_obj.view.ping();
         if (room_obj.p1 && room_obj.p1.readyState === room_obj.p1.OPEN) room_obj.p1.ping();
         if (room_obj.p2 && room_obj.p2.readyState === room_obj.p2.OPEN) room_obj.p2.ping();
      } else {
         try { if (room_obj.p1 && room_obj.p1.readyState === room_obj.p1.OPEN) room_obj.p1.close(); } catch(err) {}
         try { if (room_obj.p2 && room_obj.p2.readyState === room_obj.p2.OPEN) room_obj.p2.close(); } catch(err) {}
         delete api.rooms[room];
      }
   });
   setTimeout(cronJob, 1000);
}
cronJob();

module.exports = api;