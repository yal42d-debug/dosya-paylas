#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const readline = require('readline');
const { spawn } = require('child_process');

let qrcodeTerminal;
try {
    qrcodeTerminal = require('qrcode-terminal');
} catch (e) {
    // qrcode-terminal is optional
}

// --- CONFIG ---
const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.share-cli-config.json');

// --- DoSy All KLASÖRÜ ---
const os = require('os');
function getDesktopPath() {
    const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
    if (process.platform === 'win32') {
        // Windows: Özel masaüstü yolunu kontrol et
        const winDesktop = path.join(home, 'Desktop');
        const winDesktopTR = path.join(home, 'Masaüstü');
        const oneDriveDesktop = path.join(home, 'OneDrive', 'Desktop');
        const oneDriveDesktopTR = path.join(home, 'OneDrive', 'Masaüstü');
        if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;
        if (fs.existsSync(oneDriveDesktopTR)) return oneDriveDesktopTR;
        if (fs.existsSync(winDesktopTR)) return winDesktopTR;
        return winDesktop;
    } else {
        // macOS / Linux
        return path.join(home, 'Desktop');
    }
}

const DOSY_ALL_DIR = path.join(getDesktopPath(), 'DoSy All');
// Klasörü oluştur (yoksa)
if (!fs.existsSync(DOSY_ALL_DIR)) {
    try {
        fs.mkdirSync(DOSY_ALL_DIR, { recursive: true });
    } catch (e) {
        // Masaüstü yoksa bile devam et
    }
}
function saveConfig(config) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config)); }
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH));
    return { apiBase: 'http://localhost:3000', mode: 'disconnected' };
}
let config = loadConfig();

// --- STATE ---
let serverProcess = null; // child process if we started the server
let connectionMode = 'disconnected'; // 'local-server', 'remote-local', 'remote-tunnel', 'disconnected'
let serverInfo = null; // cached /api/info response

// --- UI HELPERS ---
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgRed: "\x1b[41m",
    bgBlue: "\x1b[44m"
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// --- CONNECTION TEST ---
async function testConnection(baseUrl, timeoutMs = 5000) {
    return new Promise((resolve) => {
        try {
            const url = new URL('/api/info', baseUrl);
            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.get(url, { timeout: timeoutMs, headers: { 'Bypass-Tunnel-Reminder': 'true' } }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        if (data.ip || data.localUrl || data.url || data.port) {
                            resolve({ success: true, info: data });
                        } else {
                            resolve({ success: false, error: 'Bu adres bir Dosya Paylaş sunucusu değil.' });
                        }
                    } catch (e) {
                        resolve({ success: false, error: 'Sunucu geçersiz yanıt verdi.' });
                    }
                });
            });
            req.on('error', (err) => {
                if (err.code === 'ECONNREFUSED') resolve({ success: false, error: 'Bağlantı reddedildi. Sunucu kapalı olabilir.' });
                else if (err.code === 'ENOTFOUND') resolve({ success: false, error: 'Adres çözümlenemedi. URL doğru mu?' });
                else resolve({ success: false, error: err.message });
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: 'Bağlantı zaman aşımına uğradı.' });
            });
        } catch (e) {
            resolve({ success: false, error: 'Geçersiz URL formatı: ' + e.message });
        }
    });
}

// --- API CORE ---
async function request(method, apiPath, data = null, isDownload = false) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(apiPath, config.apiBase);
            const protocol = url.protocol === 'https:' ? https : http;
            const options = {
                method,
                timeout: 10000,
                headers: {
                    'Bypass-Tunnel-Reminder': 'true'
                }
            };

            if (data && !isDownload) {
                options.headers['Content-Type'] = 'application/json';
            }

            const req = protocol.request(url, options, (res) => {
                if (isDownload) return resolve(res);
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve(body); } });
            });
            req.on('error', (err) => {
                if (err.code === 'ECONNREFUSED') reject(new Error("Sunucuya bağlanılamadı. Sunucunun açık olduğundan emin olun."));
                else reject(err);
            });
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('İstek zaman aşımına uğradı.'));
            });
            if (data && !isDownload) req.write(JSON.stringify(data));
            req.end();
        } catch (e) { reject(e); }
    });
}

