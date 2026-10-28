# iOS 版をビルドして App Store に出す手順（Mac での作業）

目指せ盗塁王の iOS 版は、Android 版と同じ Capacitor で作っています（`ios/` フォルダ）。
コードの準備はできているので、Mac では「ビルドして App Store Connect にアップロードする」作業だけを行います。
構成は techgymjp/jet-fighter（JET STRIKE）の iOS 版と同じです。

- Bundle ID：`jp.techgym.toruio`（Android のパッケージ名と同じ）
- チーム：Team ID `GNM3VTX9YG`（Xcode の設定に入れてあります）。Apple Developer には**個人で登録**しています（App Store の販売元は個人名になります）
- 対応端末：iPhone（横画面固定）。iPad では iPhone 用の画面で動きます
- ホーム画面の名前：日本語の端末では「盗塁王」、それ以外は「Steal King」
- 広告：AdMob（iOS 用のアプリと広告ユニット。Android とは別）。起動時に「トラッキングの許可」の確認画面が出ます
  - バナー：トップ・遊び方・一時停止・結果画面の下中央
  - インタースティシャル：プレイ開始・トップに戻る・一時停止からの再開・「もう一度」のたび
  - リワード：盗塁でアウトになったときの「広告を見てこの盗塁をやり直す」（1 ゲーム 5 回まで）

---

## 0. 最初にブラウザでやること（ゲームごとに 1 回）

1. **Apple Developer**（developer.apple.com）→「Certificates, Identifiers & Profiles」→「Identifiers」→「＋」→「App IDs」→「App」
   - Description：`Steal King`（英数字で。記号は使えないことがある）
   - Bundle ID：「Explicit」で `jp.techgym.toruio`
   - Capabilities：何もチェックしない
2. **App Store Connect**（appstoreconnect.apple.com）→「マイ App」→「＋」→「新規 App」
   - プラットフォーム：iOS ／ 名前：`目指せ盗塁王 - 代走で300盗塁に挑め`（Google Play と同じ。App Store 全体で重複不可なので、使われていたら少し変える）
   - プライマリ言語：日本語 ／ バンドル ID：1 で登録したもの ／ SKU：`toruio`（あとから変更不可）／ ユーザアクセス：アクセス制限なし
3. **AdMob**
   - 「アプリを追加」→ **iOS** →「ストアに掲載されていない」で登録し、バナー・インタースティシャル・リワードの広告ユニットを作る
   - アプリ ID（`~` が入っているもの）と広告ユニット ID 3 つを Claude Code に渡す（`ads.js` の `UNITS.ios.production` と `ios/App/App/Info.plist` の `GADApplicationIdentifier` に入れてもらう）
   - 目指せ盗塁王では設定済み（アプリ ID `ca-app-pub-6411535997477460~3166475880`、広告ユニット 3 つ）
   - 「プライバシーとメッセージ」→「欧州の規制」のメッセージに iOS アプリも追加する

---

## 1. Mac の準備（最初の1回だけ）

1. **Xcode** を App Store からインストールする（数十 GB あるので時間がかかります）。インストール後に一度起動し、追加コンポーネントのインストールを済ませる
2. Xcode の「Settings…」→「Accounts」→「＋」で、Apple Developer に登録している Apple ID でサインインする（チームが個人名で表示されれば OK）
3. **Node.js**（LTS 版）を https://nodejs.org/ からインストールする
4. ターミナルでリポジトリを取得する
   ```bash
   cd ~/Desktop   # 置きたい場所（どこでもよい）
   git clone https://github.com/techgymjp/toruio.git
   cd toruio
   npm ci
   ```
   `git` がないと言われたら、表示に従って「コマンドライン・デベロッパツール」をインストールしてから、もう一度実行します。

2回目以降は、`cd toruio` のあと `git pull` と `npm ci` で最新にします。

---

## 2. 自分の iPhone で動作確認する（テスト広告）

```bash
npm run ios:sync    # ゲームのファイルを iOS のプロジェクトにコピー（テスト広告）
npm run ios:open    # Xcode で開く
```

