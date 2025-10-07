// =============== app.js (FULL, CLOUD-READY) ===============
// + Chủ đề CLOUD (globalTopics/globalWords) do admin tạo
// + Chủ đề tự tạo theo từng tài khoản (per-user)
// + Ảnh minh hoạ: ưu tiên GLOBAL (admin) → per-user → ảnh gốc dataset/cloud
// + SRS/Quiz/TTS/Cloud Progress giữ nguyên & cô lập theo user

/************** Topic & datasets (per-user) **************/
const TOPIC_KEY = "vocab_current_topic";

// (BASE names, không dùng trực tiếp)
const LOCAL_TOPICS_KEY_BASE = "vocab_local_topics_v1";
const EXTRAS_PREFIX_BASE = "vocab_topic_extras__";
const USER_TOPIC_PREFIX_BASE = "vocab_topic_words__";
const IMG_OVERRIDE_PREFIX_BASE = "vocab_img_override__";

// Built-in
const BUILTIN_TOPICS = [
  { id: "dates",    label: "Numbers & Dates", icon: "📅" },
  { id: "hobbies",  label: "Hobbies",         icon: "🎯" },
  { id: "routines", label: "Daily Routines",  icon: "⏰" },
  { id: "food",     label: "Food & Drink",    icon: "🍔" },
  { id: "family",   label: "Family",          icon: "👨‍👩‍👧" },
  { id: "travel",   label: "Travel",          icon: "✈️" },
  { id: "school",   label: "School",          icon: "🏫" },
  { id: "work",     label: "Work",            icon: "💼" },
  { id: "daily",    label: "Daily Life",      icon: "🌞" },
];

// === mỗi user có không gian dữ liệu riêng (hoặc __guest) ===
function uidSuffix() {
  const uid = window.fb?.auth?.currentUser?.uid;
  return uid ? `__uid_${uid}` : "__guest";
}
function perUserKey(base) { return `${base}${uidSuffix()}`; }

// Các key/prefix theo user
function LOCAL_TOPICS_KEY()    { return perUserKey(LOCAL_TOPICS_KEY_BASE); }
function EXTRAS_PREFIX()       { return EXTRAS_PREFIX_BASE + uidSuffix() + "__"; }
function USER_TOPIC_PREFIX()   { return USER_TOPIC_PREFIX_BASE + uidSuffix() + "__"; }
function IMG_OVERRIDE_PREFIX() { return IMG_OVERRIDE_PREFIX_BASE + uidSuffix() + "__"; }

// Tiện ích chung
const $ = (s) => document.querySelector(s);
const isBuiltin = (id) => BUILTIN_TOPICS.some((t) => t.id === id);

/************** CLOUD TOPICS (admin) **************/
let CLOUD_TOPICS = [];                 // [{id,label,icon}]
let CLOUD_WORDS  = Object.create(null); // { [topicId]: [{id,word,vi,ipa,pos,...}] }
let _cloudTopicsUnsub = null;
const isCloudTopic = (id) => CLOUD_TOPICS.some(t => t.id === id);

// Realtime: danh sách chủ đề cloud
function subscribeCloudTopics() {
  if (!window.fb?.db) return;
  if (_cloudTopicsUnsub) _cloudTopicsUnsub();
  _cloudTopicsUnsub = fb.db.collection("globalTopics").orderBy("label")
    .onSnapshot(snap => {
      CLOUD_TOPICS = snap.docs.map(d => d.data()).filter(Boolean);
      // Re-render nếu đang ở màn chọn chủ đề
      renderTopicButtons();
      // Nếu topic hiện tại là cloud mà vừa bị xoá -> chuyển về built-in
      if (isCloudTopic(CURRENT_TOPIC) === false && !isBuiltin(CURRENT_TOPIC) && !getLocalTopics().some(x=>x.id===CURRENT_TOPIC)) {
        switchTopic("food");
      }
    }, err => console.warn("subscribeCloudTopics:", err));
}