// --- ACTIONS ---
async function showFileList() {
    console.log(`${colors.blue}\n📥 Dosya Listesi Çekiliyor...${colors.reset}`);
    const files = await request('GET', '/api/files');
    if (!files || files.length === 0) {
        console.log(`${colors.yellow}⚠️  Sunucu şu an boş.${colors.reset}`);
        return [];
    }
    console.log(`\n${colors.bright}${colors.white}ID  | İsim${" ".repeat(26)} | Boyut${colors.reset}`);
    console.log(`${colors.white}${"-".repeat(50)}${colors.reset}`);
    files.forEach((f, i) => {
        const id = (i + 1).toString().padEnd(3);
        const name = f.name.length > 30 ? f.name.substring(0, 27) + "..." : f.name.padEnd(30);
        const size = f.size >= 1048576 ? (f.size / 1024 / 1024).toFixed(2) + " MB" : (f.size / 1024).toFixed(1) + " KB";
        console.log(`${colors.green}${id}${colors.reset} | ${name} | ${size}`);
    });
    return files;
}

async function handleDownload() {
    const files = await showFileList();
    if (files.length === 0) return await question("\nDevam etmek için Enter...");
    const choice = await question(`\n${colors.yellow}İndirmek istediğiniz dosya no (veya iptal için 0): ${colors.reset}`);
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < files.length) {
        const fileName = files[index].name;
        console.log(`${colors.cyan}⏳ ${fileName} indiriliyor...${colors.reset}`);
        const res = await request('GET', `/download/${encodeURIComponent(fileName)}`, null, true);

        let downloadsDir;
        if (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) {
            downloadsDir = path.join(process.env.HOME, 'storage', 'downloads');
        } else {
            const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
            downloadsDir = path.join(home, 'Downloads');
        }

        if (!fs.existsSync(downloadsDir)) {
            try { fs.mkdirSync(downloadsDir, { recursive: true }); } catch (e) { }
        }

        let filePath = path.join(downloadsDir, fileName);
        let counter = 1;
        let ext = path.extname(fileName);
        let base = path.basename(fileName, ext);
        while (fs.existsSync(filePath)) {
            filePath = path.join(downloadsDir, `${base}(${counter})${ext}`);
            counter++;
        }

        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        await new Promise(r => fileStream.on('finish', r));
        console.log(`${colors.green}✅ Başarıyla İndirilenler klasörüne kaydedildi:\n   ${filePath}${colors.reset}`);
    }
    await question("\nDevam etmek için Enter...");
}

// Tek dosya yükleme yardımcı fonksiyonu
async function uploadSingleFile(cleanPath) {
    const filename = path.basename(cleanPath);
    console.log(`${colors.cyan}⏳ ${filename} yükleniyor...${colors.reset}`);

    const boundary = '----Boundary' + Math.random().toString(36).substring(2);
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const stat = fs.statSync(cleanPath);
    const url = new URL('/api/upload', config.apiBase);
    const protocol = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const upReq = protocol.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(header) + stat.size + Buffer.byteLength(footer),
                'Bypass-Tunnel-Reminder': 'true'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log(`${colors.green}✅ ${filename} başarıyla yüklendi!${colors.reset}`);
                resolve(true);
            });
        });
        upReq.on('error', (err) => {
            console.log(`${colors.red}❌ ${filename} yüklenemedi: ${err.message}${colors.reset}`);
            resolve(false);
        });

        upReq.write(header);
        const fileStream = fs.createReadStream(cleanPath);
        fileStream.pipe(upReq, { end: false });
        fileStream.on('end', () => upReq.end(footer));
    });
}

