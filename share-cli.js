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
    underline: "\x1b[4m",
    reverse: "\x1b[7m",
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    brightRed: "\x1b[91m",
    brightGreen: "\x1b[92m",
    brightYellow: "\x1b[93m",
    brightMagenta: "\x1b[95m",
    brightCyan: "\x1b[96m",
    brightWhite: "\x1b[97m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",
    bgGray: "\x1b[100m"
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// --- UI DRAWING ---
const B = {
    tl: '\u2554', tr: '\u2557', bl: '\u255A', br: '\u255D',
    h: '\u2550', v: '\u2551', ml: '\u2560', mr: '\u2563',
    stl: '\u250C', str: '\u2510', sbl: '\u2514', sbr: '\u2518',
    sh: '\u2500', sv: '\u2502', sml: '\u251C', smr: '\u2524',
    std: '\u252C', stu: '\u2534', sx: '\u253C',
    dot: '\u00B7'
};
const W = 52;

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function padR(s, w) { return s + ' '.repeat(Math.max(0, w - stripAnsi(s).length)); }
function centerStr(s, w) {
    const gap = w - stripAnsi(s).length;
    const l = Math.floor(gap / 2);
    return ' '.repeat(Math.max(0, l)) + s + ' '.repeat(Math.max(0, gap - l));
}

function boxTop(c) { console.log(`${c}${B.tl}${B.h.repeat(W-2)}${B.tr}${colors.reset}`); }
function boxBot(c) { console.log(`${c}${B.bl}${B.h.repeat(W-2)}${B.br}${colors.reset}`); }
function boxMid(c) { console.log(`${c}${B.ml}${B.h.repeat(W-2)}${B.mr}${colors.reset}`); }
function boxRow(text, c) {
    console.log(`${c}${B.v}${colors.reset} ${padR(text, W-4)} ${c}${B.v}${colors.reset}`);
}
function boxBlank(c) { console.log(`${c}${B.v}${' '.repeat(W-2)}${B.v}${colors.reset}`); }

function sectionHead(title) {
    console.log(`\n  ${colors.bright}${colors.white}${title}${colors.reset}`);
    console.log(`  ${colors.gray}${B.sh.repeat(W - 4)}${colors.reset}`);
}

function menuItem(num, text, color = colors.brightWhite, dimmed = false) {
    if (dimmed) {
        console.log(`  ${colors.gray} ${num}   ${text}${colors.reset}`);
    } else {
        console.log(`  ${color}${colors.bright} ${num} ${colors.reset}  ${text}`);
    }
}

function prompt(text) {
    return question(`\n  ${colors.brightCyan}${B.sh}${B.sh}${colors.reset} ${colors.bright}${text}${colors.reset} `);
}

function msgOk(text) { console.log(`  ${colors.brightGreen}${colors.bright}[+]${colors.reset} ${text}`); }
function msgErr(text) { console.log(`  ${colors.brightRed}${colors.bright}[X]${colors.reset} ${text}`); }
function msgWarn(text) { console.log(`  ${colors.brightYellow}${colors.bright}[!]${colors.reset} ${text}`); }
function msgInfo(text) { console.log(`  ${colors.brightCyan}${colors.bright}[${B.dot}]${colors.reset} ${text}`); }
function msgDim(text) { console.log(`  ${colors.gray}    ${text}${colors.reset}`); }

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
    msgInfo('Dosya listesi cekiliyor...');
    const files = await request('GET', '/api/files');
    if (!files || files.length === 0) {
        msgWarn('Sunucu su an bos.');
        return [];
    }
    console.log('');
    console.log(`  ${colors.gray}${B.stl}${B.sh.repeat(5)}${B.std}${B.sh.repeat(32)}${B.std}${B.sh.repeat(10)}${B.str}${colors.reset}`);
    console.log(`  ${colors.gray}${B.sv}${colors.reset} ${colors.bright}${colors.brightWhite}ID ${colors.reset} ${colors.gray}${B.sv}${colors.reset} ${colors.bright}${colors.brightWhite}Dosya Adi${' '.repeat(22)}${colors.reset} ${colors.gray}${B.sv}${colors.reset} ${colors.bright}${colors.brightWhite}Boyut${colors.reset}    ${colors.gray}${B.sv}${colors.reset}`);
    console.log(`  ${colors.gray}${B.sml}${B.sh.repeat(5)}${B.sx}${B.sh.repeat(32)}${B.sx}${B.sh.repeat(10)}${B.smr}${colors.reset}`);
    files.forEach((f, i) => {
        const id = (i + 1).toString().padStart(2);
        const name = f.name.length > 30 ? f.name.substring(0, 27) + "..." : f.name.padEnd(30);
        const size = (f.size >= 1048576 ? (f.size / 1024 / 1024).toFixed(2) + " MB" : (f.size / 1024).toFixed(1) + " KB").padStart(8);
        console.log(`  ${colors.gray}${B.sv}${colors.reset} ${colors.brightGreen}${id}${colors.reset}  ${colors.gray}${B.sv}${colors.reset} ${name} ${colors.gray}${B.sv}${colors.reset} ${size} ${colors.gray}${B.sv}${colors.reset}`);
    });
    console.log(`  ${colors.gray}${B.sbl}${B.sh.repeat(5)}${B.stu}${B.sh.repeat(32)}${B.stu}${B.sh.repeat(10)}${B.sbr}${colors.reset}`);
    console.log(`  ${colors.gray}Toplam: ${files.length} dosya${colors.reset}`);
    return files;
}

