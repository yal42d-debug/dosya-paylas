---
description: APK oluştur, masaüstüne kopyala ve emülatörde test et
---

# APK Oluşturma Workflow'u

// turbo-all

Bu workflow mobil uygulama için debug APK oluşturur, versiyonlu isimle masaüstündeki `debug-apk-dosya` klasörüne kopyalar ve Android Studio emülatöründe açar.

## Adımlar

1. `config.xml` dosyasındaki mevcut sürüm numarasını oku ve artır (örn: 1.0.0 → 1.0.1). Sürümü `config.xml`'de güncelle.

2. Cordova build çalıştır:
```bash
cd "/Users/yalcindegirmenci/Desktop/dosya paylaş/mobile-app-fixed" && cordova build android --debug
```

3. APK'yı versiyonlu isimle masaüstündeki `debug-apk-dosya` klasörüne kopyala:
```bash
cp "/Users/yalcindegirmenci/Desktop/dosya paylaş/mobile-app-fixed/platforms/android/app/build/outputs/apk/debug/app-debug.apk" ~/Desktop/debug-apk-dosya/DosyaPaylas_v{SÜRÜM}.apk
```

4. Emülatörü başlat (zaten çalışıyorsa atla):
```bash
$ANDROID_HOME/emulator/emulator -avd Medium_Phone_API_36.1 -no-snapshot-load &
```
Emülatörün boot olmasını bekle:
```bash
adb wait-for-device && adb shell getprop sys.boot_completed | grep -q 1
```

5. APK'yı emülatöre yükle:
```bash
adb install -r ~/Desktop/debug-apk-dosya/DosyaPaylas_v{SÜRÜM}.apk
```

6. Uygulamayı emülatörde aç:
```bash
adb shell am start -n com.localfileshare.app/.MainActivity
```

7. `Project_Analysis.md` dosyasındaki sürüm bilgisini güncelle.

8. Kullanıcıya sonucu bildir: APK yolu, sürüm numarası ve emülatör durumu.