// Realtime: từ theo topic cloud
const _cloudWordsUnsubs = Object.create(null);
function subscribeCloudWords(topicId) {
  if (!window.fb?.db) return;
  if (_cloudWordsUnsubs[topicId]) _cloudWordsUnsubs[topicId](); // hủy cũ
  _cloudWordsUnsubs[topicId] = fb.db.collection("globalWords").where("topicId","==",topicId)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(doc => {
        const d = doc.data();
        // chuẩn hóa sang cấu trúc giống dataset local/built-in
        arr.push({
          id: d.wordId, word: d.word, vi: d.vi,
          ipa: d.ipa || "", pos: d.pos || "",
          exEn: d.exEn || "", exVi: d.exVi || "",
          img: d.img || ""
        });
      });
      CLOUD_WORDS[topicId] = arr.sort((a,b)=> (a.word||"").localeCompare(b.word||""));
      if (CURRENT_TOPIC === topicId) { // đang xem topic này thì refresh ngay
        topicData = getDataset(topicId);
        queue = [...topicData];
        totalCountEl && (totalCountEl.textContent = String(topicData.length));
        showCard(idx = Math.min(idx, Math.max(0, queue.length-1)));
      }
    }, err => console.warn("subscribeCloudWords:", err));
}

/************** Danh sách chủ đề (local) **************/
const getLocalTopics = () => {
  try { return JSON.parse(localStorage.getItem(LOCAL_TOPICS_KEY()) || "[]"); }
  catch { return []; }
};
function saveLocalTopics(list) {
  localStorage.setItem(LOCAL_TOPICS_KEY(), JSON.stringify(list || []));
}
const getAllTopics = () => [...BUILTIN_TOPICS, ...CLOUD_TOPICS, ...getLocalTopics()];
const topicLabel = (id) => getAllTopics().find((x) => x.id === id)?.label || id;

// Load/Save theo user (local extras & user topics)
function loadExtras(topicId) {
  try { return JSON.parse(localStorage.getItem(EXTRAS_PREFIX() + topicId) || "[]"); }
  catch { return []; }
}
function saveExtras(topicId, arr) {
  localStorage.setItem(EXTRAS_PREFIX() + topicId, JSON.stringify(arr || []));
}
function loadUserTopicWords(topicId) {
  try { return JSON.parse(localStorage.getItem(USER_TOPIC_PREFIX() + topicId) || "[]"); }
  catch { return []; }
}
function saveUserTopicWords(topicId, arr) {
  localStorage.setItem(USER_TOPIC_PREFIX() + topicId, JSON.stringify(arr || []));
}
function loadImgOverrides(topicId) {
  try { return JSON.parse(localStorage.getItem(IMG_OVERRIDE_PREFIX() + topicId) || "{}"); }
  catch { return {}; }
}
function saveImgOverrides(topicId, map) {
  localStorage.setItem(IMG_OVERRIDE_PREFIX() + topicId, JSON.stringify(map || {}));
}

/************** (Legacy) migrate “custom” **************/
(function migrateLegacyCustomTopic() {
  const legacyExtras = loadExtras("custom");
  const legacyUser = loadUserTopicWords("custom");
  const hasAny = (legacyExtras && legacyExtras.length) || (legacyUser && legacyUser.length);
  if (!hasAny) return;
  const list = getLocalTopics();
  let baseId = "u_my-cards", id = baseId, n = 1;
  while (list.some((x) => x.id === id)) id = `${baseId}-${n++}`;
  list.push({ id, label: "Thẻ của tôi", icon: "📌" });
  saveLocalTopics(list);
  const merged = [...(legacyUser || []), ...(legacyExtras || [])];
  saveUserTopicWords(id, merged);
  localStorage.removeItem(EXTRAS_PREFIX() + "custom");
  localStorage.removeItem(USER_TOPIC_PREFIX() + "custom");
  localStorage.removeItem(IMG_OVERRIDE_PREFIX() + "custom");
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("vocab_progress_custom_v1")) localStorage.removeItem(k);
  });
  if (localStorage.getItem(TOPIC_KEY) === "custom") {
    localStorage.setItem(TOPIC_KEY, id);
  }
})();

