// server.js - Robust Mobile Version
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ip = require('ip');

// DEBUG LOGGING
const logFile = path.join(require('os').tmpdir(), 'node-server-log.txt');
function log(msg) {
  fs.appendFileSync(logFile, new Date().toISOString() + ': ' + msg + '\n');
  console.log(msg);
}
log("Node process starting...");
process.on('uncaughtException', (err) => log("UNCAUGHT: " + err.stack));
process.on('unhandledRejection', (r) => log("REJECT: " + r));
const QRCode = require('qrcode');
const cors = require('cors');
const archiver = require('archiver');
const os = require('os');
const https = require('https');

// Dynamic import for localtunnel to avoid startup crashes if it fails
let localtunnel;
try {
  localtunnel = require('localtunnel');
} catch (e) {
  console.error('Localtunnel require failed:', e);
}

// Global Exception Handlers
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// Chat Storage (In-Memory)
const messages = [];

const app = express();
const PORT = 3000;

// Path Logic
let UPLOAD_DIR;
try {
  // Try tmpdir first
  UPLOAD_DIR = path.join(os.tmpdir(), 'local-share-uploads');
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  // Test write
  fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
} catch (err) {
  console.error('Tmpdir access failed, falling back to local dir:', err);
  UPLOAD_DIR = path.join(__dirname, 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) {
    try { fs.mkdirSync(UPLOAD_DIR); } catch (e) { console.error('Failed to create local uploads dir', e); }
  }
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
    // Multer gives originalname as Latin-1; decode to UTF-8
    let name = file.originalname;
    try {
      name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (e) { }
    cb(null, name);
  }
});

const upload = multer({ storage: storage });

// Routes

// Get local IP address - Improved detection
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prefer 192.168.x.x or 10.x.x.x
        if (iface.address.startsWith('192.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
          return iface.address;
        }
      }
    }
  }
  return ip.address(); // Fallback
}
const localIp = getLocalIp();
const serverUrl = `http://${localIp}:${PORT}`;

// Firebase Config Storage
const FIREBASE_CONFIG_PATH = path.join(UPLOAD_DIR, 'firebase-config.json');