async function handleDownload() {
    const files = await showFileList();
    if (files.length === 0) return await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
    const choice = await prompt('Indirmek istediginiz dosya no (0=iptal):');
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < files.length) {
        const fileName = files[index].name;
        msgInfo(`${fileName} indiriliyor...`);
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
        msgOk(`Basariyla indirildi:`);
        msgDim(filePath);
    }
    await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
}

// Tek dosya yükleme yardımcı fonksiyonu
async function uploadSingleFile(cleanPath) {
    const filename = path.basename(cleanPath);
    msgInfo(`${filename} yukleniyor...`);

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
                msgOk(`${filename} basariyla yuklendi!`);
                resolve(true);
            });
        });
        upReq.on('error', (err) => {
            msgErr(`${filename} yuklenemedi: ${err.message}`);
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

    console.log('');
    const bc = colors.cyan;
    boxTop(bc);
    boxRow(centerStr(`${colors.bright}${colors.brightCyan}DOSYA YUKLEME${colors.reset}`, W-4), bc);
    boxMid(bc);
    boxRow(`${colors.brightGreen}${colors.bright} 1 ${colors.reset}  DoSy All klasorunden sec ${colors.gray}(${dosyAllFiles.length} dosya)${colors.reset}`, bc);
    boxRow(`${colors.brightGreen}${colors.bright} 2 ${colors.reset}  Manuel dosya yolu gir`, bc);
    boxRow(`${colors.red}${colors.bright} 0 ${colors.reset}  ${colors.red}Iptal${colors.reset}`, bc);
    boxMid(bc);
    boxRow(`${colors.gray}DoSy All: ${DOSY_ALL_DIR}${colors.reset}`, bc);
    boxBot(bc);

    const uploadChoice = await prompt('Seciminiz:');

    if (uploadChoice === '1') {
        // DoSy All klasöründen dosya seç
        if (dosyAllFiles.length === 0) {
            msgWarn('DoSy All klasoru bos!');
            msgDim('Dosyalarinizi su klasore atin:');
            msgDim(DOSY_ALL_DIR);
            await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
            return;
        }

        console.log('');
        console.log(`  ${colors.gray}${B.stl}${B.sh.repeat(5)}${B.std}${B.sh.repeat(32)}${B.std}${B.sh.repeat(10)}${B.str}${colors.reset}`);
        console.log(`  ${colors.gray}${B.sv}${colors.reset} ${colors.bright}${colors.brightWhite}No ${colors.reset} ${colors.gray}${B.sv}${colors.reset} ${colors.bright}${colors.brightWhite}Dosya Adi${' '.repeat(22)}${colors.reset} ${colors.gray}${B.sv}${colors.reset} ${colors.bright}${colors.brightWhite}Boyut${colors.reset}    ${colors.gray}${B.sv}${colors.reset}`);
        console.log(`  ${colors.gray}${B.sml}${B.sh.repeat(5)}${B.sx}${B.sh.repeat(32)}${B.sx}${B.sh.repeat(10)}${B.smr}${colors.reset}`);
        dosyAllFiles.forEach((f, i) => {
            const fPath = path.join(DOSY_ALL_DIR, f);
            const stat = fs.statSync(fPath);
            const size = (stat.size >= 1048576 ? (stat.size / 1024 / 1024).toFixed(2) + " MB" : (stat.size / 1024).toFixed(1) + " KB").padStart(8);
            const name = f.length > 30 ? f.substring(0, 27) + "..." : f.padEnd(30);
            console.log(`  ${colors.gray}${B.sv}${colors.reset} ${colors.brightGreen}${(i + 1).toString().padStart(2)}${colors.reset}  ${colors.gray}${B.sv}${colors.reset} ${name} ${colors.gray}${B.sv}${colors.reset} ${size} ${colors.gray}${B.sv}${colors.reset}`);
        });
        console.log(`  ${colors.gray}${B.sbl}${B.sh.repeat(5)}${B.stu}${B.sh.repeat(32)}${B.stu}${B.sh.repeat(10)}${B.sbr}${colors.reset}`);
        console.log(`\n  ${colors.brightYellow}[*]${colors.reset} ${colors.gray}Hepsi: 'hepsi' | Coklu: '1,3,5' | Aralik: '1-5'${colors.reset}`);

        const fileChoice = await prompt("Dosya no (veya 'hepsi'):");

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
            msgErr('Gecersiz secim!');
        } else {
            msgInfo(`${selectedIndices.length} dosya yuklenecek...`);
            let successCount = 0;
            for (const idx of selectedIndices) {
                const filePath = path.join(DOSY_ALL_DIR, dosyAllFiles[idx]);
                const result = await uploadSingleFile(filePath);
                if (result) successCount++;
            }
            console.log('');
            msgOk(`${successCount}/${selectedIndices.length} dosya basariyla yuklendi!`);
        }
    } else if (uploadChoice === '2') {
        // Manuel dosya yolu
        const filePath = await prompt('Yuklenecek dosya yolu:');
        const cleanPath = filePath.trim().replace(/^'|^"|'$|"$/g, '');
        if (!cleanPath) {
            // boş giriş, iptal
        } else if (!fs.existsSync(cleanPath)) {
            msgErr('Dosya bulunamadi!');
        } else {
            await uploadSingleFile(cleanPath);
        }
    }

    await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
}

async function handleChat() {
    const os = require('os');
    const username = os.userInfo().username || 'CLI-User';

    console.log('');
    const bc = colors.magenta;
    boxTop(bc);
    boxRow(centerStr(`${colors.bright}${colors.brightMagenta}CHAT ODASI${colors.reset}`, W-4), bc);
    boxMid(bc);
    boxRow(`${colors.brightWhite}Kullanici:${colors.reset} ${username}`, bc);
    boxRow(`${colors.gray}Cikmak icin "exit" yazin${colors.reset}`, bc);
    boxBot(bc);
    console.log('');

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
            console.log('');
            msgWarn('Chat odasindan ayrildiniz.');
            break;
        }
        if (msg.trim()) {
            try {
                await request('POST', '/api/chat', { sender: username, text: msg.trim() });
            } catch (e) {
                msgErr(`Gonderilemedi: ${e.message}`);
            }
        }
    }

    await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
}

