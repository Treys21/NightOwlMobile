// Apps built with the iOS 27 SDK must use the UIScene life cycle or UIKit
// refuses to launch them. Expo SDK 57 ships ExpoAppSceneDelegate but its
// prebuild template still starts React Native from the app delegate, so this
// plugin switches the generated app over:
//   1. Info.plist declares one window scene handled by ExpoAppSceneDelegate.
//   2. AppDelegate conforms to ExpoReactNativeFactoryProvider and no longer
//      creates the window itself; the scene delegate does.
// It fails prebuild loudly if the template changes shape, rather than
// silently producing an app that won't launch.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

function patchAppDelegate(source) {
  if (source.includes('ExpoReactNativeFactoryProvider')) return source;
  const classDecl = 'class AppDelegate: ExpoAppDelegate {';
  const windowBlock = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
  if (!source.includes(classDecl) || !windowBlock.test(source)) {
    throw new Error('withSceneLifecycle: AppDelegate.swift no longer matches the expected Expo template; update plugins/withSceneLifecycle.js.');
  }
  return source
    .replace(classDecl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    .replace(windowBlock, '\n    // The window and React Native start in ExpoAppSceneDelegate (UIScene life cycle).\n');
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: SCENE_DELEGATE }
        ]
      }
    };
    return cfg;
  });
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') throw new Error('withSceneLifecycle expects a Swift AppDelegate.');
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });
};
