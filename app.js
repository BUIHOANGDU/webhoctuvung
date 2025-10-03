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
  { id: "food", label: "Food & Drink", icon: "🍔" },
  { id: "family", label: "Family", icon: "👨‍👩‍👧" },
  { id: "travel", label: "Travel", icon: "✈️" },
  { id: "school", label: "School", icon: "🏫" },
  { id: "work", label: "Work", icon: "💼" },
  { id: "daily", label: "Daily Life", icon: "🌞" },
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
let CLOUD_TOPICS = [];               // [{id,label,icon}]
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

/************** TTS **************/
const VOICE_KEY = "vocab_tts_voice_name", RATE_KEY = "vocab_tts_rate";
let VOICES = [], EN_VOICE = null, TTS_RATE = parseFloat(localStorage.getItem(RATE_KEY) || "0.95");
function refreshVoices() {
  VOICES = window.speechSynthesis?.getVoices?.() || [];
  const saved = localStorage.getItem(VOICE_KEY);
  EN_VOICE = saved ? VOICES.find((v) => v.name === saved) : VOICES.find((v) => /^en(-|_)US/i.test(v.lang));
}
refreshVoices();
if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = refreshVoices;
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    if (EN_VOICE) { u.voice = EN_VOICE; u.lang = EN_VOICE.lang || "en-US"; } else u.lang = "en-US";
    u.rate = TTS_RATE; u.pitch = 1;
    if (speechSynthesis?.speaking) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) { console.warn("TTS error:", e); }
}
window.speak = speak;

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

/************** Settings modal **************/
const settingsModal = $("#settingsModal");
const closeSettings = $("#closeSettings");
const btnSettings = $("#btn-settings");
const voiceSelect = $("#voiceSelect");
const rateRange = $("#rateRange");
const rateValue = $("#rateValue");

btnSettings?.addEventListener("click", () => settingsModal?.classList.remove("hidden"));
closeSettings?.addEventListener("click", () => settingsModal?.classList.add("hidden"));
settingsModal?.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); });

function refreshVoiceListUI() {
  if (!voiceSelect) return;
  VOICES = speechSynthesis.getVoices() || [];
  voiceSelect.innerHTML = "";
  const englishVoices = VOICES.filter((v) => /^en(-|_)/i.test(v.lang));
  englishVoices.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
  const saved = localStorage.getItem(VOICE_KEY);
  if (saved && englishVoices.some((v) => v.name === saved)) {
    voiceSelect.value = saved;
    EN_VOICE = englishVoices.find((v) => v.name === saved);
  } else if (englishVoices.length) {
    voiceSelect.value = englishVoices[0].name;
    EN_VOICE = englishVoices[0];
  }
}
refreshVoiceListUI();
if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = refreshVoiceListUI;

voiceSelect?.addEventListener("change", () => {
  localStorage.setItem(VOICE_KEY, voiceSelect.value);
  EN_VOICE = VOICES.find((v) => v.name === voiceSelect.value) || EN_VOICE;
});
if (rateRange) {
  rateRange.value = String(TTS_RATE);
  if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
  rateRange.addEventListener("input", () => {
    TTS_RATE = parseFloat(rateRange.value);
    localStorage.setItem(RATE_KEY, String(TTS_RATE));
    if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
  });
}

/************** Add / Edit Word (modal) – LOCAL ONLY **************/
const addWordModal = $("#addWordModal");
const closeAddWord = $("#closeAddWord");
const saveAddWord = $("#saveAddWord");
const addWordTopicSel = $("#addWordTopic");
const addWordImage = $("#addWordImage");
const addWordPreview = $("#addWordPreview");
const clearImageBtn = $("#clearImage");
const deleteWordInModal = $("#deleteWordInModal");

let EDIT_MODE = false; // false: thêm, true: sửa

