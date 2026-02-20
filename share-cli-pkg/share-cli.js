#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];

// Help Menu
if (!command || command === '--help' || command === '-h') {
    console.log(`
🚀 SHARE-CLI: Dosya Paylaş Terminal Aracı
---------------------------------------
Kullanım:
  npx share-cli <komut> [parametreler]

Komutlar:
  connect <url>     -> Sunucuya bağlanır (Lokal veya Tunnel URL)
  list              -> Sunucudaki dosyaları listeler
  upload <dosya>    -> Sunucuya dosya yükler
  download <isim>   -> Sunucudan dosya indirir
  status            -> Mevcut bağlantı durumunu gösterir

Örnek:
  npx share-cli connect http://xyz.loca.lt
  npx share-cli list
  npx share-cli upload resim.jpg
    `);
    process.exit(0);
}

// Config management
const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE, '.share-cli-config.json');

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    }
    return { apiBase: 'http://localhost:3000' };
}

let config = loadConfig();

// API Helper
async function request(method, path, data = null, isDownload = false) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, config.apiBase);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
            method: method,
            headers: {
                'Bypass-Tunnel-Reminder': 'true'
            }
        };

        if (data && !isDownload) {
            // Check if it's FormData for upload
            if (data.headers) {
                Object.assign(options.headers, data.headers);
            } else {
                options.headers['Content-Type'] = 'application/json';
            }
        }

        const req = protocol.request(url, options, (res) => {
            if (isDownload) {
                resolve(res);
                return;
            }

            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);
        if (data && !isDownload && !data.stream) req.write(typeof data === 'string' ? data : JSON.stringify(data));
        if (data && data.stream) data.stream.pipe(req);
        else req.end();
    });
}

// Command Logic
async function run() {
    try {
        switch (command) {
            case 'connect':
                const newUrl = args[1];
                if (!newUrl) return console.log('❌ Hata: URL belirtilmedi.');
                config.apiBase = newUrl.endsWith('/') ? newUrl.slice(0, -1) : newUrl;
                saveConfig(config);
                console.log(`✅ Bağlantı kuruldu: ${config.apiBase}`);
                break;

            case 'status':
                console.log(`📡 Mevcut Sunucu: ${config.apiBase}`);
                break;

            case 'list':
                const files = await request('GET', '/api/files');
                console.log('\n📁 Sunucudaki Dosyalar:');
                console.log('-----------------------');
                if (files.length === 0) console.log('Boş.');
                files.forEach(f => console.log(`- ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`));
                console.log('');
                break;

            case 'download':
                const fileName = args[1];
                if (!fileName) return console.log('❌ Hata: Dosya ismi belirtilmedi.');
                console.log(`⏳ İndiriliyor: ${fileName}...`);
                const res = await request('GET', `/api/download/${encodeURIComponent(fileName)}`, null, true);
                if (res.statusCode !== 200) return console.log('❌ Hata: Dosya bulunamadı.');

                const fileStream = fs.createWriteStream(fileName);
                res.pipe(fileStream);
                fileStream.on('finish', () => console.log(`✅ Tamamlandı: ${fileName}`));
                break;

            case 'upload':
                const uploadPath = args[1];
                if (!uploadPath || !fs.existsSync(uploadPath)) return console.log('❌ Hata: Geçersiz dosya yolu.');

                console.log(`⏳ Yükleniyor: ${path.basename(uploadPath)}...`);

                // Form-data manual construction for zero dependencies
                const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
                const filename = path.basename(uploadPath);

                const header = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
                const footer = `\r\n--${boundary}--\r\n`;

                const stat = fs.statSync(uploadPath);
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
                    res.on('end', () => console.log(`✅ Yüklendi: ${filename}`));
                });

                upReq.write(header);
                fs.createReadStream(uploadPath).pipe(upReq, { end: false });
                fs.createReadStream(uploadPath).on('end', () => {
                    upReq.end(footer);
                });
                break;

            default:
                console.log('❌ Bilinmeyen komut. Yardım için --help kullanın.');
        }
    } catch (e) {
        console.error('❌ Bir hata oluştu:', e.message);
    }
}

run();
