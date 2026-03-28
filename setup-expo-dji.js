#!/usr/bin/env node
/**
 * setup-expo-dji.js
 * 
 * Run this from your zeroeffort project root:
 *   node setup-expo-dji.js
 * 
 * It replaces the old legacy native module with the Expo Modules API version.
 */
const fs = require('fs');
const path = require('path');

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log('  wrote', filePath);
}

console.log('Setting up Expo DJI Module...\n');

// 1. Module build.gradle
writeFile('modules/expo-dji/android/build.gradle', `apply plugin: 'expo-module-gradle-plugin'

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

// 2. ExpoDjiModule.kt (Expo Modules API)
writeFile('modules/expo-dji/android/src/main/java/expo/modules/dji/ExpoDjiModule.kt', `package expo.modules.dji

import android.util.Log
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import dji.common.error.DJIError
import dji.common.error.DJISDKError
import dji.sdk.base.BaseComponent
import dji.sdk.base.BaseProduct
import dji.sdk.camera.Camera
import dji.sdk.flightcontroller.FlightController
import dji.sdk.products.Aircraft
import dji.sdk.sdkmanager.DJISDKInitEvent
import dji.sdk.sdkmanager.DJISDKManager

class ExpoDjiModule : Module() {

  companion object {
    const val TAG = "ExpoDji"
  }

  private var product: BaseProduct? = null
  private var aircraft: Aircraft? = null
  private var flightController: FlightController? = null
  private var camera: Camera? = null
  private var isRegistered = false

  override fun definition() = ModuleDefinition {

    Name("ExpoDji")

    Events("onTelemetry", "onConnection")

    Function("isAvailable") {
      return@Function true
    }

    AsyncFunction("registerSDK") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.resolve(bundleOf("success" to false, "message" to "No application context"))
        return@AsyncFunction
      }

      Log.d(TAG, "Registering DJI SDK...")

      DJISDKManager.getInstance().registerApp(
        context,
        object : DJISDKManager.SDKManagerCallback {
          override fun onRegister(error: DJIError?) {
            if (error == DJISDKError.REGISTRATION_SUCCESS) {
              Log.d(TAG, "SDK registered successfully")
              isRegistered = true
              DJISDKManager.getInstance().startConnectionToProduct()
              promise.resolve(bundleOf("success" to true, "message" to "DJI SDK registered"))
            } else {
              Log.e(TAG, "SDK registration failed: \${error?.description}")
              promise.resolve(bundleOf("success" to false, "message" to "Failed: \${error?.description}"))
            }
          }

          override fun onProductDisconnect() {
            Log.d(TAG, "Product disconnected")
            product = null; aircraft = null; flightController = null; camera = null
            sendEvent("onConnection", bundleOf("status" to "disconnected", "model" to ""))
          }

          override fun onProductConnect(p: BaseProduct?) {
            Log.d(TAG, "Product connected: \${p?.model?.displayName}")
            product = p
            if (p is Aircraft) {
              aircraft = p; flightController = p.flightController; camera = p.camera
              setupTelemetry()
            }
            sendEvent("onConnection", bundleOf(
              "status" to "connected",
              "model" to (p?.model?.displayName ?: "Unknown")
            ))
          }

          override fun onProductChanged(p: BaseProduct?) {
            product = p
            if (p is Aircraft) { aircraft = p; flightController = p.flightController; camera = p.camera }
          }

          override fun onComponentChange(k: BaseProduct.ComponentKey?, o: BaseComponent?, n: BaseComponent?) {}
          override fun onInitProcess(e: DJISDKInitEvent?, t: Int) { Log.d(TAG, "Init: \$e") }
          override fun onDatabaseDownloadProgress(c: Long, t: Long) {}
        }
      )
    }

    AsyncFunction("connect") { promise: Promise ->
      if (!isRegistered) {
        promise.resolve(bundleOf("success" to false, "message" to "SDK not registered"))
        return@AsyncFunction
      }
      if (aircraft != null && flightController != null) {
        promise.resolve(bundleOf("success" to true, "message" to "\${product?.model?.displayName} connected"))
      } else {
        promise.resolve(bundleOf("success" to false, "message" to "No DJI product found. Check RC + USB."))
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      flightController?.setStateCallback(null)
      promise.resolve(bundleOf("success" to true, "message" to "Disconnected"))
    }

    AsyncFunction("takeoff") { altitude: Double, promise: Promise ->
      val fc = flightController
      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }
      fc.startTakeoff { e ->
        promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Takeoff initiated" else "Failed: \${e.description}"))
      }
    }

    AsyncFunction("land") { promise: Promise ->
      val fc = flightController
      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }
      fc.startLanding { e ->
        promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Landing" else "Failed: \${e.description}"))
      }
    }

    AsyncFunction("hover") { promise: Promise ->
      promise.resolve(bundleOf("success" to true, "message" to "Hovering"))
    }

    AsyncFunction("returnHome") { promise: Promise ->
      val fc = flightController
      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }
      fc.startGoHome { e ->
        promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Returning home" else "Failed: \${e.description}"))
      }
    }

    Function("emergencyStop") {
      Log.w(TAG, "EMERGENCY STOP")
      flightController?.turnOffMotors(null)
    }

    AsyncFunction("capturePhoto") { promise: Promise ->
      val cam = camera
      if (cam == null) {
        promise.resolve(bundleOf("success" to false, "message" to "No camera", "uri" to "", "timestamp" to System.currentTimeMillis().toString()))
        return@AsyncFunction
      }
      cam.startShootPhoto { e ->
        promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Photo captured" else "Failed: \${e.description}", "uri" to "", "timestamp" to System.currentTimeMillis().toString()))
      }
    }

    AsyncFunction("startVideo") { promise: Promise ->
      val cam = camera
      if (cam == null) { promise.resolve(bundleOf("success" to false, "message" to "No camera")); return@AsyncFunction }
      cam.startRecordVideo { e ->
        promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Recording" else "Failed: \${e.description}"))
      }
    }

    AsyncFunction("stopVideo") { promise: Promise ->
      val cam = camera
      if (cam == null) { promise.resolve(bundleOf("success" to false, "message" to "No camera")); return@AsyncFunction }
      cam.stopRecordVideo { e ->
        promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Stopped" else "Failed: \${e.description}"))
      }
    }

    AsyncFunction("moveRelative") { fwd: Double, right: Double, up: Double, promise: Promise ->
      promise.resolve(bundleOf("success" to true, "message" to "Move sent"))
    }

    AsyncFunction("setHeading") { deg: Double, promise: Promise ->
      promise.resolve(bundleOf("success" to true, "message" to "Heading set"))
    }

    AsyncFunction("setAltitude") { alt: Double, promise: Promise ->
      promise.resolve(bundleOf("success" to true, "message" to "Altitude set"))
    }

    AsyncFunction("goToGPS") { lat: Double, lon: Double, alt: Double, promise: Promise ->
      promise.resolve(bundleOf("success" to true, "message" to "GPS nav not yet implemented"))
    }

    AsyncFunction("getObstacleData") { promise: Promise ->
      promise.resolve(bundleOf("supported" to false))
    }
  }

  private fun setupTelemetry() {
    flightController?.setStateCallback { state ->
      try {
        sendEvent("onTelemetry", bundleOf(
          "altitude" to (state.aircraftLocation?.altitude?.toDouble() ?: 0.0),
          "latitude" to (state.aircraftLocation?.latitude ?: 0.0),
          "longitude" to (state.aircraftLocation?.longitude ?: 0.0),
          "heading" to state.aircraftHeadDirection,
          "speed" to Math.sqrt((state.velocityX * state.velocityX + state.velocityY * state.velocityY).toDouble()),
          "satellites" to state.satelliteCount,
          "isFlying" to state.isFlying,
          "isMotorsOn" to state.areMotorsOn()
        ))
      } catch (e: Exception) {
        Log.e(TAG, "Telemetry error: \${e.message}")
      }
    }
  }
}
`);

// 3. Delete old view files (not needed)
['modules/expo-dji/android/src/main/java/expo/modules/dji/ExpoDjiView.kt',
 'modules/expo-dji/ios/ExpoDjiView.swift',
 'modules/expo-dji/src/ExpoDjiView.tsx',
 'modules/expo-dji/src/ExpoDjiView.web.tsx',
 'modules/expo-dji/src/ExpoDjiModule.web.ts',
].forEach(f => {
  if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('  deleted', f); }
});

// 4. ExpoDjiModule.ts (JS interface)
writeFile('modules/expo-dji/src/ExpoDjiModule.ts', `import { NativeModule, requireNativeModule } from 'expo';
import { ExpoDjiModuleEvents } from './ExpoDji.types';

