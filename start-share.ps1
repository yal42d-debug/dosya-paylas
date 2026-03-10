[console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp 65001 | Out-Null } catch { }
$env:NODE_NO_WARNINGS = "1"
# npm.ps1 gibi script dosyalarının calismasi icin (sadece bu oturum icin)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# Box karakterleri
$H = [char]0x2550; $V = [char]0x2551
$TL = [char]0x2554; $TR = [char]0x2557; $BL = [char]0x255A; $BR2 = [char]0x255D
$ML = [char]0x2560; $MR = [char]0x2563
$SH = [char]0x2500; $DOT = [char]0x00B7

function ok($t)   { Write-Host "  " -NoNewline; Write-Host "[+]" -NoNewline -ForegroundColor Green; Write-Host " $t" }
function err($t)  { Write-Host "  " -NoNewline; Write-Host "[X]" -NoNewline -ForegroundColor Red; Write-Host " $t" }
function warn($t) { Write-Host "  " -NoNewline; Write-Host "[!]" -NoNewline -ForegroundColor Yellow; Write-Host " $t" }
function nfo($t)  { Write-Host "  " -NoNewline; Write-Host "[$DOT]" -NoNewline -ForegroundColor Cyan; Write-Host " $t" }
function dim($t)  { Write-Host "      $t" -ForegroundColor DarkGray }

$hline = "$H" * 48

Write-Host ""
Write-Host "$TL$hline$TR" -ForegroundColor Cyan
Write-Host "$V                                                $V" -ForegroundColor Cyan
Write-Host "$V" -NoNewline -ForegroundColor Cyan
Write-Host "     S H A R E  " -NoNewline -ForegroundColor Cyan
Write-Host "-  C L I" -NoNewline -ForegroundColor White
Write-Host "                  $V" -ForegroundColor Cyan
Write-Host "$V" -NoNewline -ForegroundColor Cyan
Write-Host "     Hizli Baslatici v3.0 (Windows)" -NoNewline -ForegroundColor DarkGray
Write-Host "             $V" -ForegroundColor Cyan
Write-Host "$V                                                $V" -ForegroundColor Cyan
Write-Host "$BL$hline$BR2" -ForegroundColor Cyan
Write-Host ""

# DoSy All klasorunu masaustunde olustur
$desktopPath = [Environment]::GetFolderPath("Desktop")
if ([string]::IsNullOrEmpty($desktopPath)) {
    # Fallback: OneDrive veya doğrudan Desktop
    $homeDir = $env:USERPROFILE
    $possiblePaths = @(
        (Join-Path $homeDir "OneDrive\Desktop"),
        (Join-Path $homeDir "OneDrive\Masaüstü"),
        (Join-Path $homeDir "Desktop"),
        (Join-Path $homeDir "Masaüstü")
    )
    foreach ($p in $possiblePaths) {
        if (Test-Path $p) {
            $desktopPath = $p
            break
        }
    }
    if ([string]::IsNullOrEmpty($desktopPath)) {
        $desktopPath = Join-Path $homeDir "Desktop"
    }
}

$dosyAllDir = Join-Path $desktopPath "DoSy All"
if (-not (Test-Path $dosyAllDir)) {
    New-Item -ItemType Directory -Path $dosyAllDir -Force | Out-Null
    ok "DoSy All klasoru olusturuldu"
}
else {
    ok "DoSy All klasoru hazir"
}
dim $dosyAllDir
dim "Paylasmak istediginiz dosyalari bu klasore atin!"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    warn "Node.js bulunamadi. Otomatik kuruluyor..."
    $nodeInstalled = $false

    # Yontem 1: winget
    if (-not $nodeInstalled -and (Get-Command winget -ErrorAction SilentlyContinue)) {
        nfo "winget ile Node.js LTS kuruluyor..."
        try {
            winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            if (Get-Command node -ErrorAction SilentlyContinue) { $nodeInstalled = $true }
        } catch { }
    }

    # Yontem 2: Resmi MSI
    if (-not $nodeInstalled) {
        try {
            nfo "Node.js indiriliyor, lutfen bekleyin..."
            $arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
            $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
            $ltsVer = ($releases | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version
            $msiUrl = "https://nodejs.org/dist/$ltsVer/node-$ltsVer-$arch.msi"
            $msiPath = Join-Path $env:TEMP "nodejs-setup.msi"
            Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
            nfo "Node.js kuruluyor (UAC onay penceresi acilabilir)..."
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Verb RunAs -Wait
            $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            if (Get-Command node -ErrorAction SilentlyContinue) { $nodeInstalled = $true }
        } catch {
            err "Otomatik kurulum basarisiz: $($_.Exception.Message)"
        }
    }

    if (-not $nodeInstalled) {
        err "Node.js kurulamadi. Manuel kurun: https://nodejs.org"
        Exit
    }
    ok "Node.js basariyla kuruldu!"
}

