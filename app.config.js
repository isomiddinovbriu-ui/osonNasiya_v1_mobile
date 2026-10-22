module.exports = ({ config }) => {
  const yandexMapKitApiKey = process.env.EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        "expo-yandex-mapkit",
        {
          flavor: "lite",
          ...(yandexMapKitApiKey ? { apiKey: yandexMapKitApiKey } : {}),
        },
      ],
    ],
  };
};