/************** Dataset theo topic **************/
function getDataset(topicId) {
  // CLOUD
  if (isCloudTopic(topicId)) {
    return (CLOUD_WORDS[topicId] || []);
  }
  // Built-in (+ extras per-user)
  if (isBuiltin(topicId)) {
    let base = [];
    if (topicId === "dates")    base = window.DATA_DATES    || [];
    if (topicId === "hobbies")  base = window.DATA_HOBBIES  || [];
    if (topicId === "routines") base = window.DATA_ROUTINES || [];
    if (topicId === "food")     base = window.DATA_FOOD     || [];
    if (topicId === "family")   base = window.DATA_FAMILY   || [];
    if (topicId === "travel")   base = window.DATA_TRAVEL   || [];
    if (topicId === "school")   base = window.DATA_SCHOOL   || [];
    if (topicId === "work")     base = window.DATA_WORK     || [];
    if (topicId === "daily")    base = window.DATA_DAILY    || [];
    return [...base, ...loadExtras(topicId)];
  }
  // user topic (local)
  return loadUserTopicWords(topicId);
}

/************** GLOBAL image overrides (admin) **************/
let GLOBAL_IMG_OVERRIDES = {}; // { [topicId]: { [wordId]: url } }
let _globalImgUnsub = null;

async function subscribeGlobalImgOverrides(topicId) {
  try {
    if (!window.fb?.db) return;
    if (typeof _globalImgUnsub === "function") { _globalImgUnsub(); _globalImgUnsub = null; }
    GLOBAL_IMG_OVERRIDES[topicId] = GLOBAL_IMG_OVERRIDES[topicId] || {};
    const col = fb.db.collection("globalImgOverrides").where("topicId", "==", topicId);
    _globalImgUnsub = col.onSnapshot(
      (snap) => {
        const map = {};
        snap.forEach((doc) => {
          const d = doc.data();
          if (d?.wordId && d?.url) map[d.wordId] = d.url;
        });
        GLOBAL_IMG_OVERRIDES[topicId] = map;
        if (CURRENT_TOPIC === topicId) showCard(idx);
      },
      (err) => console.warn("globalImgOverrides subscribe error:", err)
    );
  } catch (e) { console.warn("subscribeGlobalImgOverrides failed:", e); }
}
function getGlobalImg(topicId, wordId) {
  return (GLOBAL_IMG_OVERRIDES?.[topicId] || {})[wordId] || "";
}

/************** Render topic buttons **************/
function renderTopicButtons() {
  const wrap = $("#topicList");
  if (!wrap) return;
  wrap.innerHTML = "";
  getAllTopics().forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "topic-btn";
    btn.dataset.topic = t.id;
    btn.textContent = `${t.icon || ""} ${t.label}`;
    btn.onclick = () => switchTopic(t.id);
    wrap.appendChild(btn);
  });
}

/************** Switch topic **************/
let CURRENT_TOPIC = localStorage.getItem(TOPIC_KEY) || "food";
let topicData = getDataset(CURRENT_TOPIC);
let queue = [...topicData];
let idx = 0;

// UI refs
const wordEl = $("#word"), ipaEl = $("#ipa"), posEl = $("#pos");
const meaningEl = $("#meaning"), exEnEl = $("#exEn"), exViEl = $("#exVi");
const wordImg = $("#wordImg");
const learnedCountEl = $("#learnedCount"), totalCountEl = $("#totalCount");
const dueCountEl = $("#dueCount"), streakDaysEl = $("#streakDays");
const topicTitleEl = $("#topicTitle"), topicNameEl = $("#topicName");
const cardEl = $("#card"), btnShow = $("#btn-show");
const btnDelete = $("#btn-delete"), btnEdit = $("#btn-edit");
const btnAddWord = $("#btn-addWord");

