#!/bin/bash

# Renkli mesajlar
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}🚀 SHARE-CLI HIZLI BAŞLATICI${NC}"
echo -e "${BLUE}==========================================${NC}"

# Node.js kontrolü
if ! command -v node &> /dev/null
then
    echo -e "${YELLOW}⚠️ Node.js bulunamadı. Otomatik kuruluyor...${NC}"
    # macOS/Linux için hızlı Node kurulumu (Node.js web sitesinden prebuilt binary çekmek yerine nvm/brew mantığı)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command -v brew &> /dev/null; then
            echo "Lütfen önce Homebrew kurun veya Node.js'i manuel yükleyin."
            exit
        fi
        brew install node
    else
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
fi

# Geçici bir klasöre aracı indir ve çalıştır
TMP_DIR=$(mktemp -d)
echo -e "${BLUE}📦 Bağımlılıklar hazırlanıyor...${NC}"
cd "$TMP_DIR"

# npm projesi başlat ve gerekli paketleri kur
npm init -y &> /dev/null
echo -e "${BLUE}📦 Bağımlılıklar yükleniyor...${NC}"
npm install express multer ip qrcode qrcode-terminal cors archiver localtunnel &> /dev/null

# Sunucu kontrolü ve başlatma (En güncel sürüm ve tünel kontrolü)
SHOULD_RESTART=false
SERVER_INFO=$(curl -s http://localhost:3000/api/info)
WEB_CHECK=$(curl -s -I http://localhost:3000/ | grep "200 OK")

if [ $? -ne 0 ] || [ -z "$WEB_CHECK" ]; then
    SHOULD_RESTART=true
else
    # Sunucu çalışıyor ama tünel yoksa (null ise) veya web eksikse restart et
    HAS_TUNNEL=$(echo $SERVER_INFO | grep -o '"tunnelUrl":"http')
    if [ -z "$HAS_TUNNEL" ]; then
        echo -e "${YELLOW}🔄 Mevcut sunucuda aktif tünel yok veya web arayüzü eksik, güncelleniyor...${NC}"
        lsof -ti :3000 | xargs kill -9 &> /dev/null
        sleep 1
        SHOULD_RESTART=true
    fi
fi

if [ "$SHOULD_RESTART" = true ]; then
    echo -e "${YELLOW}🌐 Sunucu güncelleniyor ve baştan başlatılıyor...${NC}"
    # Eski süreci öldürdüğümüzden emin olalım
    lsof -ti :3000 | xargs kill -9 &> /dev/null
    sleep 1

    curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/server.js?v=$(date +%s)" -o "server.js"
    
    # Web arayüzü dosyasını indir (Klasör ve dosya kontrolü)
    mkdir -p public
    echo -e "${BLUE}📁 Web dosyaları indiriliyor...${NC}"
    curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/public/index.html?v=$(date +%s)" -o "public/index.html"
    
    # Sunucuyu arka planda başlat
    node server.js > server.log 2>&1 &
    # Tünelin ve sunucunun tam açılması için bekle
    echo -e "${BLUE}⏳ Sunucu ve İnternet Bağlantısı kuruluyor...${NC}"
    echo -e "${BLUE}   (Bypass-Tunnel-Reminder aktif ediliyor...)${NC}"
    for i in {1..8}; do echo -n "."; sleep 1; done
    echo -e ""
fi

echo -e "${BLUE}📥 Araç indiriliyor...${NC}"
curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/share-cli.js?v=$(date +%s)" -o "share-cli.js"

if [ -f "share-cli.js" ]; then
    node "share-cli.js" < /dev/tty
else
    echo -e "${RED}❌ Araç indirilemedi. Lütfen internet bağlantınızı kontrol edin.${NC}"
fi

# Çalışma dizinine geri dön (geçici klasörden kurtulmak için değil, orada çalışmak güvenli olduğu için)
rm share-cli.js &> /dev/null
echo -e "${GREEN}✅ İşlem tamamlandı.${NC}"

