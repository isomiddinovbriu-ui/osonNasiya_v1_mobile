# OsonNasiya — sotuvchi mobil ilovasi dizayn spetsifikatsiyasi

Holat: Figma chizmasi uchun tayyor UX hujjat. Dastur kodi emas.

## 1. Maqsad va chegaralar

Sotuvchi oluvchini ro‘yxatga oladi, mahsulot tanlaydi, kelishilgan narx va kelishilgan bosh to‘lovni kiritadi, bo‘lib to‘lash jadvalini ko‘radi va shartnoma yaratadi. Sotuvchi ham, yig‘uvchi ham o‘zi olgan pulni tizimga kiritishi mumkin. Sotuvchi oldingi to‘lovni jimgina tahrirlamaydi, mahsulotning eng past narxini o‘zgartirmaydi va qaytarishni yakunlamaydi. Bosh to‘lov shartnomadagi kelishuvdir; pul amalda olingani alohida to‘lov yozuvi bilan qayd etiladi. Karta tushumini yakuniy tasdiqlash qoidasi hali kelishilmagan.

Asosiy ssenariy: kirish → oluvchini topish yoki yaratish → mahsulot tanlash → savdo shartlari → jadval va shartnomani tekshirish → tasdiqlash → natijani ko‘rish.

MVP uchun bitta savdoda bitta mahsulot. Keyinroq bir shartnomada bir nechta mahsulotga kengaytirilishi mumkin.

## 2. Figma tuzilmasi

- `00 — Foundation`: ranglar, shriftlar, spacing, komponentlar, formalar, bottom navigation.
- `01 — Seller / Happy path`: quyidagi S01–S16 ekranlarning asosiy holatlari.
- `02 — Seller / States`: yuklanish, bo‘sh ro‘yxat, internet yo‘q, xato, tasdiqlash dialoglari.
- `03 — Prototype`: asosiy bosiladigan oqim va ortga qaytishlar.
- Frame: 390 × 844 px (Android mobil asosiy o‘lcham). Auto layout va moslashuvchan kenglik; iOS uchun safe area hisobga olinadi.
- Har bir frame nomi `S01 — Kirish`, `S02 — Bosh sahifa` kabi; interaktiv element yonida raqamli annotation bo‘ladi.

## 3. Dizayn tizimi

- Ohang: sodda, ish jarayoniga mos, katta va aniq raqamlar. Asosiy til — o‘zbek lotin.
- Asosiy rang: to‘q ko‘k `#183B66`; harakat rangi `#1677D2`; fon `#F6F8FB`; matn `#172536`; ikkilamchi matn `#627184`.
- Holatlar: muvaffaqiyat `#16845B`, ogohlantirish `#B66A00`, xato `#C3333D`.
- 8 px ritm; tashqi chet 16 px; kartalar radius 16 px; tugma balandligi kamida 48 px; bosiladigan maydon kamida 44 × 44 px.
- Summalar so‘mda minglik ajratkich bilan: `1 850 000 so‘m`. Hisob-kitobda kasrli so‘m ishlatilmaydi. Muddatga bo‘lishda qoldiq oxirgi oyga qo‘shiladi.
- Belgilar faqat rang bilan ifodalanmaydi: `Faol`, `Kechikkan`, `Yakunlangan` kabi matn ham ko‘rinadi.
- Majburiy maydonlar `*` bilan, xato xabari aynan tegishli maydon ostida ko‘rsatiladi.
- Ekran pastidagi asosiy CTA klaviatura ochilganda yopilib qolmasligi kerak.

## 4. Navigatsiya

Pastki menyu: `Bosh sahifa`, `Oluvchilar`, `Savdolar`, `Profil`.

`Yangi savdo` tugmasi bosh sahifada va oluvchi tafsilotida bor. Savdo oqimida yuqorida `1. Oluvchi → 2. Mahsulot → 3. Shartlar → 4. Tekshirish` progress belgisi turadi. Orqaga qaytilganda kiritilgan ma’lumot saqlanadi; oqimdan butunlay chiqishda `Qoralamani saqlash / Chiqish / Davom etish` dialogi chiqadi.

