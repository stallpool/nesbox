const i_fs = require('fs');
const i_env = require('./env');

const in_memory = {};

const KeyVal = {
   filename: i_env.keyval.filename,
   set: (key, value) => {
      if (!value) {
         delete in_memory[key];
         return null;
      }
      in_memory[key] = value;
      return value;
   },
   get: (key) => {
      return in_memory[key];
   },
   keys: (query) => {
      let regex = keyval_compile(query);
      return Object.keys(in_memory).filter((x) => regex.test(x));
   },
   save: (filename) => {
      if (!filename) return;
      i_fs.writeFileSync(filename, JSON.stringify(in_memory));
   },
   load: (filename) => {
      if (!filename) return;
      Object.assign(in_memory, JSON.parse(i_fs.readFileSync(filename)));
   }
};

function keyval_compile(query) {
   let regex = [];
   for(let i = 0, n = query.length; i < n; i++) {
      let ch = query[i];
      if (ch === '?') {
         regex.push('.');
      } else if (ch === '*') {
         regex.push('.*');
      } else if (ch === '.') {
         regex.push('[.]');
      } else if (ch === '\\') {
         // only support \* \? \\
         ch = query[i];
         if (ch === '*') {
            regex.push('[*]');
         } else if (ch === '?') {
            regex.push('[?]');
         } else if (ch === '\\') {
            regex.push('\\\\');
         } // else skip
         i ++;
      } else {
         regex.push(ch);
      }
   }
   regex = '^' + regex.join('') + '$';
   return new RegExp(regex);
}

module.exports = KeyVal;