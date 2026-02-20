console.log('--- NODE SERVER INITIALIZING ---');
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const express = require('express');
console.log('Express loaded');
const multer = require('multer');
console.log('Multer loaded');
const path = require('path');
const fs = require('fs');
const ip = require('ip');
console.log('IP loaded');
const QRCode = require('qrcode');
console.log('QRCode loaded');
const cors = require('cors');
console.log('CORS loaded');
const archiver = require('archiver');
console.log('Archiver loaded');
const { spawn, exec } = require('child_process');

console.log('Dependencies loaded. Setting up app...');
const GIST_ID = '7b1eda69625097d262abd34cb09f4353';
let tunnelProcess = null;
let currentTunnelUrl = null;

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
    // Try to safely handle UTF-8 filenames from various browsers
    let filename = file.originalname;
    try {
      // If it's encoded as ISO-8859-1 (Latin1) by Multer/Express by mistake
      if (/[^\u0000-\u00ff]/.test(filename) === false) {
        filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
      }
    } catch (e) {
      filename = file.originalname;
    }
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

// Routes

// Get local IP address
const localIp = ip.address();
const serverUrl = `http://${localIp}:${PORT}`;

// API to get server info (QR code, URL)
app.get('/api/info', async (req, res) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(serverUrl);
    res.json({
      url: serverUrl,
      qrCode: qrCodeDataUrl,
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
app.get('/api/download/:filename', (req, res) => {
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

// Download Source Code
app.get('/download-app', (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });

  res.attachment('dosya-share-app.zip');

  archive.pipe(res);

  // Append files
  archive.file('package.json', { name: 'package.json' });
  archive.file('server.js', { name: 'server.js' });
  archive.directory('public/', 'public');

  archive.finalize();
});

// --- Chat & QR APIs ---

// In-memory chat store (simple implementation for now)
let chatMessages = [];

// Get chat messages
app.get('/api/chat', (req, res) => {
  res.json(chatMessages);
});

// Post a chat message
app.post('/api/chat', (req, res) => {
  const { sender, text } = req.body;
  if (!sender || !text) {
    return res.status(400).json({ error: 'Sender and text are required' });
  }
  const message = {
    id: Date.now().toString(),
    sender,
    text,
    timestamp: new Date().toISOString()
  };
  chatMessages.push(message);
  // Keep only the last 100 messages to save memory
  if (chatMessages.length > 100) {
    chatMessages.shift();
  }
  res.json(message);
});

// Custom QR Code Generator API
app.post('/api/qr/custom', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required to generate QR' });
  }
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(text);
    res.json({ qrCode: qrCodeDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate custom QR code' });
  }
});

// Set remote URL manually
app.post('/api/tunnel/set-url', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  currentTunnelUrl = url;
  // Setting url manually assumes remote setup without localtunnel
  res.json({ message: 'URL saved', url: currentTunnelUrl });
});

// --- Tunnel Management (Localtunnel) ---

const localtunnel = require('localtunnel');
const https = require('https');

function getPublicIp() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', () => resolve('Bilinmiyor'));
  });
}

async function updateGist(url, ip) {
  if (!GIST_ID) return;
  console.log(`Updating Gist ${GIST_ID} with URL: ${url} and IP: ${ip}`);
  // If we had a token, we would do a PATCH request here.
  // For now, we use the public IP as the "password" info.
}

app.post('/api/tunnel/start', async (req, res) => {
  if (tunnelProcess) {
    return res.json({ message: 'Tunnel already running', url: currentTunnelUrl });
  }

  try {
    console.log('Starting Localtunnel...');
    const tunnel = await localtunnel({ port: PORT });
    tunnelProcess = tunnel;
    currentTunnelUrl = tunnel.url;

    const publicIp = await getPublicIp();
    console.log(`Localtunnel started: ${currentTunnelUrl}`);
    console.log(`Public IP (Password): ${publicIp}`);

    updateGist(currentTunnelUrl, publicIp);

    tunnel.on('close', () => {
      console.log('Localtunnel closed');
      tunnelProcess = null;
      currentTunnelUrl = null;
    });

    res.json({
      message: 'Tunnel started',
      url: currentTunnelUrl,
      password: publicIp // Pass the public IP to the frontend
    });
  } catch (err) {
    console.error('Failed to start localtunnel:', err);
    tunnelProcess = null;
    currentTunnelUrl = null;
    res.status(500).json({ error: 'Failed to start tunnel' });
  }
});

app.post('/api/tunnel/stop', (req, res) => {
  if (tunnelProcess) {
    tunnelProcess.close();
    tunnelProcess = null;
    currentTunnelUrl = null;
    res.json({ message: 'Tunnel stopped' });
  } else {
    res.json({ message: 'Tunnel is not running' });
  }
});

app.get('/api/tunnel/status', async (req, res) => {
  const publicIp = await getPublicIp();
  res.json({
    running: !!tunnelProcess,
    url: currentTunnelUrl,
    password: publicIp
  });
});

// SPA catch-all: Serve index.html for any other GET requests within the browser
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log('---------------------------------------------------');
  console.log(`🚀 File Sharing & Chat Server Running!`);
  console.log(`📂 Shared Folder: ${UPLOAD_DIR}`);
  console.log(`🌐 Local URL: ${serverUrl}`);
  console.log('---------------------------------------------------');

  // Print QR Code to terminal
  try {
    console.log('Scan this QR code with your mobile device:');
    const qrString = await QRCode.toString(serverUrl, { type: 'terminal', small: true });
    console.log(qrString);
  } catch (err) {
    console.error('Failed to generate terminal QR code:', err);
  }

  console.log('To upload via terminal (curl):');
  console.log(`curl -F "files=@filename.ext" ${serverUrl}/api/upload`);
  console.log('---------------------------------------------------');
});