// screens
const authScreen = $("#authScreen"), topicScreen = $("#topicScreen"), studyScreen = $("#studyScreen");
function showScreen(name) {
  [authScreen, topicScreen, studyScreen].forEach((x) => x?.classList.add("hidden"));
  if (name === "auth")   authScreen?.classList.remove("hidden");
  if (name === "topics") topicScreen?.classList.remove("hidden");
  if (name === "study")  studyScreen?.classList.remove("hidden");
}
function applyTopicUI() {
  topicTitleEl && (topicTitleEl.textContent = topicLabel(CURRENT_TOPIC));
  topicNameEl  && (topicNameEl.textContent  = topicLabel(CURRENT_TOPIC));
  totalCountEl && (totalCountEl.textContent = String(topicData.length));
}

function switchTopic(id) {
  CURRENT_TOPIC = id;
  localStorage.setItem(TOPIC_KEY, id);

  // đăng ký realtime ảnh GLOBAL cho topic
  subscribeGlobalImgOverrides(id);

  // nếu là CLOUD -> đăng ký realtime words cho topic này
  if (isCloudTopic(id)) subscribeCloudWords(id);

  topicData = getDataset(id);
  queue = [...topicData];
  idx = 0;
  applyTopicUI();

  PROG = loadProgressFor(getStorageKey());
  window.PROG = PROG;
  countLearned(); countDue();
  showCard(idx);
  showScreen("study");
}

/************** TTS (preset 4 EN + 2 JA + 2 KO, ổn định) **************/
const VOICE_KEY = "vocab_tts_voice_name";
const RATE_KEY  = "vocab_tts_rate";

// Giữ rate người dùng, giới hạn an toàn 0.6 – 1.2 cho tự nhiên
let TTS_RATE = Math.min(1.2, Math.max(0.6, parseFloat(localStorage.getItem(RATE_KEY) || "0.95")));

let VOICES = [];
let CURRENT_VOICE = null;

// 8 preset mong muốn (ẩn mục nếu thiết bị thiếu giọng)
const VOICE_PRESETS = [
  { key:"en-us-m", group:"English (US)", label:"Male",   lang:"en-US", hints:["Google US English Male","Google US English","Male"] },
  { key:"en-us-f", group:"English (US)", label:"Female", lang:"en-US", hints:["Google US English Female","Google US English","Female"] },
  { key:"en-gb-m", group:"English (UK)", label:"Male",   lang:"en-GB", hints:["Google UK English Male","Google UK English","Male"] },
  { key:"en-gb-f", group:"English (UK)", label:"Female", lang:"en-GB", hints:["Google UK English Female","Google UK English","Female"] },
  { key:"ja-jp-m", group:"Japanese",     label:"Male",   lang:"ja-JP",  hints:["日本語","Ichiro","Male","Google 日本語"] },
  { key:"ja-jp-f", group:"Japanese",     label:"Female", lang:"ja-JP",  hints:["Ayumi","Female","日本語","Google 日本語"] },
  { key:"ko-kr-m", group:"Korean",       label:"Male",   lang:"ko-KR",  hints:["한국의","Male","Google 한국의"] },
  { key:"ko-kr-f", group:"Korean",       label:"Female", lang:"ko-KR",  hints:["SunHi","Female","한국의","Google 한국의"] },
];

function resolvePreset(preset) {
  const byLang = VOICES.filter(v => {
    const L = (v.lang || "").toLowerCase();
    const need = preset.lang.toLowerCase();
    return L === need || L.startsWith(need.slice(0,2));
  });
  if (!byLang.length) return null;
  const nameHit = byLang.find(v =>
    (preset.hints||[]).some(h => (v.name||"").toLowerCase().includes(h.toLowerCase()))
  );
  return nameHit || byLang[0];
}

