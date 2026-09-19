from pathlib import Path
import plistlib

root = Path("ios/App")
info = root / "App" / "Info.plist"

with info.open("rb") as f:
    plist = plistlib.load(f)

plist["NSMicrophoneUsageDescription"] = "Propard a besoin du microphone pour les appels vocaux."
background_modes = plist.get("UIBackgroundModes", [])
if "audio" not in background_modes:
    background_modes.append("audio")
plist["UIBackgroundModes"] = background_modes

with info.open("wb") as f:
    plistlib.dump(plist, f, sort_keys=False)

candidates = list(root.rglob("AppDelegate.swift"))
if not candidates:
    raise SystemExit("AppDelegate.swift introuvable")

app_delegate = candidates[0]
text = app_delegate.read_text()

if "import AVFoundation" not in text:
    text = text.replace("import Capacitor", "import Capacitor\nimport AVFoundation", 1)

marker = "// Propard background audio configuration"
if marker not in text:
    needle = "func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {"
    if needle not in text:
        raise SystemExit("Méthode didFinishLaunchingWithOptions introuvable dans AppDelegate.swift")

    block = """
        // Propard background audio configuration
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
            )
            try audioSession.setActive(true)
        } catch {
            print("Propard: impossible d'activer la session audio: \\(error)")
        }
"""
    text = text.replace(needle, needle + block, 1)

app_delegate.write_text(text)
print(f"Audio iOS configuré: {info}")
print(f"Session audio configurée: {app_delegate}")