## 5. Ekranlar va barcha harakatlar

### S01 — Kirish

Elementlar: logotip, `Telefon raqam` yoki admin bergan login maydoni, `Parol`, `Parolni ko‘rsat` belgisi, `Kirish` tugmasi, yordam matni.

- `Kirish`: bo‘sh/nomuvofiq maydonlarni tekshiradi; to‘g‘ri bo‘lsa S02 ga o‘tadi. Jarayonda spinner, tugma vaqtincha faol emas.
- `Parolni ko‘rsat`: parolni ko‘rinadigan/yashirin holatga almashtiradi.
- Noto‘g‘ri ma’lumot: `Login yoki parol noto‘g‘ri` xabari; kiritilgan login saqlanadi.
- Internet yo‘q: `Internetga ulaning va qayta urinib ko‘ring` + `Qayta urinish`.
- Parolni tiklash admin orqali bo‘lsa, `Parolni unutdingizmi? Admin bilan bog‘laning` matni; ishlamaydigan reset tugmasi chizilmaydi.

### S02 — Bosh sahifa

Elementlar: salomlashuv, sotuvchi ismi, bugungi sana, `Yangi savdo` asosiy tugmasi, `Mening savdolarim` statistikasi, `Qoralamalar`, yaqindagi savdolar.

- `Yangi savdo` → S06 (oluvchini tanlash).
- `Qoralamalar` kartasi → S12; faqat qoralama bo‘lsa ko‘rinadi.
- Savdo kartasi → S13 (savdo tafsiloti).
- `Barchasini ko‘rish` → S11 (savdolar ro‘yxati).
- Pastki menyu har biri o‘z sahifasiga o‘tadi; faol tab aniq belgilanadi.
- Statistika sotuvchining o‘z savdolarini ko‘rsatadi; yig‘ilgan naqd pul statistikasi berilmaydi.

### S03 — Oluvchilar ro‘yxati

Elementlar: qidiruv, `+ Yangi oluvchi`, oluvchi kartalari (nomi, turi, telefon, qisqa manzil), natijalar soni.

- Qidiruv nom/telefon bo‘yicha filtrlaydi; bo‘sh natija: `Oluvchi topilmadi` va `Yangi oluvchi qo‘shish`.
- Kartani bosish → S05.
- `+ Yangi oluvchi` → S04.
- Ro‘yxat yuklanmasa: `Qayta urinish`; eski keshlangan natija bo‘lsa `Ma’lumot eskirgan bo‘lishi mumkin` belgisi.

### S04 — Yangi oluvchi / tahrirlash

Maydonlar: `Turi` (tashkilot/shaxs), `Nomi` (tashkilotning rasmiy nomi yoki shaxs F.I.Sh.), `Telefon`, `Qo‘shimcha telefon` (ixtiyoriy), `Viloyat`, `Tuman`, `Manzil`, `Lokatsiya` (xaritadan tanlash), `Izoh` (ixtiyoriy).

- `Tashkilot / Shaxs`: forma yorliqlarini moslaydi; tashkilotda mas’ul shaxs ism/familiyasi ixtiyoriy maydon.
- `Lokatsiyani tanlash` → S04a. Tanlangach koordinata va manzil preview ko‘rinadi.
- `Saqlash`: majburiy maydonlarni tekshiradi; telefon noto‘g‘ri bo‘lsa ko‘rsatadi; shu telefon/nom bilan mumkin bo‘lgan dublikat topilsa `Mavjud oluvchini ko‘rish / Baribir yaratish` dialogi.
- Muvaffaqiyatdan so‘ng oldingi kontekstga qaytadi: ro‘yxatdan kelgan bo‘lsa S05, yangi savdo oqimidan kelgan bo‘lsa yangi oluvchi avtomatik tanlanadi.
- Tahrirda savdo tarixini va eski shartnoma nusxasini o‘zgartirmaydi.