async function handleUpload() {
    // DoSy All klasöründeki dosyaları kontrol et
    let dosyAllFiles = [];
    if (fs.existsSync(DOSY_ALL_DIR)) {
        try {
            dosyAllFiles = fs.readdirSync(DOSY_ALL_DIR).filter(f => {
                const fPath = path.join(DOSY_ALL_DIR, f);
                return !f.startsWith('.') && fs.statSync(fPath).isFile();
            });
        } catch (e) { }
    }

    console.log(`\n${colors.bright}${colors.cyan}📤 DOSYA YÜKLEME${colors.reset}`);
    console.log(`${colors.dim}${"-".repeat(40)}${colors.reset}`);
    console.log(`${colors.green}1.${colors.reset} 📁 DoSy All klasöründen seç ${colors.dim}(${dosyAllFiles.length} dosya)${colors.reset}`);
    console.log(`${colors.green}2.${colors.reset} ✏️  Manuel dosya yolu gir`);
    console.log(`${colors.red}0.${colors.reset} İptal`);
    console.log(`${colors.dim}\n📂 DoSy All: ${DOSY_ALL_DIR}${colors.reset}`);

    const uploadChoice = await question(`\n${colors.magenta}Seçiminiz: ${colors.reset}`);

    if (uploadChoice === '1') {
        // DoSy All klasöründen dosya seç
        if (dosyAllFiles.length === 0) {
            console.log(`\n${colors.yellow}⚠️  DoSy All klasörü boş!${colors.reset}`);
            console.log(`${colors.dim}   Dosyalarınızı şu klasöre atın:${colors.reset}`);
            console.log(`${colors.cyan}   ${DOSY_ALL_DIR}${colors.reset}`);
            await question("\nDevam etmek için Enter...");
            return;
        }

        console.log(`\n${colors.bright}${colors.white}DoSy All Klasöründeki Dosyalar:${colors.reset}`);
        console.log(`${colors.white}${"-".repeat(50)}${colors.reset}`);
        dosyAllFiles.forEach((f, i) => {
            const fPath = path.join(DOSY_ALL_DIR, f);
            const stat = fs.statSync(fPath);
            const size = stat.size >= 1048576 ? (stat.size / 1024 / 1024).toFixed(2) + " MB" : (stat.size / 1024).toFixed(1) + " KB";
            const name = f.length > 30 ? f.substring(0, 27) + "..." : f.padEnd(30);
            console.log(`${colors.green}${(i + 1).toString().padEnd(3)}${colors.reset} | ${name} | ${size}`);
        });
        console.log(`${colors.white}${"-".repeat(50)}${colors.reset}`);
        console.log(`${colors.yellow}💡 İpucu: Hepsini yüklemek için 'hepsi' yazın${colors.reset}`);
        console.log(`${colors.yellow}   Birden fazla: '1,3,5' veya '1-5' yazın${colors.reset}`);

        const fileChoice = await question(`\n${colors.yellow}Dosya no (veya 'hepsi'): ${colors.reset}`);

        let selectedIndices = [];
        const trimmedChoice = fileChoice.trim().toLowerCase();

        if (trimmedChoice === 'hepsi' || trimmedChoice === 'all' || trimmedChoice === '*') {
            selectedIndices = dosyAllFiles.map((_, i) => i);
        } else if (trimmedChoice.includes('-')) {
            // Aralık: "1-5"
            const parts = trimmedChoice.split('-').map(s => parseInt(s.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                for (let i = parts[0] - 1; i < parts[1] && i < dosyAllFiles.length; i++) {
                    if (i >= 0) selectedIndices.push(i);
                }
            }
        } else if (trimmedChoice.includes(',')) {
            // Virgüllü: "1,3,5"
            selectedIndices = trimmedChoice.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < dosyAllFiles.length);
        } else {
            const idx = parseInt(trimmedChoice) - 1;
            if (idx >= 0 && idx < dosyAllFiles.length) selectedIndices.push(idx);
        }

        if (selectedIndices.length === 0) {
            console.log(`${colors.red}❌ Geçersiz seçim!${colors.reset}`);
        } else {
            console.log(`\n${colors.cyan}📤 ${selectedIndices.length} dosya yüklenecek...${colors.reset}`);
            let successCount = 0;
            for (const idx of selectedIndices) {
                const filePath = path.join(DOSY_ALL_DIR, dosyAllFiles[idx]);
                const result = await uploadSingleFile(filePath);
                if (result) successCount++;
            }
            console.log(`\n${colors.green}✅ ${successCount}/${selectedIndices.length} dosya başarıyla yüklendi!${colors.reset}`);
        }
    } else if (uploadChoice === '2') {
        // Manuel dosya yolu
        const filePath = await question(`\n${colors.yellow}Yüklenecek dosya yolu: ${colors.reset}`);
        const cleanPath = filePath.trim().replace(/^'|^"|'$|"$/g, '');
        if (!cleanPath) {
            // boş giriş, iptal
        } else if (!fs.existsSync(cleanPath)) {
            console.log(`${colors.red}❌ Hata: Dosya bulunamadı!${colors.reset}`);
        } else {
            await uploadSingleFile(cleanPath);
        }
    }

    await question("\nDevam etmek için Enter...");
}

async function handleChat() {
    const os = require('os');
    const username = os.userInfo().username || 'CLI-User';

    console.log(`\n${colors.bright}${colors.cyan}💬 Chat Odasına Bağlanıldı (Kullanıcı: ${username})${colors.reset}`);
    console.log(`${colors.dim}Çıkmak için "exit" yazın\n-----------------------------------${colors.reset}`);

    let lastMsgCount = 0;
    let isPolling = true;

    async function pollMessages() {
        if (!isPolling) return;
        try {
            const msgs = await request('GET', '/api/chat');
            if (msgs.length > lastMsgCount) {
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                for (let i = lastMsgCount; i < msgs.length; i++) {
                    const m = msgs[i];
                    const time = new Date(m.timestamp).toLocaleTimeString();
                    if (m.sender !== username) {
                        console.log(`${colors.cyan}[${time}] ${m.sender}:${colors.reset} ${m.text}`);
                    }
                }
                lastMsgCount = msgs.length;
                process.stdout.write('> '); // Prompt'u yeniden yazdır
            }
        } catch (e) { }
        if (isPolling) setTimeout(pollMessages, 2000);
    }

    try {
        const initialMsgs = await request('GET', '/api/chat');
        lastMsgCount = initialMsgs.length;
        for (let m of initialMsgs) {
            const time = new Date(m.timestamp).toLocaleTimeString();
            console.log(`${colors.cyan}[${time}] ${m.sender}:${colors.reset} ${m.text}`);
        }
    } catch (e) { }

    pollMessages();

    while (true) {
        const msg = await question('> ');
        if (msg.trim().toLowerCase() === 'exit') {
            isPolling = false;
            console.log(`\n${colors.red}🔴 Chat odasından ayrıldınız.${colors.reset}`);
            break;
        }
        if (msg.trim()) {
            try {
                await request('POST', '/api/chat', { sender: username, text: msg.trim() });
            } catch (e) {
                console.log(`${colors.red}❌ Gönderilemedi: ${e.message}${colors.reset}`);
            }
        }
    }

    await question("\nDevam etmek için Enter...");
}

// --- SERVER START ---
async function startLocalServer() {
    const serverPath = path.join(__dirname, 'server.js');
    if (!fs.existsSync(serverPath)) {
        console.log(`${colors.red}❌ server.js bulunamadı: ${serverPath}${colors.reset}`);
        return false;
    }

    // Check if already running
    const check = await testConnection('http://localhost:3000', 2000);
    if (check.success) {
        console.log(`${colors.yellow}⚠️  Port 3000'de zaten bir sunucu çalışıyor.${colors.reset}`);
        config.apiBase = 'http://localhost:3000';
        connectionMode = 'local-server';
        serverInfo = check.info;
        saveConfig(config);
        // Mevcut sunucunun klasörünü DoSy All olarak ayarla
        try {
            await request('POST', '/api/set-dir', { dir: DOSY_ALL_DIR });
            console.log(`${colors.green}📁 Paylaşım klasörü: ${DOSY_ALL_DIR}${colors.reset}`);
        } catch (e) { }
        return true;
    }

    console.log(`${colors.cyan}🚀 Sunucu başlatılıyor...${colors.reset}`);
    serverProcess = spawn('node', [serverPath, '--dir', DOSY_ALL_DIR], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
    });

    serverProcess.stdout.on('data', (data) => {
        // Silent - don't pollute CLI output
    });
    serverProcess.stderr.on('data', (data) => {
        // Silent
    });
    serverProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.log(`${colors.red}⚠️  Sunucu kapandı (kod: ${code})${colors.reset}`);
        }
        serverProcess = null;
    });

    // Wait for server to be ready (up to 15 seconds)
    for (let i = 0; i < 15; i++) {
        process.stdout.write(`\r${colors.yellow}⏳ Sunucu bekleniyor... (${i + 1}s)${colors.reset}`);
        await new Promise(r => setTimeout(r, 1000));
        const result = await testConnection('http://localhost:3000', 2000);
        if (result.success) {
            process.stdout.write(`\r${colors.green}✅ Sunucu başarıyla başlatıldı!            ${colors.reset}\n`);
            console.log(`${colors.green}📁 Paylaşım klasörü: ${DOSY_ALL_DIR}${colors.reset}`);
            config.apiBase = 'http://localhost:3000';
            connectionMode = 'local-server';
            serverInfo = result.info;
            saveConfig(config);
            return true;
        }
    }

    console.log(`\n${colors.red}❌ Sunucu başlatılamadı. Lüften logları kontrol edin.${colors.reset}`);
    return false;
}

