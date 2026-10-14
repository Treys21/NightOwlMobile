// UI tests and simulator runs pass NSUserDefaults launch arguments, e.g.
//   xcrun simctl launch booted com.nightowl.ios -NightOwlOpenRoute /season
// Regular users can't set these; every reader falls back to normal behavior.
import { Platform, Settings } from 'react-native';

export function launchArgument(key: string): string | null {
  if (Platform.OS !== 'ios') return null;
  const value: unknown = Settings.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