### S04a — Xaritadan lokatsiya tanlash

Elementlar: xarita, markaziy pin, qidiruv yoki `Joriy joylashuv`, aniqlangan manzil, `Shu joyni tanlash`.

- Xaritani surish pin koordinatasini yangilaydi; `Joriy joylashuv` ruxsat so‘raydi, ruxsat berilmasa xaritada qo‘lda tanlash ishlaydi.
- `Shu joyni tanlash` koordinatani S04 ga qaytaradi.
- Xaritani yuklab bo‘lmasa koordinatani qo‘lda kiritish (`Kenglik`, `Uzunlik`) varianti mavjud.

### S05 — Oluvchi tafsiloti

Elementlar: to‘liq ma’lumot, xaritada nuqta preview, `Yangi savdo`, `Tahrirlash`, shu oluvchiga bog‘liq sotuvchiga ko‘rinadigan savdolar.

- `Yangi savdo` → S07; oluvchi oldindan tanlangan.
- `Tahrirlash` → S04.
- `Xaritada ochish` telefon xarita ilovasiga koordinatani yuboradi; o‘rnatilmagan bo‘lsa ko‘chirish varianti.
- Telefon raqamini bosish → qo‘ng‘iroq qilishni tasdiqlash / tizim qo‘ng‘iroq ilovasi.
- Savdo kartasi → S13.

### S06 — Yangi savdo: oluvchini tanlash

Elementlar: progress `1/4`, qidiruv, mavjud oluvchilar, `+ Yangi oluvchi`.

- Oluvchi kartasini tanlash → S07.
- `+ Yangi oluvchi` → S04; saqlangandan keyin S07.
- Bir xil nomdagi oluvchilar telefon va manzil bilan farqlanadi.
- Internet bo‘lmasa yakuniy savdo yaratish bloklanadi; mavjud qoralamani tahrirlash mumkin.

### S07 — Yangi savdo: mahsulot tanlash

Elementlar: progress `2/4`, mahsulot qidiruvi, mahsulot rasmi/nomi/kodi, tavsiya etilgan narx; tanlangan oluvchi qisqa satri.

- Mahsulot kartasi → S08, mahsulot tanlangan holda.
- `Oluvchini o‘zgartirish` → S06; joriy qoralama saqlanadi.
- Mahsulot yo‘q bo‘lsa `Admin mahsulot qo‘shishi kerak` xabari; sotuvchi yangi mahsulot yoki minimum narx yaratmaydi.
- Eng past narx ro‘yxatda ko‘rinmaydi yoki sotuvchiga ko‘rsatilishi biznes qaroriga bog‘liq; narx kiritishda backend tekshiruvi majburiy.

### S08 — Yangi savdo: shartlar

Elementlar: progress `3/4`, oluvchi va mahsulot summary; `Kelishilgan yakuniy narx`, `Bosh to‘lov`, `Bo‘lib to‘lash muddati (oy)`, `Birinchi to‘lov sanasi`, hisoblangan `Qolgan qarz`, `Taxminiy oylik to‘lov`.

- Narx boshlang‘ich qiymati tavsiya etilgan narx; sotuvchi o‘zgartira oladi. Backend minimumdan pastligini qaytarsa `Bu narx ruxsat etilgan eng past narxdan kam` xabari va `Davom etish` bloklanadi.
- Bosh to‘lov `0` dan yakuniy narxgacha; yakuniy narxdan oshsa xato. Muddat admin ruxsat bergan oralig‘idan tanlanadi.
- `Davom etish` → S09; narx/mahsulot/oluvchi mavjudligini serverda qayta tekshiradi.
- `Qoralamani saqlash` → S12; hali shartnoma yoki qarz yaratilmaydi.
- Klaviaturada summalar formatlanadi, ammo foydalanuvchi yozayotgan raqam kutilmaganda o‘zgarmaydi.

### S09 — Jadval va savdoni tekshirish

