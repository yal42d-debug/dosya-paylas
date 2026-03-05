const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');
const archiver = require('archiver');
const localtunnel = require('localtunnel');
const https = require('https');
const os = require('os');

const app = express();
const PORT = 3000;

// Cross-platform Desktop Path Helper
function getDesktopPath() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const winDesktop = path.join(home, 'Desktop');
    const winDesktopTR = path.join(home, 'Masaüstü');
    const oneDriveDesktop = path.join(home, 'OneDrive', 'Desktop');
    const oneDriveDesktopTR = path.join(home, 'OneDrive', 'Masaüstü');
    if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;
    if (fs.existsSync(oneDriveDesktopTR)) return oneDriveDesktopTR;
    if (fs.existsSync(winDesktopTR)) return winDesktopTR;
    return winDesktop;
  }
  return path.join(home, 'Desktop');
}

// Default to Masaüstü/DoSy All
const DEFAULT_DIR = path.join(getDesktopPath(), 'DoSy All');

// Shared directory logic
let UPLOAD_DIR = DEFAULT_DIR;

const dirArgIndex = process.argv.indexOf('--dir');
if (dirArgIndex !== -1 && process.argv[dirArgIndex + 1]) {
  const targetDir = process.argv[dirArgIndex + 1];
  UPLOAD_DIR = path.isAbsolute(targetDir) ? targetDir : path.join(process.cwd(), targetDir);
}

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`📁 Klasör oluşturuldu: ${UPLOAD_DIR}`);
  } catch (e) {
    console.error(`❌ Klasör oluşturulamadı: ${e.message}`);
    // Fallback to local uploads if Desktop is not accessible
    if (UPLOAD_DIR !== path.join(__dirname, 'uploads')) {
      UPLOAD_DIR = path.join(__dirname, 'uploads');
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  }
}

// Global state
let currentTunnelUrl = null;
let tunnelError = null;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIp();
const serverUrl = `http://${localIp}:${PORT}`;

// Fetch Public IP asynchronously after startup
let publicIp = 'Bekleniyor...';
setTimeout(() => {
  https.get('https://api.ipify.org', (resp) => {
    let data = '';
    resp.on('data', (chunk) => data += chunk);
    resp.on('end', () => { publicIp = data; });
  }).on("error", (err) => {
    console.warn("Public IP alınamadı (localtunnel şifresi için gerekli): " + err.message);
    publicIp = 'Hata';
  });
}, 2000);

// Middleware
app.use(cors({
  allowedHeaders: ['Content-Type', 'Bypass-Tunnel-Reminder'],
  exposedHeaders: ['Bypass-Tunnel-Reminder']
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Main Web Route (Explicitly serve index.html)
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('<h1>Dosya Paylaşım Sunucusu Aktif</h1><p>Ancak web arayüzü (index.html) bulunamadı. Lütfen public klasörünü kontrol edin.</p>');
  }
});

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
      tunnelError: tunnelError,
      ip: localIp,
      publicIp: publicIp,
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

// Alias for web interface
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) res.download(filePath);
  else res.status(404).send('Not found');
});

// Serve APK for web users
app.get('/download-apk', (req, res) => {
  const apkPath = path.join(process.env.HOME || process.env.USERPROFILE, 'Desktop', 'Dosya_Paylas_Guncel.apk');
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'Dosya_Paylas.apk');
  } else {
    // Fallback search in project dir
    const localApk = path.join(__dirname, 'Dosya_Paylas_Guncel.apk');
    if (fs.existsSync(localApk)) res.download(localApk, 'Dosya_Paylas.apk');
    else res.status(404).send('APK dosyası sunucuda bulunamadı. Lütfen önce derleyin.');
  }
});

app.delete('/api/files/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: 'Deleted' });
  } else res.status(404).send('Not found');
});

// Chat Storage (In-Memory)
const messages = [];

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

  res.json({ success: true, message: msg });
});

// --- Tunnel Management ---
app.post('/api/tunnel/set-url', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  currentTunnelUrl = url;
  console.log('External tunnel URL set:', url);
  res.json({ message: 'External tunnel URL set', url: currentTunnelUrl });
});

app.get('/api/tunnel/status', (req, res) => {
  res.json({ running: !!currentTunnelUrl, url: currentTunnelUrl });
});

app.post('/api/tunnel/start', async (req, res) => {
  if (currentTunnelUrl) return res.json({ message: 'Already running', url: currentTunnelUrl });
  try {
    const tunnel = await Promise.race([
      localtunnel({ port: PORT }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tünel bağlantısı zaman aşımına uğradı (10s)')), 10000))
    ]);
    tunnel.on('error', (err) => {
      console.error('❌ Tünel hatası:', err.message);
      currentTunnelUrl = null;
      tunnelError = err.message;
    });
    currentTunnelUrl = tunnel.url;
    tunnelError = null;
    res.json({ message: 'Started', url: currentTunnelUrl });
  } catch (e) {
    tunnelError = e.message;
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tunnel/stop', (req, res) => {
  currentTunnelUrl = null;
  res.json({ message: 'Stopped' });
});

// START LOGIC
async function startServer() {
  // Global error handlers to prevent process crash
  process.on('uncaughtException', (err) => {
    console.error('❌ Beklenmeyen Hata (Process):', err.message);
    if (err.message.includes('localtunnel')) {
      currentTunnelUrl = null;
      tunnelError = err.message;
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Beklenmeyen Rejection (Process):', reason);
  });

  app.listen(PORT, '0.0.0.0', async () => {
    console.log('📡 Tünel/Dış Bağlantı başlatılıyor (localtunnel)...');

    async function attemptTunnel(retries = 2) {
      for (let i = 0; i < retries; i++) {
        try {
          tunnelError = null;
          // Set a strict 5-second timeout for localtunnel connection. 
          const tunnel = await Promise.race([
            localtunnel({ port: PORT }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Localtunnel bağlantısında zaman aşımı (Timeout) yaşandı.')), 8000))
          ]);

          if (tunnel) {
            tunnel.on('error', (err) => {
              console.error('❌ Tünel koptu:', err.message);
              currentTunnelUrl = null;
              tunnelError = err.message;
            });
            currentTunnelUrl = tunnel.url;
            console.log(`✅ Tünel aktif: ${currentTunnelUrl}`);
            return true;
          }
        } catch (e) {
          console.warn(`⚠️ Tünel denemesi ${i + 1} başarısız: ${e.message}`);
          tunnelError = e.message;
          // Wait a bit before retry
          if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
        }
      }
      console.log('ℹ️ Tünel başlatılamadı, yerel ağda devam ediliyor.');
      return false;
    }

    // Try to start tunnel, but don't block everything if it fails
    attemptTunnel().catch(err => {
      console.error('❌ Tünel başlatma sırasında hata:', err.message);
    });

    console.log('\x1b[36m%s\x1b[0m', '===================================================');
    console.log('\x1b[32m%s\x1b[0m', '🚀 DOSYA PAYLAŞIM SUNUCUSU AKTİF');
    console.log('\x1b[36m%s\x1b[0m', '---------------------------------------------------');
    console.log(`📂 Klasör: ${UPLOAD_DIR}`);
    console.log(`🏠 Yerel Ağ: ${serverUrl}`);
    console.log('\x1b[36m%s\x1b[0m', '---------------------------------------------------');

    console.log('\n\x1b[33m%s\x1b[0m', '📲 YEREL AĞ QR KODU (Ev/Ofis İçi):');
    qrcodeTerminal.generate(serverUrl, { small: true });

    console.log('\n\x1b[36m%s\x1b[0m', '---------------------------------------------------\n');
  });
}

startServer();
