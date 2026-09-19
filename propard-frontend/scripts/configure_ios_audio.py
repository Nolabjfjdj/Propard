from pathlib import Path
import plistlib
import re

root = Path("ios/App")
info = root / "App" / "Info.plist"

if not info.exists():
    raise SystemExit(f"Info.plist introuvable: {info}")

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
    imports = list(re.finditer(r"^import .*?$", text, re.MULTILINE))
    if imports:
        insert_at = imports[-1].end()
        text = text[:insert_at] + "\nimport AVFoundation" + text[insert_at:]
    else:
        text = "import AVFoundation\n" + text

marker = "// Propard background audio configuration"
if marker not in text:
    block = """        // Propard background audio configuration
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

    method_pattern = re.compile(
        r"(?P<indent>^[ \t]*)func[ \t]+application\(\s*_?[ \t]*application:[^\n]*?\n(?P<body>[\s\S]*?)^[ \t]*\}",
        re.MULTILINE,
    )
    match = method_pattern.search(text)

    if match:
        method_start = match.start()
        brace_pos = text.find("{", method_start, match.end())
        text = text[:brace_pos + 1] + "\n" + block + text[brace_pos + 1:]
    else:
        class_match = re.search(
            r"(^[ \t]*class[ \t]+AppDelegate[^\{]*\{)",
            text,
            re.MULTILINE,
        )
        if not class_match:
            raise SystemExit("Classe AppDelegate introuvable dans AppDelegate.swift")

        indent = "    "
        method = f"""\n{indent}func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {{\n{block}\n{indent}    return true\n{indent}}}\n"""
        text = text[:class_match.end()] + method + text[class_match.end():]

app_delegate.write_text(text)
print(f"Audio iOS configuré: {info}")
print(f"Session audio configurée: {app_delegate}")