// --- CONNECT TO ANOTHER SERVER ---
async function handleConnect() {
    console.log(`\n${colors.bright}${colors.cyan}🔗 SUNUCUYA BAĞLANMA${colors.reset}`);
    console.log(`${colors.dim}Mevcut bağlantı: ${config.apiBase}${colors.reset}\n`);
    console.log(`${colors.green}1.${colors.reset} Yerel ağdaki sunucuya bağlan (IP:Port)`);
    console.log(`${colors.green}2.${colors.reset} Uzak sunucuya bağlan (Tünel URL)`);
    console.log(`${colors.green}3.${colors.reset} Kendi sunucumu başlat (localhost:3000)`);
    console.log(`${colors.red}0.${colors.reset} İptal - Ana Menüye Dön`);

    const choice = await question(`\n${colors.magenta}Seçiminiz: ${colors.reset}`);

    if (choice === '1') {
        // Local network connection
        const ipInput = await question(`${colors.yellow}IP adresi ve port (örn: 192.168.1.42:3000): ${colors.reset}`);
        if (!ipInput.trim()) return;

        let targetUrl = ipInput.trim();
        if (!targetUrl.startsWith('http')) targetUrl = 'http://' + targetUrl;
        if (targetUrl.split(':').length < 3) targetUrl += ':3000';
        targetUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;

        console.log(`${colors.cyan}🔍 Bağlantı test ediliyor: ${targetUrl}${colors.reset}`);
        const result = await testConnection(targetUrl);

        if (result.success) {
            config.apiBase = targetUrl;
            connectionMode = 'remote-local';
            serverInfo = result.info;
            saveConfig(config);
            console.log(`${colors.green}✅ Bağlantı başarılı!${colors.reset}`);
            if (result.info.shareDir) console.log(`${colors.dim}   Paylaşılan klasör: ${result.info.shareDir}${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Bağlantı başarısız: ${result.error}${colors.reset}`);
            console.log(`${colors.dim}   İpucu: Cihazların aynı Wi-Fi ağında olduğundan emin olun.${colors.reset}`);
        }
    } else if (choice === '2') {
        // Remote tunnel connection
        const urlInput = await question(`${colors.yellow}Tünel URL (örn: https://abc123.loca.lt): ${colors.reset}`);
        if (!urlInput.trim()) return;

        let targetUrl = urlInput.trim();
        targetUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;

        console.log(`${colors.cyan}🔍 Uzak sunucu test ediliyor: ${targetUrl}${colors.reset}`);
        const result = await testConnection(targetUrl, 10000); // longer timeout for tunnels

        if (result.success) {
            config.apiBase = targetUrl;
            connectionMode = 'remote-tunnel';
            serverInfo = result.info;
            saveConfig(config);
            console.log(`${colors.green}✅ Uzak sunucuya bağlantı başarılı!${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Bağlantı başarısız: ${result.error}${colors.reset}`);
            console.log(`${colors.dim}   İpucu: Localtunnel için önce tarayıcıdan Public IP girilmesi gerekebilir.${colors.reset}`);
        }
    } else if (choice === '3') {
        // Start own server
        await startLocalServer();
    }

    await question("\nDevam etmek için Enter...");
}

