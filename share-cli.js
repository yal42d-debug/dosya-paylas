#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const readline = require('readline');
let qrcodeTerminal;
try {
    qrcodeTerminal = require('qrcode-terminal');
} catch (e) {
    // qrcode-terminal is optional
}

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
    red: "\x1b[31m",
    white: "\x1b[37m"
};

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
            const options = {
                method,
                timeout: 5000,
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
        const size = (f.size / 1024 / 1024).toFixed(2) + " MB";
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
    const cleanPath = filePath.trim().replace(/^'|^"|'$|"$/g, '');
    if (!fs.existsSync(cleanPath)) {
        console.log(`${colors.red}❌ Hata: Dosya bulunamadı!${colors.reset}`);
    } else {
        const filename = path.basename(cleanPath);
        console.log(`${colors.cyan}⏳ ${filename} yükleniyor...${colors.reset}`);

        const boundary = '----Boundary' + Math.random().toString(36).substring(2);
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;
        const stat = fs.statSync(cleanPath);
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
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => console.log(`${colors.green}✅ Başarıyla yüklendi!${colors.reset}`));
        });

        upReq.write(header);
        const fileStream = fs.createReadStream(cleanPath);
        fileStream.pipe(upReq, { end: false });
        await new Promise(r => fileStream.on('end', r));
        upReq.end(footer);
    }
    await question("\nDevam etmek için Enter...");
}

// --- BANNER UPDATE ---
async function printBanner() {
    console.clear();
    let info = { localUrl: 'Bilinmiyor', tunnelUrl: null, shareDir: 'Bilinmiyor' };
    try {
        info = await request('GET', '/api/info');
    } catch (e) {
        console.log(`${colors.red}⚠️  Sunucu Bağlantısı Yok!${colors.reset}`);
    }

    console.log(`${colors.cyan}${colors.bright}==========================================`);
    console.log(`🚀 SHARE-CLI TERMINAL ARAYÜZÜ v2.1`);
    console.log(`==========================================${colors.reset}`);
    console.log(`${colors.yellow}🏠 Yerel Ağ:  ${colors.reset} ${info.localUrl}`);
    if (info.tunnelUrl) {
        console.log(`${colors.yellow}🌍 İnternet:  ${colors.reset} ${info.tunnelUrl}`);
    }
    console.log(`${colors.yellow}📂 Klasör:    ${colors.reset} ${info.shareDir}`);
    console.log(`${colors.white}${"-".repeat(42)}${colors.reset}\n`);
}

// --- MAIN LOOP ---
async function mainMenu() {
    while (true) {
        await printBanner();
        console.log(`${colors.bright}${colors.white}ANA MENÜ:${colors.reset}`);
        console.log(`${colors.green}1.${colors.reset} Dosyaları Listele`);
        console.log(`${colors.green}2.${colors.reset} Dosya İndir`);
        console.log(`${colors.green}3.${colors.reset} Dosya Yükle`);
        console.log(`${colors.blue}4.${colors.reset} Tünel/Sunucu Adresi Değiştir`);
        console.log(`${colors.blue}5.${colors.reset} Paylaşılan Klasörü Değiştir (Sunucuda)`);
        console.log(`${colors.yellow}6.${colors.reset} Sunucu Bilgileri (QR Kodları)`);
        console.log(`${colors.red}7.${colors.reset} Güle Güle (Çıkış)`);

        const choice = await question(`\n${colors.magenta}Seçiminiz: ${colors.reset}`);

        try {
            if (choice === '1') { await showFileList(); await question("\nDevam etmek için Enter..."); }
            else if (choice === '2') { await handleDownload(); }
            else if (choice === '3') { await handleUpload(); }
            else if (choice === '4') {
                const newUrl = await question(`Yeni adres (örn: http://localhost:3000): `);
                if (newUrl) {
                    config.apiBase = newUrl.trim().endsWith('/') ? newUrl.trim().slice(0, -1) : newUrl.trim();
                    saveConfig(config);
                    console.log(`${colors.green}✅ Adres güncellendi!${colors.reset}`);
                }
                await question("\nEnter...");
            }
            else if (choice === '5') {
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
            else if (choice === '6') {
                console.log(`\n${colors.bright}Sunucu Bilgileri & QR Kodları:${colors.reset}`);
                const info = await request('GET', '/api/info');

                console.log(`\n${colors.yellow}🏠 YEREL AĞ BAĞLANTISI:${colors.reset}`);
                console.log(`${info.localUrl}`);
                if (qrcodeTerminal) {
                    qrcodeTerminal.generate(info.localUrl, { small: true });
                } else {
                    console.log(`${colors.cyan}(QR Kodu için: npm install qrcode-terminal)${colors.reset}`);
                }

                if (info.tunnelUrl) {
                    console.log(`\n${colors.yellow}🌍 İNTERNET/TÜNEL BAĞLANTISI:${colors.reset}`);
                    console.log(`${info.tunnelUrl}`);
                    if (qrcodeTerminal) {
                        qrcodeTerminal.generate(info.tunnelUrl, { small: true });
                    } else {
                        console.log(`${colors.cyan}(QR Kodu için: npm install qrcode-terminal)${colors.reset}`);
                    }
                }
                await question("\nDevam etmek için Enter...");
            }
            else if (choice === '7') { console.log("Güle güle!"); process.exit(0); }
        } catch (e) {
            console.log(`${colors.red}❌ Hata: ${e.message}${colors.reset}`);
            await question("\nEnter...");
        }
    }
}

mainMenu();
