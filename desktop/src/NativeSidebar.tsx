import {
  Platform,
  requireNativeComponent,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";

export const NativeSidebar = Platform.OS === "macos"
  ? requireNativeComponent<ViewProps & {
      dark: boolean;
      selectedPage: string;
      onSelect: (event: NativeSyntheticEvent<{ page: string }>) => void;
    }>("RaynaSidebar")
  : null;