// --- TUNNEL CONTROL ---
async function handleTunnel() {
    if (connectionMode !== 'local-server' && config.apiBase !== 'http://localhost:3000') {
        console.log(`${colors.yellow}⚠️  Tünel yönetimi sadece kendi sunucunuzda çalışır.${colors.reset}`);
        console.log(`${colors.dim}   Şu an ${config.apiBase} adresine bağlısınız.${colors.reset}`);
        await question("\nDevam etmek için Enter...");
        return;
    }

    try {
        const status = await request('GET', '/api/tunnel/status');
        console.log(`\n${colors.bright}${colors.cyan}🌐 TÜNEL YÖNETİMİ${colors.reset}`);
        if (status.running && status.url) {
            console.log(`${colors.green}Durum: Aktif ✅${colors.reset}`);
            console.log(`${colors.white}URL: ${status.url}${colors.reset}`);
            if (qrcodeTerminal) {
                console.log('');
                qrcodeTerminal.generate(status.url, { small: true });
            }
            const action = await question(`\n${colors.yellow}Tüneli kapatmak ister misiniz? (e/h): ${colors.reset}`);
            if (action.toLowerCase() === 'e') {
                await request('POST', '/api/tunnel/stop');
                console.log(`${colors.green}✅ Tünel kapatıldı.${colors.reset}`);
            }
        } else {
            console.log(`${colors.yellow}Durum: Kapalı ❌${colors.reset}`);
            const action = await question(`\n${colors.yellow}Tüneli açmak ister misiniz? (e/h): ${colors.reset}`);
            if (action.toLowerCase() === 'e') {
                console.log(`${colors.cyan}⏳ Tünel açılıyor...${colors.reset}`);
                const result = await request('POST', '/api/tunnel/start');
                if (result.url) {
                    console.log(`${colors.green}✅ Tünel açıldı: ${result.url}${colors.reset}`);
                    if (qrcodeTerminal) {
                        console.log('');
                        qrcodeTerminal.generate(result.url, { small: true });
                    }
                } else {
                    console.log(`${colors.red}❌ Tünel açılamadı: ${result.error || 'Bilinmeyen hata'}${colors.reset}`);
                }
            }
        }
    } catch (e) {
        console.log(`${colors.red}❌ Tünel durumu alınamadı: ${e.message}${colors.reset}`);
    }
    await question("\nDevam etmek için Enter...");
}

