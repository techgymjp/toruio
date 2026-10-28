#!/usr/bin/env python3
"""App Store 配布用のプロビジョニングプロファイルを App Store Connect API で用意する (GitHub Actions 用)。

環境変数: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (AuthKey_XXXX.p8 のパス), BUNDLE_ID, CERT_SERIAL (配布用証明書のシリアル番号 16 進)
出力: プロファイルを ~/Library/MobileDevice/Provisioning Profiles/ に入れ、標準出力にプロファイル名を出す。
同じ名前のプロファイルが証明書と合っていなければ消して作り直す。
"""
import base64, json, os, sys, time, urllib.parse, urllib.request, urllib.error
import jwt  # PyJWT (pip install pyjwt cryptography)

API = 'https://api.appstoreconnect.apple.com/v1'
key = open(os.environ['ASC_KEY_PATH']).read()
token = jwt.encode(
    {'iss': os.environ['ASC_ISSUER_ID'], 'iat': int(time.time()), 'exp': int(time.time()) + 1200, 'aud': 'appstoreconnect-v1'},
    key, algorithm='ES256', headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> {e.code}: {e.read().decode()[:800]}')


bundle = os.environ['BUNDLE_ID']
serial = os.environ['CERT_SERIAL'].upper().lstrip('0')
name = f'{bundle} AppStore CI'

ids = [b for b in call('GET', f'/bundleIds?filter[identifier]={bundle}&limit=200')['data'] if b['attributes']['identifier'] == bundle]
if not ids:
    sys.exit(f'Bundle ID {bundle} が Apple Developer に登録されていません')
bundle_id = ids[0]['id']

certs = call('GET', '/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=200')['data']
cert = next((c for c in certs if c['attributes']['serialNumber'].upper().lstrip('0') == serial), None)
if not cert:
    sys.exit(f'シリアル番号 {serial} の配布用証明書が App Store Connect に見つかりません (Secrets の .p12 を確認)')

prof = None
for p in call('GET', f'/profiles?filter[name]={urllib.parse.quote(name)}&include=certificates&limit=50')['data']:
    cert_ids = [c['id'] for c in p['relationships']['certificates'].get('data', [])] if 'data' in p['relationships']['certificates'] else []
    if p['attributes']['profileState'] == 'ACTIVE' and cert['id'] in cert_ids:
        prof = p
    else:
        call('DELETE', f"/profiles/{p['id']}")
if not prof:
    prof = call('POST', '/profiles', {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': 'IOS_APP_STORE'},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bundle_id}},
                          'certificates': {'data': [{'type': 'certificates', 'id': cert['id']}]}}}})['data']

dest = os.path.expanduser('~/Library/MobileDevice/Provisioning Profiles')
os.makedirs(dest, exist_ok=True)
with open(os.path.join(dest, prof['attributes']['uuid'] + '.mobileprovision'), 'wb') as f:
    f.write(base64.b64decode(prof['attributes']['profileContent']))
print(name)