// --- SERVER START ---
async function startLocalServer() {
    const serverPath = path.join(__dirname, 'server.js');
    if (!fs.existsSync(serverPath)) {
        msgErr(`server.js bulunamadi: ${serverPath}`);
        return false;
    }

    // Check if already running
    const check = await testConnection('http://localhost:3000', 2000);
    if (check.success) {
        msgWarn("Port 3000'de zaten bir sunucu calisiyor.");
        config.apiBase = 'http://localhost:3000';
        connectionMode = 'local-server';
        serverInfo = check.info;
        saveConfig(config);
        // Mevcut sunucunun klasörünü DoSy All olarak ayarla
        try {
            await request('POST', '/api/set-dir', { dir: DOSY_ALL_DIR });
            msgOk(`Paylasim klasoru: ${DOSY_ALL_DIR}`);
        } catch (e) { }
        return true;
    }

    msgInfo('Sunucu baslatiliyor...');
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
            msgErr(`Sunucu kapandi (kod: ${code})`);
        }
        serverProcess = null;
    });

    // Wait for server to be ready (up to 10 seconds, 500ms aralıkla)
    for (let i = 0; i < 20; i++) {
        const dots = '.'.repeat((i % 3) + 1).padEnd(3);
        process.stdout.write(`\r  ${colors.brightCyan}${colors.bright}[${B.dot}]${colors.reset} Sunucu bekleniyor${dots} ${colors.gray}(${((i + 1) * 0.5).toFixed(1)}s)${colors.reset}   `);
        await new Promise(r => setTimeout(r, 500));
        const result = await testConnection('http://localhost:3000', 1500);
        if (result.success) {
            process.stdout.write('\r' + ' '.repeat(50) + '\r');
            msgOk('Sunucu basariyla baslatildi!');
            msgOk(`Paylasim klasoru: ${DOSY_ALL_DIR}`);
            config.apiBase = 'http://localhost:3000';
            connectionMode = 'local-server';
            serverInfo = result.info;
            saveConfig(config);
            return true;
        }
    }

    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    msgErr('Sunucu baslatilamadi. Lutfen loglari kontrol edin.');
    return false;
}

