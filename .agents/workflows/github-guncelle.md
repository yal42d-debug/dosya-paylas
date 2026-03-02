---
description: Değişiklikleri GitHub'a pushla
---

# GitHub Güncelleme Workflow'u

// turbo-all

Yapılan kod değişikliklerini commit edip GitHub'a pushlar.

## Adımlar

1. Değişiklikleri kontrol et:
```bash
cd "/Users/yalcindegirmenci/Desktop/dosya paylaş" && git status
```

2. Tüm değişiklikleri stage'e al:
```bash
cd "/Users/yalcindegirmenci/Desktop/dosya paylaş" && git add -A
```

3. Anlamlı bir commit mesajı ile commit et (Türkçe, emoji ile):
```bash
cd "/Users/yalcindegirmenci/Desktop/dosya paylaş" && git commit -m "🔧 {YAPILAN DEĞİŞİKLİK AÇIKLAMASI}"
```

4. GitHub'a pushla:
```bash
cd "/Users/yalcindegirmenci/Desktop/dosya paylaş" && git push origin main
```

5. Push sonucunu kullanıcıya bildir.
