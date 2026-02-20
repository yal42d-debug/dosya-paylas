# Cloudflare Tunnel Nasıl Çalışır?

Şu an kurduğumuz sistemin (Cloudflare Tunnel) çalışma mantığı özetle şöyledir:

### 1. Tünel Mantığı (The Tunnel)
Normalde bilgisayarınızdaki bir siteye dışarıdan erişilmesi için modeminizden "port açmanız" gerekir. Ancak **Cloudflare Tunnel** (`cloudflared` programı) bunu terse çevirir.
*   Bilgisayarınızdaki program, Cloudflare'in güvenli sunucularına **içeriden dışarıya** doğru şifreli bir bağlantı (tünel) başlatır.
*   Bu sayede modeminizde hiçbir ayar yapmanıza veya güvenlik duvarını delmenize gerek kalmaz.

### 2. İstek Akışı
Birisi size verilen `https://....trycloudflare.com` adresine girdiğinde:
1.  İstek önce dünyaya yayılmış Cloudflare sunucularına gelir.
2.  Cloudflare, bu isteği açık olan tünelden geçirip sizin bilgisayarınıza (`localhost:3000` portuna) iletir.
3.  Sizin bilgisayarınız cevabı tünelden geri gönderir.

### 3. Neden Şifre Sormuyor?
Önceki kullandığınız **localtunnel** servisi, tamamen ücretsiz ve denetimsiz olduğu için "kötüye kullanım" (phishing vb.) çok yaygındı. Bu yüzden localtunnel, siteye giren herkesten bir şifre/IP onayı isteyerek "gerçek insan" olduğunu doğruluyordu.

**Cloudflare** ise çok daha gelişmiş bir güvenlik altyapısına sahiptir:
*   Trafiği arka planda analiz eder.
*   Kötü amaçlı kullanımları otomatik engeller.
*   Bu sayede normal kullanıcıları (sizin gibi dosya paylaşanları) gereksiz şifre ekranlarıyla yormaz.

### Özet
Bu sistem, bilgisayarınızdaki dosyaları bir sunucuya yüklemez. Dosyalar hala **sizin bilgisayarınızdadır**. Sadece güvenli bir "pencere" açarak dışarıdan bakılmasını sağlar. Terminaldeki siyah ekranı kapattığınız an, bu pencere kapanır ve erişim kesilir.