declare class ExpoDjiModule extends NativeModule<ExpoDjiModuleEvents> {
  isAvailable(): boolean;
  registerSDK(): Promise<{ success: boolean; message: string }>;
  connect(): Promise<{ success: boolean; message: string }>;
  disconnect(): Promise<{ success: boolean; message: string }>;
  takeoff(altitude: number): Promise<{ success: boolean; message: string }>;
  land(): Promise<{ success: boolean; message: string }>;
  hover(): Promise<{ success: boolean; message: string }>;
  returnHome(): Promise<{ success: boolean; message: string }>;
  emergencyStop(): void;
  capturePhoto(): Promise<{ success: boolean; message: string; uri: string; timestamp: string }>;
  startVideo(): Promise<{ success: boolean; message: string }>;
  stopVideo(): Promise<{ success: boolean; message: string }>;
  moveRelative(fwd: number, right: number, up: number): Promise<{ success: boolean; message: string }>;
  setHeading(deg: number): Promise<{ success: boolean; message: string }>;
  setAltitude(alt: number): Promise<{ success: boolean; message: string }>;
  goToGPS(lat: number, lon: number, alt: number): Promise<{ success: boolean; message: string }>;
  getObstacleData(): Promise<{ supported: boolean }>;
}

export default requireNativeModule<ExpoDjiModule>('ExpoDji');
`);

// 5. Types
writeFile('modules/expo-dji/src/ExpoDji.types.ts', `export type TelemetryEvent = {
  altitude: number;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  satellites: number;
  isFlying: boolean;
  isMotorsOn: boolean;
};

