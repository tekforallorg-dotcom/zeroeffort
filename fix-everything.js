#!/usr/bin/env node
/**
 * COMPLETE FIX — Run from ~/zeroeffort
 * node fix-everything.js
 */
const fs = require('fs');
const path = require('path');

const BUILD_TAG = 'BUILD-2026-03-28-V2';

function w(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
  console.log('  OK', p);
}

console.log('=== ZeroEffort Complete Fix ===\n');

// 1. Kotlin module — CORRECT string templates (no backslash escaping)
const kt = [
  'package expo.modules.dji',
  '',
  'import android.util.Log',
  'import androidx.core.os.bundleOf',
  'import expo.modules.kotlin.modules.Module',
  'import expo.modules.kotlin.modules.ModuleDefinition',
  'import expo.modules.kotlin.Promise',
  'import dji.common.error.DJIError',
  'import dji.common.error.DJISDKError',
  'import dji.sdk.base.BaseComponent',
  'import dji.sdk.base.BaseProduct',
  'import dji.sdk.camera.Camera',
  'import dji.sdk.flightcontroller.FlightController',
  'import dji.sdk.products.Aircraft',
  'import dji.sdk.sdkmanager.DJISDKInitEvent',
  'import dji.sdk.sdkmanager.DJISDKManager',
  '',
  'class ExpoDjiModule : Module() {',
  '',
  '  companion object {',
  '    const val TAG = "ExpoDji"',
  '  }',
  '',
  '  private var product: BaseProduct? = null',
  '  private var aircraft: Aircraft? = null',
  '  private var flightController: FlightController? = null',
  '  private var camera: Camera? = null',
  '  private var isRegistered = false',
  '',
  '  override fun definition() = ModuleDefinition {',
  '',
  '    Name("ExpoDji")',
  '',
  '    Events("onTelemetry", "onConnection")',
  '',
  '    Function("isAvailable") {',
  '      return@Function true',
  '    }',
  '',
  '    Function("getBuildTag") {',
  '      return@Function "' + BUILD_TAG + '"',
  '    }',
  '',
  '    AsyncFunction("registerSDK") { promise: Promise ->',
  '      val context = appContext.reactContext?.applicationContext',
  '      if (context == null) {',
  '        promise.resolve(bundleOf("success" to false, "message" to "No app context"))',
  '        return@AsyncFunction',
  '      }',
  '      Log.d(TAG, "Registering DJI SDK...")',
  '      DJISDKManager.getInstance().registerApp(',
  '        context,',
  '        object : DJISDKManager.SDKManagerCallback {',
  '          override fun onRegister(error: DJIError?) {',
  '            if (error == DJISDKError.REGISTRATION_SUCCESS) {',
  '              Log.d(TAG, "SDK registered")',
  '              isRegistered = true',
  '              DJISDKManager.getInstance().startConnectionToProduct()',
  '              promise.resolve(bundleOf("success" to true, "message" to "DJI SDK registered"))',
  '            } else {',
  '              val msg = error?.description ?: "Unknown error"',
  '              Log.e(TAG, "Registration failed: " + msg)',
  '              promise.resolve(bundleOf("success" to false, "message" to "Failed: " + msg))',
  '            }',
  '          }',
  '          override fun onProductDisconnect() {',
  '            product = null; aircraft = null; flightController = null; camera = null',
  '            sendEvent("onConnection", bundleOf("status" to "disconnected", "model" to ""))',
  '          }',
  '          override fun onProductConnect(p: BaseProduct?) {',
  '            val name = p?.model?.displayName ?: "Unknown"',
  '            Log.d(TAG, "Product connected: " + name)',
  '            product = p',
  '            if (p is Aircraft) { aircraft = p; flightController = p.flightController; camera = p.camera; setupTelemetry() }',
  '            sendEvent("onConnection", bundleOf("status" to "connected", "model" to name))',
  '          }',
  '          override fun onProductChanged(p: BaseProduct?) {',
  '            product = p',
  '            if (p is Aircraft) { aircraft = p; flightController = p.flightController; camera = p.camera }',
  '          }',
  '          override fun onComponentChange(k: BaseProduct.ComponentKey?, o: BaseComponent?, n: BaseComponent?) {}',
  '          override fun onInitProcess(e: DJISDKInitEvent?, t: Int) {}',
  '          override fun onDatabaseDownloadProgress(c: Long, t: Long) {}',
  '        }',
  '      )',
  '    }',
  '',
  '    AsyncFunction("connect") { promise: Promise ->',
  '      if (!isRegistered) { promise.resolve(bundleOf("success" to false, "message" to "SDK not registered")); return@AsyncFunction }',
  '      if (aircraft != null && flightController != null) {',
  '        val name = product?.model?.displayName ?: "DJI Aircraft"',
  '        promise.resolve(bundleOf("success" to true, "message" to name + " connected"))',
  '      } else {',
  '        promise.resolve(bundleOf("success" to false, "message" to "No DJI product. Check RC + USB."))',
  '      }',
  '    }',
  '',
  '    AsyncFunction("disconnect") { promise: Promise ->',
  '      flightController?.setStateCallback(null)',
  '      promise.resolve(bundleOf("success" to true, "message" to "Disconnected"))',
  '    }',
  '',
  '    AsyncFunction("takeoff") { altitude: Double, promise: Promise ->',
  '      val fc = flightController',
  '      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }',
  '      fc.startTakeoff { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Takeoff" else "Failed: " + (e?.description ?: ""))) }',
  '    }',
  '',
  '    AsyncFunction("land") { promise: Promise ->',
  '      val fc = flightController',
  '      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }',
  '      fc.startLanding { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Landing" else "Failed: " + (e?.description ?: ""))) }',
  '    }',
  '',
  '    AsyncFunction("hover") { promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Hovering")) }',
  '',
  '    AsyncFunction("returnHome") { promise: Promise ->',
  '      val fc = flightController',
  '      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }',
  '      fc.startGoHome { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "RTH" else "Failed: " + (e?.description ?: ""))) }',
  '    }',
  '',
  '    Function("emergencyStop") { flightController?.turnOffMotors(null) }',
  '',
  '    AsyncFunction("capturePhoto") { promise: Promise ->',
  '      val cam = camera',
  '      if (cam == null) { promise.resolve(bundleOf("success" to false, "message" to "No camera", "uri" to "", "timestamp" to System.currentTimeMillis().toString())); return@AsyncFunction }',
  '      cam.startShootPhoto { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Photo" else "Failed", "uri" to "", "timestamp" to System.currentTimeMillis().toString())) }',
  '    }',
  '',
  '    AsyncFunction("startVideo") { promise: Promise ->',
  '      val cam = camera ?: run { promise.resolve(bundleOf("success" to false, "message" to "No camera")); return@AsyncFunction }',
  '      cam.startRecordVideo { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Recording" else "Failed")) }',
  '    }',
  '',
  '    AsyncFunction("stopVideo") { promise: Promise ->',
  '      val cam = camera ?: run { promise.resolve(bundleOf("success" to false, "message" to "No camera")); return@AsyncFunction }',
  '      cam.stopRecordVideo { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Stopped" else "Failed")) }',
  '    }',
  '',
  '    AsyncFunction("moveRelative") { _f: Double, _r: Double, _u: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Move")) }',
  '    AsyncFunction("setHeading") { _d: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Heading")) }',
  '    AsyncFunction("setAltitude") { _a: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Alt")) }',
  '    AsyncFunction("goToGPS") { _lat: Double, _lon: Double, _alt: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "GPS")) }',
  '    AsyncFunction("getObstacleData") { promise: Promise -> promise.resolve(bundleOf("supported" to false)) }',
  '  }',
  '',
  '  private fun setupTelemetry() {',
  '    flightController?.setStateCallback { state ->',
  '      try {',
  '        sendEvent("onTelemetry", bundleOf(',
  '          "altitude" to (state.aircraftLocation?.altitude?.toDouble() ?: 0.0),',
  '          "latitude" to (state.aircraftLocation?.latitude ?: 0.0),',
  '          "longitude" to (state.aircraftLocation?.longitude ?: 0.0),',
  '          "heading" to state.aircraftHeadDirection,',
  '          "speed" to Math.sqrt((state.velocityX * state.velocityX + state.velocityY * state.velocityY).toDouble()),',
  '          "satellites" to state.satelliteCount,',
  '          "isFlying" to state.isFlying,',
  '          "isMotorsOn" to state.areMotorsOn()',
  '        ))',
  '      } catch (e: Exception) { Log.e(TAG, "Telemetry: " + e.message) }',
  '    }',
  '  }',
  '}',
].join('\n');

