// =============== app.js (full) ===============

// ---------- Topic & dataset ----------
const TOPIC_KEY = "vocab_current_topic";
let CURRENT_TOPIC = localStorage.getItem(TOPIC_KEY) || "food";

const CUSTOM_KEY = "vocab_custom_words"; // lưu "Thẻ của tôi" (custom words)

function loadCustomWords(){
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); }
  catch { return []; }
}
function saveCustomWords(arr){
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr || []));
}

function getDataset(topic) {
  if (topic === "family") return window.DATA_FAMILY || [];
  if (topic === "travel") return window.DATA_TRAVEL || [];
  if (topic === "school") return window.DATA_SCHOOL || [];
  if (topic === "work")   return window.DATA_WORK || [];
  if (topic === "daily")  return window.DATA_DAILY || [];
  if (topic === "custom") return loadCustomWords();        // Thẻ của tôi
  return window.DATA_FOOD || [];
}

let topicData = getDataset(CURRENT_TOPIC);
const $ = (s) => document.querySelector(s);

// ---------- Screens ----------
const authScreen  = $("#authScreen");
const topicScreen = $("#topicScreen");
const studyScreen = $("#studyScreen");
function showScreen(name){
  [authScreen, topicScreen, studyScreen].forEach(x=>x?.classList.add("hidden"));
  if(name==="auth")   authScreen?.classList.remove("hidden");
  if(name==="topics") topicScreen?.classList.remove("hidden");
  if(name==="study")  studyScreen?.classList.remove("hidden");
}

// ---------- UI refs ----------
const wordEl = $("#word"), ipaEl = $("#ipa"), posEl = $("#pos");
const meaningEl = $("#meaning"), exEnEl = $("#exEn"), exViEl = $("#exVi");
const learnedCountEl = $("#learnedCount"), totalCountEl = $("#totalCount");
const dueCountEl = $("#dueCount"), streakDaysEl = $("#streakDays");
const topicTitleEl = $("#topicTitle"), topicNameEl = $("#topicName");

// Flip card refs
const cardEl = $("#card");
const btnShow = $("#btn-show");

// Nút delete (chỉ show ở custom)
const btnDelete = $("#btn-delete");
function setCustomUIVisibility(){
  const isCustom = CURRENT_TOPIC === "custom";
  btnDelete?.classList.toggle("hidden", !isCustom);
}

// ---------- State ----------
let idx = 0;
let queue = [...topicData];
if (totalCountEl) totalCountEl.textContent = String(topicData.length);

function topicLabel(t){
  switch(t){
    case "family": return "Family";
    case "travel": return "Travel";
    case "school": return "School";
    case "work":   return "Work";
    case "daily":  return "Daily Life";
    case "custom": return "Thẻ của tôi";
    default:       return "Food & Drink";
  }
}
if (topicTitleEl) topicTitleEl.textContent = topicLabel(CURRENT_TOPIC);
if (topicNameEl)  topicNameEl.textContent  = topicLabel(CURRENT_TOPIC);
setCustomUIVisibility();

// ====== TTS setup ======
const VOICE_KEY = "vocab_tts_voice_name";
const RATE_KEY  = "vocab_tts_rate";
let VOICES = [];
let EN_VOICE = null;
let TTS_RATE = parseFloat(localStorage.getItem(RATE_KEY) || "0.95");

function refreshVoices() {
  VOICES = window.speechSynthesis?.getVoices?.() || [];
  const savedName = localStorage.getItem(VOICE_KEY);
  if (savedName) EN_VOICE = VOICES.find(v => v.name === savedName) || null;
  if (!EN_VOICE) EN_VOICE = VOICES.find(v => /^en(-|_)US/i.test(v.lang)) || null;
}
refreshVoices();
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = refreshVoices;
}

function speak(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    if (EN_VOICE) { u.voice = EN_VOICE; u.lang = EN_VOICE.lang || "en-US"; }
    else { u.lang = "en-US"; }
    u.rate = TTS_RATE || 0.95; u.pitch = 1.0;
    if (window.speechSynthesis?.speaking) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){ console.warn("TTS error:", e); }
}
// expose cho quiz.js dùng nút 🔊
window.speak = speak;

// ---------- Local progress ----------
const STREAK_KEY = "vocab_streak_day_v1";
function baseKey(){ return `vocab_progress_${CURRENT_TOPIC}_v1`; }
function getStorageKey(){
  const uid = window.fb?.auth?.currentUser?.uid;
  return uid ? `${baseKey()}__uid_${uid}` : `${baseKey()}__guest`;
}
function loadProgressFor(key){
  const raw = localStorage.getItem(key);
  if(!raw){
    const init = Object.fromEntries((topicData||[]).map(w=>[w.id,{ease:2.5, interval:0, next:0, learned:false}]));
    localStorage.setItem(key, JSON.stringify(init));
    return init;
  }
  return JSON.parse(raw);
}
function saveProgress(p){ localStorage.setItem(getStorageKey(), JSON.stringify(p)); }

