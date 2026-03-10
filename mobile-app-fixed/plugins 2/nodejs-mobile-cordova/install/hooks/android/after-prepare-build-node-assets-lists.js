var fs = require('fs');
var path = require('path');

var fileList = [];
var dirList = [];

function enumFolder(folderPath) {
  var files = fs.readdirSync(folderPath);
  for (var i in files) {
    var name = files[i];
    var filePath = folderPath + '/' + files[i];
    if (fs.statSync(filePath).isDirectory()) {
      if (name.startsWith('.') === false) {
        dirList.push(filePath);
        enumFolder(filePath);
      }
    } else {
      if (name.startsWith('.') === false &&
        name.endsWith('.gz') === false &&
        name.endsWith('~') === false) {
        fileList.push(filePath);
      }
    }
  }
}

function createFileAndFolderLists(context, callback) {
  try {
    var projectRoot = context.opts.projectRoot || process.cwd();
    var androidAssetsPath = path.join(projectRoot, 'platforms/android/app/src/main/assets');
    var nodeJsProjectRoot = 'www/nodejs-project';
    var fileListPath = path.join(androidAssetsPath, 'file.list');
    var dirListPath = path.join(androidAssetsPath, 'dir.list');

    var oldCwd = process.cwd();
    process.chdir(androidAssetsPath);

    enumFolder(nodeJsProjectRoot);
    fs.writeFileSync(fileListPath, fileList.join('\n'));
    fs.writeFileSync(dirListPath, dirList.join('\n'));

    process.chdir(oldCwd);
  } catch (err) {
    console.log(err);
    callback(err);
    return;
  }
  callback(null);
}

module.exports = function (context) {
  if (context.opts.platforms.indexOf('android') < 0) {
    return;
  }

  return new Promise((resolve, reject) => {
    createFileAndFolderLists(context, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