1. iPhone を USB ケーブルで Mac につなぎ、iPhone で「このコンピュータを信頼」を許可する
2. iPhone の「設定」→「プライバシーとセキュリティ」→「デベロッパモード」をオンにする（再起動を求められます。項目がない場合は、Xcode で一度 iPhone を選ぶと表示されます）
3. Xcode の上部で、実行先に自分の iPhone を選ぶ
4. 左の「App」→「Signing & Capabilities」で、「Automatically manage signing」がオン、Team に自分（個人名）のチームが選ばれていることを確認する
5. ▶（Run）を押すと、iPhone にアプリが入って起動する

確認すること：

- 横画面の全画面で、画面の端（Dynamic Island 側）でボタンや文字が欠けていない
- トラッキングの確認画面が出る（初回だけ）
- リード（長押し）・ダッシュ・スライディング・ヘッドスライディングが操作できる。音が鳴る（マナーモードでも鳴る）
- **テスト広告**が出る：トップ画面の下にバナー、「プレイボール」で全画面広告、アウトになったとき「広告を見てこの盗塁をやり直す」
- 結果画面の「結果をシェア」で共有メニューが出る
- ホームボタン（上へスワイプ）でアプリを離れると一時停止し、音が止まる

---

## 3. App Store 用にビルドしてアップロードする（本番広告）

```bash
git pull && npm ci
npm run ios:release   # 本番の広告 ID でコピーする（ここが ios:sync と違う）
npm run ios:open
```

1. Xcode の左で「App」→「General」→「Identity」を開き、**Build の番号を前回より大きくする**（初回は 1。アップロードのたびに 2、3…と上げる。同じ番号は二度アップロードできない）。Version はストアに表示されるバージョン（1.0.0）
2. 上部の実行先を「**Any iOS Device (arm64)**」にする
3. メニューの「Product」→「**Archive**」（メニューバーが隠れていたら、マウスを画面の上端に動かす）
4. 終わると Organizer が開くので、「**Distribute App**」→「**App Store Connect**」→「Upload」で進める（途中の確認は既定のまま「Next」でよい。「Xcode Cloud can automate…」は「Remind Me Later」で閉じる）
5. 10〜30 分ほどで、App Store Connect の「TestFlight」タブにビルドが表示される

輸出コンプライアンス（暗号化）の質問は、Info.plist で「独自の暗号化は使っていない」と設定済みなので、聞かれません。

**注意**：`ios:release` でビルドしたアプリは本番の広告が出ます。TestFlight で確認するときも、**本番の広告はタップしない**でください（AdMob のアカウント停止の対象）。Xcode から iPhone に直接入れて試すときは、`npm run ios:sync` でテスト広告に戻してから実行します。

---

## 4. TestFlight で確認する

1. App Store Connect の「TestFlight」→「内部テスト」でグループを作り、自分を追加する
2. iPhone に「TestFlight」アプリを App Store から入れ、届いた招待から目指せ盗塁王をインストールする

---

## 5. 審査用の画面録画を撮っておく（提出の前に）

審査の実績が少ないアカウントでは、初回の審査で「Guideline 2.1 - Information Needed」として**実機での操作の画面録画**を求められます（JET STRIKE で実際に求められた）。
提出の前に撮っておき、2.1 が来たら、6 章の「審査へのメモ」と同じ文の返信にこの録画を添付します（録画はメモの文には入れない）。

**録画のしかた**（TestFlight で入れた最新のビルドで、最新の iOS の iPhone で行う）

1. 「設定」→「コントロールセンター」に「画面収録」を追加しておく
2. アプリを一度削除してから TestFlight で入れ直す（最初の起動から録るため）
3. コントロールセンターの「画面収録」を押して録画を始め、次の順に操作する（2〜3 分）
   1. ホーム画面からアプリを起動（起動画面 → トラッキングの確認画面 →「許可しない」でも「許可」でもよい）
   2. トップ画面 →「遊び方」を開いて「もどる」
   3. 「プレイボール」（全画面広告 → 閉じる）
   4. 一塁でリードを取り、投球でスタート、ダッシュ、ヘッドスライディングで二盗
   5. 牽制球に戻る場面（来なければ省略してよい）
   6. アウトになったら「広告を見てこの盗塁をやり直す」（リワード広告を最後まで見る）
   7. ホームボタンで離れて戻り、一時停止の画面 →「タイトルへ」