let PROG = loadProgressFor(getStorageKey());
// expose PROG để quiz.js có thể ưu tiên từ khó/sai
window.PROG = PROG;

// ---------- Streak ----------
function todayDayNumber(){ return Math.floor(Date.now()/86400000); }
function updateStreak(){
  const day = todayDayNumber();
  const raw = localStorage.getItem(STREAK_KEY);
  let data = raw ? JSON.parse(raw) : { last:null, streak:0 };
  if(data.last !== day){
    data.streak = (data.last===day-1) ? data.streak+1 : Math.max(1, data.streak||0);
    data.last = day;
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  }
  if (streakDaysEl) streakDaysEl.textContent = data.streak || 1;
}
function peekStreak(){
  const raw = localStorage.getItem(STREAK_KEY);
  if (streakDaysEl) streakDaysEl.textContent = raw ? (JSON.parse(raw).streak || 0) : 0;
}

// ---------- Counters & render ----------
function countLearned(){
  if (!learnedCountEl) return;
  learnedCountEl.textContent = Object.values(PROG).filter(x=>x.learned).length;
}
function countDue(){
  const now = Date.now();
  const idsDue = Object.entries(PROG).filter(([,v])=>v.next<=now).map(([id])=>id);
  if (dueCountEl) dueCountEl.textContent = idsDue.length;
  return idsDue;
}
function showCard(i){
  const w = queue[i]; 
  if(!w){
    // trạng thái trống
    if (wordEl)    wordEl.textContent = "Trống";
    if (ipaEl)     ipaEl.textContent = "";
    if (posEl)     posEl.textContent = "";
    if (meaningEl) meaningEl.textContent = "Bạn chưa có thẻ nào. Hãy thêm thẻ mới!";
    if (exEnEl)    exEnEl.textContent = "";
    if (exViEl)    exViEl.textContent = "";
    return;
  }
  if (wordEl)    wordEl.textContent = w.word;
  if (ipaEl)     ipaEl.textContent = w.ipa||"";
  if (posEl)     posEl.textContent = w.pos||"";
  if (meaningEl) meaningEl.textContent = w.vi||"";
  if (exEnEl)    exEnEl.textContent = w.exEn||"";
  if (exViEl)    exViEl.textContent = w.exVi||"";
  cardEl?.classList.remove("flipped");
}

// ---------- SRS ----------
function gradeCurrent(grade){
  const w = queue[idx];
  if (!w) return;
  const rec = PROG[w.id] || { ease:2.5, interval:0, next:0, learned:false };
  let { ease, interval } = rec;

  if (grade === "again") {
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    rec.againCount = (rec.againCount || 0) + 1;
    rec.lastWrongAt = Date.now();
  } else if (grade === "hard") {
    interval = Math.max(1, Math.round((interval || 1) * 1.2));
    ease = Math.max(1.3, ease - 0.05);
    rec.hardCount = (rec.hardCount || 0) + 1;
    rec.lastWrongAt = Date.now();
  } else if (grade === "good") {
    interval = Math.max(1, Math.round((interval || 1) * ease));
    rec.goodCount = (rec.goodCount || 0) + 1;
  } else if (grade === "easy") {
    interval = Math.max(1, Math.round((interval || 1) * (ease + 0.15)));
    ease = Math.min(3.5, ease + 0.05);
    rec.easyCount = (rec.easyCount || 0) + 1;
  }

  const next = Date.now() + interval * 86400000;
  PROG[w.id] = { ...rec, ease, interval, next, learned: true };
  saveProgress(PROG);
  updateStreak(); countLearned(); countDue();

  if (grade === "again") {
    cardEl?.classList.remove("flipped");
    showCard(idx);        // giữ nguyên từ
  } else {
    nextCard();           // sang từ kế tiếp
  }
}

// ---------- Điều hướng ----------
function nextCard(){
  if (!queue.length) return;
  idx = (idx + 1) % queue.length;
  showCard(idx);
}
function prevCard(){
  if (!queue.length) return;
  idx = (idx - 1 + queue.length) % queue.length;
  showCard(idx);
}
function shuffle(){
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  idx = 0;
  showCard(idx);
}

