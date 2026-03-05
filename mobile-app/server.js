const express = require('express');
const multer =
  // Use require for CommonJS
  require('multer');
const path = require('path');
const fs = require('fs');
const ip = require('ip');
const QRCode = require('qrcode');
const cors = require('cors');
const archiver = require('archiver');
const { spawn, exec } = require('child_process');

const GIST_ID = '7b1eda69625097d262abd34cb09f4353'; // Auto-generated Gist ID
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
app.use(express.static('public'));
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
  archive.finalize();
});

// --- Tunnel Management ---

function updateGist() {
  const data = {
    local: `http://${ip.address()}:${PORT}`,
    tunnel: currentTunnelUrl || null,
    lastUpdate: new Date().toISOString()
  };
  const content = JSON.stringify(data);
  const command = `echo '${content}' | gh gist edit ${GIST_ID} -f tunnel.json -`; // Changed to tunnel.json
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Gist update error: ${error.message}`);
      return;
    }
    console.log(`Gist updated: ${content}`);
  });
}

app.post('/api/tunnel/start', (req, res) => {
  if (tunnelProcess) {
    return res.json({ message: 'Tunnel already running', url: currentTunnelUrl });
  }

  tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`]);

  tunnelProcess.stderr.on('data', (data) => {
    const output = data.toString();
    const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (urlMatch) {
      currentTunnelUrl = urlMatch[0];
      console.log(`Tunnel URL found: ${currentTunnelUrl}`);
      updateGist();
    }
  });

  tunnelProcess.on('close', (code) => {
    console.log(`Tunnel process exited with code ${code}`);
    tunnelProcess = null;
    currentTunnelUrl = null;
    updateGist();
  });

  res.json({ message: 'Tunnel starting...' });
});

app.post('/api/tunnel/stop', (req, res) => {
  if (tunnelProcess) {
    tunnelProcess.kill();
    tunnelProcess = null;
    currentTunnelUrl = null;
    updateGist();
    res.json({ message: 'Tunnel stopped' });
  } else {
    res.json({ message: 'Tunnel is not running' });
  }
});

// Initial Gist Update on Start
updateGist();
setInterval(updateGist, 10 * 60 * 1000); // Heartbeat every 10 mins

app.get('/api/tunnel/status', (req, res) => {
  res.json({
    running: !!tunnelProcess,
    url: currentTunnelUrl
  });
});

// Start server
app.listen(PORT, async () => {
  console.log('---------------------------------------------------');
  console.log(`🚀 File Sharing Server Running!`);
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
