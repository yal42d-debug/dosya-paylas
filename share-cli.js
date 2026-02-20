#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const readline = require('readline');

// --- CONFIG ---
const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.share-cli-config.json');
function saveConfig(config) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config)); }
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH));
    return { apiBase: 'http://localhost:3000' };
}
let config = loadConfig();

// --- UI HELPERS ---
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m"
};

function printBanner() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}==========================================`);
    console.log(`🚀 SHARE-CLI TERMINAL ARAYÜZÜ v2.0`);
    console.log(`==========================================${colors.reset}`);
    console.log(`${colors.yellow}📡 Bağlı Sunucu:${colors.reset} ${config.apiBase}\n`);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// --- API CORE ---
async function request(method, path, data = null, isDownload = false) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(path, config.apiBase);
            const protocol = url.protocol === 'https:' ? https : http;
            const options = { method, headers: { 'Bypass-Tunnel-Reminder': 'true' } };
            const req = protocol.request(url, options, (res) => {
                if (isDownload) return resolve(res);
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve(body); } });
            });
            req.on('error', reject);
            req.end();
        } catch (e) { reject(e); }
    });
}

// --- ACTIONS ---
async function showFileList() {
    console.log(`${colors.blue}📥 Dosya Listesi Çekiliyor...${colors.reset}`);
    const files = await request('GET', '/api/files');
    console.log(`\n${colors.bright}İsim${" ".repeat(30)} | Boyut${colors.reset}`);
    console.log("-".repeat(50));
    files.forEach((f, i) => {
        const name = f.name.length > 30 ? f.name.substring(0, 27) + "..." : f.name.padEnd(30);
        const size = (f.size / 1024 / 1024).toFixed(2) + " MB";
        console.log(`${colors.green}[${i + 1}]${colors.reset} ${name} | ${size}`);
    });
    return files;
}

async function handleDownload() {
    const files = await showFileList();
    if (files.length === 0) return await question("\nSunucu boş. Devam etmek için Enter...");
    const choice = await question(`\n${colors.yellow}İndirmek istediğiniz dosya no (veya iptal için 0): ${colors.reset}`);
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < files.length) {
        const fileName = files[index].name;
        console.log(`${colors.cyan}⏳ ${fileName} indiriliyor...${colors.reset}`);
        const res = await request('GET', `/api/download/${encodeURIComponent(fileName)}`, null, true);
        const fileStream = fs.createWriteStream(fileName);
        res.pipe(fileStream);
        await new Promise(r => fileStream.on('finish', r));
        console.log(`${colors.green}✅ Başarıyla indirildi: ${fileName}${colors.reset}`);
    }
    await question("\nDevam etmek için Enter...");
}

async function handleUpload() {
    const filePath = await question(`\n${colors.yellow}Yüklenecek dosya yolu: ${colors.reset}`);
    if (!fs.existsSync(filePath)) {
        console.log(`${colors.red}❌ Hata: Dosya bulunamadı!${colors.reset}`);
    } else {
        const filename = path.basename(filePath);
        console.log(`${colors.cyan}⏳ ${filename} yükleniyor...${colors.reset}`);

        const boundary = '----Boundary' + Math.random().toString(36).substring(2);
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;
        const stat = fs.statSync(filePath);
        const url = new URL('/api/upload', config.apiBase);
        const protocol = url.protocol === 'https:' ? https : http;

        const upReq = protocol.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(header) + stat.size + Buffer.byteLength(footer),
                'Bypass-Tunnel-Reminder': 'true'
            }
        }, (res) => {
            res.on('data', () => { });
            res.on('end', () => console.log(`${colors.green}✅ Yüklendi!${colors.reset}`));
        });

        upReq.write(header);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(upReq, { end: false });
        await new Promise(r => fileStream.on('end', r));
        upReq.end(footer);
    }
    await question("\nDevam etmek için Enter...");
}

// --- MAIN LOOP ---
async function mainMenu() {
    while (true) {
        printBanner();
        console.log(`${colors.bright}MENÜ:${colors.reset}`);
        console.log(`1. Dosyaları Listele`);
        console.log(`2. Dosya İndir`);
        console.log(`3. Dosya Yükle`);
        console.log(`4. Tünel/Sunucu Adresi Değiştir`);
        console.log(`5. Çıkış`);

        const choice = await question(`\n${colors.magenta}Seçiminiz: ${colors.reset}`);

        try {
            if (choice === '1') { await showFileList(); await question("\nDevam etmek için Enter..."); }
            else if (choice === '2') { await handleDownload(); }
            else if (choice === '3') { await handleUpload(); }
            else if (choice === '4') {
                const newUrl = await question(`Yeni adres (http://...): `);
                if (newUrl) {
                    config.apiBase = newUrl.endsWith('/') ? newUrl.slice(0, -1) : newUrl;
                    saveConfig(config);
                    console.log(`${colors.green}Adres güncellendi!${colors.reset}`);
                }
            }
            else if (choice === '5') { console.log("Güle güle!"); process.exit(0); }
        } catch (e) {
            console.log(`${colors.red}❌ Hata: ${e.message}${colors.reset}`);
            await question("\nEnter...");
        }
    }
}

mainMenu();
