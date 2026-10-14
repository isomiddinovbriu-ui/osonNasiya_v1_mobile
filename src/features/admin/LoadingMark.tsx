import { Image } from "expo-image";

type Props = { size?: number };

export default function LoadingMark({ size = 48 }: Props) {
  return (
    <Image
      source={require("../../../assets/images/loading-coins.gif")}
      style={{ width: size, height: size }}
      contentFit="contain"
      autoplay
      accessibilityLabel="Yuklanmoqda"
    />
  );
}
