#!/bin/bash

# Renkler
R='\033[0m'    # Reset
B='\033[1m'    # Bold
C='\033[36m'   # Cyan
GR='\033[90m'  # Gray
BG='\033[92m'  # Bright Green
BR='\033[91m'  # Bright Red
BY='\033[93m'  # Bright Yellow
BC='\033[96m'  # Bright Cyan
BW='\033[97m'  # Bright White

# Box karakterleri
H=$'\u2550'; V=$'\u2551'; TL=$'\u2554'; TR=$'\u2557'; BL=$'\u255A'; BR_=$'\u255D'; ML=$'\u2560'; MR=$'\u2563'
SH=$'\u2500'; DOT=$'\u00B7'
HLine="${C}${ML}$(printf '%0.s'"$H" $(seq 1 48))${MR}${R}"

ok()   { echo -e "  ${BG}${B}[+]${R} $1"; }
err()  { echo -e "  ${BR}${B}[X]${R} $1"; }
warn() { echo -e "  ${BY}${B}[!]${R} $1"; }
info() { echo -e "  ${BC}${B}[${DOT}]${R} $1"; }
dim()  { echo -e "  ${GR}    $1${R}"; }

# Banner
echo ""
echo -e "${C}${TL}$(printf '%0.s'"$H" $(seq 1 48))${TR}${R}"
echo -e "${C}${V}${R}                                                ${C}${V}${R}"
echo -e "${C}${V}${R}     ${B}${BC}S H A R E  ${BW}-  C L I${R}                  ${C}${V}${R}"
echo -e "${C}${V}${R}     ${GR}Hizli Baslatici v3.0${R}                      ${C}${V}${R}"
echo -e "${C}${V}${R}                                                ${C}${V}${R}"
echo -e "${C}${BL}$(printf '%0.s'"$H" $(seq 1 48))${BR_}${R}"
echo ""

# DoSy All klasörünü masaüstünde oluştur
DOSY_ALL_DIR="$HOME/Desktop/DoSy All"
if [ ! -d "$DOSY_ALL_DIR" ]; then
    mkdir -p "$DOSY_ALL_DIR"
    ok "DoSy All klasoru olusturuldu"
else
    ok "DoSy All klasoru hazir"
fi
dim "$DOSY_ALL_DIR"
dim "Paylasmak istediginiz dosyalari bu klasore atin!"
echo ""

# Node.js kontrolü
if ! command -v node &> /dev/null; then
    warn "Node.js bulunamadi. Otomatik kuruluyor..."
    NODE_INSTALLED=false

    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install node && NODE_INSTALLED=true
        fi
        if [ "$NODE_INSTALLED" = false ]; then
            info "Node.js indiriliyor..."
            LTS_VER=$(curl -sL "https://nodejs.org/dist/latest-lts/SHASUMS256.txt" | grep -o 'node-v[0-9.]*' | head -1 | grep -o 'v[0-9.]*')
            if [ -n "$LTS_VER" ]; then
                PKG_URL="https://nodejs.org/dist/latest-lts/node-${LTS_VER}.pkg"
                curl -sL "$PKG_URL" -o "/tmp/nodejs-setup.pkg"
                info "Kuruluyor (Mac sifrenizi girmeniz istenebilir)..."
                sudo installer -pkg "/tmp/nodejs-setup.pkg" -target /
                command -v node &> /dev/null && NODE_INSTALLED=true
            fi
        fi
    else
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs && NODE_INSTALLED=true
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y nodejs && NODE_INSTALLED=true
        elif command -v yum &> /dev/null; then
            sudo yum install -y nodejs && NODE_INSTALLED=true
        fi
    fi

    if [ "$NODE_INSTALLED" = false ]; then
        err "Node.js kurulamadi. Manuel kurun: https://nodejs.org"
        exit 1
    fi
    ok "Node.js basariyla kuruldu!"
fi

# Kalıcı cache dizini (her seferinde npm install yapmaz)
CACHE_DIR="$HOME/.share-cli-cache"
mkdir -p "$CACHE_DIR"
cd "$CACHE_DIR"