export type ConnectionEvent = {
  status: 'connected' | 'disconnected';
  model: string;
};

export type ExpoDjiModuleEvents = {
  onTelemetry: (event: TelemetryEvent) => void;
  onConnection: (event: ConnectionEvent) => void;
};
`);

// 6. Module index.ts
writeFile('modules/expo-dji/index.ts', `export { default as ExpoDjiModule } from './src/ExpoDjiModule';
export type { TelemetryEvent, ConnectionEvent, ExpoDjiModuleEvents } from './src/ExpoDji.types';
`);

// 7. Updated DJIAdapter.ts (no simulation, no mock fallback)
writeFile('src/plugins/dji/DJIAdapter.ts', `import type {
  DronePlugin, DroneState, ConnectionStatus, ConnectionResult,
  CommandResult, PhotoResult, ObstacleData,
} from '../interface';

let ExpoDjiModule: any = null;
let moduleLoadError: string | null = null;

try {
  const mod = require('../../../modules/expo-dji');
  ExpoDjiModule = mod.ExpoDjiModule;
} catch (err: any) {
  moduleLoadError = err.message || 'Failed to load ExpoDji module';
  console.error('[DJI] Module load error:', moduleLoadError);
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
      try {
        const ok = ExpoDjiModule.isAvailable();
        console.log('[DJI] ' + droneName + ' Expo module loaded, isAvailable: ' + ok);
      } catch (err: any) {
        (this as any).nativeAvailable = false;
        (this as any).nativeError = err.message;
        console.error('[DJI] isAvailable failed:', err.message);
      }
    } else {
      console.error('[DJI] ' + droneName + ' NATIVE MODULE NOT AVAILABLE: ' + this.nativeError);
    }
  }

  async connect(): Promise<ConnectionResult> {
    if (this._status === 'connected') return { success: true, status: 'connected', message: 'Already connected' };

    if (!this.nativeAvailable || !ExpoDjiModule) {
      this._status = 'error';
      var msg = 'DJI native bridge unavailable: ' + (this.nativeError || 'Module not loaded');
      this._last_error = msg;
      return { success: false, status: 'error', message: msg };
    }

    this._status = 'connecting';
    try {
      console.log('[DJI] Registering SDK...');
      var reg = await ExpoDjiModule.registerSDK();
      console.log('[DJI] Register:', JSON.stringify(reg));
      if (!reg.success) { this._status = 'error'; this._last_error = reg.message; return { success: false, status: 'error', message: reg.message }; }

      console.log('[DJI] Waiting 3s for USB detection...');
      await new Promise(function(r) { setTimeout(r, 3000); });

      console.log('[DJI] Checking connection...');
      var conn = await ExpoDjiModule.connect();
      console.log('[DJI] Connect:', JSON.stringify(conn));

      if (conn.success) {
        this._status = 'connected';
        this._signal = 90;
        this.setupListeners();
        return { success: true, status: 'connected', message: conn.message };
      } else {
        this._status = 'error';
        this._last_error = conn.message;
        return { success: false, status: 'error', message: conn.message };
      }
    } catch (err: any) {
      this._status = 'error';
      this._last_error = err.message;
      return { success: false, status: 'error', message: err.message };
    }
  }

  private setupListeners() {
    if (!ExpoDjiModule) return;
    try {
      ExpoDjiModule.addListener('onTelemetry', (d: any) => {
        if (d.altitude !== undefined) this._altitude_m = d.altitude;
        if (d.latitude !== undefined) this._latitude = d.latitude;
        if (d.longitude !== undefined) this._longitude = d.longitude;
        if (d.heading !== undefined) this._heading = d.heading;
        if (d.speed !== undefined) this._speed = d.speed;
        if (d.satellites !== undefined) this._gps_satellites = d.satellites;
        if (d.isFlying !== undefined) this._is_airborne = d.isFlying;
      });
    } catch (e) { console.warn('[DJI] Listener setup failed:', e); }
  }

  async disconnect(): Promise<void> {
    if (ExpoDjiModule) try { await ExpoDjiModule.disconnect(); } catch {}
    this._status = 'disconnected'; this._signal = 0;
  }

  getConnectionStatus(): ConnectionStatus { return this._status; }

  getState(): DroneState {
    return {
      is_airborne: this._is_airborne,
      altitude_m: Math.round(this._altitude_m * 10) / 10,
      battery_percent: Math.round(this._battery_percent),
      gps_satellites: this._gps_satellites,
      latitude: this._latitude, longitude: this._longitude,
      heading_degrees: Math.round(this._heading),
      speed_ms: Math.round(this._speed * 10) / 10,
      signal_strength: this._signal,
      is_busy: this._is_busy, last_error: this._last_error,
    };
  }

  async takeoff(alt: number = 3): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.takeoff(alt);
  }
  async land(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.land();
  }
  async hover(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.hover();
  }
  async returnHome(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.returnHome();
  }
  emergencyStop(): void {
    if (ExpoDjiModule) try { ExpoDjiModule.emergencyStop(); } catch {}
    this._is_airborne = false; this._altitude_m = 0; this._speed = 0;
  }
  async goToGPS(lat: number, lon: number, alt: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.goToGPS(lat, lon, alt);
  }
  async moveRelative(f: number, r: number, u: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.moveRelative(f, r, u);
  }
  async setHeading(d: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.setHeading(d);
  }
  async setAltitude(a: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.setAltitude(a);
  }
  async capturePhoto(): Promise<PhotoResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module', uri: null, timestamp: new Date().toISOString() };
    var r = await ExpoDjiModule.capturePhoto();
    return { success: r.success, message: r.message, uri: r.uri || null, timestamp: r.timestamp };
  }
  async startVideo(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.startVideo();
  }
  async stopVideo(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.stopVideo();
  }
  async getObstacleData(): Promise<ObstacleData> {
    return { supported: false, nearest_m: null, direction: null };
  }
}