// ---------- XÓA THẺ (custom) ----------
async function cloudDeleteOne(uid, wordId){
  try{
    const ref = fb.db
      .collection("userProgress")
      .doc(uid)
      .collection(CURRENT_TOPIC) // "custom"
      .doc(wordId);
    await ref.delete();
  }catch(e){
    console.warn("Delete cloud failed:", e);
  }
}
async function deleteCurrentCard(){
  if (CURRENT_TOPIC !== "custom") return;
  const w = queue[idx];
  if (!w) return;

  const ok = confirm(`Xoá thẻ “${w.word}”? Hành động này không thể hoàn tác.`);
  if (!ok) return;

  // 1) Xoá khỏi custom deck
  let deck = loadCustomWords().filter(item => item.id !== w.id);
  saveCustomWords(deck);

  // 2) Xoá tiến trình local
  if (PROG[w.id]) {
    delete PROG[w.id];
    saveProgress(PROG);
  }

  // 3) Xoá trên cloud nếu đăng nhập
  const uid = window.fb?.auth?.currentUser?.uid;
  if (uid) await cloudDeleteOne(uid, w.id);

  // 4) Cập nhật queue/UI
  topicData = getDataset("custom");
  queue = [...topicData];
  if (totalCountEl) totalCountEl.textContent = String(topicData.length);
  countLearned(); countDue();

  if (!queue.length){
    idx = 0;
    showCard(idx);
    return;
  }
  if (idx >= queue.length) idx = 0;
  showCard(idx);
}
btnDelete?.addEventListener("click", deleteCurrentCard);

// ---------- Events ----------
btnShow?.addEventListener("click", ()=> cardEl?.classList.toggle("flipped"));
$("#btn-speak")?.addEventListener("click", ()=>speak(wordEl?.textContent || ""));
document.querySelectorAll(".srs-buttons button").forEach(b=>b.addEventListener("click", ()=>{
  const grade = b.getAttribute("data-grade");
  if (grade) gradeCurrent(grade);
  cardEl?.classList.remove("flipped"); // đảm bảo về mặt trước
}));
$("#next")?.addEventListener("click", nextCard);
$("#prev")?.addEventListener("click", prevCard);
$("#shuffle")?.addEventListener("click", shuffle);
$("#btn-quiz")?.addEventListener("click", ()=>openQuiz(topicData));
$("#closeQuiz")?.addEventListener("click", ()=>$("#quizModal")?.classList.add("hidden"));
$("#btn-back")?.addEventListener("click", ()=>showScreen("topics"));

// ---------- Topic screen ----------
document.querySelectorAll(".topic-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const t = btn.getAttribute("data-topic");
    if (!t) return;
    CURRENT_TOPIC = t;
    localStorage.setItem(TOPIC_KEY, t);

    topicData = getDataset(t);
    queue = [...topicData];

    if (topicTitleEl) topicTitleEl.textContent = topicLabel(t);
    if (topicNameEl)  topicNameEl.textContent  = topicLabel(t);
    if (totalCountEl) totalCountEl.textContent = String(topicData.length);

    PROG = loadProgressFor(getStorageKey());
    window.PROG = PROG; // cập nhật export cho quiz
    countLearned(); countDue(); showCard(idx=0);

    setCustomUIVisibility(); // 👈 cập nhật hiển thị nút xoá
    showScreen("study");
  });
});

// ---------- Auth ----------
const loginBtn  = $("#btn-login");
const logoutBtn = $("#btn-logout");
function setAuthUI(signedIn){
  loginBtn?.classList.toggle("hidden", signedIn);
  logoutBtn?.classList.toggle("hidden", !signedIn);
}
loginBtn?.addEventListener("click", async ()=>{
  try{ await fb.auth.signInWithPopup(fb.googleProvider); }
  catch(e){ alert("Đăng nhập thất bại: " + e.message); }
});
logoutBtn?.addEventListener("click", ()=>fb.auth.signOut());

// ---------- Cloud ----------
async function cloudLoadProgress(uid){
  const col = fb.db.collection("userProgress").doc(uid).collection(CURRENT_TOPIC);
  const snap = await col.get(); const remote={};
  snap.forEach(doc=>remote[doc.id]=doc.data()); return remote;
}
async function cloudSaveOne(uid, wordId, rec){
  const ref = fb.db.collection("userProgress").doc(uid).collection(CURRENT_TOPIC).doc(wordId);
  await ref.set(rec, { merge:true });
}
function mergeProgress(localObj, remoteObj){
  const out = { ...localObj };
  Object.keys(remoteObj).forEach(id=>{
    const a=localObj[id], b=remoteObj[id];
    if(!a) out[id]=b; else out[id]=((b?.next||0)>(a?.next||0)?b:a);
  });
  return out;
}

