'use strict';
// 表示言語(日本語 / 英語)。端末の言語が日本語なら日本語、それ以外は英語。タイトル画面で切り替えも可能
// 構成は techgymjp/center-fly の i18n.js と同じ
window.I18N = (() => {
  const dict = {
    ja: {
      'doc.title': '目指せ盗塁王',
      'rotate.msg': 'スマホを横向きにしてください',
      'rotate.sub': '目指せ盗塁王は横画面で遊ぶゲームです',

      'btn.lead': 'リード', 'btn.leadSub': '長押し / 離すと帰塁',
      'btn.dash': 'ダッシュ', 'btn.head': 'ヘッド\nスライディング', 'btn.feet': 'スライ\nディング',

      'title.name': '目指せ盗塁王',
      'title.sub': '代走のあなたが一塁から二盗・三盗・ホームスチール!',
      'help.touch.1': 'リード : リードボタン長押しでリード、離すと塁に戻る(大きいほど牽制が来やすい)',
      'help.touch.2': '投手が投げたら自動でスタート。ダッシュボタンを押している間は全力疾走',
      'help.touch.3': '塁の手前でスライディング / ヘッドスライディング(下のメーターの色の範囲が目安)',
      'help.touch.4': '牽制が来たら指を離して帰塁。ヘッドスライディングで頭から戻れる',
      'help.touch.5': 'リード・スライディングのたびにスタミナが減り、足が遅くなる',
      'help.touch.6': '成功で次の塁へ。アウトなら一塁からやり直し。100 チャレンジで最大 300 盗塁!',
      'help.key.1': 'リード : Space / Z 長押し、離すと帰塁(大きいほど牽制が来やすい)',
      'help.key.2': '投手が投げたら自動でスタート。Shift / X を押している間は全力疾走',
      'help.key.3': 'スライディング : C / ↓   ヘッドスライディング : V / ↑ (メーターの色の範囲が目安)',
      'help.key.4': '牽制が来たらキーを離して帰塁。V / ↑ で頭から戻れる',
      'help.key.5': 'リード・スライディングのたびにスタミナが減り、足が遅くなる。P : 一時停止  M : 音',
      'help.key.6': '成功で次の塁へ。アウトなら一塁からやり直し。100 チャレンジで最大 300 盗塁!',
      'title.best': 'ベスト: {n} 盗塁(ホームスチール {h})',
      'title.start.touch': 'タップでプレイボール',
      'title.start.key': 'SPACE / タップでプレイボール',
      'title.sound': '音が鳴ります(M キー / 上のボタンで消音)。iPhone はマナーモードを解除してください',

      'board.ch': 'チャレンジ {n}', 'board.steals': '盗塁 {n}', 'board.home': '本盗 {n}',
      'hud.ch': 'チャレンジ {n} / {t}',
      'hud.steals': '盗塁 {n}', 'hud.home': '本盗 {n}', 'hud.streak': '連続 {n}',
      'hud.stamina': 'スタミナ',
      'hud.target': '{b}を狙え',
      'base.0': '本塁', 'base.1': '一塁', 'base.2': '二塁', 'base.3': '三塁',
      'bat.line': '投手 {q}・{p} / 捕手 {a}',
      'bat.quickFast': 'クイック速い', 'bat.quickMid': 'クイック普通', 'bat.quickSlow': 'モーション大きい',
      'bat.pickMany': '牽制多め', 'bat.pickMid': '牽制普通', 'bat.pickFew': '牽制少なめ',
      'bat.armStrong': '強肩', 'bat.armMid': '肩普通', 'bat.armWeak': '肩弱い',
      'meter.lead': 'リード {m} m',
      'meter.remain': '{b}まで {m} m',
      'meter.arrive': '到達!',
      'meter.head': '■ ヘッド', 'meter.feet': 'スライディング ■',
      'ready.ch': 'チャレンジ {n}',
      'ready.sub': '代走、一塁へ。まずは二盗だ!',
      'ready.s3': '次は三盗!',
      'ready.home': 'ホームスチールを狙え!!',
      'cue.pick': '牽制!', 'cue.go': 'スタート!', 'cue.home': 'GO!!',
      'pause.resume': 'P / Esc で再開',
      'sound.tap': '音が出ないときはタップ',

      'call.safe': 'セーフ!!', 'call.out': 'アウト!',
      'pop.s2': '二盗成功!', 'pop.s3': '三盗成功!!', 'pop.home': 'ホームスチール成功!!!',
      'pop.pickOut': '牽制死…', 'pop.csOut': '盗塁死…', 'pop.backSafe': 'セーフ',
      'pop.overslide': 'オーバースライド!', 'pop.dirt': 'ワンバウンド!', 'pop.bad': '悪送球!',
      'pop.streak': '{n} 連続盗塁!',

      'rank.0': '草野球の代走', 'rank.1': '代走要員', 'rank.2': '俊足のスペシャリスト',
      'rank.3': 'リーグ屈指の韋駄天', 'rank.4': '盗塁王', 'rank.5': '球史に残る盗塁王', 'rank.6': '伝説の走り屋',

      'over.title': 'ゲームセット',
      'over.steals': '{n} 盗塁 / 最大 {m}',
      'over.rank': '称号: {r}',
      'over.line1': '二盗 {a}   三盗 {b}   ホームスチール {h}',
      'over.line2': '最大連続盗塁 {k}   牽制死 {p}   盗塁死 {c}',
      'over.new': 'NEW RECORD!',
      'over.best': 'ベスト: {n} 盗塁(ホームスチール {h})',
      'over.retryBtn': 'もう一度',
      'menu.resume': '再開', 'menu.title': 'タイトルへ',

      'share.btn': '📤 結果をシェア', 'share.post': '𝕏 ポスト', 'share.copy': 'コピー',
      'share.title': '目指せ盗塁王',
      'share.msg.image': '成績画像つきでシェアできます',
      'share.msg.links': 'X・LINE・コピーからシェアしてください',
      'share.copied': '結果をコピーしました!SNSに貼り付けてください',
      'share.copyFail': 'コピーできませんでした。X・LINEボタンを使ってください',
      'share.text': '🏃目指せ盗塁王で{t}チャレンジ{n}盗塁!\nホームスチール{h}回・最大{k}連続 称号:{r}\n#目指せ盗塁王 #ClaudeCode',
      'card.head': '目指せ盗塁王',
      'card.steals': '{n} 盗塁',
      'card.rank': '称号:{r}',
      'card.line1': '二盗{a} 三盗{b} ホームスチール{h}',
      'card.line2': '最大{k}連続盗塁 ・ {t}チャレンジ',
      'card.tags': '#目指せ盗塁王  #ClaudeCode',
    },
    en: {
      'doc.title': 'Steal King',
      'rotate.msg': 'Please rotate your phone to landscape',
      'rotate.sub': 'Steal King is played in landscape mode',

      'btn.lead': 'LEAD', 'btn.leadSub': 'hold / release = back',
      'btn.dash': 'DASH', 'btn.head': 'HEAD-\nFIRST', 'btn.feet': 'SLIDE',

      'title.name': 'STEAL KING',
      'title.sub': 'Pinch runner on first: steal second, third — and home!',
      'help.touch.1': 'Lead: hold LEAD to take a lead, release to go back (bigger lead = more pickoffs)',
      'help.touch.2': 'You take off automatically on the pitch. Hold DASH to sprint',
      'help.touch.3': 'SLIDE or HEAD-FIRST before the bag (the colored zones on the meter show when)',
      'help.touch.4': 'Pickoff! Release LEAD to get back — HEAD-FIRST dives back to the bag',
      'help.touch.5': 'Every lead and slide costs stamina and slows you down',
      'help.touch.6': 'Safe = next base. Out = back to first. 100 tries, up to 300 steals!',
      'help.key.1': 'Lead: hold Space / Z, release to go back (bigger lead = more pickoffs)',
      'help.key.2': 'You take off automatically on the pitch. Hold Shift / X to sprint',
      'help.key.3': 'Slide: C / ↓   Head-first: V / ↑  (the colored zones on the meter show when)',
      'help.key.4': 'Pickoff! Release the key to get back — V / ↑ dives back head-first',
      'help.key.5': 'Every lead and slide costs stamina and slows you down.  P: pause  M: sound',
      'help.key.6': 'Safe = next base. Out = back to first. 100 tries, up to 300 steals!',
      'title.best': 'Best: {n} steals ({h} of home)',
      'title.start.touch': 'Tap to play ball',
      'title.start.key': 'SPACE / Tap to play ball',
      'title.sound': 'This game has sound (M key / top button to mute). On iPhone, turn off silent mode.',

      'board.ch': 'Try {n}', 'board.steals': 'SB {n}', 'board.home': 'Home {n}',
      'hud.ch': 'Try {n} / {t}',
      'hud.steals': 'SB {n}', 'hud.home': 'Home {n}', 'hud.streak': 'Streak {n}',
      'hud.stamina': 'STAMINA',
      'hud.target': 'Steal {b}',
      'base.0': 'home', 'base.1': 'first', 'base.2': 'second', 'base.3': 'third',
      'bat.line': 'P: {q}, {p} / C: {a}',
      'bat.quickFast': 'quick', 'bat.quickMid': 'normal', 'bat.quickSlow': 'slow to plate',
      'bat.pickMany': 'throws over a lot', 'bat.pickMid': 'some pickoffs', 'bat.pickFew': 'few pickoffs',
      'bat.armStrong': 'strong arm', 'bat.armMid': 'average arm', 'bat.armWeak': 'weak arm',
      'meter.lead': 'Lead {m} m',
      'meter.remain': '{m} m to {b}',
      'meter.arrive': 'In!',
      'meter.head': '■ HEAD-FIRST', 'meter.feet': 'SLIDE ■',
      'ready.ch': 'Try {n}',
      'ready.sub': 'Pinch runner at first. Steal second!',
      'ready.s3': 'Now steal third!',
      'ready.home': 'Steal home!!',
      'cue.pick': 'PICKOFF!', 'cue.go': 'GO!', 'cue.home': 'GO!!',
      'pause.resume': 'P / Esc to resume',
      'sound.tap': 'No sound? Tap here',

      'call.safe': 'SAFE!!', 'call.out': 'OUT!',
      'pop.s2': 'Stole second!', 'pop.s3': 'Stole third!!', 'pop.home': 'STOLE HOME!!!',
      'pop.pickOut': 'Picked off...', 'pop.csOut': 'Caught stealing...', 'pop.backSafe': 'Safe',
      'pop.overslide': 'Overslid!', 'pop.dirt': 'In the dirt!', 'pop.bad': 'Bad throw!',
      'pop.streak': '{n} steals in a row!',

      'rank.0': 'Sandlot Runner', 'rank.1': 'Pinch Runner', 'rank.2': 'Speed Specialist',
      'rank.3': 'Base Path Menace', 'rank.4': 'Stolen Base King', 'rank.5': 'All-Time Steal King', 'rank.6': 'Legend of the Base Paths',

      'over.title': 'GAME OVER',
      'over.steals': '{n} steals / max {m}',
      'over.rank': 'Rank: {r}',
      'over.line1': '2nd {a}   3rd {b}   Home {h}',
      'over.line2': 'Best streak {k}   Picked off {p}   Caught stealing {c}',
      'over.new': 'NEW RECORD!',
      'over.best': 'Best: {n} steals ({h} of home)',
      'over.retryBtn': 'Play again',
      'menu.resume': 'Resume', 'menu.title': 'Title',

      'share.btn': '📤 Share result', 'share.post': '𝕏 Post', 'share.copy': 'Copy',
      'share.title': 'Steal King',
      'share.msg.image': 'Share with a result card image',
      'share.msg.links': 'Share via X, LINE or copy',
      'share.copied': 'Copied! Paste it into your social media',
      'share.copyFail': 'Could not copy. Please use the X or LINE button',
      'share.text': '🏃I stole {n} bases in {t} tries in Steal King!\n{h} steals of home, best streak {k}. Rank: {r}\n#StealKing #ClaudeCode',
      'card.head': 'STEAL KING',
      'card.steals': '{n} steals',
      'card.rank': 'Rank: {r}',
      'card.line1': '2nd {a}  3rd {b}  Home {h}',
      'card.line2': 'Best streak {k} ・ {t} tries',
      'card.tags': '#StealKing  #ClaudeCode',
    },
  };

  const STORE_KEY = 'toruio.lang';
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* 保存不可 */ }
  const deviceLang = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja';
  let lang = dict[saved] ? saved : (/^ja\b/i.test(deviceLang) ? 'ja' : 'en');
  const listeners = [];

  // t('hud.ch', { n: 3, t: 100 }) → 'チャレンジ 3 / 100'
  function t(key, vars) {
    let s = dict[lang][key];
    if (s === undefined) s = dict.ja[key];
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
  }

  // data-i18n(文字)/ data-i18n-href(リンク先)の付いた要素を書き換える
  function apply() {
    document.documentElement.lang = lang;
    document.title = t('doc.title');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-href]').forEach((el) => { el.href = t(el.dataset.i18nHref); });
    document.querySelectorAll('[data-lang]').forEach((el) => el.classList.toggle('on', el.dataset.lang === lang));
  }

  function setLang(l) {
    if (!dict[l] || l === lang) return;
    lang = l;
    try { localStorage.setItem(STORE_KEY, l); } catch (e) { /* 保存不可 */ }
    apply();
    listeners.forEach((f) => f(l));
  }

  return {
    t, apply, setLang,
    get lang() { return lang; },
    onChange(f) { listeners.push(f); },
  };
})();