// --- CONNECT TO ANOTHER SERVER ---
async function handleConnect() {
    console.log('');
    const bc = colors.cyan;
    boxTop(bc);
    boxRow(centerStr(`${colors.bright}${colors.brightCyan}SUNUCUYA BAGLANMA${colors.reset}`, W-4), bc);
    boxMid(bc);
    boxRow(`${colors.gray}Mevcut: ${config.apiBase}${colors.reset}`, bc);
    boxMid(bc);
    boxRow(`${colors.brightGreen}${colors.bright} 1 ${colors.reset}  Yerel agdaki sunucuya baglan ${colors.gray}(IP:Port)${colors.reset}`, bc);
    boxRow(`${colors.brightGreen}${colors.bright} 2 ${colors.reset}  Uzak sunucuya baglan ${colors.gray}(Tunel URL)${colors.reset}`, bc);
    boxRow(`${colors.brightGreen}${colors.bright} 3 ${colors.reset}  Kendi sunucumu baslat ${colors.gray}(localhost:3000)${colors.reset}`, bc);
    boxRow(`${colors.red}${colors.bright} 0 ${colors.reset}  ${colors.red}Iptal - Ana Menuye Don${colors.reset}`, bc);
    boxBot(bc);

    const choice = await prompt('Seciminiz:');

    if (choice === '1') {
        // Local network connection
        const ipInput = await prompt('IP adresi ve port (orn: 192.168.1.42:3000):');
        if (!ipInput.trim()) return;

        let targetUrl = ipInput.trim();
        if (!targetUrl.startsWith('http')) targetUrl = 'http://' + targetUrl;
        if (targetUrl.split(':').length < 3) targetUrl += ':3000';
        targetUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;

        msgInfo(`Baglanti test ediliyor: ${targetUrl}`);
        const result = await testConnection(targetUrl);

        if (result.success) {
            config.apiBase = targetUrl;
            connectionMode = 'remote-local';
            serverInfo = result.info;
            saveConfig(config);
            msgOk('Baglanti basarili!');
            if (result.info.shareDir) msgDim(`Paylasilan klasor: ${result.info.shareDir}`);
        } else {
            msgErr(`Baglanti basarisiz: ${result.error}`);
            msgDim('Ipucu: Cihazlarin ayni Wi-Fi aginda oldugundan emin olun.');
        }
    } else if (choice === '2') {
        // Remote tunnel connection
        const urlInput = await prompt('Tunel URL (orn: https://abc123.loca.lt):');
        if (!urlInput.trim()) return;

        let targetUrl = urlInput.trim();
        targetUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;

        msgInfo(`Uzak sunucu test ediliyor: ${targetUrl}`);
        const result = await testConnection(targetUrl, 10000); // longer timeout for tunnels

        if (result.success) {
            config.apiBase = targetUrl;
            connectionMode = 'remote-tunnel';
            serverInfo = result.info;
            saveConfig(config);
            msgOk('Uzak sunucuya baglanti basarili!');
        } else {
            msgErr(`Baglanti basarisiz: ${result.error}`);
            msgDim('Ipucu: Localtunnel icin once tarayicidan Public IP girilmesi gerekebilir.');
        }
    } else if (choice === '3') {
        // Start own server
        await startLocalServer();
    }

    await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
}

