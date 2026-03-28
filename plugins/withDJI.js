/**
 * withDJI — Expo config plugin for DJI Mobile SDK V4.
 *
 * UPDATED: No longer writes DJIBridgeModule.kt or DJIBridgePackage.kt.
 * Those are replaced by the Expo Module at modules/expo-dji/ which
 * auto-registers with New Architecture via Expo Autolinking.
 *
 * This plugin still handles:
 * 1. DJI Maven repository (project-level)
 * 2. DJI App Key in AndroidManifest
 * 3. USB accessory intent filter on MainActivity
 * 4. DJI permissions
 * 5. accessory_filter.xml
 */
const {
  withProjectBuildGradle,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DJI_APP_KEY = '7999a727d113493fa9985f55';

// 1. Add DJI Maven repo to project build.gradle
function withDJIMaven(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('developer.dji.com')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        "maven { url 'https://www.jitpack.io' }",
        "maven { url 'https://www.jitpack.io' }\n        maven { url 'https://developer.dji.com/maven/release/' }"
      );
    }
    return mod;
  });
}

// 2. Add DJI permissions + App Key + USB filter to AndroidManifest
function withDJIManifest(config) {
  return withAndroidManifest(config, (mod) => {
    var manifest = mod.modResults;
    var mainApp = manifest.manifest.application[0];

    // Add DJI App Key meta-data
    if (!mainApp['meta-data']) mainApp['meta-data'] = [];
    var hasKey = mainApp['meta-data'].some(function(m) {
      return m.$ && m.$['android:name'] === 'com.dji.sdk.API_KEY';
    });
    if (!hasKey) {
      mainApp['meta-data'].push({
        $: {
          'android:name': 'com.dji.sdk.API_KEY',
          'android:value': DJI_APP_KEY,
        },
      });
    }

    // Add USB accessory intent-filter to MainActivity
    var mainActivity = mainApp.activity && mainApp.activity.find(function(a) {
      return a.$ && a.$['android:name'] === '.MainActivity';
    });
    if (mainActivity) {
      if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
      var hasUsb = mainActivity['intent-filter'].some(function(f) {
        return f.action && f.action.some(function(a) {
          return a.$ && a.$['android:name'] === 'android.hardware.usb.action.USB_ACCESSORY_ATTACHED';
        });
      });
      if (!hasUsb) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.hardware.usb.action.USB_ACCESSORY_ATTACHED' } }],
        });
        if (!mainActivity['meta-data']) mainActivity['meta-data'] = [];
        mainActivity['meta-data'].push({
          $: {
            'android:name': 'android.hardware.usb.action.USB_ACCESSORY_ATTACHED',
            'android:resource': '@xml/accessory_filter',
          },
        });
      }
    }

    // Add permissions
    if (!manifest.manifest['uses-permission']) manifest.manifest['uses-permission'] = [];
    var perms = manifest.manifest['uses-permission'];
    var existingPerms = perms.map(function(p) { return p.$ && p.$['android:name']; });
    var neededPerms = [
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_PHONE_STATE',
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
    ];
    neededPerms.forEach(function(perm) {
      if (existingPerms.indexOf(perm) === -1) {
        perms.push({ $: { 'android:name': perm } });
      }
    });

    // Add uses-feature for USB
    if (!manifest.manifest['uses-feature']) manifest.manifest['uses-feature'] = [];
    var features = manifest.manifest['uses-feature'];
    var existingFeatures = features.map(function(f) { return f.$ && f.$['android:name']; });
    ['android.hardware.usb.accessory', 'android.hardware.usb.host'].forEach(function(feat) {
      if (existingFeatures.indexOf(feat) === -1) {
        features.push({ $: { 'android:name': feat, 'android:required': 'false' } });
      }
    });

    return mod;
  });
}

// 3. Write accessory_filter.xml
function withDJIAccessoryFilter(config) {
  return withDangerousMod(config, [
    'android',
    async function(mod) {
      var projectRoot = mod.modRequest.projectRoot;
      var xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'accessory_filter.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<resources>\n' +
        '    <usb-accessory model="T600" manufacturer="DJI"/>\n' +
        '    <usb-accessory model="AG410" manufacturer="DJI"/>\n' +
        '    <usb-accessory model="com.dji.logiclink" manufacturer="DJI"/>\n' +
        '    <usb-accessory model="WM160" manufacturer="DJI"/>\n' +
        '    <usb-accessory model="WM161" manufacturer="DJI"/>\n' +
        '    <usb-accessory model="RC231" manufacturer="DJI"/>\n' +
        '</resources>\n'
      );
      console.log('[withDJI] Wrote accessory_filter.xml');
      return mod;
    },
  ]);
}

// Combine
function withDJI(config) {
  config = withDJIMaven(config);
  config = withDJIManifest(config);
  config = withDJIAccessoryFilter(config);
  return config;
}

module.exports = withDJI;
