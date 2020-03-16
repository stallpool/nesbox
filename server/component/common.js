const i_path = require('path');

function validate_path(path) {
   if (!path) return null;
   let parts = path.split(i_path.sep);
   // max folder deep
   if (parts.length > 25) return null;
   return parts.filter((x) => x !== '.' && x !== '..').join(i_path.sep);
}

function prepare_user_folder(storage, baseDir, username) {
   if (!username) return;
   let base = i_path.join(baseDir, username);
   if (!storage.sync_exists(base)) {
      try {
         storage.sync_mkdir(base);
      } catch(err) {}
   }
}

module.exports = {
   validatePath: validate_path,
   prepareUserFolder: prepare_user_folder,
}