function refreshVoices() {
  VOICES = window.speechSynthesis?.getVoices?.() || [];
  if (!VOICES.length) { setTimeout(refreshVoices, 200); return; }

  const sel = document.querySelector("#voiceSelect");
  if (sel) {
    sel.innerHTML = "";
    const groups = [...new Set(VOICE_PRESETS.map(p => p.group))];
    groups.forEach(gr => {
      const og = document.createElement("optgroup");
      og.label = gr;
      VOICE_PRESETS.filter(p => p.group === gr).forEach(p => {
        const v = resolvePreset(p);
        if (!v) return;
        const opt = document.createElement("option");
        opt.value = v.name;
        opt.textContent = `${p.group} – ${p.label}`;
        og.appendChild(opt);
      });
      if (og.children.length) sel.appendChild(og);
    });

    const saved = localStorage.getItem(VOICE_KEY);
    const savedVoice = VOICES.find(v => v.name === saved);
    if (savedVoice) {
      sel.value = savedVoice.name;
      CURRENT_VOICE = savedVoice;
    } else {
      const wantOrder = ["en-us-f","en-us-m","en-gb-f","en-gb-m"];
      let picked = null;
      for (const key of wantOrder) {
        const preset = VOICE_PRESETS.find(p => p.key === key);
        picked = resolvePreset(preset || {});
        if (picked) break;
      }
      picked = picked || VOICES.find(v => /^en-us/i.test(v.lang)) || VOICES[0];
      if (picked) {
        sel.value = picked.name;
        CURRENT_VOICE = picked;
        localStorage.setItem(VOICE_KEY, picked.name);
      }
    }
  }
}

if (typeof speechSynthesis !== "undefined") {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}

// UI: đổi voice trong select
document.querySelector("#voiceSelect")?.addEventListener("change", (e) => {
  const v = VOICES.find(v => v.name === e.target.value);
  if (v) {
    CURRENT_VOICE = v;
    localStorage.setItem(VOICE_KEY, v.name);
  }
});

// UI: đổi tốc độ
const rateRange = document.querySelector("#rateRange");
const rateValue = document.querySelector("#rateValue");
if (rateRange) {
  rateRange.value = String(TTS_RATE);
  if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
  rateRange.addEventListener("input", () => {
    TTS_RATE = Math.min(1.2, Math.max(0.6, parseFloat(rateRange.value || "1")));
    localStorage.setItem(RATE_KEY, String(TTS_RATE));
    if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
  });
}

// Hàm đọc – chắc chắn, không bị “nối đuôi”
function speak(text) {
  try {
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    if (speechSynthesis?.speaking) speechSynthesis.cancel();
    if (CURRENT_VOICE) { u.voice = CURRENT_VOICE; u.lang = CURRENT_VOICE.lang || "en-US"; }
    else { u.lang = "en-US"; }
    u.rate = TTS_RATE; u.pitch = 1;
    speechSynthesis.speak(u);
  } catch(e) { console.warn("TTS error:", e); }
}
window.speak = speak;

// Handlers mở/đóng modal cài đặt (không đụng TTS vars)
const settingsModal = $("#settingsModal");
$("#btn-settings")?.addEventListener("click", () => settingsModal?.classList.remove("hidden"));
$("#closeSettings")?.addEventListener("click", () => settingsModal?.classList.add("hidden"));
settingsModal?.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); });

/************** Progress (per-user) **************/
const STREAK_KEY = "vocab_streak_day_v1";
function baseKey() { return `vocab_progress_${CURRENT_TOPIC}_v1`; }
function getStorageKey() {
  const uid = window.fb?.auth?.currentUser?.uid;
  return uid ? `${baseKey()}__uid_${uid}` : `${baseKey()}__guest`;
}
function loadProgressFor(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    const init = Object.fromEntries((topicData || []).map((w) => [w.id, { ease: 2.5, interval: 0, next: 0, learned: false }]));
    localStorage.setItem(key, JSON.stringify(init));
    return init;
  }
  return JSON.parse(raw);
}
function saveProgress(p) { localStorage.setItem(getStorageKey(), JSON.stringify(p)); }
let PROG = loadProgressFor(getStorageKey());
window.PROG = PROG;

