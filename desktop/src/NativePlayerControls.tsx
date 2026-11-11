import { Platform, requireNativeComponent, type NativeSyntheticEvent, type ViewProps } from "react-native";

type PlayerCommand = "previous" | "toggle" | "next" | "lyrics" | "queue" | "mute" | "seek" | "volume";
export const NativePlayerControls = Platform.OS === "macos"
  ? requireNativeComponent<ViewProps & {
      dark: boolean;
      playing: boolean;
      hasTrack: boolean;
      position: number;
      duration: number;
      volume: number;
      onCommand: (event: NativeSyntheticEvent<{ action: PlayerCommand; value: number }>) => void;
    }>("RaynaPlayerControls")
  : null;