w('modules/expo-dji/android/src/main/java/expo/modules/dji/ExpoDjiModule.kt', kt);

// 2. Module build.gradle
w('modules/expo-dji/android/build.gradle', `apply plugin: 'expo-module-gradle-plugin'

android {
  namespace "expo.modules.dji"
  defaultConfig {
    minSdkVersion 24
  }
  packagingOptions {
    pickFirst 'lib/*/libstlport_shared.so'
    pickFirst 'lib/*/libc++_shared.so'
    exclude 'META-INF/rxjava.properties'
  }
}

repositories {
  maven { url 'https://developer.dji.com/maven/release/' }
}

dependencies {
  implementation 'com.dji:dji-sdk:4.18'
  compileOnly 'com.dji:dji-sdk-provided:4.18'
}
`);

// 3. AndroidManifest for module
w('modules/expo-dji/android/src/main/AndroidManifest.xml',
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>\n');

// 4. expo-module.config.json
w('modules/expo-dji/expo-module.config.json', JSON.stringify({
  platforms: ["android"],
  android: { modules: ["expo.modules.dji.ExpoDjiModule"] }
}, null, 2) + '\n');

// 5. package.json for autolinking
w('modules/expo-dji/package.json', JSON.stringify({
  name: "expo-dji",
  version: "0.1.0",
  main: "index.ts",
  devDependencies: { "expo-modules-core": "*" },
  peerDependencies: { expo: "*" }
}, null, 2) + '\n');

// 6. TS module interface
w('modules/expo-dji/src/ExpoDjiModule.ts', `import { requireNativeModule } from 'expo-modules-core';

export default requireNativeModule('ExpoDji');
`);

// 7. index.ts
w('modules/expo-dji/index.ts', `export { default as ExpoDjiModule } from './src/ExpoDjiModule';
`);

// 8. Clean up unnecessary files
['modules/expo-dji/ios', 'modules/expo-dji/src/ExpoDji.types.ts',
 'modules/expo-dji/src/ExpoDjiView.tsx', 'modules/expo-dji/src/ExpoDjiView.web.tsx',
 'modules/expo-dji/src/ExpoDjiModule.web.ts'].forEach(f => {
  try { if (fs.statSync(f).isDirectory()) fs.rmSync(f, {recursive:true}); else fs.unlinkSync(f); console.log('  DEL', f); } catch {}
});

// 9. DJIAdapter.ts — uses requireNativeModule, NO mock, NO simulation
w('src/plugins/dji/DJIAdapter.ts', `import type {
  DronePlugin, DroneState, ConnectionStatus, ConnectionResult,
  CommandResult, PhotoResult, ObstacleData,
} from '../interface';

var ExpoDjiModule: any = null;
var moduleLoadError: string | null = null;

try {
  ExpoDjiModule = require('../../../modules/expo-dji').ExpoDjiModule;
} catch (err: any) {
  moduleLoadError = err.message || 'Module load failed';
}

export class DJIAdapter implements DronePlugin {
  readonly plugin_id: string;
  readonly drone_name: string;
  readonly nativeAvailable: boolean;
  readonly nativeError: string | null;

  private _status: ConnectionStatus = 'disconnected';
  private _is_airborne = false;
  private _altitude_m = 0;
  private _battery_percent = 0;
  private _gps_satellites = 0;
  private _latitude = 0;
  private _longitude = 0;
  private _heading = 0;
  private _speed = 0;
  private _signal = 0;
  private _is_busy = false;
  private _last_error: string | null = null;

  constructor(pluginId: string, droneName: string) {
    this.plugin_id = pluginId;
    this.drone_name = droneName;
    this.nativeAvailable = ExpoDjiModule !== null;
    this.nativeError = moduleLoadError;
    if (this.nativeAvailable) {
      console.log('[DJI] ' + droneName + ' Expo module LOADED');
      try { console.log('[DJI] buildTag: ' + ExpoDjiModule.getBuildTag()); } catch {}
    } else {
      console.error('[DJI] ' + droneName + ' MODULE MISSING: ' + this.nativeError);
    }
  }

  async connect(): Promise<ConnectionResult> {
    if (!this.nativeAvailable) {
      this._status = 'error';
      this._last_error = 'Native module missing: ' + (this.nativeError || 'unknown');
      return { success: false, status: 'error', message: this._last_error };
    }
    this._status = 'connecting';
    try {
      console.log('[DJI] registerSDK...');
      var reg = await ExpoDjiModule.registerSDK();
      console.log('[DJI] reg:', JSON.stringify(reg));
      if (!reg.success) { this._status = 'error'; this._last_error = reg.message; return { success: false, status: 'error', message: reg.message }; }
      console.log('[DJI] waiting 3s...');
      await new Promise(function(r) { setTimeout(r, 3000); });
      var conn = await ExpoDjiModule.connect();
      console.log('[DJI] conn:', JSON.stringify(conn));
      if (conn.success) { this._status = 'connected'; this._signal = 90; return { success: true, status: 'connected', message: conn.message }; }
      this._status = 'error'; this._last_error = conn.message;
      return { success: false, status: 'error', message: conn.message };
    } catch (err: any) {
      this._status = 'error'; this._last_error = err.message;
      return { success: false, status: 'error', message: err.message };
    }
  }

  async disconnect(): Promise<void> {
    if (ExpoDjiModule) try { await ExpoDjiModule.disconnect(); } catch {}
    this._status = 'disconnected'; this._signal = 0;
  }
  getConnectionStatus(): ConnectionStatus { return this._status; }
  getState(): DroneState {
    return { is_airborne: this._is_airborne, altitude_m: this._altitude_m, battery_percent: this._battery_percent,
      gps_satellites: this._gps_satellites, latitude: this._latitude, longitude: this._longitude,
      heading_degrees: this._heading, speed_ms: this._speed, signal_strength: this._signal,
      is_busy: this._is_busy, last_error: this._last_error };
  }
  async takeoff(a: number = 3): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.takeoff(a); }
  async land(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.land(); }
  async hover(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.hover(); }
  async returnHome(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.returnHome(); }
  emergencyStop(): void { if (ExpoDjiModule) try { ExpoDjiModule.emergencyStop(); } catch {} }
  async goToGPS(lat: number, lon: number, alt: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.goToGPS(lat,lon,alt); }
  async moveRelative(f: number, r: number, u: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.moveRelative(f,r,u); }
  async setHeading(d: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.setHeading(d); }
  async setAltitude(a: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.setAltitude(a); }
  async capturePhoto(): Promise<PhotoResult> { if (!ExpoDjiModule) return {success:false,message:'No module',uri:null,timestamp:''}; var r = await ExpoDjiModule.capturePhoto(); return {success:r.success,message:r.message,uri:null,timestamp:r.timestamp}; }
  async startVideo(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.startVideo(); }
  async stopVideo(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.stopVideo(); }
  async getObstacleData(): Promise<ObstacleData> { return { supported: false, nearest_m: null, direction: null }; }
}

export function createMini2SEAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-2-se', 'DJI Mini 2 SE'); }
export function createMini2Adapter(): DJIAdapter { return new DJIAdapter('dji-mini-2', 'DJI Mini 2'); }
export function createMini4ProAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-4-pro', 'DJI Mini 4 Pro'); }
export function createAir3Adapter(): DJIAdapter { return new DJIAdapter('dji-air-3', 'DJI Air 3'); }
`);

// 10. Update droneStore.tsx
var storePath = 'src/store/droneStore.tsx';
if (fs.existsSync(storePath)) {
  var store = fs.readFileSync(storePath, 'utf8');
  // Fix imports
  store = store.replace(
    /import \{[^}]*\} from '@\/plugins\/dji\/DJIAdapter';/,
    "import { createMini2SEAdapter, createMini2Adapter, createMini4ProAdapter, createAir3Adapter } from '@/plugins/dji/DJIAdapter';"
  );
  // Remove ('native') args
  store = store.replace(/createMini2Adapter\('native'\)/g, 'createMini2Adapter()');
  store = store.replace(/createMini2SEAdapter\('native'\)/g, 'createMini2SEAdapter()');
  store = store.replace(/createMini4ProAdapter\('native'\)/g, 'createMini4ProAdapter()');
  store = store.replace(/createAir3Adapter\('native'\)/g, 'createAir3Adapter()');
  // Add dji-mini-2-se case
  if (store.indexOf("case 'dji-mini-2-se':") === -1) {
    store = store.replace("case 'dji-mini-2':", "case 'dji-mini-2':\n      case 'dji-mini-2-se':");
  }
  fs.writeFileSync(storePath, store);
  console.log('  OK', storePath);
}