// --- TUNNEL CONTROL ---
async function handleTunnel() {
    if (connectionMode !== 'local-server' && config.apiBase !== 'http://localhost:3000') {
        msgWarn('Tunel yonetimi sadece kendi sunucunuzda calisir.');
        msgDim(`Su an ${config.apiBase} adresine baglisiniz.`);
        await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
        return;
    }

    try {
        const status = await request('GET', '/api/tunnel/status');
        console.log('');
        const bc = colors.cyan;
        boxTop(bc);
        boxRow(centerStr(`${colors.bright}${colors.brightCyan}TUNEL YONETIMI${colors.reset}`, W-4), bc);
        boxMid(bc);
        if (status.running && status.url) {
            boxRow(`${colors.brightGreen}${colors.bright}Durum:${colors.reset} Aktif                ${colors.brightGreen}${colors.bright}[+]${colors.reset}`, bc);
            boxRow(`${colors.brightYellow}URL:${colors.reset}   ${status.url}`, bc);
            boxBot(bc);
            if (qrcodeTerminal) {
                console.log('');
                qrcodeTerminal.generate(status.url, { small: true });
            }
            const action = await prompt('Tuneli kapatmak ister misiniz? (e/h):');
            if (action.toLowerCase() === 'e') {
                await request('POST', '/api/tunnel/stop');
                msgOk('Tunel kapatildi.');
            }
        } else {
            boxRow(`${colors.brightRed}${colors.bright}Durum:${colors.reset} Kapali               ${colors.brightRed}${colors.bright}[-]${colors.reset}`, bc);
            boxBot(bc);
            const action = await prompt('Tuneli acmak ister misiniz? (e/h):');
            if (action.toLowerCase() === 'e') {
                msgInfo('Tunel aciliyor...');
                const result = await request('POST', '/api/tunnel/start');
                if (result.url) {
                    msgOk(`Tunel acildi: ${result.url}`);
                    if (qrcodeTerminal) {
                        console.log('');
                        qrcodeTerminal.generate(result.url, { small: true });
                    }
                } else {
                    msgErr(`Tunel acilamadi: ${result.error || 'Bilinmeyen hata'}`);
                }
            }
        }
    } catch (e) {
        msgErr(`Tunel durumu alinamadi: ${e.message}`);
    }
    await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
}

// --- BANNER ---
async function printBanner() {
    console.clear();

    // Determine connection status (kısa timeout - menü hızlı açılsın)
    let statusText, statusColor;
    const result = await testConnection(config.apiBase, 1500);
    if (result.success) {
        serverInfo = result.info;
        statusText = 'BAGLI';
        statusColor = colors.brightGreen;

        // Detect mode
        if (config.apiBase === 'http://localhost:3000') connectionMode = 'local-server';
        else if (config.apiBase.includes('loca.lt') || config.apiBase.includes('trycloudflare') || config.apiBase.startsWith('https://')) connectionMode = 'remote-tunnel';
        else connectionMode = 'remote-local';
    } else {
        serverInfo = null;
        statusText = 'BAGLANTI YOK';
        statusColor = colors.brightRed;
        connectionMode = 'disconnected';
    }

    // Mode description
    let modeDesc, modeIcon;
    switch (connectionMode) {
        case 'local-server': modeDesc = 'Kendi Sunucum'; modeIcon = '~'; break;
        case 'remote-local': modeDesc = 'Yerel Ag'; modeIcon = '='; break;
        case 'remote-tunnel': modeDesc = 'Tunel'; modeIcon = '@'; break;
        default: modeDesc = 'Bagli Degil'; modeIcon = 'x'; break;
    }

    // -- Title Block --
    const bc = colors.cyan;
    boxTop(bc);
    boxBlank(bc);
    boxRow(centerStr(`${colors.bright}${colors.brightCyan}S H A R E  ${colors.brightWhite}-  C L I${colors.reset}`, W-4), bc);
    boxRow(centerStr(`${colors.gray}Dosya Paylasim Terminali v3.0${colors.reset}`, W-4), bc);
    boxBlank(bc);

    // -- Status Bar --
    boxMid(bc);
    const sIcon = connectionMode !== 'disconnected' ? `${statusColor}${colors.bright} + ${colors.reset}` : `${statusColor}${colors.bright} - ${colors.reset}`;
    const sText = `${statusColor}${colors.bright}${statusText}${colors.reset}`;
    const mText = `${colors.gray}[${modeIcon}] ${modeDesc}${colors.reset}`;
    const gap = W - 4 - stripAnsi(sIcon).length - stripAnsi(sText).length - 1 - stripAnsi(mText).length;
    boxRow(`${sIcon}${sText}${' '.repeat(Math.max(2, gap))}${mText}`, bc);

    // -- Connection Info --
    boxMid(bc);
    boxRow(`${colors.brightYellow}Sunucu ${colors.gray}${B.dot}${B.dot}${colors.reset} ${config.apiBase}`, bc);

    if (serverInfo) {
        const localUrl = serverInfo.localUrl || serverInfo.url || '';
        const tunnelUrl = serverInfo.tunnelUrl || ((serverInfo.running && serverInfo.url) ? serverInfo.url : null);
        if (localUrl && connectionMode === 'local-server') {
            boxRow(`${colors.brightYellow}Yerel  ${colors.gray}${B.dot}${B.dot}${colors.reset} ${localUrl}`, bc);
        }
        if (tunnelUrl) {
            boxRow(`${colors.brightYellow}Tunel  ${colors.gray}${B.dot}${B.dot}${colors.reset} ${tunnelUrl}`, bc);
        }
        if (serverInfo.shareDir) {
            boxRow(`${colors.brightYellow}Klasor ${colors.gray}${B.dot}${B.dot}${colors.reset} ${serverInfo.shareDir}`, bc);
        }
    }
    boxRow(`${colors.brightYellow}DoSyAll${colors.gray}${B.dot}${B.dot}${colors.reset} ${DOSY_ALL_DIR}`, bc);
    boxBot(bc);
    console.log('');
}