# Bagimliliklari sadece yoksa veya eskiyse kur
if [ ! -d "node_modules/express" ] || [ ! -d "node_modules/localtunnel" ]; then
    info "Bagimliliklar kuruluyor (ilk calistirma)..."
    npm init -y &> /dev/null
    npm install express multer ip qrcode qrcode-terminal cors archiver localtunnel --silent --no-fund --no-audit &> /dev/null
else
    ok "Bagimliliklar hazir (cache)"
fi

# Sunucu durumunu kontrol et
SERVER_RUNNING=false
SERVER_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/info 2>/dev/null)
if [ "$SERVER_CHECK" = "200" ]; then
    SERVER_RUNNING=true
    ok "Mevcut sunucu tespit edildi (localhost:3000)"
fi

# Sunucu calismiyorsa baslat
if [ "$SERVER_RUNNING" = false ]; then
    info "Sunucu baslatiliyor..."

    mkdir -p public
    NEED_SERVER=true
    if [ -f "server.js" ]; then
        S_AGE=$(( $(date +%s) - $(stat -f%m "server.js" 2>/dev/null || stat -c%Y "server.js" 2>/dev/null || echo 0) ))
        [ "$S_AGE" -lt 86400 ] && NEED_SERVER=false
    fi
    if [ "$NEED_SERVER" = true ]; then
        curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/server.js?v=$(date +%s)" -o "server.js"
        curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/public/index.html?v=$(date +%s)" -o "public/index.html"
    fi

    if [ ! -f "server.js" ]; then
        err "server.js indirilemedi. Internet baglantinizi kontrol edin."
        exit 1
    fi

    node server.js --dir "$DOSY_ALL_DIR" > server.log 2>&1 &
    SERVER_PID=$!

    printf "  ${BC}${B}[${DOT}]${R} Sunucu bekleniyor"
    for i in {1..15}; do
        printf "."
        sleep 1
        CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/info 2>/dev/null)
        if [ "$CHECK" = "200" ]; then
            printf "\r                                          \r"
            ok "Sunucu basariyla baslatildi!"
            SERVER_RUNNING=true

            printf "  ${BC}${B}[${DOT}]${R} Tunel adresi aliniyor"
            for j in {1..10}; do
                TUNNEL_URL=$(curl -s http://localhost:3000/api/info 2>/dev/null | grep -o '"tunnelUrl":"[^"]*"' | cut -d'"' -f4)
                if [ -n "$TUNNEL_URL" ] && [ "$TUNNEL_URL" != "null" ]; then
                    printf "\r                                          \r"
                    ok "Tunel hazir: $TUNNEL_URL"
                    break
                fi
                printf "."
                sleep 1
            done
            echo ""

            break
        fi
    done

    if [ "$SERVER_RUNNING" = false ]; then
        echo ""
        err "Sunucu baslatilamadi. Log:"
        cat server.log 2>/dev/null
        exit 1
    fi
fi

# CLI aracini indir (yoksa veya 1 gunden eskiyse)
CLI_FILE="share-cli.js"
NEED_DOWNLOAD=true
if [ -f "$CLI_FILE" ]; then
    FILE_AGE=$(( $(date +%s) - $(stat -f%m "$CLI_FILE" 2>/dev/null || stat -c%Y "$CLI_FILE" 2>/dev/null || echo 0) ))
    if [ "$FILE_AGE" -lt 86400 ]; then
        NEED_DOWNLOAD=false
        ok "CLI araci hazir (cache)"
    fi
fi
if [ "$NEED_DOWNLOAD" = true ]; then
    info "CLI araci indiriliyor..."
    curl -sL "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/share-cli.js?v=$(date +%s)" -o "$CLI_FILE"
fi

if [ -f "$CLI_FILE" ]; then
    ok "Baslatiliyor..."
    echo ""
    node "$CLI_FILE" < /dev/tty
else
    err "CLI araci indirilemedi. Internet baglantinizi kontrol edin."
fi

ok "Islem tamamlandi."