4. 録画は「写真」に保存される。大きすぎると返信に添付できない（400MB でも失敗した）ので、Mac に送って Finder で右クリック →「選択したビデオファイルをエンコード」→ 720p で小さくするか、Google ドライブの共有リンクを返信文に貼る

**本番の広告はタップしないこと**（録画中も、広告の閉じるボタンだけを押す）。

---

## 6. App Store Connect で審査に出す

「配信」タブ（iOS App のバージョン 1.0.0）で入力します。

| 項目 | 入力内容 |
| --- | --- |
| バージョン | **1.0.0**（「1.0」のままだとアップロードしたビルドが選べない） |
| スクリーンショット | 「Dynamic Island 搭載 iPhone（中型ディスプレイ）」の欄に、`docs/store/ios/6.3inch/` の 2622 × 1206（横向き）を入れる。日本語版（ja-）と英語版（en-）各 4 枚。6.9 インチ（2868 × 1320）は受け付けられない |
| ヘッダ・検索結果 | 「ヘッダと検索結果」タブに `docs/store/ios/appstore-header-3840x1646.png` と `appstore-search-3840x2560.png`（ヘッダを入れたら検索結果も入れる） |
| 名前・サブタイトル・プロモーション用テキスト・概要・キーワード | `docs/store/ios/listing.md`（日本語と英語） |
| サポート URL | https://techgym.jp/ |
| プライバシーポリシー URL（App 情報） | https://techgym.jp/privacy-policy/ |
| カテゴリ（App 情報） | ゲーム（サブカテゴリ：スポーツ） |
| コンテンツの配信権（App 情報） | 第三者のコンテンツ：いいえ |
| 著作権 | 2026 TECH GYM K.K. |
| ビルド | TestFlight で確認したビルドを選ぶ |
| 年齢制限 | 質問に答える（暴力・流血などの表現なし） |
| App のプライバシー | AdMob が収集するデータを申告する（下記）。プライバシーポリシーの URL もここで入れる |
| App Review に関する情報 | ログイン不要。連絡先を入力。メモに下の「審査へのメモ」を貼る |

**App のプライバシー（AdMob を使うアプリの目安）**
Google の「Apple の App Store のデータ開示要件への準備」（AdMob のヘルプ）に、AdMob が収集するデータの一覧があります。必ずそちらを見て最終確認してください。目安は次のとおりです。

- 収集する：ID（デバイス ID）、使用状況データ（広告データ、製品の操作）、診断（クラッシュデータ、パフォーマンスデータ、その他の診断データ）、位置情報（おおよその場所）
- 目的：サードパーティ広告、アナリティクス
- ユーザーに関連付け：しない
- トラッキングに使用：デバイス ID と広告データは「する」

**審査へのメモ（App Review に関する情報の「メモ」に貼る。初回に「Guideline 2.1 - Information Needed」が来たら、同じ文を返信し、5 章で撮った録画を添付する）**

```
1. Purpose and audience: Steal King is a free 3D baseball game for ages 13+. The player is a pinch runner and tries to steal second base, third base and home plate in 100 tries.

2. How to use: No login or account is needed. Tap "Play ball". Hold LEAD to take a lead and release it to go back to the base. The runner starts automatically on the pitch. Hold DASH to sprint, and tap SLIDE or HEAD-FIRST before the base. The game is available in English and Japanese (chosen by the device language, and switchable on the title screen).

3. External services: Google AdMob (banner, interstitial and rewarded ads) with Google's consent form (UMP) and App Tracking Transparency. Rewarded ads are optional: watching one lets the player retry a failed steal (up to 5 times per game). No other services or in-app purchases.

4. Regional differences: None, except that the ad consent form appears only where required (e.g. EEA/UK).

5. Regulated content / third-party material: The game is not in a regulated industry. All graphics and sounds are original (generated in code). The 3D engine three.js is used under the MIT License.
```

