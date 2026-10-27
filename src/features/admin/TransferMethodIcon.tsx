import { Image } from "expo-image";

export default function TransferMethodIcon({ size }: { size: number }) {
  return (
    <Image
      source={require("../../../assets/images/transfer-method.png")}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}
