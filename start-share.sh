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

# DoSy All klasörünü masaüstünde oluştur
DOSY_ALL_DIR="$HOME/Desktop/DoSy All"
if [ ! -d "$DOSY_ALL_DIR" ]; then
    mkdir -p "$DOSY_ALL_DIR"
    echo -e "${GREEN}📁 DoSy All klasörü oluşturuldu: $DOSY_ALL_DIR${NC}"
else
    echo -e "${GREEN}📁 DoSy All klasörü hazır: $DOSY_ALL_DIR${NC}"
fi
echo -e "${BLUE}   Paylaşmak istediğiniz dosyaları bu klasöre atın!${NC}"
echo ""

# Node.js kontrolü
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️ Node.js bulunamadı. Otomatik kuruluyor...${NC}"
    NODE_INSTALLED=false

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Yöntem 1: Homebrew varsa kullan
        if command -v brew &> /dev/null; then
            brew install node && NODE_INSTALLED=true
        fi
        # Yöntem 2: Resmi .pkg dosyasını indir ve kur
        if [ "$NODE_INSTALLED" = false ]; then
            echo -e "${BLUE}📥 Node.js indiriliyor...${NC}"
            LTS_VER=$(curl -sL "https://nodejs.org/dist/latest-lts/SHASUMS256.txt" | grep -o 'node-v[0-9.]*' | head -1 | grep -o 'v[0-9.]*')
            if [ -n "$LTS_VER" ]; then
                PKG_URL="https://nodejs.org/dist/latest-lts/node-${LTS_VER}.pkg"
                curl -sL "$PKG_URL" -o "/tmp/nodejs-setup.pkg"
                echo -e "${BLUE}⚙️ Kuruluyor (Mac şifrenizi girmeniz istenebilir)...${NC}"
                sudo installer -pkg "/tmp/nodejs-setup.pkg" -target /
                command -v node &> /dev/null && NODE_INSTALLED=true
            fi
        fi
    else
        # Linux
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs && NODE_INSTALLED=true
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y nodejs && NODE_INSTALLED=true
        elif command -v yum &> /dev/null; then
            sudo yum install -y nodejs && NODE_INSTALLED=true
        fi
    fi

    if [ "$NODE_INSTALLED" = false ]; then
        echo -e "${RED}❌ Node.js kurulamadı. Manuel kurun: https://nodejs.org${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js başarıyla kuruldu!${NC}"
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
    node server.js --dir "$DOSY_ALL_DIR" > server.log 2>&1 &
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
