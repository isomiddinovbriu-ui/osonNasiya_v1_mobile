module.exports = ({ config }) => {
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ["expo-yandex-mapkit", { flavor: "lite" }],
    ],
  };
};