Elementlar: progress `4/4`, oluvchi, mahsulot, tavsiya etilgan va kelishilgan narx, bosh to‘lov, moliyalashtirilgan qoldiq, 12 oy kabi to‘lov jadvali (sana/summa), izoh maydoni, `Shartnomani ko‘rish`, `Savdoni tasdiqlash`.

- Har bir oy satri ochilib tafsilotini ko‘rsatadi; jami reja summasi qoldiqqa teng bo‘lishi kerak.
- `Tahrirlash` tegishli bosqichga qaytaradi; qaytgach jadval qayta hisoblanadi.
- `Shartnomani ko‘rish` → S10; hali yakuniy hujjat emas, `Loyiha` belgisi.
- `Savdoni tasdiqlash` avval yakuniy dialogni chiqaradi: `Ushbu savdo va shartnoma yaratiladi. Olingan bosh to‘lovni alohida qayd eting. Davom etasizmi?`; `Bekor qilish / Ha, yaratish`.
- Tasdiq serverda yagona operatsiya bo‘ladi: savdo, kelishilgan bosh to‘lov, jadval va shartnoma ma’lumoti birgalikda saqlanadi. Ikki marta bosish ikki savdo yaratmasligi kerak.
- Server narxi yoki mahsulot holati o‘zgargan bo‘lsa, `Ma’lumot yangilangan` xabari bilan hisobni qayta ko‘rib chiqishga qaytaradi.

### S10 — Shartnoma preview

Elementlar: PDF preview, `Loyiha` yoki `Yakuniy` belgisi, `Yopish`; yakuniy shartnomada `Ulashish`, `Yuklab olish`.

- Loyiha preview’ida yakuniy shartnoma raqami berilmaydi va `Loyiha` suv belgisi bo‘ladi.
- Yakuniy hujjat imzolangan deb avtomatik belgilanmaydi. Qog‘ozga chiqarish/qo‘l qo‘yish jarayoni alohida tasdiqlanishi kerak.
- PDF ochilmasa `Qayta urinish`; savdo yakunlangan bo‘lsa, PDF xatosi savdoni qayta yaratmaydi.

### S11 — Savdolar ro‘yxati

Elementlar: qidiruv, filtr (`Barchasi`, `Faol`, `Kechikkan`, `Yakunlangan`, `Qaytarilgan`), savdo kartasi (oluvchi, mahsulot, sana, qoldiq, holat), `Yangi savdo`.

- Qidiruv oluvchi nomi/telefon, shartnoma raqami bo‘yicha.
- Filtr va qidiruv birga ishlaydi; natija yo‘q holatida `Filtrni tozalash`.
- Savdo kartasi → S13. Sotuvchi o‘ziga ruxsat etilgan savdolarni ko‘radi; adminning hamma savdolari avtomatik ochilmaydi.
- `Yangi savdo` → S06.

### S12 — Qoralamalar

Elementlar: saqlangan savdo qoralamalari, oxirgi o‘zgarish sanasi, qaysi bosqichda qolgan, `Davom etish`, `O‘chirish`.

- `Davom etish` o‘sha bosqichni ochadi va amaldagi mahsulot/narxni qayta tekshiradi.
- `O‘chirish` → `Qoralama o‘chirilsinmi?` tasdiqlash dialogi. Qoralamani o‘chirish haqiqiy savdo yoki oluvchini o‘chirmaydi.
- Bo‘sh holat: `Saqlangan qoralama yo‘q`.

### S13 — Savdo tafsiloti

Elementlar: shartnoma raqami, holat, oluvchi, mahsulot, kelishilgan narx, kelishilgan bosh to‘lov, bosh to‘lovning qabul qilingan/qilinmagan holati, jami to‘langan, umumiy qoldiq, kechikkan summa, jadval, to‘lovlar tarixi, `To‘lov kiritish`, `Shartnomani ko‘rish`, `Xaritada ochish`.

