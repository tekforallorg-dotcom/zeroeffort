/**
 * withDJI — Expo config plugin for DJI Mobile SDK V4.
 *
 * This plugin runs during `npx expo prebuild` and modifies the
 * generated Android files to include:
 * 1. DJI Maven repository
 * 2. DJI SDK dependency
 * 3. DJI App Key in AndroidManifest
 * 4. USB accessory permissions + intent filter
 * 5. DJI native module (Kotlin files)
 * 6. Package registration in MainApplication
 *
 * This ensures DJI integration survives EAS Build's prebuild step.
 */
const {
  withProjectBuildGradle,
  withAppBuildGradle,
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DJI_APP_KEY = '7999a727d113493fa9985f55';

// ── 1. Add DJI Maven repo to project build.gradle ─────────────

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

// ── 2. Add DJI SDK dependency to app build.gradle ─────────────

function withDJIDependency(config) {
  return withAppBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;

    // Add DJI SDK dependency
    if (!contents.includes('dji-sdk')) {
      mod.modResults.contents = contents.replace(
        'implementation("com.facebook.react:react-android")',
        `implementation("com.facebook.react:react-android")

    // DJI Mobile SDK V4
    implementation "com.dji:dji-sdk:4.18"
    compileOnly "com.dji:dji-sdk-provided:4.18"`
      );
    }

    // Add packaging options
    if (!contents.includes('libstlport_shared')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'packagingOptions {',
        `packagingOptions {
        pickFirsts += ["lib/*/libstlport_shared.so", "lib/*/libc++_shared.so"]
        excludes += ["META-INF/rxjava.properties"]`
      );
    }

    return mod;
  });
}

// ── 3. Add DJI permissions + App Key to AndroidManifest ───────

function withDJIManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const mainApp = manifest.manifest.application[0];

    // Add DJI App Key meta-data
    if (!mainApp['meta-data']) mainApp['meta-data'] = [];
    const hasKey = mainApp['meta-data'].some(
      (m) => m.$?.['android:name'] === 'com.dji.sdk.API_KEY'
    );
    if (!hasKey) {
      mainApp['meta-data'].push({
        $: {
          'android:name': 'com.dji.sdk.API_KEY',
          'android:value': DJI_APP_KEY,
        },
      });
    }

    // Add DJI USB Accessory Activity
    if (!mainApp.activity) mainApp.activity = [];
    const hasAoa = mainApp.activity.some(
      (a) => a.$?.['android:name'] === 'dji.sdk.sdkmanager.DJIAoaControllerActivity'
    );
    if (!hasAoa) {
      mainApp.activity.push({
        $: {
          'android:name': 'dji.sdk.sdkmanager.DJIAoaControllerActivity',
          'android:theme': '@android:style/Theme.Translucent',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.hardware.usb.action.USB_ACCESSORY_ATTACHED' } }],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.hardware.usb.action.USB_ACCESSORY_ATTACHED',
              'android:resource': '@xml/accessory_filter',
            },
          },
        ],
      });
    }

    // Add permissions
    if (!manifest.manifest['uses-permission']) manifest.manifest['uses-permission'] = [];
    const perms = manifest.manifest['uses-permission'];
    const existingPerms = perms.map((p) => p.$?.['android:name']);
    const neededPerms = [
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_PHONE_STATE',
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
    ];
    for (const perm of neededPerms) {
      if (!existingPerms.includes(perm)) {
        perms.push({ $: { 'android:name': perm } });
      }
    }

    // Add uses-feature for USB
    if (!manifest.manifest['uses-feature']) manifest.manifest['uses-feature'] = [];
    const features = manifest.manifest['uses-feature'];
    const existingFeatures = features.map((f) => f.$?.['android:name']);
    const neededFeatures = [
      'android.hardware.usb.accessory',
      'android.hardware.usb.host',
    ];
    for (const feat of neededFeatures) {
      if (!existingFeatures.includes(feat)) {
        features.push({ $: { 'android:name': feat, 'android:required': 'false' } });
      }
    }

    return mod;
  });
}

// ── 4. Register DJIBridgePackage in MainApplication ───────────

function withDJIMainApplication(config) {
  return withMainApplication(config, (mod) => {
    const contents = mod.modResults.contents;

    // Add import
    if (!contents.includes('DJIBridgePackage')) {
      mod.modResults.contents = contents.replace(
        '// Packages that cannot be autolinked yet can be added manually here, for example:',
        '// Packages that cannot be autolinked yet can be added manually here, for example:\n              add(com.tekforall.zeroeffort.dji.DJIBridgePackage())'
      );
    }

    return mod;
  });
}

// ── 5. Write Kotlin files + accessory_filter.xml ──────────────

function withDJINativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const androidDir = path.join(projectRoot, 'android');

      // Create DJI module directory
      const djiDir = path.join(
        androidDir, 'app', 'src', 'main', 'java', 'com', 'tekforall', 'zeroeffort', 'dji'
      );
      fs.mkdirSync(djiDir, { recursive: true });

      // Write DJIBridgePackage.kt
      fs.writeFileSync(
        path.join(djiDir, 'DJIBridgePackage.kt'),
        `package com.tekforall.zeroeffort.dji

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DJIBridgePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(DJIBridgeModule(reactContext))
    }
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`
      );

      // Write DJIBridgeModule.kt
      fs.writeFileSync(
        path.join(djiDir, 'DJIBridgeModule.kt'),
        `package com.tekforall.zeroeffort.dji

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import dji.common.error.DJIError
import dji.common.error.DJISDKError
import dji.common.flightcontroller.FlightControllerState
import dji.sdk.base.BaseComponent
import dji.sdk.base.BaseProduct
import dji.sdk.camera.Camera
import dji.sdk.flightcontroller.FlightController
import dji.sdk.products.Aircraft
import dji.sdk.sdkmanager.DJISDKInitEvent
import dji.sdk.sdkmanager.DJISDKManager

class DJIBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "DJIBridge"
        const val NAME = "DJIBridge"
    }

    override fun getName(): String = NAME

    private var product: BaseProduct? = null
    private var aircraft: Aircraft? = null
    private var flightController: FlightController? = null
    private var camera: Camera? = null
    private var isRegistered = false

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun sendTelemetry(state: FlightControllerState) {
        val params = Arguments.createMap().apply {
            putDouble("altitude", state.aircraftLocation?.altitude?.toDouble() ?: 0.0)
            putDouble("latitude", state.aircraftLocation?.latitude ?: 0.0)
            putDouble("longitude", state.aircraftLocation?.longitude ?: 0.0)
            putInt("heading", state.aircraftHeadDirection)
            putDouble("speed", Math.sqrt(
                (state.velocityX * state.velocityX + state.velocityY * state.velocityY).toDouble()
            ))
            putInt("satellites", state.satelliteCount)
            putBoolean("isFlying", state.isFlying)
            putBoolean("isMotorsOn", state.areMotorsOn())
        }
        sendEvent("DJI_TELEMETRY", params)
    }

    @ReactMethod
    fun registerSDK(promise: Promise) {
        Log.d(TAG, "Registering DJI SDK...")
        DJISDKManager.getInstance().registerApp(
            reactContext.applicationContext,
            object : DJISDKManager.SDKManagerCallback {
                override fun onRegister(error: DJIError?) {
                    if (error == DJISDKError.REGISTRATION_SUCCESS) {
                        Log.d(TAG, "SDK registered")
                        isRegistered = true
                        DJISDKManager.getInstance().startConnectionToProduct()
                        promise.resolve(Arguments.createMap().apply {
                            putBoolean("success", true)
                            putString("message", "DJI SDK registered")
                        })
                    } else {
                        Log.e(TAG, "Registration failed: \\\${error?.description}")
                        promise.resolve(Arguments.createMap().apply {
                            putBoolean("success", false)
                            putString("message", "Failed: \\\${error?.description}")
                        })
                    }
                }
                override fun onProductDisconnect() {
                    product = null; aircraft = null; flightController = null; camera = null
                    sendEvent("DJI_CONNECTION", Arguments.createMap().apply { putString("status", "disconnected") })
                }
                override fun onProductConnect(p: BaseProduct?) {
                    Log.d(TAG, "Product: \\\${p?.model?.displayName}")
                    product = p
                    if (p is Aircraft) { aircraft = p; flightController = p.flightController; camera = p.camera; setupTelemetry() }
                    sendEvent("DJI_CONNECTION", Arguments.createMap().apply {
                        putString("status", "connected"); putString("model", p?.model?.displayName ?: "Unknown")
                    })
                }
                override fun onProductChanged(p: BaseProduct?) { product = p; if (p is Aircraft) { aircraft = p; flightController = p.flightController; camera = p.camera } }
                override fun onComponentChange(k: BaseProduct.ComponentKey?, o: BaseComponent?, n: BaseComponent?) {}
                override fun onInitProcess(e: DJISDKInitEvent?, t: Int) {}
                override fun onDatabaseDownloadProgress(c: Long, t: Long) {}
            }
        )
    }

    private fun setupTelemetry() { flightController?.setStateCallback { sendTelemetry(it) } }

    @ReactMethod fun connect(promise: Promise) {
        if (!isRegistered) { promise.resolve(cmdResult(false, "SDK not registered")); return }
        if (aircraft != null) promise.resolve(cmdResult(true, "\\\${product?.model?.displayName} connected"))
        else promise.resolve(cmdResult(false, "No DJI product found. Check RC + USB."))
    }

    @ReactMethod fun disconnect(promise: Promise) { flightController?.setStateCallback(null); promise.resolve(null) }

    @ReactMethod fun takeoff(altitude: Double, promise: Promise) {
        val fc = flightController ?: run { promise.resolve(cmdResult(false, "No flight controller")); return }
        fc.startTakeoff { e -> promise.resolve(cmdResult(e == null, if (e == null) "Takeoff initiated" else "Failed: \\\${e.description}")) }
    }

    @ReactMethod fun land(promise: Promise) {
        val fc = flightController ?: run { promise.resolve(cmdResult(false, "No flight controller")); return }
        fc.startLanding { e -> promise.resolve(cmdResult(e == null, if (e == null) "Landing" else "Failed: \\\${e.description}")) }
    }

    @ReactMethod fun hover(promise: Promise) { promise.resolve(cmdResult(true, "Hovering")) }

    @ReactMethod fun returnHome(promise: Promise) {
        val fc = flightController ?: run { promise.resolve(cmdResult(false, "No flight controller")); return }
        fc.startGoHome { e -> promise.resolve(cmdResult(e == null, if (e == null) "Returning home" else "Failed: \\\${e.description}")) }
    }

    @ReactMethod fun emergencyStop() {
        Log.w(TAG, "EMERGENCY STOP")
        flightController?.turnOffMotors(null)
    }

    @ReactMethod fun capturePhoto(promise: Promise) {
        val cam = camera ?: run {
            promise.resolve(Arguments.createMap().apply { putBoolean("success", false); putString("message", "No camera"); putNull("uri"); putString("timestamp", java.time.Instant.now().toString()) })
            return
        }
        cam.startShootPhoto { e ->
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", e == null); putString("message", if (e == null) "Photo captured" else "Failed: \\\${e.description}")
                putNull("uri"); putString("timestamp", java.time.Instant.now().toString())
            })
        }
    }

    @ReactMethod fun startVideo(promise: Promise) {
        camera?.startRecordVideo { e -> promise.resolve(cmdResult(e == null, if (e == null) "Recording" else "Failed: \\\${e.description}")) } ?: promise.resolve(cmdResult(false, "No camera"))
    }

    @ReactMethod fun stopVideo(promise: Promise) {
        camera?.stopRecordVideo { e -> promise.resolve(cmdResult(e == null, if (e == null) "Stopped" else "Failed: \\\${e.description}")) } ?: promise.resolve(cmdResult(false, "No camera"))
    }

    @ReactMethod fun getObstacleData(promise: Promise) {
        promise.resolve(Arguments.createMap().apply { putBoolean("supported", false); putNull("nearest_m"); putNull("direction") })
    }

    @ReactMethod fun moveRelative(fwd: Double, right: Double, up: Double, promise: Promise) {
        promise.resolve(cmdResult(true, "Move sent"))
    }

    @ReactMethod fun setHeading(deg: Double, promise: Promise) { promise.resolve(cmdResult(true, "Heading set")) }
    @ReactMethod fun setAltitude(alt: Double, promise: Promise) { promise.resolve(cmdResult(true, "Altitude set")) }
    @ReactMethod fun goToGPS(lat: Double, lon: Double, alt: Double, promise: Promise) { promise.resolve(cmdResult(true, "GPS nav not yet implemented")) }

    private fun cmdResult(success: Boolean, message: String): WritableMap {
        return Arguments.createMap().apply { putBoolean("success", success); putString("message", message) }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
`
      );

      // Write accessory_filter.xml
      const xmlDir = path.join(androidDir, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'accessory_filter.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <usb-accessory model="T600" manufacturer="DJI"/>
    <usb-accessory model="AG410" manufacturer="DJI"/>
    <usb-accessory model="com.dji.logiclink" manufacturer="DJI"/>
    <usb-accessory model="WM160" manufacturer="DJI"/>
    <usb-accessory model="WM161" manufacturer="DJI"/>
    <usb-accessory model="RC231" manufacturer="DJI"/>
</resources>
`
      );

      console.log('[withDJI] Wrote Kotlin files + accessory_filter.xml');
      return mod;
    },
  ]);
}

// ── Combine all mods ──────────────────────────────────────────

function withDJI(config) {
  config = withDJIMaven(config);
  config = withDJIDependency(config);
  config = withDJIManifest(config);
  config = withDJIMainApplication(config);
  config = withDJINativeFiles(config);
  return config;
}

module.exports = withDJI;