function todayDayNumber() { return Math.floor(Date.now() / 86400000); }
function updateStreak() {
  const day = todayDayNumber();
  const raw = localStorage.getItem(STREAK_KEY);
  let d = raw ? JSON.parse(raw) : { last: null, streak: 0 };
  if (d.last !== day) {
    d.streak = d.last === day - 1 ? d.streak + 1 : Math.max(1, d.streak || 0);
    d.last = day;
    localStorage.setItem(STREAK_KEY, JSON.stringify(d));
  }
  streakDaysEl && (streakDaysEl.textContent = d.streak || 1);
}
function peekStreak() {
  const raw = localStorage.getItem(STREAK_KEY);
  streakDaysEl && (streakDaysEl.textContent = raw ? JSON.parse(raw).streak || 0 : 0);
}
function countLearned() {
  learnedCountEl && (learnedCountEl.textContent = Object.values(PROG).filter((x) => x.learned).length);
}
function countDue() {
  const now = Date.now();
  const ids = Object.entries(PROG).filter(([, v]) => v.next <= now).map(([id]) => id);
  dueCountEl && (dueCountEl.textContent = ids.length);
  return ids;
}

/************** Card height auto **************/
function adjustCardHeight() {
  const inner = cardEl?.querySelector(".card-inner");
  const front = cardEl?.querySelector(".card-front");
  const back  = cardEl?.querySelector(".card-back");
  if (!inner || !front || !back) return;
  const h = Math.max(front.scrollHeight, back.scrollHeight);
  inner.style.height = h + "px";
}

/************** Show card **************/
function imgForWord(w) {
  const g = getGlobalImg(CURRENT_TOPIC, w.id);
  if (g) return g;
  const userMap = loadImgOverrides(CURRENT_TOPIC);
  if (userMap[w.id]) return userMap[w.id];
  return w.img || "";
}
function showImage(url) {
  if (!wordImg) return;
  if (url) { wordImg.src = url; wordImg.style.display = "block"; }
  else { wordImg.removeAttribute("src"); wordImg.style.display = "none"; }
}
function showCard(i) {
  const w = queue[i];
  if (!w) {
    wordEl && (wordEl.textContent = "Trống");
    ipaEl && (ipaEl.textContent = "");
    posEl && (posEl.textContent = "");
    meaningEl && (meaningEl.textContent = "Bạn chưa có thẻ nào. Hãy thêm thẻ mới!");
    exEnEl && (exEnEl.textContent = "");
    exViEl && (exViEl.textContent = "");
    showImage(""); adjustCardHeight(); return;
  }
  wordEl && (wordEl.textContent = w.word);
  ipaEl && (ipaEl.textContent = w.ipa || "");
  posEl && (posEl.textContent = w.pos || "");
  meaningEl && (meaningEl.textContent = w.vi || "");
  exEnEl && (exEnEl.textContent = w.exEn || "");
  exViEl && (exViEl.textContent = w.exVi || "");
  showImage(imgForWord(w));
  cardEl?.classList.remove("flipped");
  if (wordImg) { wordImg.onload = () => adjustCardHeight(); wordImg.onerror = () => adjustCardHeight(); }
  adjustCardHeight();
}

