import { requireOptionalNativeModule } from "expo";

const hasNativeMapKit = requireOptionalNativeModule("ExpoYandexMapKit") !== null;

export const YandexMapSurface =
  hasNativeMapKit
    ? (
      // Expo Go and older app builds do not include MapKit's native module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./YandexMapSurface.native").default as typeof import("./YandexMapSurface.native").default
    )
    : null;

export const yandexMapUnavailableMessage =
  "Bu ilova buildida Yandex MapKit moduli yo‘q. Yandex xaritasini ochish uchun yangi development build yoki APK o‘rnating; Expo Go’da u ishlamaydi.";