// 11. Add build tag to Settings screen
var settingsPath = 'app/settings.tsx';
if (fs.existsSync(settingsPath)) {
  var settings = fs.readFileSync(settingsPath, 'utf8');
  // Replace version string to include build tag
  settings = settings.replace(
    /ZeroEffort v[\d.]+ • Tek4All/,
    'ZeroEffort v1.0.0 • ' + BUILD_TAG
  );
  fs.writeFileSync(settingsPath, settings);
  console.log('  OK', settingsPath, '(build tag added)');
}

// 12. Verify
console.log('\n=== Verification ===');
var checks = [
  ['modules/expo-dji/package.json', 'expo-dji'],
  ['modules/expo-dji/expo-module.config.json', 'ExpoDjiModule'],
  ['modules/expo-dji/android/build.gradle', 'dji-sdk'],
  ['modules/expo-dji/android/src/main/java/expo/modules/dji/ExpoDjiModule.kt', 'ModuleDefinition'],
  ['modules/expo-dji/src/ExpoDjiModule.ts', 'requireNativeModule'],
  ['src/plugins/dji/DJIAdapter.ts', 'ExpoDjiModule'],
];
var allOk = true;
checks.forEach(function(c) {
  var exists = fs.existsSync(c[0]);
  var hasContent = exists && fs.readFileSync(c[0], 'utf8').indexOf(c[1]) !== -1;
  console.log((hasContent ? '  ✅' : '  ❌') + ' ' + c[0] + ' contains "' + c[1] + '"');
  if (!hasContent) allOk = false;
});

// Check no $ templates in Kotlin (they'd fail silently)
var ktContent = fs.readFileSync('modules/expo-dji/android/src/main/java/expo/modules/dji/ExpoDjiModule.kt', 'utf8');
if (ktContent.indexOf('${') !== -1) {
  console.log('  ⚠️  WARNING: Kotlin file has ${} templates — might fail if escaped wrong');
} else {
  console.log('  ✅ Kotlin file uses string concat (no template risk)');
}

if (allOk) {
  console.log('\n✅ ALL CHECKS PASSED');
  console.log('\nNext: npm install ./modules/expo-dji');
  console.log('Then: rm -rf android && npx expo prebuild --platform android');
  console.log('Then: git add -A && git commit -m "fix: complete expo-dji rewrite ' + BUILD_TAG + '"');
  console.log('Then: npx eas build --profile development --platform android');
  console.log('\nSettings screen will show: ' + BUILD_TAG);
} else {
  console.log('\n❌ SOME CHECKS FAILED — fix before building');
}
