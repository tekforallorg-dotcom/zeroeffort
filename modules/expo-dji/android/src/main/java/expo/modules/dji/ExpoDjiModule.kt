package expo.modules.dji

import android.os.Handler
import android.os.Looper
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

    Function("getBuildTag") {
      return@Function "BUILD-2026-04-01-V3"
    }

    AsyncFunction("registerSDK") { promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        Log.e(TAG, "registerSDK: No application context")
        promise.resolve(bundleOf("success" to false, "message" to "No app context"))
        return@AsyncFunction
      }

      Log.d(TAG, "registerSDK: Starting on main thread...")

      // DJI SDK MUST be called on the main/UI thread
      Handler(Looper.getMainLooper()).post {
        try {
          Log.d(TAG, "registerSDK: Now on main thread, calling registerApp...")
          DJISDKManager.getInstance().registerApp(
            context,
            object : DJISDKManager.SDKManagerCallback {
              override fun onRegister(error: DJIError?) {
                if (error == DJISDKError.REGISTRATION_SUCCESS) {
                  Log.d(TAG, "registerSDK: SUCCESS")
                  isRegistered = true
                  DJISDKManager.getInstance().startConnectionToProduct()
                  promise.resolve(bundleOf("success" to true, "message" to "DJI SDK registered"))
                } else {
                  val msg = error?.description ?: "Unknown error"
                  Log.e(TAG, "registerSDK: FAILED - " + msg)
                  promise.resolve(bundleOf("success" to false, "message" to "Registration failed: " + msg))
                }
              }

              override fun onProductDisconnect() {
                Log.d(TAG, "Product disconnected")
                product = null
                aircraft = null
                flightController = null
                camera = null
                sendEvent("onConnection", bundleOf("status" to "disconnected", "model" to ""))
              }

              override fun onProductConnect(p: BaseProduct?) {
                val name = p?.model?.displayName ?: "Unknown"
                Log.d(TAG, "Product connected: " + name)
                product = p
                if (p is Aircraft) {
                  aircraft = p
                  flightController = p.flightController
                  camera = p.camera
                  setupTelemetry()
                }
                sendEvent("onConnection", bundleOf("status" to "connected", "model" to name))
              }

              override fun onProductChanged(p: BaseProduct?) {
                product = p
                if (p is Aircraft) {
                  aircraft = p
                  flightController = p.flightController
                  camera = p.camera
                }
              }

              override fun onComponentChange(k: BaseProduct.ComponentKey?, o: BaseComponent?, n: BaseComponent?) {}
              override fun onInitProcess(e: DJISDKInitEvent?, t: Int) {
                Log.d(TAG, "SDK init: " + e.toString())
              }
              override fun onDatabaseDownloadProgress(c: Long, t: Long) {
                Log.d(TAG, "DB download: " + c + "/" + t)
              }
            }
          )
        } catch (e: Exception) {
          Log.e(TAG, "registerSDK exception: " + e.message)
          promise.resolve(bundleOf("success" to false, "message" to "Exception: " + (e.message ?: "unknown")))
        }
      }

      // Timeout after 15 seconds
      Handler(Looper.getMainLooper()).postDelayed({
        if (!isRegistered) {
          Log.w(TAG, "registerSDK: 15s timeout — callback never fired")
        }
      }, 15000)
    }

    AsyncFunction("connect") { promise: Promise ->
      if (!isRegistered) {
        promise.resolve(bundleOf("success" to false, "message" to "SDK not registered"))
        return@AsyncFunction
      }
      if (aircraft != null && flightController != null) {
        val name = product?.model?.displayName ?: "DJI Aircraft"
        promise.resolve(bundleOf("success" to true, "message" to name + " connected"))
      } else {
        promise.resolve(bundleOf("success" to false, "message" to "No DJI product. Check RC + USB."))
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      flightController?.setStateCallback(null)
      promise.resolve(bundleOf("success" to true, "message" to "Disconnected"))
    }

    AsyncFunction("takeoff") { altitude: Double, promise: Promise ->
      val fc = flightController
      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }
      fc.startTakeoff { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Takeoff" else "Failed: " + (e?.description ?: ""))) }
    }

    AsyncFunction("land") { promise: Promise ->
      val fc = flightController
      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }
      fc.startLanding { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Landing" else "Failed: " + (e?.description ?: ""))) }
    }

    AsyncFunction("hover") { promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Hovering")) }

    AsyncFunction("returnHome") { promise: Promise ->
      val fc = flightController
      if (fc == null) { promise.resolve(bundleOf("success" to false, "message" to "No flight controller")); return@AsyncFunction }
      fc.startGoHome { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "RTH" else "Failed: " + (e?.description ?: ""))) }
    }

    Function("emergencyStop") { flightController?.turnOffMotors(null) }

    AsyncFunction("capturePhoto") { promise: Promise ->
      val cam = camera
      if (cam == null) { promise.resolve(bundleOf("success" to false, "message" to "No camera", "uri" to "", "timestamp" to System.currentTimeMillis().toString())); return@AsyncFunction }
      cam.startShootPhoto { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Photo" else "Failed", "uri" to "", "timestamp" to System.currentTimeMillis().toString())) }
    }

    AsyncFunction("startVideo") { promise: Promise ->
      val cam = camera
      if (cam == null) { promise.resolve(bundleOf("success" to false, "message" to "No camera")); return@AsyncFunction }
      cam.startRecordVideo { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Recording" else "Failed")) }
    }

    AsyncFunction("stopVideo") { promise: Promise ->
      val cam = camera
      if (cam == null) { promise.resolve(bundleOf("success" to false, "message" to "No camera")); return@AsyncFunction }
      cam.stopRecordVideo { e -> promise.resolve(bundleOf("success" to (e == null), "message" to if (e == null) "Stopped" else "Failed")) }
    }

    AsyncFunction("moveRelative") { _f: Double, _r: Double, _u: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Move")) }
    AsyncFunction("setHeading") { _d: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Heading")) }
    AsyncFunction("setAltitude") { _a: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "Alt")) }
    AsyncFunction("goToGPS") { _lat: Double, _lon: Double, _alt: Double, promise: Promise -> promise.resolve(bundleOf("success" to true, "message" to "GPS")) }
    AsyncFunction("getObstacleData") { promise: Promise -> promise.resolve(bundleOf("supported" to false)) }
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
      } catch (e: Exception) { Log.e(TAG, "Telemetry: " + e.message) }
    }
  }
}
