from pathlib import Path
import re
import uuid

root = Path("ios/App")
android_root = Path("android/app/src/main")
java_root = android_root / "java" / "site" / "propard"
java_root.mkdir(parents=True, exist_ok=True)

plugin_java = r"""package site.propard;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

@CapacitorPlugin(name = "PropardScreenCapture")
public class PropardScreenCapturePlugin extends Plugin {
    private static final int REQUEST_CODE = 7182;
    private PluginCall pendingCall;
    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private long lastFrameAt = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void start(PluginCall call) {
        if (projection != null) {
            call.resolve();
            return;
        }
        pendingCall = call;
        Intent serviceIntent = new Intent(getContext(), PropardScreenCaptureService.class);
        if (android.os.Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(serviceIntent);
        else getContext().startService(serviceIntent);
        MediaProjectionManager manager = (MediaProjectionManager) getContext()
            .getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, manager.createScreenCaptureIntent(), "projectionResult");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        releaseCapture();
        call.resolve();
    }

    @ActivityCallback
    private void projectionResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Autorisation de capture d'écran refusée.");
            return;
        }
        try {
            MediaProjectionManager manager = (MediaProjectionManager) getContext()
                .getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(result.getResultCode(), result.getData());
            if (projection == null) throw new IllegalStateException("MediaProjection indisponible");
            DisplayMetrics metrics = new DisplayMetrics();
            WindowManager wm = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
            wm.getDefaultDisplay().getRealMetrics(metrics);
            int width = Math.min(metrics.widthPixels, 1280);
            int height = Math.max(1, (int) (width * (metrics.heightPixels / (float) metrics.widthPixels)));
            imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image == null || System.currentTimeMillis() - lastFrameAt < 100) return;
                    lastFrameAt = System.currentTimeMillis();
                    Image.Plane plane = image.getPlanes()[0];
                    ByteBuffer buffer = plane.getBuffer();
                    int pixelStride = plane.getPixelStride();
                    int rowStride = plane.getRowStride();
                    int rowPadding = rowStride - pixelStride * image.getWidth();
                    Bitmap padded = Bitmap.createBitmap(
                        image.getWidth() + rowPadding / pixelStride,
                        image.getHeight(), Bitmap.Config.ARGB_8888);
                    buffer.rewind();
                    padded.copyPixelsFromBuffer(buffer);
                    Bitmap frame = Bitmap.createBitmap(padded, 0, 0, image.getWidth(), image.getHeight());
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    frame.compress(Bitmap.CompressFormat.JPEG, 55, bytes);
                    JSObject payload = new JSObject();
                    payload.put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                    notifyListeners("screenFrame", payload);
                    frame.recycle();
                    padded.recycle();
                } catch (Exception error) {
                    android.util.Log.w("PropardScreenCapture", "Frame ignored", error);
                } finally {
                    if (image != null) image.close();
                }
            }, handler);
            virtualDisplay = projection.createVirtualDisplay(
                "PropardScreenCapture", width, height, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(), null, handler);
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { releaseCapture(); }
            }, handler);
            call.resolve();
        } catch (Exception error) {
            releaseCapture();
            call.reject("Impossible de démarrer la capture mobile.", error);
        }
    }

    private void releaseCapture() {
        if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
        if (imageReader != null) { imageReader.setOnImageAvailableListener(null, null); imageReader.close(); imageReader = null; }
        if (projection != null) { MediaProjection old = projection; projection = null; old.stop(); }
        getContext().stopService(new Intent(getContext(), PropardScreenCaptureService.class));
    }
}
"""
# Add required callback import in the generated Java source.
plugin_java = plugin_java.replace("import com.getcapacitor.ActivityResult;", "import com.getcapacitor.ActivityResult;\nimport com.getcapacitor.annotation.ActivityCallback;")
(java_root / "PropardScreenCapturePlugin.java").write_text(plugin_java)
(java_root / "PropardScreenCaptureService.java").write_text(Path("scripts/native/PropardScreenCaptureService.java").read_text())

activity = java_root / "MainActivity.java"
if not activity.exists():
    activity.write_text("""package site.propard;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PropardScreenCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
""")
else:
    source = activity.read_text()
    if "PropardScreenCapturePlugin.class" not in source:
        source = source.replace("super.onCreate(savedInstanceState);", "registerPlugin(PropardScreenCapturePlugin.class);\n        super.onCreate(savedInstanceState);")
        activity.write_text(source)

