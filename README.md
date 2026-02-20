# 🚀 Local File Share (Hızlı Dosya Paylaşım Sistemi)

Bu proje, yerel ağda ve internet üzerinde cihazlar arası (APK'dan APK'ya, Web'den APK'ya) ışık hızında dosya transferi yapmanıza olanak sağlar.

## 🛠 Hızlı Başlat (Sunucu + Arayüz)

Artık sunucuyu ayrı, arayüzü ayrı başlatmanıza gerek yok! Terminale şu tek satırı yapıştırın, sistem hem sunucuyu arka planda kurar hem de arayüzü açar:

```bash
curl -sL https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/start-share.sh | bash
```
*(Not: Bu komut sunucuyu kontrol eder, kapalıysa otomatik başlatır.)*

## ✨ Özellikler

- **APK-to-APK Paylaşım:** Cihazların QR kodlarını birbirine taratarak doğrudan dosya transferi.
- **Terminal Arayüzü (CLI):** Projeyi terminalden renkli bir menü ile yönetme.
- **Otomatik Tünel:** Dış dünyaya kapalı ağlarda bile internet üzerinden erişim.
- **Kendi Dosya Yöneticisi:** Uygulama içinden indirdiğiniz dosyaları anında görüntüleme.

## 📦 Kurulum (Geliştiriciler İçin)

1. Depoyu klonlayın.
2. `npm install` komutunu çalıştırın.
3. Sunucuyu başlatın: `node server.js --tunnel`

---
Copyright © 2026 Yalcin Degirmenci. Tüm Hakları Saklıdır.
