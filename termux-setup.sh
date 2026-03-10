#!/data/data/com.termux/files/usr/bin/bash

echo "[>>] Dosya Paylaşım Sunucusu Kuruluyor..."

# 1. Gerekli paketleri yükle
pkg update -y
pkg install -y nodejs unzip wget

# 2. depolama izni iste
termux-setup-storage
sleep 3

# 3. Uygulama klasörünü oluştur
mkdir -p ~/dosya-paylasim
cd ~/dosya-paylasim

# 4. Kaynak kodunu indir (Bilgisayarınızdaki sunucudan veya buradan)
# Not: Kullanıcıya bu adımı manuel yapması veya yerel ağdan çekmesi söylenecek.
# Şimdilik örnek dosya varmış gibi devam ediyoruz.

if [ -f ~/storage/downloads/dosya-share-app.zip ]; then
    echo "[*] İndirilen dosya bulundu, açılıyor..."
    unzip -o ~/storage/downloads/dosya-share-app.zip -d .
else
    echo "[!] 'dosya-share-app.zip' İndirilenler klasöründe bulunamadı!"
    echo "Lütfen bilgisayarınızdaki sunucudan 'Clone to Phone' diyerek indirin."
    exit 1
fi

# 5. Bağımlılıkları yükle
npm install

# 6. Kısayol oluştur (Termux:Widget için)
mkdir -p ~/.shortcuts
cat <<EOF > ~/.shortcuts/DosyaPaylas
#!/data/data/com.termux/files/usr/bin/bash
cd ~/dosya-paylasim
echo "[>>] Sunucu Başlatılıyor..."
node server.js
EOF

chmod +x ~/.shortcuts/DosyaPaylas

echo "---------------------------------------------------"
echo "[+] Kurulum Tamamlandı!"
echo "[>] Ana ekranınıza Widget ekleyerek 'DosyaPaylas' butonuna basabilirsiniz."
echo "---------------------------------------------------"