// --- BANNER ---
async function printBanner() {
    console.clear();

    // Determine connection status
    let statusIcon, statusText, statusColor;
    const result = await testConnection(config.apiBase, 3000);
    if (result.success) {
        serverInfo = result.info;
        statusIcon = '🟢';
        statusText = 'Bağlı';
        statusColor = colors.green;

        // Detect mode
        if (config.apiBase === 'http://localhost:3000') connectionMode = 'local-server';
        else if (config.apiBase.includes('loca.lt') || config.apiBase.includes('trycloudflare') || config.apiBase.startsWith('https://')) connectionMode = 'remote-tunnel';
        else connectionMode = 'remote-local';
    } else {
        serverInfo = null;
        statusIcon = '🔴';
        statusText = 'Bağlantı Yok';
        statusColor = colors.red;
        connectionMode = 'disconnected';
    }

    // Mode description
    let modeDesc;
    switch (connectionMode) {
        case 'local-server': modeDesc = '📡 Kendi Sunucum (localhost)'; break;
        case 'remote-local': modeDesc = '🏠 Yerel Ağdaki Sunucu'; break;
        case 'remote-tunnel': modeDesc = '🌍 Uzak Sunucu (Tünel)'; break;
        default: modeDesc = '❌ Bağlı Değil'; break;
    }

    console.log(`${colors.cyan}${colors.bright}╔══════════════════════════════════════════╗`);
    console.log(`║   🚀 SHARE-CLI TERMINAL ARAYÜZÜ v3.0    ║`);
    console.log(`╚══════════════════════════════════════════╝${colors.reset}`);
    console.log(`${statusColor}${statusIcon} Durum: ${statusText}${colors.reset}   ${colors.dim}${modeDesc}${colors.reset}`);
    console.log(`${colors.yellow}🔗 Sunucu:${colors.reset}  ${config.apiBase}`);

    if (serverInfo) {
        const localUrl = serverInfo.localUrl || serverInfo.url || '';
        const tunnelUrl = serverInfo.tunnelUrl || ((serverInfo.running && serverInfo.url) ? serverInfo.url : null);
        if (localUrl && connectionMode === 'local-server') {
            console.log(`${colors.yellow}🏠 Yerel:${colors.reset}   ${localUrl}`);
        }
        if (tunnelUrl) {
            console.log(`${colors.yellow}🌍 Tünel:${colors.reset}   ${tunnelUrl}`);
        }
        if (serverInfo.shareDir) {
            console.log(`${colors.yellow}📂 Klasör:${colors.reset}  ${serverInfo.shareDir}`);
        }
    }
    console.log(`${colors.yellow}📁 DoSy All:${colors.reset} ${DOSY_ALL_DIR}`);
    console.log(`${colors.cyan}${"-".repeat(44)}${colors.reset}\n`);
}

