import { useSyncExternalStore, type ReactNode } from "react";
import { Text, View } from "react-native";

let content: ReactNode = null;
const listeners = new Set<() => void>();
export function updateSettingsContent(next: ReactNode) {
  content = next;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export default function SettingsWindow() {
  const settings = useSyncExternalStore(subscribe, () => content, () => null);
  return settings ?? <View style={{ padding: 24 }}><Text>Continue in the main Rayna window.</Text></View>;
}