# Kalici cache dizini (her seferinde npm install yapmaz)
$cacheDir = Join-Path $env:USERPROFILE ".share-cli-cache"
if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
Set-Location $cacheDir

# Bagimliliklari sadece yoksa kur
$expressPath = Join-Path $cacheDir "node_modules\express"
$tunnelPath = Join-Path $cacheDir "node_modules\localtunnel"
if (-not (Test-Path $expressPath) -or -not (Test-Path $tunnelPath)) {
    nfo "Bagimliliklar kuruluyor (ilk calistirma)..."
    cmd /c "npm init -y" 2>&1 | Out-Null
    cmd /c "npm install express multer ip qrcode qrcode-terminal cors archiver localtunnel --silent --no-fund --no-audit" 2>&1 | Out-Null
} else {
    ok "Bagimliliklar hazir (cache)"
}

$serverRunning = $false
try {
    $null = Invoke-WebRequest -Uri "http://localhost:3000/api/info" -Method Get -UseBasicParsing -ErrorAction Stop
    $serverRunning = $true
    ok "Mevcut sunucu tespit edildi (localhost:3000)"
}
catch {
    $serverRunning = $false
}

if (-not $serverRunning) {
    nfo "Sunucu baslatiliyor..."
    New-Item -ItemType Directory -Force -Path "public" | Out-Null
    # Dosyalari indir (yoksa veya 1 gunden eskiyse)
    $needServer = $true
    if (Test-Path "server.js") {
        $sAge = (Get-Date) - (Get-Item "server.js").LastWriteTime
        if ($sAge.TotalSeconds -lt 86400) { $needServer = $false }
    }
    if ($needServer) {
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/server.js?v=$(Get-Random)" -OutFile "server.js" -UseBasicParsing
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/public/index.html?v=$(Get-Random)" -OutFile "public\index.html" -UseBasicParsing
    }
    
    if (-not (Test-Path "server.js")) {
        err "server.js indirilemedi. Internet baglantinizi kontrol edin."
        Exit
    }

    # Sunucuyu arka planda calistir
    try {
        Start-Process -FilePath "node" -ArgumentList "server.js --dir `"$dosyAllDir`"" -WindowStyle Hidden -ErrorAction Stop
    }
    catch {
        Start-Process -FilePath "node" -ArgumentList "server.js --dir `"$dosyAllDir`"" -RedirectStandardOutput "server.log" -RedirectStandardError "server.err" -NoNewWindow
    }
    
    Write-Host "  " -NoNewline
    Write-Host "[$DOT]" -NoNewline -ForegroundColor Cyan
    Write-Host " Sunucu bekleniyor" -NoNewline
    for ($i = 1; $i -le 15; $i++) {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 1
        try {
            $check = Invoke-WebRequest -Uri "http://localhost:3000/api/info" -Method Get -UseBasicParsing -ErrorAction Stop
            Write-Host ""
            ok "Sunucu basariyla baslatildi!"
            $serverRunning = $true

            Write-Host "  " -NoNewline
            Write-Host "[$DOT]" -NoNewline -ForegroundColor Cyan
            Write-Host " Tunel adresi aliniyor" -NoNewline
            for ($j = 1; $j -le 10; $j++) {
                try {
                    $json = $check.Content | ConvertFrom-Json
                    if ($null -ne $json.tunnelUrl -and $json.tunnelUrl -ne "") {
                        Write-Host ""
                        ok "Tunel hazir: $($json.tunnelUrl)"
                        break
                    }
                    if ($null -ne $json.tunnelError -and $json.tunnelError -ne "") {
                        Write-Host ""
                        err "Tunel hatasi: $($json.tunnelError)"
                        break
                    }
                    $check = Invoke-WebRequest -Uri "http://localhost:3000/api/info" -Method Get -UseBasicParsing -ErrorAction Stop
                }
                catch { }
                Write-Host "." -NoNewline
                Start-Sleep -Seconds 1
            }
            Write-Host ""

            break
        }
        catch {
            # Bekliyor
        }
    }

    if (-not $serverRunning) {
        Write-Host ""
        err "Sunucu baslatilamadi."
        Exit
    }
}

# CLI aracini indir (yoksa veya 1 gunden eskiyse)
$cliFile = "share-cli.js"
$needDownload = $true
if (Test-Path $cliFile) {
    $fileAge = (Get-Date) - (Get-Item $cliFile).LastWriteTime
    if ($fileAge.TotalSeconds -lt 86400) {
        $needDownload = $false
        ok "CLI araci hazir (cache)"
    }
}
if ($needDownload) {
    nfo "CLI araci indiriliyor..."
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/share-cli.js?v=$(Get-Random)" -OutFile $cliFile -UseBasicParsing
}

if (Test-Path $cliFile) {
    ok "Baslatiliyor..."
    Write-Host ""
    node $cliFile
}
else {
    err "CLI araci indirilemedi. Internet baglantinizi kontrol edin."
}

ok "Islem tamamlandi."
