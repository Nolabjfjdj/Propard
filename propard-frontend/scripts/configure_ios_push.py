from pathlib import Path
import plistlib
import re

root = Path('ios/App')
info = root / 'App' / 'Info.plist'
project = root / 'App.xcodeproj' / 'project.pbxproj'

if not info.exists():
    raise SystemExit(f'Info.plist introuvable: {info}')
if not project.exists():
    raise SystemExit(f'project.pbxproj introuvable: {project}')

with info.open('rb') as f:
    plist = plistlib.load(f)

plist.setdefault('UIBackgroundModes', [])

with info.open('wb') as f:
    plistlib.dump(plist, f, sort_keys=False)

candidates = list(root.rglob('AppDelegate.swift'))
if not candidates:
    raise SystemExit('AppDelegate.swift introuvable')

app_delegate = candidates[0]
text = app_delegate.read_text()

if 'capacitorDidRegisterForRemoteNotifications' not in text:
    block = '''\n    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {\n        NotificationCenter.default.post(\n            name: .capacitorDidRegisterForRemoteNotifications,\n            object: deviceToken\n        )\n    }\n\n    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {\n        NotificationCenter.default.post(\n            name: .capacitorDidFailToRegisterForRemoteNotifications,\n            object: error\n        )\n    }\n'''
    last_brace = text.rfind('}')
    if last_brace == -1:
        raise SystemExit('Fin de AppDelegate.swift introuvable')
    text = text[:last_brace] + block + text[last_brace:]
    app_delegate.write_text(text)

pbx = project.read_text()

# Add the APNs entitlement to every native App target build configuration.
pbx = re.sub(
    r'(?m)^(\s*)PRODUCT_BUNDLE_IDENTIFIER = site\.propard;$',
    lambda m: m.group(1) + 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n' + m.group(0),
    pbx,
)

project.write_text(pbx)

entitlements = root / 'App' / 'App.entitlements'
entitlements.parent.mkdir(parents=True, exist_ok=True)
with entitlements.open('wb') as f:
    plistlib.dump({'aps-environment': 'development'}, f, sort_keys=False)

print(f'Notifications Push iOS configurées: {app_delegate}')
print(f'Entitlements APNs: {entitlements}')