function populateTopicSelect() {
  if (!addWordTopicSel) return;
  addWordTopicSel.innerHTML = "";
  // Chỉ cho phép thêm/sửa vào built-in (extras) & user topics; KHÔNG cloud
  [...BUILTIN_TOPICS, ...getLocalTopics()].forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.icon || ""} ${t.label}`;
    addWordTopicSel.appendChild(opt);
  });
  addWordTopicSel.disabled = false;
  addWordTopicSel.value = isCloudTopic(CURRENT_TOPIC) ? "food" : CURRENT_TOPIC;
}
function fillForm(data = {}) {
  const set = (sel,val)=>{ const el=$(sel); if(el) el.value=val||""; };
  set("#addWordEn", data.word);
  set("#addWordIpa", data.ipa);
  set("#addWordPos", data.pos);
  set("#addWordVi", data.vi);
  set("#addWordExEn", data.exEn);
  set("#addWordExVi", data.exVi);
  if (addWordImage) addWordImage.value = data.img || "";
  previewImage(data.img || "");
}
function previewImage(url) {
  if (!addWordPreview) return;
  if (url) { addWordPreview.src = url; addWordPreview.style.display = "block"; }
  else { addWordPreview.removeAttribute("src"); addWordPreview.style.display = "none"; }
}
addWordImage?.addEventListener("input", () => previewImage(addWordImage.value.trim()));
clearImageBtn?.addEventListener("click", () => { if (addWordImage) addWordImage.value = ""; previewImage(""); });
function toggleDeleteInModal(show) { deleteWordInModal?.classList.toggle("hidden", !show); }

// mở modal thêm
btnAddWord?.addEventListener("click", () => {
  if (isCloudTopic(CURRENT_TOPIC)) {
    alert("Chủ đề CLOUD được quản trị từ trang admin. Bạn không thể thêm ở đây.");
    return;
  }
  EDIT_MODE = false; populateTopicSelect(); fillForm(); toggleDeleteInModal(false);
  addWordModal?.classList.remove("hidden");
});
// mở modal sửa
btnEdit?.addEventListener("click", () => {
  const w = queue[idx]; if (!w) return;
  if (isCloudTopic(CURRENT_TOPIC)) { alert("Không sửa trực tiếp thẻ CLOUD tại đây."); return; }
  EDIT_MODE = true; populateTopicSelect(); addWordTopicSel.value = CURRENT_TOPIC; addWordTopicSel.disabled = false;
  const map = loadImgOverrides(CURRENT_TOPIC);
  fillForm({ word:w.word, ipa:w.ipa||"", pos:w.pos||"", vi:w.vi||"", exEn:w.exEn||"", exVi:w.exVi||"", img:w.img||map[w.id]||"" });
  toggleDeleteInModal(/^ext-|^u-/.test(w.id));
  addWordModal?.classList.remove("hidden");
});
// đóng modal
closeAddWord?.addEventListener("click", () => addWordModal?.classList.add("hidden"));
addWordModal?.addEventListener("click", (e) => { if (e.target === addWordModal) addWordModal.classList.add("hidden"); });
// xoá trong modal
deleteWordInModal?.addEventListener("click", () => {
  const w = queue[idx]; if (!w || !/^ext-|^u-/.test(w.id)) return;
  if (!confirm(`Xoá thẻ “${w.word}”?`)) return;
  if (isBuiltin(CURRENT_TOPIC)) saveExtras(CURRENT_TOPIC, loadExtras(CURRENT_TOPIC).filter((x) => x.id !== w.id));
  else saveUserTopicWords(CURRENT_TOPIC, loadUserTopicWords(CURRENT_TOPIC).filter((x) => x.id !== w.id));
  if (PROG[w.id]) { delete PROG[w.id]; saveProgress(PROG); }
  topicData = getDataset(CURRENT_TOPIC); queue = [...topicData];
  totalCountEl && (totalCountEl.textContent = String(topicData.length));
  countLearned(); countDue(); idx = 0; showCard(idx);
  addWordModal?.classList.add("hidden");
});
// lưu (thêm mới / sửa) – LOCAL ONLY
saveAddWord?.addEventListener("click", () => {
  const targetTopic = addWordTopicSel?.value || CURRENT_TOPIC;
  const payload = {
    word: $("#addWordEn")?.value.trim(),
    ipa: $("#addWordIpa")?.value.trim(),
    pos: $("#addWordPos")?.value.trim(),
    vi: $("#addWordVi")?.value.trim(),
    exEn: $("#addWordExEn")?.value.trim(),
    exVi: $("#addWordExVi")?.value.trim(),
    img: addWordImage ? addWordImage.value.trim() : "",
  };
  if (!payload.word || !payload.vi) { alert("Cần nhập tối thiểu: Tiếng Anh + Nghĩa."); return; }
  if (isCloudTopic(targetTopic)) { alert("Không thể thêm thẻ vào chủ đề CLOUD tại đây."); return; }

  // thêm mới
  if (!EDIT_MODE) {
    const id = (isBuiltin(targetTopic) ? `ext-${targetTopic}-` : `u-${targetTopic}-`) + Date.now();
    const w = { id, ...payload };
    if (isBuiltin(targetTopic)) { const arr = loadExtras(targetTopic); arr.push(w); saveExtras(targetTopic, arr); }
    else { const arr = loadUserTopicWords(targetTopic); arr.push(w); saveUserTopicWords(targetTopic, arr); }
    if (CURRENT_TOPIC === targetTopic) {
      topicData.push(w); queue.push(w);
      totalCountEl && (totalCountEl.textContent = String(topicData.length));
      idx = topicData.length - 1; showCard(idx);
    }
    addWordModal?.classList.add("hidden"); return;
  }

  // sửa
  const cur = queue[idx]; if (!cur) return;
  if (/^ext-|^u-/.test(cur.id)) {
    if (isBuiltin(CURRENT_TOPIC)) {
      const arr = loadExtras(CURRENT_TOPIC); const i = arr.findIndex((x) => x.id === cur.id);
      if (i > -1) { arr[i] = { ...arr[i], ...payload }; saveExtras(CURRENT_TOPIC, arr); }
    } else {
      const arr = loadUserTopicWords(CURRENT_TOPIC); const i = arr.findIndex((x) => x.id === cur.id);
      if (i > -1) { arr[i] = { ...arr[i], ...payload }; saveUserTopicWords(CURRENT_TOPIC, arr); }
    }
  } else {
    // builtin gốc: chỉ override ảnh (per-user) + chỉnh text hiển thị cục bộ
    const map = loadImgOverrides(CURRENT_TOPIC);
    if (payload.img) map[cur.id] = payload.img; else delete map[cur.id];
    saveImgOverrides(CURRENT_TOPIC, map);
    cur.ipa = payload.ipa; cur.pos = payload.pos; cur.vi = payload.vi; cur.exEn = payload.exEn; cur.exVi = payload.exVi;
  }
  topicData = getDataset(CURRENT_TOPIC); queue = [...topicData];
  const newIdx = queue.findIndex((x) => x.id === cur.id); idx = newIdx > -1 ? newIdx : 0;
  showCard(idx); addWordModal?.classList.add("hidden");
});

/************** Modal quản lý chủ đề (LOCAL) **************/
function renderMyTopicsInModal() {
  const box = document.querySelector("#myTopics"); if (!box) return;
  const mine = getLocalTopics(); box.innerHTML = "";
  if (!mine.length) { box.innerHTML = "<p>Chưa có chủ đề tự tạo.</p>"; return; }
  mine.forEach((t) => {
    const row = document.createElement("div"); row.className = "row";
    const icon = document.createElement("input"); icon.type="text"; icon.value=t.icon||""; icon.placeholder="📚"; icon.style.width="64px";
    const name = document.createElement("input"); name.type="text"; name.value=t.label; name.placeholder="Tên chủ đề";
    const save = document.createElement("button"); save.textContent="Lưu";
    const del  = document.createElement("button"); del.textContent="Xoá"; del.className="danger";
    save.onclick = () => { const list=getLocalTopics(); const i=list.findIndex((x)=>x.id===t.id); if(i>-1){ list[i].label=name.value.trim()||list[i].label; list[i].icon=icon.value.trim()||""; saveLocalTopics(list); renderTopicButtons(); alert("Đã lưu."); } };
    del.onclick  = () => {
      if (!confirm(`Xoá chủ đề “${t.label}”?`)) return;
      localStorage.removeItem(USER_TOPIC_PREFIX() + t.id);
      localStorage.removeItem(EXTRAS_PREFIX() + t.id);
      localStorage.removeItem(IMG_OVERRIDE_PREFIX() + t.id);
      Object.keys(localStorage).forEach((k) => { if (k.startsWith(`vocab_progress_${t.id}_v1`)) localStorage.removeItem(k); });
      saveLocalTopics(getLocalTopics().filter((x) => x.id !== t.id));
      renderTopicButtons(); renderMyTopicsInModal();
      if (CURRENT_TOPIC === t.id) switchTopic("food");
      alert("Đã xoá.");
    };
    row.append(icon, name, save, del); box.appendChild(row);
  });
}
document.querySelector("#btn-manage-topics")?.addEventListener("click", () => {
  document.querySelector("#topicModal")?.classList.remove("hidden"); renderMyTopicsInModal();
});
document.querySelector("#closeTopicModal")?.addEventListener("click", () => {
  document.querySelector("#topicModal")?.classList.add("hidden");
});
document.querySelector("#topicModal")?.addEventListener("click", (e) => {
  if (e.target.id === "topicModal") e.currentTarget.classList.add("hidden");
});
document.querySelector("#createTopic")?.addEventListener("click", () => {
  const name = document.querySelector("#newTopicName")?.value.trim();
  const icon = document.querySelector("#newTopicIcon")?.value.trim();
  if (!name) { alert("Nhập tên chủ đề."); return; }
  const id = "u_" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || Date.now());
  const list = getLocalTopics();
  if (list.some((x) => x.id === id)) { alert("Tên này đã tồn tại, hãy đổi tên khác."); return; }
  list.push({ id, label: name, icon }); saveLocalTopics(list);
  const tn = document.querySelector("#newTopicName"); if (tn) tn.value = "";
  const ti = document.querySelector("#newTopicIcon"); if (ti) ti.value = "";
  renderTopicButtons(); renderMyTopicsInModal(); alert("Đã tạo chủ đề!");
});