入力が終わったら「審査用に追加」→「審査へ提出」。

---

## 7. 公開後にやること

- AdMob で iOS アプリを App Store のアプリに紐づける（「アプリ」→ iOS の目指せ盗塁王 →「アプリの設定」）
- App Store からインストールして、起動・同意画面・トラッキングの確認・広告を確認する

---

## 8. TestFlight への自動アップロード（2回目以降を GitHub Actions に任せる）

`.github/workflows/ios-release.yml` を入れてあります（techgymjp/shutoko と同じ。2026-10 に shutoko で TestFlight へのアップロードまで確認済み）。
下の Secrets を登録すると、既定のブランチに push するたびに次のことを自動で行います。登録するまでは何もしません。

- 本番広告（`ios:release` と同じ）でビルドする。ビルド番号は **100 + 実行回数**（Mac から手でアップロードする 1、2、… と重ならない）
- 配布用の証明書と API キーで、App Store 配布用のプロファイル（`jp.techgym.toruio AppStore CI`）を作る／取ってくる（`scripts/ios_profile.py`。Bundle ID が Apple Developer に登録済みであること）
- Archive して App Store Connect（TestFlight）にアップロードする。審査への提出は、これまでどおり App Store Connect で行う

**Secrets**（作り方は techgymjp/jet-fighter の `docs/IOS_BUILD.md` の 7 章。API キー（.p8）と証明書（.p12）は JET STRIKE・首都高グランプリで作ったものを使い回せる）

Secrets はリポジトリごとなので、toruio にも次の 5 つを https://github.com/techgymjp/toruio/settings/secrets/actions に登録します。

| 名前 | 内容 |
| --- | --- |
| `IOS_DIST_CERT_P12_BASE64` | 配布用の証明書（.p12）を変換した文字列（`base64 -i 証明書.p12 \| tr -d '\n' \| pbcopy`） |
| `IOS_DIST_CERT_PASSWORD` | .p12 を書き出したときのパスワード |
| `ASC_KEY_ID` | App Store Connect の API キーのキー ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8_BASE64` | API キー（.p8）を変換した文字列（`base64 -i AuthKey_XXXXXXXXXX.p8 \| tr -d '\n' \| pbcopy`） |

**注意**：証明書（.p12）、そのパスワード、API キー（.p8）は、チャット・AI へのアップロード・リポジトリへのコミットで**絶対に共有しない**でください。

`.github/workflows/ios.yml` は、push のたびに「シミュレーター向けに署名なしでビルドできるか」だけを確認するものです（Secrets 不要）。

---

## つまずきやすいところ

| 症状 | 対処 |
| --- | --- |
| アップロードで「同じビルド番号がすでにある」 | General の Build の番号を上げてから Archive し直す |
| Signing でエラー（チームが選べない、証明書がない） | Xcode の Accounts で Apple ID にサインインし直し、Team に自分のチームを選ぶ。「Automatically manage signing」をオンにする |
| 実行先に iPhone が出ない | ケーブルをつなぎ直し、iPhone で「信頼」を許可。デベロッパモードをオンにする |
| 実行先に「iOS 26.x Not Installed」と出る | 「Get」で iOS のシミュレーターと部品をダウンロードする（8 GB ほど。Archive にも必要） |
| ビルドが古いゲームのまま | `npm run ios:sync`（または `ios:release`）を実行し忘れている。`git pull` してから実行し直す |
| アップロードしたビルドが選べない | App Store Connect のバージョンが「1.0」のまま。1.0.0 に直して保存する |
| 「審査用に追加できません」 | 「App 情報」の「コンテンツの配信権」と、「App のプライバシー」のプライバシーポリシー URL を入れる |
| 審査で「Xcode が古い」と言われる | Xcode を最新版に更新してから Archive し直す |
| 返信に動画を添付すると「エラーが発生しました」 | 動画が大きすぎる。720p にエンコードするか、Google ドライブの共有リンクを貼る |
| 本番広告とテスト広告の取り違え | App Store 用は必ず `npm run ios:release`。Xcode から実機で試すときは `npm run ios:sync` に戻す |