// --- MAIN LOOP ---
async function mainMenu() {
    // İlk başlatmada: sunucuya bağlıysa DoSy All'ı paylaşım klasörü yap
    try {
        const initCheck = await testConnection(config.apiBase, 3000);
        if (initCheck.success) {
            await request('POST', '/api/set-dir', { dir: DOSY_ALL_DIR });
        } else {
            console.log("\nOtomatik olarak yerel sunucu başlatılıyor...");
            await startLocalServer();
        }
    } catch (e) {
        console.log("\nOtomatik olarak yerel sunucu başlatılıyor...");
        await startLocalServer();
    }

    while (true) {
        await printBanner();

        const isConnected = connectionMode !== 'disconnected';
        const isLocalServer = connectionMode === 'local-server';

        console.log(`${colors.bright}${colors.white}ANA MENÜ:${colors.reset}`);

        if (isConnected) {
            console.log(`${colors.green}1.${colors.reset} Dosyaları Listele`);
            console.log(`${colors.green}2.${colors.reset} Dosya İndir`);
            console.log(`${colors.green}3.${colors.reset} Dosya Yükle ${colors.dim}(DoSy All veya manuel)${colors.reset}`);
        } else {
            console.log(`${colors.dim}1. Dosyaları Listele (bağlantı gerekli)${colors.reset}`);
            console.log(`${colors.dim}2. Dosya İndir (bağlantı gerekli)${colors.reset}`);
            console.log(`${colors.dim}3. Dosya Yükle (bağlantı gerekli)${colors.reset}`);
        }
        console.log(`${colors.blue}4.${colors.reset} 🔗 Sunucuya Bağlan / Kendi Sunucunu Başlat`);
        if (isLocalServer) {
            console.log(`${colors.blue}5.${colors.reset} 🌐 Tünel Yönetimi (Dış Erişim Aç/Kapa)`);
            console.log(`${colors.blue}6.${colors.reset} 📂 Paylaşılan Klasörü Değiştir`);
        } else {
            console.log(`${colors.dim}5. 🌐 Tünel Yönetimi (kendi sunucunuzda çalışır)${colors.reset}`);
            console.log(`${colors.dim}6. 📂 Paylaşılan Klasörü Değiştir (kendi sunucunuzda çalışır)${colors.reset}`);
        }
        console.log(`${colors.yellow}7.${colors.reset} 📲 Sunucu Bilgileri & QR Kodları`);
        if (isConnected) {
            console.log(`${colors.magenta}8.${colors.reset} 💬 Chat Odasına Katıl`);
        } else {
            console.log(`${colors.dim}8. 💬 Chat Odasına Katıl (bağlantı gerekli)${colors.reset}`);
        }
        console.log(`${colors.red}9.${colors.reset} 🚪 Çıkış`);

        const choice = await question(`\n${colors.magenta}Seçiminiz: ${colors.reset}`);

        try {
            if (choice === '1' && isConnected) {
                await showFileList();
                await question("\nDevam etmek için Enter...");
            }
            else if (choice === '2' && isConnected) { await handleDownload(); }
            else if (choice === '3' && isConnected) { await handleUpload(); }
            else if (choice === '4') {
                await handleConnect();
            }
            else if (choice === '5') {
                await handleTunnel();
            }
            else if (choice === '6' && isLocalServer) {
                const newPath = await question(`Paylaşılacak klasör yolu: `);
                if (newPath) {
                    const cleanPath = newPath.trim().replace(/^'|^"|'$|"$/g, '');
                    const res = await request('POST', '/api/set-dir', { dir: cleanPath });
                    if (res.shareDir) {
                        console.log(`${colors.green}✅ Sunucu klasörü güncellendi: ${res.shareDir}${colors.reset}`);
                    } else {
                        console.log(`${colors.red}❌ Hata: Klasör değiştirilemedi.${colors.reset}`);
                    }
                }
                await question("\nEnter...");
            }
            else if (choice === '7') {
                if (!isConnected) {
                    console.log(`${colors.red}⚠️  Önce bir sunucuya bağlanmalısınız. (Seçenek 4)${colors.reset}`);
                } else {
                    console.log(`\n${colors.bright}Sunucu Bilgileri & QR Kodları:${colors.reset}`);
                    const info = await request('GET', '/api/info');

                    const localUrl = info.localUrl || info.url || config.apiBase;
                    console.log(`\n${colors.yellow}🏠 YEREL AĞ BAĞLANTISI:${colors.reset}`);
                    console.log(`${localUrl}`);
                    if (qrcodeTerminal) {
                        qrcodeTerminal.generate(localUrl, { small: true });
                    } else {
                        console.log(`${colors.cyan}(QR Kodu için: npm install qrcode-terminal)${colors.reset}`);
                    }

                    const tunnelUrl = info.tunnelUrl;
                    console.log(`\n${colors.yellow}🌍 İNTERNET/TÜNEL BAĞLANTISI:${colors.reset}`);
                    if (tunnelUrl) {
                        console.log(`${tunnelUrl}`);
                        if (qrcodeTerminal) {
                            qrcodeTerminal.generate(tunnelUrl, { small: true });
                        } else {
                            console.log(`${colors.cyan}(QR Kodu için: npm install qrcode-terminal)${colors.reset}`);
                        }
                    } else if (info.tunnelError) {
                        console.log(`${colors.red}❌ Tünel Bağlantı Hatası: ${info.tunnelError}${colors.reset}`);
                        console.log(`${colors.dim}   (Sunucu otomatik olarak yeniden bağlanmaya çalışıyor...)${colors.reset}`);
                    } else {
                        console.log(`${colors.yellow}⏳ Tünel bağlantısı bekleniyor veya kapalı...${colors.reset}`);
                    }

                    if (info.publicIp) {
                        console.log(`\n${colors.yellow}🔑 Public IP (Tünel şifresi): ${colors.reset}${info.publicIp}`);
                    }
                }
                await question("\nDevam etmek için Enter...");
            }
            else if (choice === '8' && isConnected) {
                await handleChat();
            }
            else if (choice === '9') {
                console.log(`${colors.yellow}Sunucu kapatılıyor...${colors.reset}`);
                shutdownServer();
                console.log("Güle güle!");
                setTimeout(() => process.exit(0), 100);
            }
            else if (['1', '2', '3', '8'].includes(choice) && !isConnected) {
                console.log(`${colors.red}⚠️  Önce bir sunucuya bağlanmalısınız. (Seçenek 4)${colors.reset}`);
                await question("\nEnter...");
            }
        } catch (e) {
            console.log(`${colors.red}❌ Hata: ${e.message}${colors.reset}`);
            await question("\nEnter...");
        }
    }
}

// Cleanup on exit
function shutdownServer() {
    if (serverProcess) {
        try { serverProcess.kill(); } catch (e) { }
    }
    try {
        if (config.apiBase === 'http://localhost:3000' || connectionMode === 'local-server') {
            const { execSync } = require('child_process');
            execSync('curl -s -X POST http://localhost:3000/api/shutdown || true');
        }
    } catch (e) { }
}

process.on('exit', () => shutdownServer());
process.on('SIGINT', () => { shutdownServer(); setTimeout(() => process.exit(0), 100); });
process.on('SIGHUP', () => { shutdownServer(); setTimeout(() => process.exit(0), 100); });
process.on('SIGTERM', () => { shutdownServer(); setTimeout(() => process.exit(0), 100); });

mainMenu();
