---
description: APK oluştur, masaüstüne kopyala ve emülatörde test et
---

# APK Oluşturma Workflow'u

// turbo-all

Bu workflow mobil uygulama için debug APK oluşturur, versiyonlu isimle masaüstündeki `debug-apk-dosya` klasörüne kopyalar ve Android Studio emülatöründe açar.

## Adımlar

1. `config.xml` dosyasındaki mevcut sürüm numarasını oku ve artır (örn: 1.0.0 → 1.0.1). Sürümü `config.xml`'de güncelle.

2. `cordova prepare android` ile www dosyalarını kopyala, ardından build config'i düzelt:
```bash
cd "/Users/yalcindegirmenci/Desktop/dosya paylaş/mobile-app-fixed" && cordova prepare android
```
**NOT:** `cordova prepare` her çalıştığında `cdv-gradle-config.json`'daki `MIN_BUILD_TOOLS_VERSION`'ı 33.0.2'ye sıfırlar. Build'den önce 34.0.0'a geri ayarla:
```bash
sed -i '' 's/"MIN_BUILD_TOOLS_VERSION":"33.0.2"/"MIN_BUILD_TOOLS_VERSION":"34.0.0"/' platforms/android/cdv-gradle-config.json
```

3. Gradle ile build et (`cordova build` yerine doğrudan gradlew kullan):
```bash
cd platforms/android && ./gradlew assembleDebug
```

4. APK'yı versiyonlu isimle masaüstündeki `debug-apk-dosya` klasörüne kopyala:
```bash
cp "/Users/yalcindegirmenci/Desktop/dosya paylaş/mobile-app-fixed/platforms/android/app/build/outputs/apk/debug/app-debug.apk" ~/Desktop/debug-apk-dosya/DosyaPaylas_v{SÜRÜM}.apk
```

5. Emülatörü başlat (zaten çalışıyorsa atla):
```bash
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 -no-snapshot-load &
```
Emülatörün boot olmasını bekle:
```bash
adb wait-for-device && adb shell getprop sys.boot_completed | grep -q 1
```

6. APK'yı emülatöre yükle:
```bash
adb install -r ~/Desktop/debug-apk-dosya/DosyaPaylas_v{SÜRÜM}.apk
```

7. Uygulamayı emülatörde aç:
```bash
adb shell am start -n com.localfileshare.app/.MainActivity
```

8. `Project_Analysis.md` dosyasındaki sürüm bilgisini güncelle.

9. Kullanıcıya sonucu bildir: APK yolu, sürüm numarası ve emülatör durumu.

## Bilinen Build Sorunları ve Çözümleri

- **`cordova-plugin-local-notification`**: AndroidX uyumsuz, kaldırıldı. Tekrar eklenirse `android.support.v4` hataları alınır.
- **`nodejs-mobile-cordova` minSdk**: Plugin `ext.cdvMinSdkVersion = 22` ayarlıyor. `platforms/android/nodejs-mobile-cordova/app-build.gradle` dosyasında 24 olmalı.
- **`libnode.so`**: `jniLibs` klasörüne kopyalanması gerekir. `platforms/android/app/libs/cdvnodejsmobile/libnode/bin/` altından `platforms/android/app/src/main/jniLibs/` altına.
- **`node_modules` eksik**: `www/nodejs-project/` altında `npm install --production` gerekebilir.
- **Build-tools symlink**: Sistem sadece 34.0.0+ yüklü, Cordova 33.x arıyor. Config'de 34.0.0 ayarlanmalı.
- **Gradle wrapper**: Sistem Gradle 9.3.1 proje ile uyumsuz. `platforms/android/gradlew` ile Gradle 7.6.4 kullanılmalı.
