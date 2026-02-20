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

# Aracı indir ve çalıştır (GitHub'a yüklediğinizde bu linki GitHub logonuzla değiştirirsiniz)
# Şimdilik lokaldekini çalıştıralım
node share-cli.js
