#!/bin/bash

# Renkli mesajlar
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}🚀 SHARE-CLI HIZLI BAŞLATICI v3.0${NC}"
echo -e "${BLUE}==========================================${NC}"

# Node.js kontrolü
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️ Node.js bulunamadı. Otomatik kuruluyor...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command -v brew &> /dev/null; then
            echo -e "${RED}Lütfen önce Homebrew kurun veya Node.js'i manuel yükleyin.${NC}"
            exit 1
        fi
        brew install node
    else
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
fi

# Çalışma dizini
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Bağımlılıkları kur
echo -e "${BLUE}📦 Bağımlılıklar hazırlanıyor...${NC}"
npm init -y &> /dev/null
npm install express multer ip qrcode qrcode-terminal cors archiver localtunnel &> /dev/null

# Sunucu durumunu kontrol et (mevcut sunucu varsa kullan)
SERVER_RUNNING=false
SERVER_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/info 2>/dev/null)
if [ "$SERVER_CHECK" = "200" ]; then
    SERVER_RUNNING=true
    echo -e "${GREEN}✅ Mevcut sunucu tespit edildi (localhost:3000)${NC}"
fi

# Sunucu çalışmıyorsa başlat
if [ "$SERVER_RUNNING" = false ]; then
    echo -e "${YELLOW}🌐 Sunucu başlatılıyor...${NC}"
    
    # Dosyaları indir
    curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/server.js?v=$(date +%s)" -o "server.js"
    mkdir -p public
    curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/public/index.html?v=$(date +%s)" -o "public/index.html"
    
    if [ ! -f "server.js" ]; then
        echo -e "${RED}❌ server.js indirilemedi. İnternet bağlantınızı kontrol edin.${NC}"
        exit 1
    fi
    
    # Sunucuyu arka planda başlat
    node server.js > server.log 2>&1 &
    SERVER_PID=$!
    
    # Sunucunun hazır olmasını bekle
    echo -ne "${BLUE}⏳ Sunucu bekleniyor"
    for i in {1..15}; do
        echo -n "."
        sleep 1
        CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/info 2>/dev/null)
        if [ "$CHECK" = "200" ]; then
            echo -e "${NC}"
            echo -e "${GREEN}✅ Sunucu başarıyla başlatıldı!${NC}"
            SERVER_RUNNING=true

            echo -ne "${BLUE}⏳ Dış bağlantı (Tünel) adresi alınıyor"
            for j in {1..10}; do
                TUNNEL_URL=$(curl -s http://localhost:3000/api/info 2>/dev/null | grep -o '"tunnelUrl":"[^"]*"' | cut -d'"' -f4)
                if [ -n "$TUNNEL_URL" ] && [ "$TUNNEL_URL" != "null" ]; then
                    echo -e "${NC}"
                    echo -e "${GREEN}✅ Tünel hazır: $TUNNEL_URL${NC}"
                    break
                fi
                echo -n "."
                sleep 1
            done
            echo -e "${NC}"

            break
        fi
    done
    
    if [ "$SERVER_RUNNING" = false ]; then
        echo -e "${NC}"
        echo -e "${RED}❌ Sunucu başlatılamadı. Log:${NC}"
        cat server.log 2>/dev/null
        exit 1
    fi
fi

# CLI aracını indir ve çalıştır
echo -e "${BLUE}📥 CLI aracı indiriliyor...${NC}"
curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/share-cli.js?v=$(date +%s)" -o "share-cli.js"

if [ -f "share-cli.js" ]; then
    echo -e "${GREEN}✅ Başlatılıyor...${NC}"
    sleep 1
    node "share-cli.js" < /dev/tty
else
    echo -e "${RED}❌ CLI aracı indirilemedi. Lütfen internet bağlantınızı kontrol edin.${NC}"
fi

# Temizlik
echo -e "${GREEN}✅ İşlem tamamlandı.${NC}"