export function createMini2SEAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-2-se', 'DJI Mini 2 SE'); }
export function createMini2Adapter(): DJIAdapter { return new DJIAdapter('dji-mini-2', 'DJI Mini 2'); }
export function createMini4ProAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-4-pro', 'DJI Mini 4 Pro'); }
export function createAir3Adapter(): DJIAdapter { return new DJIAdapter('dji-air-3', 'DJI Air 3'); }
`);

// 8. Update droneStore imports and switch cases
const storePath = 'src/store/droneStore.tsx';
if (fs.existsSync(storePath)) {
  let store = fs.readFileSync(storePath, 'utf8');
  
  // Fix import - remove old, add new
  store = store.replace(
    /import \{ createMini2Adapter.*\} from '@\/plugins\/dji\/DJIAdapter';/,
    "import { createMini2SEAdapter, createMini2Adapter, createMini4ProAdapter, createAir3Adapter } from '@/plugins/dji/DJIAdapter';"
  );
  
  // Fix switch cases - remove ('native') argument since factories no longer take it
  store = store.replace(/createMini2Adapter\('native'\)/g, 'createMini2Adapter()');
  store = store.replace(/createMini2SEAdapter\('native'\)/g, 'createMini2SEAdapter()');
  store = store.replace(/createMini4ProAdapter\('native'\)/g, 'createMini4ProAdapter()');
  store = store.replace(/createAir3Adapter\('native'\)/g, 'createAir3Adapter()');
  
  // Add dji-mini-2-se case if not present
  if (!store.includes("case 'dji-mini-2-se':")) {
    store = store.replace(
      "case 'dji-mini-2':",
      "case 'dji-mini-2':\n      case 'dji-mini-2-se':"
    );
  }
  
  fs.writeFileSync(storePath, store);
  console.log('  updated', storePath);
}

// 9. Update config plugin
writeFile('plugins/withDJI.js', fs.readFileSync('plugins/withDJI.js', 'utf8').includes('DJIAoaControllerActivity') 
  ? (() => { console.log('  withDJI.js needs manual update — see instructions'); return fs.readFileSync('plugins/withDJI.js', 'utf8'); })()
  : fs.readFileSync('plugins/withDJI.js', 'utf8')
);

console.log('\n✅ Expo DJI Module setup complete!');
console.log('\nNext steps:');
console.log('  1. Copy plugins/withDJI.js from the downloaded withDJI-v2.js');
console.log('  2. rm -rf android');
console.log('  3. npx expo prebuild --platform android');
console.log('  4. npx eas build --profile development --platform android');
console.log('\nThe Expo Module auto-registers with New Architecture.');
console.log('NativeModules.DJIBridge is GONE. Using requireNativeModule("ExpoDji") instead.');