app.post('/api/firebase/config', (req, res) => {
  try {
    fs.writeFileSync(FIREBASE_CONFIG_PATH, JSON.stringify(req.body));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/firebase/config', (req, res) => {
  try {
    if (fs.existsSync(FIREBASE_CONFIG_PATH)) {
      const data = fs.readFileSync(FIREBASE_CONFIG_PATH);
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (e) {
    res.json({});
  }
});

// API to get server info (QR code, URL)
app.get('/api/info', async (req, res) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(serverUrl);
    res.json({
      url: serverUrl,
      qrCode: qrCodeDataUrl,
      ip: localIp,
      port: PORT,
      storage: UPLOAD_DIR
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Custom QR Generator
app.post('/api/qr/custom', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(text);
    res.json({ qrCode: qrCodeDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// List files
app.get('/api/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      console.error('ReadDir Error:', err);
      // Return empty list instead of 500 if directory is missing/unreadable
      return res.json([]);
    }

    const fileList = files.map(file => {
      try {
        const filePath = path.join(UPLOAD_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          date: stats.mtime
        };
      } catch (e) { return null; }
    }).filter(x => x);

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

// --- Firebase Integration ---
let firebaseApp;
let firebaseStorage;

app.post('/api/firebase/upload-file', async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Filename required' });

  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  try {
    if (!fs.existsSync(FIREBASE_CONFIG_PATH)) {
      return res.status(400).json({ error: 'Firebase config missing' });
    }
    const config = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH));

    // Lazy load firebase
    const { initializeApp, getApps } = require('firebase/app');
    const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');

    if (!getApps().length) {
      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApps()[0];
    }
    firebaseStorage = getStorage(firebaseApp);

    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const storageRef = ref(firebaseStorage, 'uploads/' + filename);

    // Upload
    const snapshot = await uploadBytes(storageRef, fileBuffer);
    const url = await getDownloadURL(snapshot.ref);

    res.json({ success: true, url: url });
  } catch (e) {
    console.error("Firebase Upload Error:", e);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

// Download Source Code (must be before /download/* wildcard)
app.get('/download-app', (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('dosya-share-app.zip');
  archive.pipe(res);
  archive.file(path.join(__dirname, 'package.json'), { name: 'package.json' });
  archive.file(path.join(__dirname, 'server.js'), { name: 'server.js' });
  archive.directory(path.join(__dirname, 'public'), 'public');
  archive.finalize();
});

// Download file - use wildcard to handle special chars in filenames
app.get('/download/*', (req, res) => {
  let filename = req.params[0];
  try { filename = decodeURIComponent(filename); } catch (e) { }

  const filePath = path.join(UPLOAD_DIR, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    console.error('Download not found:', filename, '-> path:', filePath);
    res.status(404).json({ error: 'File not found', requested: filename });
  }
});

// Delete file
app.delete('/api/files/:filename', (req, res) => {
  let filename = req.params.filename;
  try { filename = decodeURIComponent(filename); } catch (e) { }
  const filePath = path.join(UPLOAD_DIR, filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: 'File deleted successfully' });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});



// --- Chat API ---
app.get('/api/chat', (req, res) => {
  res.json(messages);
});

app.post('/api/chat', (req, res) => {
  const { sender, text } = req.body;
  if (!sender || !text) return res.status(400).json({ error: 'Missing fields' });

  const msg = {
    id: Date.now(),
    sender,
    text,
    timestamp: new Date().toISOString()
  };
  messages.push(msg);
  if (messages.length > 50) messages.shift();

  // Firebase Relay
  try {
    if (firebaseApp && firebaseStorage) { // Re-using existing check
      // Check if database is initialized (we lazy load)
      const { getDatabase, ref: dbRef, push } = require('firebase/database');
      const db = getDatabase(firebaseApp);
      push(dbRef(db, 'messages'), msg);
    }
  } catch (e) {
    console.error("Firebase sync error", e);
  }

  res.json({ success: true, message: msg });
});

// --- Tunnel Management ---

let tunnelInstance = null;
let currentTunnelUrl = null;
let externalTunnelUrl = null; // For cloudflared or other external tunnels

function updateGist() {
  const data = {
    local: `http://${ip.address()}:${PORT}`,
    tunnel: currentTunnelUrl || externalTunnelUrl || null,
    lastUpdate: new Date().toISOString()
  };
  console.log('Server State Updated:', JSON.stringify(data));
}

// Set external tunnel URL (e.g. from cloudflared)
app.post('/api/tunnel/set-url', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  externalTunnelUrl = url;
  console.log('External tunnel URL set:', url);
  updateGist();
  res.json({ message: 'External tunnel URL set', url: externalTunnelUrl });
});

// Clear external tunnel URL
app.post('/api/tunnel/clear-url', (req, res) => {
  externalTunnelUrl = null;
  console.log('External tunnel URL cleared');
  res.json({ message: 'External tunnel URL cleared' });
});

app.post('/api/tunnel/start', async (req, res) => {
  if (tunnelInstance) {
    return res.json({ message: 'Tunnel already running', url: currentTunnelUrl });
  }

  try {
    console.log('Starting LocalTunnel...');
    if (!localtunnel) localtunnel = require('localtunnel');

    tunnelInstance = await localtunnel({ port: PORT });
    currentTunnelUrl = tunnelInstance.url;
    console.log('LocalTunnel started at:', currentTunnelUrl);

    tunnelInstance.on('close', () => {
      console.log('LocalTunnel closed');
      tunnelInstance = null;
      currentTunnelUrl = null;
    });

    updateGist();
    res.json({ message: 'Tunnel started', url: currentTunnelUrl });
  } catch (err) {
    console.error('Tunnel start failed:', err);
    res.status(500).json({ error: 'Failed to start tunnel: ' + err.message });
  }
});

app.post('/api/tunnel/stop', (req, res) => {
  if (tunnelInstance) {
    tunnelInstance.close();
    tunnelInstance = null;
    currentTunnelUrl = null;
    updateGist();
    res.json({ message: 'Tunnel stopped' });
  } else {
    currentTunnelUrl = null;
    res.json({ message: 'Tunnel is not running' });
  }
});

app.get('/api/tunnel/status', (req, res) => {
  const activeUrl = currentTunnelUrl || externalTunnelUrl;
  res.json({
    running: !!(tunnelInstance || externalTunnelUrl),
    url: activeUrl
  });
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log('---------------------------------------------------');
  console.log(`🚀 File Sharing Server Running (Mobile)!`);
  console.log(`📂 Shared Folder: ${UPLOAD_DIR}`);
  console.log(`🌐 Local URL: ${serverUrl}`);
  console.log('---------------------------------------------------');
});