manifest = android_root / "AndroidManifest.xml"
if manifest.exists():
    source = manifest.read_text()
    if "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" not in source:
        source = source.replace("<manifest ", '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1) if "xmlns:tools=" not in source else source
        source = source.replace("<application", '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />\n    <application', 1)
        manifest.write_text(source)
    source = manifest.read_text()
    if "PropardScreenCaptureService" not in source:
        service_entry = '<service android:name="site.propard.PropardScreenCaptureService" android:exported="false" android:foregroundServiceType="mediaProjection" />'
        source = source.replace("</application>", service_entry + "\n    </application>", 1)
        manifest.write_text(source)

# iOS plugin: ReplayKit's in-app capture API produces live frames for the WebRTC canvas bridge.
ios_app = root / "App"
ios_app.mkdir(parents=True, exist_ok=True)
swift = ios_app / "PropardScreenCapturePlugin.swift"
swift.write_text(r"""import UIKit
import ReplayKit
import Capacitor
import CoreImage
import ImageIO

@objc(PropardScreenCapturePlugin)
public class PropardScreenCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PropardScreenCapturePlugin"
    public let jsName = "PropardScreenCapture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private let recorder = RPScreenRecorder.shared()
    private let ciContext = CIContext()
    private var lastFrameAt = Date.distantPast

    @objc func start(_ call: CAPPluginCall) {
        guard recorder.isAvailable else {
            call.reject("La capture ReplayKit n'est pas disponible sur cet appareil.")
            return
        }
        recorder.startCapture(handler: { [weak self] sampleBuffer, sampleType, error in
            guard let self = self, error == nil, sampleType == .video else { return }
            let now = Date()
            guard now.timeIntervalSince(self.lastFrameAt) >= 0.1 else { return }
            self.lastFrameAt = now
            guard CMSampleBufferIsValid(sampleBuffer),
                  let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
            let image = CIImage(cvPixelBuffer: pixelBuffer)
            guard let cgImage = self.ciContext.createCGImage(image, from: image.extent) else { return }
            let data = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(data, "public.jpeg" as CFString, 1, nil) else { return }
            CGImageDestinationAddImage(destination, cgImage, [kCGImageDestinationLossyCompressionQuality: 0.5] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { return }
            self.notifyListeners("screenFrame", data: ["data": (data as Data).base64EncodedString()])
        }, completionHandler: { error in
            if let error = error { call.reject("Impossible de démarrer ReplayKit: " + error.localizedDescription) }
            else { call.resolve() }
        })
    }

    @objc func stop(_ call: CAPPluginCall) {
        recorder.stopCapture { error in
            if let error = error { call.reject("Impossible d'arrêter ReplayKit: " + error.localizedDescription) }
            else { call.resolve() }
        }
    }
}
""")

view_controller = ios_app / "ViewController.swift"
if view_controller.exists():
    source = view_controller.read_text()
    if "registerPluginInstance(PropardScreenCapturePlugin())" not in source:
        if "override func capacitorDidLoad()" in source:
            source = source.replace("override func capacitorDidLoad() {", "override func capacitorDidLoad() {\n        bridge?.registerPluginInstance(PropardScreenCapturePlugin())")
        else:
            source = source.replace("class ViewController: CAPBridgeViewController {", "class ViewController: CAPBridgeViewController {\n    override func capacitorDidLoad() {\n        super.capacitorDidLoad()\n        bridge?.registerPluginInstance(PropardScreenCapturePlugin())\n    }")
        view_controller.write_text(source)

# Ensure the new Swift source is part of the Xcode target.
project = root / "App.xcodeproj" / "project.pbxproj"
if project.exists():
    source = project.read_text()
    filename = "PropardScreenCapturePlugin.swift"
    if filename not in source:
        ids = [uuid.uuid4().hex[:24].upper() for _ in range(3)]
        build_id, file_id, group_id = ids
        build_marker = "/* Begin PBXBuildFile section */"
        source = source.replace(build_marker, build_marker + f"\n\t\t{build_id} /* {filename} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_id} /* {filename} */; }};", 1)
        ref_marker = "/* Begin PBXFileReference section */"
        source = source.replace(ref_marker, ref_marker + f"\n\t\t{file_id} /* {filename} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {filename}; sourceTree = \"<group>\"; }};", 1)
        source_match = re.search(r"(?m)^(\s*)([A-F0-9]{24}) /\* Sources \*/ = \{", source)
        if source_match:
            phase_start = source_match.start()
            phase_end = source.find("};", phase_start)
            phase = source[phase_start:phase_end]
            phase = phase.replace("files = (", f"files = (\n\t\t\t\t{build_id} /* {filename} in Sources */,", 1)
            source = source[:phase_start] + phase + source[phase_end:]
        group_match = re.search(r"(?m)^(\s*)([A-F0-9]{24}) /\* App \*/ = \{", source)
        if group_match:
            group_start = group_match.start()
            group_end = source.find("};", group_start)
            group = source[group_start:group_end]
            if "children = (" in group:
                group = group.replace("children = (", f"children = (\n\t\t\t\t{file_id} /* {filename} */,", 1)
                source = source[:group_start] + group + source[group_end:]
        project.write_text(source)

print("Configuration de capture native Propard générée.")
