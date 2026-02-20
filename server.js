const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ip = require('ip');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');
const archiver = require('archiver');
const localtunnel = require('localtunnel');
const https = require('https');

const app = express();
const PORT = 3000;

// Shared directory logic
let UPLOAD_DIR = path.join(__dirname, 'uploads');
const dirArgIndex = process.argv.indexOf('--dir');
if (dirArgIndex !== -1 && process.argv[dirArgIndex + 1]) {
  const targetDir = process.argv[dirArgIndex + 1];
  UPLOAD_DIR = path.isAbsolute(targetDir) ? targetDir : path.join(process.cwd(), targetDir);
}

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Global state
let currentTunnelUrl = null;
const localIp = ip.address();
const serverUrl = `http://${localIp}:${PORT}`;

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Content-Disposition Fix for UTF-8
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Convert filename to UTF-8 if it's coming in garbled
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, originalName);
  }
});
const upload = multer({ storage: storage });

// Routes
app.get('/api/info', async (req, res) => {
  try {
    res.json({
      localUrl: serverUrl,
      tunnelUrl: currentTunnelUrl,
      ip: localIp,
      port: PORT,
      shareDir: UPLOAD_DIR
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/set-dir', (req, res) => {
  const { dir } = req.body;
  if (!dir) return res.status(400).json({ error: 'Directory path is required' });

  const newDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  if (!fs.existsSync(newDir)) {
    try {
      fs.mkdirSync(newDir, { recursive: true });
    } catch (e) {
      return res.status(500).json({ error: 'Could not create directory' });
    }
  }

  UPLOAD_DIR = newDir;
  console.log(`📂 Paylaşılan klasör değiştirildi: ${UPLOAD_DIR}`);
  res.json({ message: 'Success', shareDir: UPLOAD_DIR });
});

app.get('/api/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to list' });
    const list = files.filter(f => !f.startsWith('.')).map(file => {
      try {
        const stats = fs.statSync(path.join(UPLOAD_DIR, file));
        return { name: file, size: stats.size, date: stats.mtime };
      } catch (e) { return null; }
    }).filter(f => f !== null);
    res.json(list);
  });
});

app.post('/api/upload', upload.array('files'), (req, res) => {
  res.json({ message: 'Success', files: req.files.map(f => f.originalname) });
});

app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) res.download(filePath);
  else res.status(404).send('Not found');
});

app.delete('/api/files/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: 'Deleted' });
  } else res.status(404).send('Not found');
});

// START LOGIC
async function startServer() {
  if (process.argv.includes('--tunnel')) {
    console.log('📡 Tünel başlatılıyor...');
    try {
      const tunnel = await localtunnel({ port: PORT });
      currentTunnelUrl = tunnel.url;
    } catch (e) {
      console.error('❌ Tünel hatası:', e.message);
    }
  }

  app.listen(PORT, () => {
    console.clear();
    console.log('===================================================');
    console.log('🚀 DOSYA PAYLAŞIM SUNUCUSU AKTİF');
    console.log('---------------------------------------------------');
    console.log(`📂 Klasör: ${UPLOAD_DIR}`);
    console.log(`🏠 Yerel Ağ: ${serverUrl}`);
    if (currentTunnelUrl) console.log(`🌍 İnternet: ${currentTunnelUrl}`);
    console.log('---------------------------------------------------');

    console.log('\n📲 YEREL AĞ QR KODU (Ev/Ofis İçi):');
    qrcodeTerminal.generate(serverUrl, { small: true });

    if (currentTunnelUrl) {
      console.log('\n🌍 İNTERNET/TÜNEL QR KODU (Dışarıdan Erişim):');
      qrcodeTerminal.generate(currentTunnelUrl, { small: true });
    }
    console.log('\n(Bu kodları mobil uygulama veya tarayıcı ile kullanabilirsiniz)');
    console.log('---------------------------------------------------\n');
  });
}

startServer();

