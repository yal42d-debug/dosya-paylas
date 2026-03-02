# 📋 Dosya Paylaş — Proje Analizi

> **Son Güncelleme:** 2 Mart 2026 — v1.0.0
> Bu dosya her kod değişikliğinde otomatik güncellenir.

## Genel Bakış

**Dosya Paylaş**, yerel ağ (LAN) ve internet üzerinden cihazlar arası dosya transferi sağlayan kapsamlı bir dosya paylaşım sistemidir. Proje 4 ana bileşenden oluşur.

---

## 🏗️ Mimari & Bileşenler

```
┌──────────────────────────────────────────────────────────┐
│                    DOSYA PAYLAŞ SİSTEMİ                  │
├──────────────┬──────────────┬──────────────┬─────────────┤
│  🖥️ PC       │  📱 Mobil    │  🌐 Web UI   │  💻 CLI     │
│  Sunucu      │  Uygulama   │  (Tarayıcı)  │  Terminal   │
│  (server.js) │  (Cordova)  │  (index.html)│  (share-cli)│
├──────────────┴──────────────┴──────────────┴─────────────┤
│               HTTP API + Localtunnel/Cloudflared         │
└──────────────────────────────────────────────────────────┘
```

---

## 1. PC Sunucusu — `server.js`

| Özellik | Durum |
|---------|-------|
| Dosya yükleme (çoklu) | ✅ `multer` ile |
| Dosya indirme | ✅ `/download/:filename` |
| Dosya silme | ✅ `DELETE /api/files/:filename` |
| Dosya listeleme | ✅ isim, boyut, tarih |
| Paylaşılan klasör değiştirme | ✅ `--dir` arg veya API |
| QR Kod (terminal) | ✅ `qrcode-terminal` |
| Localtunnel tüneli | ✅ otomatik 3 deneme |
| APK sunma | ✅ `/download-apk` |
| UTF-8 dosya adı desteği | ✅ latin1→utf8 dönüşümü |
| Public IP çözümleme | ✅ ipify.org |

**Bağımlılıklar:** express, multer, cors, qrcode, qrcode-terminal, ip, archiver, localtunnel

---

## 2. Web Arayüzü — `public/index.html` (500 satır)

| Özellik | Durum |
|---------|-------|
| Drag & Drop dosya yükleme | ✅ |
| Dosya listesi (isim + boyut) | ✅ |
| Dosya indirme / silme | ✅ |
| Tünel aç/kapat kontrolü | ✅ |
| QR Kod modal | ✅ |
| APK indirme butonu | ✅ |
| Dark mode tasarım | ✅ |
| Yükleme progress bar | ❌ Yok |
| Responsive tasarım | ⚠️ Temel |

---

## 3. Mobil Uygulama — `mobile-app-fixed/` (Cordova)

### 3.1 Mobil Web UI — `www/index.html` (1136 satır)

| Özellik | Durum |
|---------|-------|
| Dosya yükleme/indirme/silme | ✅ |
| QR Kod tarama (kamera) | ✅ `barcodeScanner` |
| QR Kod gösterme (Lokal/Uzak/Wi-Fi/Firebase) | ✅ 4 sekmeli modal |
| Wi-Fi QR Kod oluşturma | ✅ |
| Mesajlaşma (chat) | ✅ Gerçek zamanlı polling |
| İndirilen dosya yöneticisi | ✅ Aç/Sil |
| Cloudflared tünel (URL yapıştır) | ✅ |
| Firebase entegrasyonu | ✅ Config kaydetme, dosya yükleme |
| Başka sunucuya bağlanma (QR ile) | ✅ BASE_URL değiştirme |
| Yerel Node.js sunucu | ✅ `nodejs-mobile-cordova` |
| Bildirimler | ✅ `local-notification` |

### 3.2 Mobil Sunucu — `mobile-app-fixed/server.js` (226 satır)

| Özellik | Durum |
|---------|-------|
| Dosya CRUD | ✅ |
| QR Kod oluşturma | ✅ `qrcode` kütüphanesi |
| Cloudflared tünel yönetimi | ✅ `spawn` ile |
| GitHub Gist güncelleme | ✅ İnternet keşfi için |
| Kaynak kodu ZIP indirme | ✅ `/download-app` |

