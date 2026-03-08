[console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp 65001 | Out-Null } catch { }
$env:NODE_NO_WARNINGS = "1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 SHARE-CLI HIZLI BASLATICI v3.0 (Windows)" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan

# DoSy All klasörünü masaüstünde oluştur
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
    Write-Host "📁 DoSy All klasörü oluşturuldu: $dosyAllDir" -ForegroundColor Green
}
else {
    Write-Host "📁 DoSy All klasörü hazır: $dosyAllDir" -ForegroundColor Green
}
Write-Host "   Paylaşmak istediğiniz dosyaları bu klasöre atın!" -ForegroundColor Cyan
Write-Host ""


if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️ Node.js bulunamadi. Otomatik kuruluyor..." -ForegroundColor Yellow
    $nodeInstalled = $false

    # Yontem 1: winget (Windows 10/11'de genellikle hazir)
    if (-not $nodeInstalled -and (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "📦 winget ile Node.js LTS kuruluyor..." -ForegroundColor Cyan
        try {
            winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            if (Get-Command node -ErrorAction SilentlyContinue) { $nodeInstalled = $true }
        } catch { }
    }

    # Yontem 2: Resmi MSI'yi indirip kur
    if (-not $nodeInstalled) {
        try {
            Write-Host "📥 Node.js indiriliyor, lutfen bekleyin..." -ForegroundColor Cyan
            $arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
            $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
            $ltsVer = ($releases | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version
            $msiUrl = "https://nodejs.org/dist/$ltsVer/node-$ltsVer-$arch.msi"
            $msiPath = Join-Path $env:TEMP "nodejs-setup.msi"
            Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
            Write-Host "⚙️ Node.js kuruluyor (UAC onay penceresi acilabilir, Evet'e basin)..." -ForegroundColor Cyan
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Verb RunAs -Wait
            $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            if (Get-Command node -ErrorAction SilentlyContinue) { $nodeInstalled = $true }
        } catch {
            Write-Host "❌ Otomatik kurulum basarisiz: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    if (-not $nodeInstalled) {
        Write-Host "❌ Node.js kurulamadi. Manuel kurun: https://nodejs.org" -ForegroundColor Red
        Exit
    }
    Write-Host "✅ Node.js basariyla kuruldu!" -ForegroundColor Green
}

$tempFolder = [System.IO.Path]::GetTempPath()
$tmpDirName = Join-Path $tempFolder "share-cli-$(Get-Random)"
$tmpDir = New-Item -ItemType Directory -Path $tmpDirName
Set-Location $tmpDir.FullName

Write-Host "📦 Bagimliliklar hazirlaniyor..." -ForegroundColor Cyan
npm init -y 2>&1 | Out-Null
npm install express multer ip qrcode qrcode-terminal cors archiver localtunnel --silent --no-fund --no-audit 2>&1 | Out-Null

$serverRunning = $false
try {
    $null = Invoke-WebRequest -Uri "http://localhost:3000/api/info" -Method Get -UseBasicParsing -ErrorAction Stop
    $serverRunning = $true
    Write-Host "✅ Mevcut sunucu tespit edildi (localhost:3000)" -ForegroundColor Green
}
catch {
    $serverRunning = $false
}

if (-not $serverRunning) {
    Write-Host "🌐 Sunucu baslatiliyor..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/server.js?v=$(Get-Random)" -OutFile "server.js" -UseBasicParsing
    New-Item -ItemType Directory -Force -Path "public" | Out-Null
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/public/index.html?v=$(Get-Random)" -OutFile "public\index.html" -UseBasicParsing
    
    if (-not (Test-Path "server.js")) {
        Write-Host "❌ server.js indirilemedi. Internet baglantinizi kontrol edin." -ForegroundColor Red
        Exit
    }

    # Sunucuyu arka planda calistir
    try {
        Start-Process -FilePath "node" -ArgumentList "server.js --dir `"$dosyAllDir`"" -WindowStyle Hidden -ErrorAction Stop
    }
    catch {
        Start-Process -FilePath "node" -ArgumentList "server.js --dir `"$dosyAllDir`"" -RedirectStandardOutput "server.log" -RedirectStandardError "server.err" -NoNewWindow
    }
    
    Write-Host "⏳ Sunucu bekleniyor" -NoNewline -ForegroundColor Cyan
    for ($i = 1; $i -le 15; $i++) {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 1
        try {
            $check = Invoke-WebRequest -Uri "http://localhost:3000/api/info" -Method Get -UseBasicParsing -ErrorAction Stop
            Write-Host "`n✅ Sunucu basariyla baslatildi!" -ForegroundColor Green
            $serverRunning = $true
            
            Write-Host "⏳ Dis baglanti (Tunel) adresi aliniyor" -NoNewline -ForegroundColor Cyan
            for ($j = 1; $j -le 10; $j++) {
                try {
                    $json = $check.Content | ConvertFrom-Json
                    if ($null -ne $json.tunnelUrl -and $json.tunnelUrl -ne "") {
                        Write-Host "`n✅ Tunel hazir: $($json.tunnelUrl)" -ForegroundColor Green
                        break
                    }
                    if ($null -ne $json.tunnelError -and $json.tunnelError -ne "") {
                        Write-Host "`n❌ Tunel hatasi: $($json.tunnelError)" -ForegroundColor Red
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
        Write-Host "`n❌ Sunucu baslatilamadi." -ForegroundColor Red
        Exit
    }
}

Write-Host "📥 CLI araci indiriliyor..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yal42d-debug/dosya-paylas/main/share-cli.js?v=$(Get-Random)" -OutFile "share-cli.js" -UseBasicParsing

if (Test-Path "share-cli.js") {
    Write-Host "✅ Baslatiliyor..." -ForegroundColor Green
    Start-Sleep -Seconds 1
    node share-cli.js
}
else {
    Write-Host "❌ CLI araci indirilemedi." -ForegroundColor Red
}

Write-Host "✅ Islem tamamlandi." -ForegroundColor Green
