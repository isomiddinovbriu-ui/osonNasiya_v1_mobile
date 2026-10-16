# OsonNasiya mobil ilovasi

Bu Expo SDK 57 loyihasiga eski `osonNasiya/mobile` ilovasining super-admin kirish ekrani ko'chirildi. Ekran `src/features/admin/AdminApp.tsx`da, Expo Router bosh marshruti `src/app/index.tsx`da. Oldin shu loyihada yaratilgan vazifalar demo ekrani `src/components/task-demo-screen.tsx`da saqlangan.

## Ishga tushirish

1. Eski `mobile/.env` qiymati bu loyiha `.env` fayliga ko'chirildi. Kompyuter IP manzili o'zgargan bo'lsa, `EXPO_PUBLIC_API_URL`ni yangilang. Namuna `.env.example`da; `.env` Gitga qo'shilmaydi.
2. Eski `osonNasiya/backend` serverini va MongoDBni ishga tushiring. Backenddagi `/health` manzili javob qaytarishi kerak.
3. `npx expo start` orqali ilovani ishga tushiring.
4. Eski backenddagi `super_admin` login va paroli bilan kiring.

Jismoniy telefon uchun API manzili kompyuterning tarmoq IP manzili yoki HTTPS domeni bo'lishi kerak; `localhost` telefonning o'zini anglatadi. Lokal IP ishlatilsa, telefon va kompyuter bir tarmoqda bo'lsin. Telefon uchun yig'ilgan APK ham backend ishlayotgan manzilga ulana olishi kerak. EAS `preview` buildida `EXPO_PUBLIC_API_URL` qiymatini build muhiti uchun ham sozlang, aks holda login API manzili topilmaydi.

`SOTUVCHI_DESIGN_SPEC.md` kelgusi sotuvchi ekranlari uchun eski loyiha dizayn hujjatidir. Hozir ko'chirilgan kod faqat super-admin login va kirgandan keyingi oddiy kutib olish ekranini o'z ichiga oladi.
