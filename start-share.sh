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

# npm projesi başlat ve gerekli paketi kur
npm init -y &> /dev/null
npm install qrcode-terminal &> /dev/null

echo -e "${BLUE}📥 Araç indiriliyor...${NC}"
curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/share-cli.js?v=$(date +%s)" -o "share-cli.js"

if [ -f "share-cli.js" ]; then
    node "share-cli.js" < /dev/tty
else
    echo -e "${RED}❌ Araç indirilemedi. Lütfen internet bağlantınızı kontrol edin.${NC}"
fi

# Temizlik
rm -rf "$TMP_DIR"
