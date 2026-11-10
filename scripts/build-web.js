// Android アプリに同梱する Web ファイルを www/ にコピーする
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of [
  'index.html', 'style.css', 'manifest.json', 'icon.svg',
  'game.js', 'scene3d.js', 'sound.js', 'ads.js', 'i18n.js', 'vendor',
]) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, item), { recursive: true });
}
// アプリ(Android / iOS)に同梱するときは、Web 版だけの部分(Google Play へのリンク、テスト・撮影用のフック)を取り除く。
// iOS の審査では、端末によって出し分ける機能は「審査中に隠した機能」と見なされる(Guideline 5.6)ため、アプリには最初から入れない。
// 構成は techgymjp/chabudai の scripts/build-web.js と同じ
if (process.env.APP_BUILD === '1') {
  const strip = (rel, re) => {
    const file = path.join(out, rel);
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(re, '');
    if (after === before) {
      console.error(`${rel} に web-only の目印が見つかりません`);
      process.exit(1);
    }
    fs.writeFileSync(file, after);
  };
  strip('index.html', /[ \t]*<!-- web-only[\s\S]*?<!-- \/web-only -->\n?/g);
  strip('game.js', /[ \t]*\/\/ web-only:start[\s\S]*?\/\/ web-only:end\n?/g);
  strip('i18n.js', /[ \t]*\/\/ web-only:start[\s\S]*?\/\/ web-only:end\n?/g);
  for (const rel of ['index.html', 'game.js', 'i18n.js']) {
    const text = fs.readFileSync(path.join(out, rel), 'utf8');
    if (/play\.google\.com|web-only|storeLink|window\.Toruio/.test(text)) {
      console.error(`${rel} に Web 版だけの部分が残っています`);
      process.exit(1);
    }
  }
}
// Google Play 用のビルドでは本番の広告を使う
const mode = process.env.ADMOB_MODE === 'production' ? 'production' : 'test';
fs.writeFileSync(path.join(out, 'ads-config.js'), `// ビルド時に生成\nwindow.AD_MODE = '${mode}';\n`);
// タイトル画面に出すバージョン（CI では VERSION_NAME / VERSION_CODE を使う）
const version = process.env.VERSION_CODE
  ? `v${process.env.VERSION_NAME || require('../package.json').version} (build ${process.env.VERSION_CODE})`
  : 'dev';
fs.writeFileSync(path.join(out, 'build-info.js'), `// ビルド時に生成\nwindow.APP_VERSION = '${version}';\n`);
console.log(`built web assets into www/ (ads: ${mode}, version: ${version})`);
