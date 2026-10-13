// The native side lives in ios/; JavaScript reaches it through
// requireOptionalNativeModule('NightOwlLiveActivity') in
// src/utils/liveActivityBridge.ts, so Expo Go (no module) keeps working.
export const NATIVE_MODULE_NAME = 'NightOwlLiveActivity';
