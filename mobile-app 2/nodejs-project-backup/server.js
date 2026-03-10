process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', function (reason) {
  console.error('UNHANDLED REJECTION:', reason);
});
console.log('server.js: Starting require phase...');
try {
  const express = require('express');
  const multer =
    // Use require for CommonJS
    require('multer');
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const QRCode = require('qrcode');
  const cors = require('cors');
  var localtunnel;
  try {
    localtunnel = require('localtunnel');
  } catch (e) {
    console.log('localtunnel not available, remote access disabled');
    localtunnel = null;
  }


  const app = express();
  const PORT = 3000;
  const UPLOAD_DIR = path.join(__dirname, 'uploads');

  // Ensure upload directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
  }

  // Middleware
  app.use(cors());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());

  // Configure Multer for file storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      // Keep original filename, handle duplicates if necessary (simple overwrite for now)
      cb(null, file.originalname);
    }
  });

  const upload = multer({ storage: storage });

  // Routes

  // Get local IP address (works better on Android than ip module)
  function getLocalIp() {
    var interfaces = os.networkInterfaces();
    var keys = Object.keys(interfaces);
    for (var i = 0; i < keys.length; i++) {
      var iface = interfaces[keys[i]];
      for (var j = 0; j < iface.length; j++) {
        var alias = iface[j];
        if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
          return alias.address;
        }
      }
    }
    return '127.0.0.1';
  }
  const localIp = getLocalIp();
  console.log('Detected local IP:', localIp);
  const serverUrl = `http://${localIp}:${PORT}`;

  // Tunnel state
  var tunnelUrl = null;
  var tunnelStatus = 'off'; // off, connecting, connected, error

  // WiFi hotspot config (in-memory, can be set by user)
  var wifiConfig = { ssid: '', password: '', security: 'WPA' };

  // Load wifi config from file if exists
  var wifiConfigPath = path.join(__dirname, 'wifi-config.json');
  try {
    if (fs.existsSync(wifiConfigPath)) {
      wifiConfig = JSON.parse(fs.readFileSync(wifiConfigPath, 'utf-8'));
    }
  } catch (e) {
    console.log('No saved wifi config');
  }

  // Get WiFi config
  app.get('/api/wifi-config', function (req, res) {
    res.json(wifiConfig);
  });

  // Set WiFi config
  app.post('/api/wifi-config', function (req, res) {
    wifiConfig.ssid = req.body.ssid || '';
    wifiConfig.password = req.body.password || '';
    wifiConfig.security = req.body.security || 'WPA';
    // Save to file
    try {
      fs.writeFileSync(wifiConfigPath, JSON.stringify(wifiConfig));
    } catch (e) {
      console.log('Could not save wifi config:', e.message);
    }
    res.json({ message: 'WiFi config saved', config: wifiConfig });
  });

  // API to get server info (QR code, URL)
  app.get('/api/info', async function (req, res) {
    try {
      var serverQr = await QRCode.toDataURL(serverUrl);
      var wifiQr = null;
      if (wifiConfig.ssid) {
        var wifiString = 'WIFI:T:' + wifiConfig.security + ';S:' + wifiConfig.ssid + ';P:' + wifiConfig.password + ';;';
        wifiQr = await QRCode.toDataURL(wifiString);
      }
      var tunnelQr = null;
      if (tunnelUrl) {
        tunnelQr = await QRCode.toDataURL(tunnelUrl);
      }
      res.json({
        url: serverUrl,
        qrCode: serverQr,
        wifiQrCode: wifiQr,
        wifiConfigured: !!wifiConfig.ssid,
        wifiSsid: wifiConfig.ssid,
        tunnelUrl: tunnelUrl,
        tunnelShortUrl: tunnelShortUrl,
        tunnelPassword: tunnelPassword,
        tunnelQrCode: tunnelQr,
        tunnelStatus: tunnelStatus,
        ip: localIp,
        port: PORT
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // List files
  app.get('/api/files', (req, res) => {
    fs.readdir(UPLOAD_DIR, (err, files) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to list files' });
      }

      const fileList = files.map(file => {
        const filePath = path.join(UPLOAD_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          date: stats.mtime
        };
      });

      res.json(fileList);
    });
  });

  // Upload file
  app.post('/api/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    res.json({ message: 'Files uploaded successfully', files: req.files.map(f => f.originalname) });
  });

  // Download file
  app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Delete file
  app.delete('/api/files/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Chat messages (in-memory)
  var chatMessages = [];

  // Get chat messages
  app.get('/api/chat', function (req, res) {
    res.json(chatMessages);
  });

  // Send chat message
  app.post('/api/chat', function (req, res) {
    var text = req.body.text;
    var userId = req.body.userId || 'anonymous';
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }
    var message = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      text: text.trim(),
      userId: userId,
      timestamp: new Date().toISOString()
    };
    chatMessages.push(message);
    // Keep last 200 messages
    if (chatMessages.length > 200) {
      chatMessages = chatMessages.slice(-200);
    }
    res.json(message);
  });

  // Download APK
  app.get('/download-apk', function (req, res) {
    // Look for APK file in the uploads directory or app directory
    var apkPaths = [
      path.join(__dirname, 'app-debug.apk'),
      path.join(UPLOAD_DIR, 'app-debug.apk'),
      path.join(__dirname, '..', 'app-debug.apk')
    ];

    var apkPath = null;
    for (var i = 0; i < apkPaths.length; i++) {
      if (fs.existsSync(apkPaths[i])) {
        apkPath = apkPaths[i];
        break;
      }
    }

    if (apkPath) {
      res.download(apkPath, 'LocalFileShare.apk');
    } else {
      res.status(404).send('APK file not found. Please place app-debug.apk in the server directory.');
    }
  });

  // Toggle tunnel on/off
  app.post('/api/tunnel', function (req, res) {
    var action = req.body.action; // 'start' or 'stop'
    if (action === 'start') {
      startTunnel(res);
    } else if (action === 'stop') {
      stopTunnel(res);
    } else {
      res.json({ tunnelUrl: tunnelUrl, tunnelShortUrl: tunnelShortUrl, tunnelStatus: tunnelStatus, tunnelPassword: tunnelPassword });
      res.json({ tunnelUrl: tunnelUrl, tunnelShortUrl: tunnelShortUrl, tunnelStatus: tunnelStatus });
    }
  });

  var activeTunnel = null;
  var tunnelShortUrl = null;
  var tunnelPassword = null;
  var localtunnel = null; // Will be dynamically required

  function startTunnel(res) {
    if (!localtunnel) {
      // Try to require localtunnel if not already loaded (though it should be)
      try {
        localtunnel = require('localtunnel');
      } catch (e) {
        tunnelStatus = 'error';
        if (res && !res.headersSent) res.json({ error: 'localtunnel not installed', tunnelStatus: tunnelStatus });
        return;
      }
    }
    if (activeTunnel) {
      if (res && !res.headersSent) res.json({ tunnelUrl: tunnelUrl, tunnelShortUrl: tunnelShortUrl, tunnelStatus: tunnelStatus, tunnelPassword: tunnelPassword });
      return;
    }

    // Fetch public IP for password
    const https = require('https');
    try {
      https.get('https://api.ipify.org', function (resp) {
        var data = '';
        resp.on('data', function (chunk) { data += chunk; });
        resp.on('end', function () {
          tunnelPassword = data;
          console.log('🌍 Public IP (Password):', tunnelPassword);
        });
      }).on('error', function (err) { console.log('Failed to get public IP'); });
    } catch (e) { }

    tunnelStatus = 'connecting';
    console.log('🌍 Starting Localtunnel...');

    try {
      localtunnel({ port: PORT, host: 'https://localtunnel.me' }).then(function (tunnel) {
        activeTunnel = tunnel;
        tunnelUrl = tunnel.url;
        tunnelStatus = 'connected';
        console.log('🌍 Tunnel URL:', tunnelUrl);

        // Generate TinyURL
        try {
          https.get('https://tinyurl.com/api-create.php?url=' + tunnel.url, function (resp) {
            var data = '';
            resp.on('data', function (chunk) { data += chunk; });
            resp.on('end', function () {
              tunnelShortUrl = data;
              console.log('🌍 Short URL:', tunnelShortUrl);
            });
          }).on('error', function (err) {
            tunnelShortUrl = tunnel.url;
          });
        } catch (e) { }

        if (res && !res.headersSent) res.json({ tunnelUrl: tunnelUrl, tunnelStatus: tunnelStatus, tunnelPassword: tunnelPassword });

        tunnel.on('close', function () {
          console.log('🌍 Tunnel closed');
          tunnelUrl = null;
          tunnelShortUrl = null;
          tunnelStatus = 'off';
          activeTunnel = null;
        });

        tunnel.on('error', function (err) {
          console.error('🌍 Tunnel error:', err.message);
          tunnelStatus = 'error';
        });
      }).catch(function (err) {
        console.error('🌍 Tunnel start failed:', err);
        tunnelStatus = 'error';
        if (res && !res.headersSent) res.json({ error: err.message, tunnelStatus: tunnelStatus });
      });
    } catch (err) {
      console.error('🌍 Tunnel sync error:', err);
      tunnelStatus = 'error';
      if (res && !res.headersSent) res.json({ error: err.message, tunnelStatus: tunnelStatus });
    }
  }

  function stopTunnel(res) {
    if (activeTunnel) {
      if (activeTunnel.close) activeTunnel.close(); else activeTunnel.end();
      activeTunnel = null;
    }
    tunnelStatus = 'off';
    tunnelUrl = null;
    tunnelShortUrl = null;
    tunnelPassword = null;
    if (res && !res.headersSent) res.json({ tunnelUrl: null, tunnelStatus: 'off' });
  }

  // Start server
  app.listen(PORT, '0.0.0.0', async function () {
    console.log('---------------------------------------------------');
    console.log('🚀 File Sharing Server Running!');
    console.log('📂 Shared Folder: ' + UPLOAD_DIR);
    console.log('🌐 Local URL: ' + serverUrl);
    console.log('---------------------------------------------------');

    // Print QR Code to terminal
    try {
      console.log('Scan this QR code with your mobile device:');
      var qrString = await QRCode.toString(serverUrl, { type: 'terminal', small: true });
      console.log(qrString);
    } catch (err) {
      console.error('Failed to generate terminal QR code:', err);
    }

    console.log('To upload via terminal (curl):');
    console.log('curl -F "files=@filename.ext" ' + serverUrl + '/api/upload');
    console.log('---------------------------------------------------');
  });

} catch (e) {
  console.error('SERVER INIT ERROR:', e.message);
  console.error(e.stack);
}