// ---------- Auth flow ----------
if(window.fb){
  fb.auth.onAuthStateChanged(async (user)=>{
    setAuthUI(!!user);
    if(!user){ showScreen("auth"); return; }

    showScreen("topics");
    PROG = loadProgressFor(getStorageKey());
    try{
      const remote = await cloudLoadProgress(user.uid);
      PROG = mergeProgress(PROG, remote);
      saveProgress(PROG);
      window.PROG = PROG;
    }catch(e){ console.warn("Load cloud failed:", e); }

    countLearned(); countDue(); peekStreak();
    showCard(idx=0);
    setCustomUIVisibility();
  });
}

// ---------- First render ----------
countLearned(); countDue(); peekStreak(); showCard(idx=0);

// Save cloud mỗi lần grade
const _oldGradeCurrent = gradeCurrent;
gradeCurrent = function (grade) {
  _oldGradeCurrent(grade);
  const user = window.fb?.auth?.currentUser;
  if (user) {
    const prevIndex = (idx - 1 + queue.length) % queue.length;
    const w = queue[prevIndex];
    if (w && PROG[w.id]) {
      cloudSaveOne(user.uid, w.id, PROG[w.id]).catch((e) =>
        console.warn("Save cloud fail", e)
      );
    }
  }
};

// ---------- Settings modal ----------
const settingsModal = $("#settingsModal");
const closeSettings = $("#closeSettings");
const btnSettings   = $("#btn-settings");
const voiceSelect   = $("#voiceSelect");
const rateRange     = $("#rateRange");
const rateValue     = $("#rateValue");

btnSettings?.addEventListener("click", ()=>settingsModal?.classList.remove("hidden"));
closeSettings?.addEventListener("click", ()=>settingsModal?.classList.add("hidden"));
settingsModal?.addEventListener("click", (e)=>{
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});

function refreshVoiceListUI(){
  if (!voiceSelect) return;
  VOICES = speechSynthesis.getVoices() || [];
  voiceSelect.innerHTML = "";

  const englishVoices = VOICES.filter(v=>/^en(-|_)/i.test(v.lang));
  englishVoices.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });

  const saved = localStorage.getItem(VOICE_KEY);
  if(saved && englishVoices.some(v=>v.name===saved)){
    voiceSelect.value = saved;
    EN_VOICE = englishVoices.find(v=>v.name===saved);
  } else if (englishVoices.length){
    voiceSelect.value = englishVoices[0].name;
    EN_VOICE = englishVoices[0];
  }
}
refreshVoiceListUI();
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = refreshVoiceListUI;
}

voiceSelect?.addEventListener("change", ()=>{
  localStorage.setItem(VOICE_KEY, voiceSelect.value);
  EN_VOICE = VOICES.find(v=>v.name === voiceSelect.value) || EN_VOICE;
});

// tốc độ
if (rateRange) {
  rateRange.value = String(TTS_RATE);
  if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
  rateRange.addEventListener("input", ()=>{
    TTS_RATE = parseFloat(rateRange.value);
    localStorage.setItem(RATE_KEY, String(TTS_RATE));
    if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
  });
}

// ---------- Add custom word (Thẻ của tôi) ----------
const addWordModal = $("#addWordModal");
const btnAddWord   = $("#btn-addWord");
const closeAddWord = $("#closeAddWord");
const saveAddWord  = $("#saveAddWord");

btnAddWord?.addEventListener("click", ()=> addWordModal?.classList.remove("hidden"));
closeAddWord?.addEventListener("click", ()=> addWordModal?.classList.add("hidden"));
addWordModal?.addEventListener("click", (e)=>{
  if (e.target === addWordModal) addWordModal.classList.add("hidden");
});

saveAddWord?.addEventListener("click", ()=>{
  const w = {
    id: "custom-" + Date.now(),
    word: $("#addWordEn")?.value.trim(),
    ipa:  $("#addWordIpa")?.value.trim(),
    pos:  $("#addWordPos")?.value.trim(),
    vi:   $("#addWordVi")?.value.trim(),
    exEn: $("#addWordExEn")?.value.trim(),
    exVi: $("#addWordExVi")?.value.trim()
  };
  if (!w.word || !w.vi) {
    alert("Cần nhập tối thiểu English + Nghĩa.");
    return;
  }
  const arr = loadCustomWords();
  arr.push(w);
  saveCustomWords(arr);

  if (CURRENT_TOPIC === "custom") {
    topicData.push(w);
    queue.push(w);
    if (totalCountEl) totalCountEl.textContent = String(topicData.length);
    showCard(idx = topicData.length - 1);
  }

  addWordModal?.classList.add("hidden");
  alert("Đã thêm vào 'Thẻ của tôi'!");
});