- `Shartnomani ko‘rish` → S10 yakuniy PDF.
- `To‘lov kiritish` → S16; sotuvchi faqat o‘zi olgan pulni kiritadi.
- `Xaritada ochish` → tashqi xarita ilovasi.
- To‘lov satri sanasi, summasi, usuli va tasdiq holatini ko‘rsatadi; sotuvchi uni tahrirlamaydi.
- `Qaytarilgan` holatida qaytarishning sanasi va admin tasdiqlagan yakuniy hisob ko‘rinadi; sotuvchida `Qaytarishni yakunlash` tugmasi bo‘lmaydi.
- Agar savdo yaqinda yaratilgan bo‘lsa `Ulashish` shartnoma faylini tizim share oynasiga beradi.

### S14 — Savdo yaratildi

Elementlar: muvaffaqiyat belgisi, shartnoma raqami, oluvchi, mahsulot, yakuniy narx, kelishilgan bosh to‘lov (`Qabul qilinmagan` belgisi, agar hali kiritilmagan bo‘lsa), bo‘lib to‘lanadigan qoldiq, birinchi to‘lov sanasi, `Bosh to‘lovni kiritish`, `Shartnomani ko‘rish`, `Ulashish`, `Savdolarimga o‘tish`, `Yana savdo qilish`.

- `Bosh to‘lovni kiritish` → S16, bosh to‘lov turi oldindan tanlangan; `Shartnomani ko‘rish` → S10; `Ulashish` → tizim share oynasi; `Savdolarimga o‘tish` → S11; `Yana savdo qilish` → S06.
- Orqaga bosilganda tasdiqlash ekraniga qaytib savdoni takrorlamaydi; S11 yoki S02 ga o‘tadi.

### S15 — Profil va sozlamalar

Elementlar: xodim ismi, telefon/login, rol `Sotuvchi`, `Til`, `Yordam`, `Chiqish`.

- `Til` mavjud tarjimalar bo‘lsa tanlash oynasi; MVP faqat o‘zbekcha bo‘lsa tugma o‘rniga `O‘zbekcha` yorlig‘i.
- `Yordam` adminning yordam telefoni yoki qo‘llanma ekranini ochadi; ishlamaydigan havola bo‘lmasin.
- `Chiqish` tasdiqlash dialogi; qoralamalar serverda saqlanmagan bo‘lsa avval ogohlantiradi.

### S16 — To‘lov kiritish

Elementlar: shartnoma va oluvchi qisqa ma’lumoti, hozirgi qoldiq, `Summa`, `Usul` (`Naqd` / `Karta o‘tkazmasi`), `Qabul qilingan sana-vaqt`, `Izoh` (ixtiyoriy), karta uchun `Tranzaksiya raqami` va `Chek rasmi` (mavjud bo‘lsa), `To‘lovni qayd etish`.

- `Qabul qiluvchi` tizimga kirgan xodimdan olinadi va o‘zgartirilmaydi: kim pulni olsa, o‘sha o‘z hisobidan kiritadi.
- `Summa` musbat bo‘lishi kerak; qarzdan ortiq to‘lovga ruxsat va uning qaytarish qoidasi alohida biznes qarori sifatida belgilanadi.
- `Naqd / Karta o‘tkazmasi` tanlovi forma maydonlarini moslaydi; karta tushumi bank bilan avtomatik bog‘lanmagan bo‘lsa, faqat xodim yozuviga tayanib `bank tasdiqladi` deb ko‘rsatilmaydi.
- `To‘lovni qayd etish` ikki marta bosilganda ikki tushum yaratmaydi. Muvaffaqiyatdan so‘ng summa, usul, vaqt va yozuv holati ko‘rsatiladi; `Savdoga qaytish` → S13.
- Avvalgi to‘lovni tahrirlash/o‘chirish tugmasi yo‘q. Xatoni tuzatish admin ko‘radigan alohida bekor qilish amali va sabab bilan bajariladi.

## 6. Hisoblash va ma’lumot qoidalari

