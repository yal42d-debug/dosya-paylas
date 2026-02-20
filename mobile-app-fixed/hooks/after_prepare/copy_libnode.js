#!/usr/bin/env node

var fs = require('fs');
var path = require('path');

module.exports = function (context) {
    if (context.opts.platforms.indexOf('android') >= 0) {
        var projectRoot = context.opts.projectRoot || process.cwd();
        var jniLibsDir = path.join(projectRoot, 'platforms', 'android', 'app', 'src', 'main', 'jniLibs');
        var sourceBinDir = path.join(projectRoot, 'plugins', 'nodejs-mobile-cordova', 'libs', 'android', 'libnode', 'bin');

        // Ensure jniLibs directory exists
        if (!fs.existsSync(jniLibsDir)) {
            fs.mkdirSync(jniLibsDir, { recursive: true });
        }

        // Copy folders arm64-v8a, armeabi-v7a, x86, x86_64
        var archs = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];
        archs.forEach(function (arch) {
            var src = path.join(sourceBinDir, arch);
            var dest = path.join(jniLibsDir, arch);
            if (fs.existsSync(src)) {
                if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                var files = fs.readdirSync(src);
                files.forEach(function (file) {
                    fs.copyFileSync(path.join(src, file), path.join(dest, file));
                });
            }
        });
        console.log("Successfully copied libnode.so for Android architectures.");
    }
};