### 3.3 Cordova Plugin'leri (11 adet)

| Plugin | Amaç |
|--------|------|
| `nodejs-mobile-cordova` | Telefonun içinde Node.js çalıştırma |
| `phonegap-plugin-barcodescanner` | QR Kod okuma |
| `cordova-plugin-file` | Dosya sistemi erişimi |
| `cordova-plugin-file-transfer` | Dosya indirme |
| `cordova-plugin-file-opener2` | İndirilen dosyaları açma |
| `cordova-plugin-local-notification` | Bildirimler |
| `cordova-plugin-inappbrowser` | Uygulama içi tarayıcı |
| `cordova-plugin-android-permissions` | İzin yönetimi |
| `cordova-plugin-customurlscheme` | `localfileshare://` URL |
| `cordova-plugin-android-intent` | Android intent desteği |
| `cordova-plugin-device` | Cihaz bilgisi |

---

## 4. Terminal CLI — `share-cli.js` (246 satır)

| Özellik | Durum |
|---------|-------|
| Renkli menü arayüzü | ✅ |
| Dosya listeleme | ✅ |
| Dosya indirme | ✅ |
| Dosya yükleme (multipart) | ✅ |
| Başka sunucuya bağlanma | ✅ Config kaydetme |
| Klasör değiştirme | ✅ |
| QR Kod gösterme | ✅ |

---

## 🔍 Tespit Edilen Sorunlar

### 🔴 Kritik

| # | Sorun | Açıklama | Düzeltildi? |
|---|-------|----------|-------------|
| 1 | Path traversal | Dosya indirme/silme'de parametre doğrulaması yok | ❌ |
| 2 | Erişim kontrolü yok | Tüm API'ler kimliksiz açık | ❌ |
| 3 | `archive.finalize()` 2x | `mobile-app-fixed/server.js` satır 133 | ❌ |
| 4 | Chat API eksik | `/api/chat` mobil sunucuda tanımlı değil | ❌ |
| 5 | Firebase API eksik | `/api/firebase/*` ve `/api/qr/custom` yok | ❌ |

### 🟡 Orta

| # | Sorun | Açıklama | Düzeltildi? |
|---|-------|----------|-------------|
| 6 | Upload progress yok | Büyük dosyalarda ilerleme göstergesi yok | ❌ |
| 7 | Dosya boyutu limiti yok | Sunucu belleği tükenebilir | ❌ |
| 8 | Hata yönetimi zayıf | Genel catch blokları | ❌ |
| 9 | İki ayrı mobile-app klasörü | Hangisi güncel belirsiz | ❌ |
| 10 | Web QR kodu kırık | PC `server.js` `qrCode` alanı döndürmüyor | ❌ |

---

## 📊 Değişiklik Geçmişi

| Tarih | Sürüm | Değişiklik |
|-------|-------|------------|
| 2 Mart 2026 | v1.0.0 | İlk analiz oluşturuldu |

---

## 📁 Proje Yapısı

```
dosya paylaş/
├── server.js              # Ana PC sunucusu (Express)
├── share-cli.js           # Terminal menü arayüzü
├── start-share.sh         # curl | bash bootstrap
├── package.json           # Node.js bağımlılıkları
├── Project_Analysis.md    # Bu dosya
├── public/
│   └── index.html         # Web arayüzü (PC)
├── mobile-app-fixed/      # Güncel Cordova projesi
│   ├── server.js          # Mobil Node.js sunucu
│   ├── config.xml         # Cordova yapılandırma
│   ├── www/
│   │   ├── index.html     # Mobil UI (1136 satır)
│   │   ├── nodejs-project/# Node.js mobil sunucu kodu
│   │   └── js/            # JS dosyaları
│   └── platforms/android/ # Android build
├── mobile-app/            # Eski/yedek mobil uygulama
├── uploads/               # Paylaşılan dosyalar
├── .agents/workflows/     # Otomasyon workflow'ları
│   ├── apk-olustur.md     # APK derleme workflow'u
│   └── github-guncelle.md # GitHub push workflow'u
└── *.apk                  # Derlenmiş APK dosyaları
```