- `Kelishilgan yakuniy narx ≥ admin belgilagan minimal narx`.
- `Moliyalashtirilgan qoldiq = kelishilgan yakuniy narx − bosh to‘lov`.
- `Amaldagi umumiy qarz = kelishilgan yakuniy narx − barcha tasdiqlangan to‘lovlar`. Bosh to‘lov hali tasdiqlanmagan bo‘lsa, u ham shu qarz ichida qoladi.
- `Jadval jami = moliyalashtirilgan qoldiq`; oylar bo‘yicha yaxlitlash farqi oxirgi oyga tushadi.
- `Jami to‘langan`ga faqat hisobga olingan to‘lovlar kiradi. Kelishilgan bosh to‘lov alohida majburiyat sifatida ko‘rsatiladi; u haqiqatan olinganda sotuvchi yoki yig‘uvchi uni to‘lov sifatida qayd etadi. Karta tushumini qachon hisobga olish qoidasi hali kelishilmagan.
- Muddatidan oldin yoki qisman to‘lovlarga jadval moslashadi: qarz qoldig‘i real to‘lovlardan hisoblanadi, eski yozuvlar o‘chirilmaydi. Sotuvchi o‘zi olgan yangi to‘lovni kiritadi, eski yozuvni o‘zgartirmaydi.
- Shartnomadagi savdo shartlari savdo paytidagi qiymatlar bilan saqlanadi. Mahsulotning keyingi narx o‘zgarishi eski shartnomani o‘zgartirmaydi.
- Pul qiymatlari butun so‘mda saqlanadi; interfeysda kiritish va ko‘rsatish bir xil formatga ega.

## 7. Bo‘sh, xato va tarmoq holatlari

- Har bir ro‘yxat uchun skeleton yuklanish, bo‘sh holat, xato + qayta urinish va normal holat frame’i chiziladi.
- Internet yo‘q paytda yangi savdoni yakunlash taqiqlanadi; qoralama saqlash mumkin bo‘lsa, uning faqat lokal ekanligi aniq yoziladi.
- Serverdan kelgan validation xatosi tegishli maydon ostida; umumiy xato esa yuqorida qisqa bannerda.
- 401/sessiya tugashi → `Sessiya tugadi, qayta kiring`; qoralama yo‘qolmasligi kerak.
- Uzoq davom etgan PDF generatsiyasida progress va `Bu bir necha soniya olishi mumkin`; tugmani qayta bosish ikkinchi savdo yaratmaydi.
- Qo‘ng‘iroq, xarita va ulashish tashqi ilova ochilmasa foydalanuvchiga tushunarli xabar beradi.

## 8. Figma prototipida tekshiriladigan oqimlar

1. Mavjud oluvchi bilan yangi savdo va shartnoma.
2. Yangi tashkilot oluvchisi, xaritada lokatsiya tanlash, savdo yaratish.
3. Tavsiya etilgan narxdan past, ammo minimumdan yuqori narxda savdo.
4. Minimumdan past narx xatosi va qayta tuzatish.
5. Qoralamani saqlab, keyin davom ettirish.
6. Shartnoma preview’i, tasdiqlash va yakuniy PDF’ni ulashish.
7. Internet uzilishi, sessiya tugashi va PDF xatosidan tiklanish.
8. Sotuvchi olgan bosh to‘lovni va keyingi to‘lovni S16 orqali qayd etish.

## 9. Yakunlashdan oldin biznes qarorlari

- Sotuvchiga minimal narxning o‘zi ko‘rsatiladimi yoki faqat `bu narx mumkin emas` xabari beriladimi?
- Shartnoma kim tomonidan va qanday imzolanadi: qog‘ozda, telefon ekranida yoki faqat PDF chop etiladimi?
- Karta o‘tkazmasini hisobga olishdan oldin alohida bank/admin tekshiruvi kerakmi yoki xodim kiritishi bilan hisobga olinadimi?
- Sotuvchi barcha MChJ savdolarini ko‘radimi yoki faqat o‘z savdolarinimi? Hozirgi dizayn faqat o‘ziga ruxsat etilgan savdolarni ko‘rsatadi.
