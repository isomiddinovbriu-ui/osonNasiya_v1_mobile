module.exports = ({ config }) => {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(androidGoogleMapsApiKey
        ? [["react-native-maps", { androidGoogleMapsApiKey }]]
        : []),
    ],
  };
};
