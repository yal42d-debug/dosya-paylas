# Android APK Nasıl Üretilir?

Bilgisayarımızda gerekli araçlar olmadığı için, **GitHub** kullanarak bulutta APK üreteceğiz.

## Adım 1: GitHub'a Yükleme

1.  Terminali açın ve proje klasöründe olduğunuzdan emin olun:
    ```bash
    cd "/Users/yalcindegirmenci/Desktop/dosya paylaş"
    ```

2.  Sırasıyla şu komutları çalıştırın (GitHub'a göndermek için):
    ```bash
    git init
    git add .
    git commit -m "Uygulama hazır"
    # GitHub'da yeni bir 'repository' oluşturun ve size verilen linki aşağıya ekleyin:
    # git remote add origin https://github.com/KULLANICI_ADI/REPO_ADI.git
    # git push -u origin main
    ```

## Adım 2: APK'yı İndirme

1.  GitHub'da yüklediğiniz projenin sayfasına gidin.
2.  Yukarıdaki **Actions** sekmesine tıklayın.
3.  Sol tarafta **Build Android APK** göreceksiniz. Ona tıklayın.
4.  İşlem yeşil tik ile bitince, en son yapılan işlemin içine girin.
5.  Sayfanın en altına inin. **Artifacts** bölümünde `app-release` dosyasını göreceksiniz.
6.  İndirin, zipten çıkarın ve `.apk` dosyasını telefonunuza atıp kurun!