/************** SRS **************/
function gradeCurrent(grade) {
  const w = queue[idx];
  if (!w) return;
  const rec = PROG[w.id] || { ease: 2.5, interval: 0, next: 0, learned: false };
  let { ease, interval } = rec;
  if (grade === "again") { interval = 0; ease = Math.max(1.3, ease - 0.2); rec.againCount = (rec.againCount || 0) + 1; rec.lastWrongAt = Date.now(); }
  else if (grade === "hard") { interval = Math.max(1, Math.round((interval || 1) * 1.2)); ease = Math.max(1.3, ease - 0.05); rec.hardCount = (rec.hardCount || 0) + 1; rec.lastWrongAt = Date.now(); }
  else if (grade === "good") { interval = Math.max(1, Math.round((interval || 1) * ease)); rec.goodCount = (rec.goodCount || 0) + 1; }
  else if (grade === "easy") { interval = Math.max(1, Math.round((interval || 1) * (ease + 0.15))); ease = Math.min(3.5, ease + 0.05); rec.easyCount = (rec.easyCount || 0) + 1; }
  const next = Date.now() + interval * 86400000;
  PROG[w.id] = { ...rec, ease, interval, next, learned: true };
  saveProgress(PROG);
  updateStreak(); countLearned(); countDue();
  if (grade === "again") { cardEl?.classList.remove("flipped"); showCard(idx); }
  else nextCard();
}

/************** Điều hướng **************/
function nextCard() { if (!queue.length) return; idx = (idx + 1) % queue.length; showCard(idx); }
function prevCard() { if (!queue.length) return; idx = (idx - 1 + queue.length) % queue.length; showCard(idx); }
function shuffle()   { for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; } idx = 0; showCard(idx); }

/************** Xoá thẻ (local/user-only) **************/
const btnDeleteEl = $("#btn-delete");
btnDeleteEl?.addEventListener("click", () => {
  const w = queue[idx]; if (!w) return;
  if (!/^ext-|^u-/.test(w.id)) { alert("Thẻ mặc định & thẻ cloud không thể xoá tại đây."); return; }
  if (!confirm(`Xoá thẻ “${w.word}”?`)) return;

  if (isBuiltin(CURRENT_TOPIC)) {
    const arr = loadExtras(CURRENT_TOPIC).filter((x) => x.id !== w.id); saveExtras(CURRENT_TOPIC, arr);
  } else {
    const arr = loadUserTopicWords(CURRENT_TOPIC).filter((x) => x.id !== w.id); saveUserTopicWords(CURRENT_TOPIC, arr);
  }
  if (PROG[w.id]) { delete PROG[w.id]; saveProgress(PROG); }
  topicData = getDataset(CURRENT_TOPIC); queue = [...topicData];
  totalCountEl && (totalCountEl.textContent = String(topicData.length));
  countLearned(); countDue();
  if (!queue.length) idx = 0; else if (idx >= queue.length) idx = 0;
  showCard(idx);
});

/************** Events **************/
btnShow?.addEventListener("click", () => { cardEl?.classList.toggle("flipped"); setTimeout(adjustCardHeight, 60); });
$("#btn-speak")?.addEventListener("click", () => speak(wordEl?.textContent || ""));
document.querySelectorAll(".srs-buttons button").forEach((b) =>
  b.addEventListener("click", () => { const g = b.getAttribute("data-grade"); if (g) gradeCurrent(g); cardEl?.classList.remove("flipped"); setTimeout(adjustCardHeight, 0); })
);
$("#next")?.addEventListener("click", nextCard);
$("#prev")?.addEventListener("click", prevCard);
$("#shuffle")?.addEventListener("click", shuffle);
$("#btn-quiz")?.addEventListener("click", () => { try { openQuiz?.(topicData); } catch (e) { console.warn("Quiz not wired:", e); } });
$("#closeQuiz")?.addEventListener("click", () => $("#quizModal")?.classList.add("hidden"));
$("#btn-back")?.addEventListener("click", () => showScreen("topics"));

/************** Topic buttons (màn chọn chủ đề) **************/
function wireTopicButtons() {
  document.querySelectorAll(".topic-btn").forEach((btn) => {
    btn.addEventListener("click", () => { const t = btn.getAttribute("data-topic"); if (!t) return; switchTopic(t); });
  });
}

