# 🚀 Local File Share (Hızlı Dosya Paylaşım Sistemi)

Bu proje, yerel ağda ve internet üzerinde cihazlar arası (APK'dan APK'ya, Web'den APK'ya) ışık hızında dosya transferi yapmanıza olanak sağlar.

## 🛠 Hızlı Başlat (Sunucu + Arayüz)

Artık sunucuyu ayrı, arayüzü ayrı başlatmanıza gerek yok! Terminale/CMD'ye şu tek satırı yapıştırın, sistem hem sunucuyu arka planda kurar hem de CLI arayüzünü açar:

**Mac & Linux & Termux için:**
```bash
curl -sL https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/start-share.sh | bash
```

**Windows (CMD veya PowerShell) için:**
```powershell
powershell -Command "$r=Get-Random; irm https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/start-share.ps1?v=$r | iex"
```

*(Not: Bu komutlar sunucuyu kontrol eder, kapalıysa arka planda otomatik başlatır.)*

## ✨ Özellikler

- **APK-to-APK Paylaşım:** Cihazların QR kodlarını birbirine taratarak doğrudan dosya transferi.
- **Terminal Arayüzü (CLI):** Projeyi terminalden renkli bir menü ile yönetme.
- **Native HTTP Tünel (v1.3.0):** (Localtunnel) Dış dünyaya kapalı ağlarda IP sorma duvarına takılmadan (Bypass-Tunnel-Reminder), `cordova-plugin-advanced-http` ile internet üzerinden şifresiz, tek dokunuşla dosya aktarımı.
- **Kendi Dosya Yöneticisi:** Uygulama içinden indirdiğiniz dosyaları anında görüntüleme.
- **Mesajlaşma (Chat):** Web ve mobil uygulama üzerinden anlık mesajlaşma desteği.
- **Dinamik Web Arayüzü:** Tünel durumunu canlı izleme, uzak alan adı girme ve sekme yapısı.

## 📦 Kurulum (Geliştiriciler İçin)

1. Depoyu klonlayın.
2. `npm install` komutunu çalıştırın.
3. Sunucuyu başlatın: `node server.js` (Tünel otomatik başlar ve bağlanır).

---
Copyright © 2026 Yalcin Degirmenci. Tüm Hakları Saklıdır.