// --- MAIN LOOP ---
async function mainMenu() {
    // İlk başlatmada: sunucuya bağlıysa DoSy All'ı paylaşım klasörü yap
    const initCheck = await testConnection(config.apiBase, 2000);
    if (initCheck.success) {
        serverInfo = initCheck.info;
        connectionMode = config.apiBase === 'http://localhost:3000' ? 'local-server' :
            (config.apiBase.includes('loca.lt') || config.apiBase.startsWith('https://')) ? 'remote-tunnel' : 'remote-local';
        try { await request('POST', '/api/set-dir', { dir: DOSY_ALL_DIR }); } catch (e) { }
    } else {
        msgInfo('Otomatik olarak yerel sunucu baslatiliyor...');
        await startLocalServer();
    }

    while (true) {
        await printBanner();

        const isConnected = connectionMode !== 'disconnected';
        const isLocalServer = connectionMode === 'local-server';

        // -- DOSYA ISLEMLERI --
        sectionHead('DOSYA ISLEMLERI');
        if (isConnected) {
            menuItem('1', 'Dosyalari Listele', colors.brightGreen);
            menuItem('2', 'Dosya Indir', colors.brightGreen);
            menuItem('3', `Dosya Yukle ${colors.gray}(DoSy All veya manuel)${colors.reset}`, colors.brightGreen);
        } else {
            menuItem('1', 'Dosyalari Listele (baglanti gerekli)', colors.gray, true);
            menuItem('2', 'Dosya Indir (baglanti gerekli)', colors.gray, true);
            menuItem('3', 'Dosya Yukle (baglanti gerekli)', colors.gray, true);
        }

        // -- SUNUCU & AG --
        sectionHead('SUNUCU & AG');
        menuItem('4', 'Sunucuya Baglan / Baslat', colors.brightCyan);
        if (isLocalServer) {
            menuItem('5', 'Tunel Yonetimi (Dis Erisim)', colors.brightCyan);
            menuItem('6', 'Paylasilan Klasoru Degistir', colors.brightCyan);
        } else {
            menuItem('5', 'Tunel Yonetimi (kendi sunucunuzda)', colors.gray, true);
            menuItem('6', 'Klasoru Degistir (kendi sunucunuzda)', colors.gray, true);
        }

        // -- DIGER --
        sectionHead('DIGER');
        menuItem('7', 'Sunucu Bilgileri & QR Kodlari', colors.brightYellow);
        if (isConnected) {
            menuItem('8', 'Chat Odasina Katil', colors.brightMagenta);
        } else {
            menuItem('8', 'Chat Odasina Katil (baglanti gerekli)', colors.gray, true);
        }
        console.log(`\n  ${colors.gray}${B.sh.repeat(W - 4)}${colors.reset}`);
        menuItem('9', `${colors.red}Cikis${colors.reset}`, colors.red);

        const choice = await prompt('Seciminiz:');

        try {
            if (choice === '1' && isConnected) {
                await showFileList();
                await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
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
                const newPath = await prompt('Paylasilacak klasor yolu:');
                if (newPath) {
                    const cleanPath = newPath.trim().replace(/^'|^"|'$|"$/g, '');
                    const res = await request('POST', '/api/set-dir', { dir: cleanPath });
                    if (res.shareDir) {
                        msgOk(`Sunucu klasoru guncellendi: ${res.shareDir}`);
                    } else {
                        msgErr('Klasor degistirilemedi.');
                    }
                }
                await question(`\n  ${colors.gray}Enter...${colors.reset}`);
            }
            else if (choice === '7') {
                if (!isConnected) {
                    msgErr('Once bir sunucuya baglanmalisiniz. (Secenek 4)');
                } else {
                    const info = await request('GET', '/api/info');
                    console.log('');
                    const bc7 = colors.cyan;
                    boxTop(bc7);
                    boxRow(centerStr(`${colors.bright}${colors.brightCyan}SUNUCU BILGILERI & QR${colors.reset}`, W-4), bc7);
                    boxBot(bc7);

                    const localUrl = info.localUrl || info.url || config.apiBase;
                    console.log(`\n  ${colors.bright}${colors.brightYellow}YEREL AG BAGLANTISI${colors.reset}`);
                    console.log(`  ${colors.gray}${B.sh.repeat(W-4)}${colors.reset}`);
                    console.log(`  ${colors.brightWhite}${localUrl}${colors.reset}`);
                    if (qrcodeTerminal) {
                        qrcodeTerminal.generate(localUrl, { small: true });
                    } else {
                        msgDim('QR Kodu icin: npm install qrcode-terminal');
                    }

                    const tunnelUrl = info.tunnelUrl;
                    console.log(`\n  ${colors.bright}${colors.brightYellow}INTERNET / TUNEL BAGLANTISI${colors.reset}`);
                    console.log(`  ${colors.gray}${B.sh.repeat(W-4)}${colors.reset}`);
                    if (tunnelUrl) {
                        console.log(`  ${colors.brightWhite}${tunnelUrl}${colors.reset}`);
                        if (qrcodeTerminal) {
                            qrcodeTerminal.generate(tunnelUrl, { small: true });
                        } else {
                            msgDim('QR Kodu icin: npm install qrcode-terminal');
                        }
                    } else if (info.tunnelError) {
                        msgErr(`Tunel Baglanti Hatasi: ${info.tunnelError}`);
                        msgDim('Sunucu otomatik olarak yeniden baglanmaya calisiyor...');
                    } else {
                        msgInfo('Tunel baglantisi bekleniyor veya kapali...');
                    }

                    if (info.publicIp) {
                        console.log(`\n  ${colors.bright}${colors.brightYellow}PUBLIC IP ${colors.gray}(Tunel sifresi)${colors.reset}`);
                        console.log(`  ${colors.gray}${B.sh.repeat(W-4)}${colors.reset}`);
                        console.log(`  ${colors.brightWhite}${info.publicIp}${colors.reset}`);
                    }
                }
                await question(`\n  ${colors.gray}Devam etmek icin Enter...${colors.reset}`);
            }
            else if (choice === '8' && isConnected) {
                await handleChat();
            }
            else if (choice === '9') {
                console.log('');
                msgInfo('Sunucu kapatiliyor...');
                shutdownServer();
                console.log(`\n  ${colors.bright}${colors.brightCyan}Gule gule!${colors.reset}\n`);
                setTimeout(() => process.exit(0), 100);
            }
            else if (['1', '2', '3', '8'].includes(choice) && !isConnected) {
                msgErr('Once bir sunucuya baglanmalisiniz. (Secenek 4)');
                await question(`\n  ${colors.gray}Enter...${colors.reset}`);
            }
        } catch (e) {
            msgErr(`Hata: ${e.message}`);
            await question(`\n  ${colors.gray}Enter...${colors.reset}`);
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