/************** Auth **************/
const loginBtn = $("#btn-login"), logoutBtn = $("#btn-logout");
function setAuthUI(signedIn) { loginBtn?.classList.toggle("hidden", signedIn); logoutBtn?.classList.toggle("hidden", !signedIn); }
loginBtn?.addEventListener("click", async () => { try { await fb.auth.signInWithPopup(fb.googleProvider); } catch (e) { alert("Đăng nhập thất bại: " + e.message); } });
logoutBtn?.addEventListener("click", () => fb.auth.signOut());

/************** Cloud Progress sync **************/
async function cloudLoadProgress(uid) {
  const col = fb.db.collection("userProgress").doc(uid).collection(CURRENT_TOPIC);
  const snap = await col.get(); const remote = {}; snap.forEach((doc) => (remote[doc.id] = doc.data())); return remote;
}
async function cloudSaveOne(uid, wordId, rec) {
  const ref = fb.db.collection("userProgress").doc(uid).collection(CURRENT_TOPIC).doc(wordId);
  await ref.set(rec, { merge: true });
}
function mergeProgress(localObj, remoteObj) {
  const out = { ...localObj };
  Object.keys(remoteObj).forEach((id) => {
    const a = localObj[id], b = remoteObj[id];
    out[id] = !a ? b : (b?.next || 0) > (a?.next || 0) ? b : a;
  });
  return out;
}

/************** Auth flow **************/
if (window.fb) {
  fb.auth.onAuthStateChanged(async (user) => {
    setAuthUI(!!user);

    // Luôn subscribe danh sách chủ đề cloud khi app chạy
    subscribeCloudTopics();

    if (!user) {
      renderTopicButtons(); wireTopicButtons();
      showScreen("auth");
      // subscribe ảnh GLOBAL + cloud words cho topic hiện tại
      subscribeGlobalImgOverrides(CURRENT_TOPIC);
      if (isCloudTopic(CURRENT_TOPIC)) subscribeCloudWords(CURRENT_TOPIC);
      return;
    }
    showScreen("topics");
    renderTopicButtons(); wireTopicButtons();

    // đảm bảo realtime ảnh GLOBAL & cloud words cho topic hiện tại
    subscribeGlobalImgOverrides(CURRENT_TOPIC);
    if (isCloudTopic(CURRENT_TOPIC)) subscribeCloudWords(CURRENT_TOPIC);

    PROG = loadProgressFor(getStorageKey());
    try {
      const remote = await cloudLoadProgress(user.uid);
      PROG = mergeProgress(PROG, remote);
      saveProgress(PROG);
      window.PROG = PROG;
    } catch (e) { console.warn("Load cloud failed:", e); }

    countLearned(); countDue(); peekStreak();
    showCard((idx = 0));
  });
}

/************** First render **************/
renderTopicButtons(); wireTopicButtons();
function applyTopicUIOnce(){ topicTitleEl && (topicTitleEl.textContent = topicLabel(CURRENT_TOPIC)); topicNameEl && (topicNameEl.textContent = topicLabel(CURRENT_TOPIC)); }
applyTopicUIOnce();
function peekStreak(){ const raw = localStorage.getItem("vocab_streak_day_v1"); streakDaysEl && (streakDaysEl.textContent = raw ? JSON.parse(raw).streak || 0 : 0); }
countLearned(); countDue(); peekStreak();
showCard((idx = 0));
// Subscribe ngay khi mở
subscribeGlobalImgOverrides(CURRENT_TOPIC);
if (isCloudTopic(CURRENT_TOPIC)) subscribeCloudWords(CURRENT_TOPIC);

/************** Save cloud mỗi lần grade **************/
const _oldGradeCurrent = gradeCurrent;
gradeCurrent = function (grade) {
  _oldGradeCurrent(grade);
  const user = window.fb?.auth?.currentUser;
  if (user) {
    const prevIndex = (idx - 1 + queue.length) % queue.length;
    const w = queue[prevIndex];
    if (w && PROG[w.id]) {
      cloudSaveOne(user.uid, w.id, PROG[w.id]).catch((e) => console.warn("Save cloud fail", e));
    }
  }
};
