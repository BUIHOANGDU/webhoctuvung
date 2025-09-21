// ---------- Topic & dataset ----------
const TOPIC_KEY = "vocab_current_topic";
let CURRENT_TOPIC = localStorage.getItem(TOPIC_KEY) || "food";

function getDataset(topic) {
  if (topic === "family") return window.DATA_FAMILY || [];
  if (topic === "travel") return window.DATA_TRAVEL || [];
  if (topic === "school") return window.DATA_SCHOOL || [];
  if (topic === "work")   return window.DATA_WORK || [];
  if (topic === "daily")  return window.DATA_DAILY || [];
  return window.DATA_FOOD || [];
}

let topicData = getDataset(CURRENT_TOPIC);
const $ = (s)=>document.querySelector(s);

// Screens
const authScreen  = $("#authScreen");
const topicScreen = $("#topicScreen");
const studyScreen = $("#studyScreen");
function showScreen(name){
  [authScreen, topicScreen, studyScreen].forEach(x=>x.classList.add("hidden"));
  if(name==="auth")  authScreen.classList.remove("hidden");
  if(name==="topics") topicScreen.classList.remove("hidden");
  if(name==="study") studyScreen.classList.remove("hidden");
}

// ---------- UI refs for study ----------
const wordEl = $("#word"), ipaEl = $("#ipa"), posEl = $("#pos");
const meaningEl = $("#meaning"), exEnEl = $("#exEn"), exViEl = $("#exVi");
const cardBack = $("#cardBack"), cardFront = $("#cardFront");
const learnedCountEl = $("#learnedCount"), totalCountEl = $("#totalCount");
const dueCountEl = $("#dueCount"), streakDaysEl = $("#streakDays");
const topicTitleEl = $("#topicTitle"), topicNameEl = $("#topicName");

let idx = 0;
let queue = [...topicData];
totalCountEl.textContent = topicData.length.toString();
function topicLabel(t){
  switch(t){
    case "family": return "Family";
    case "travel": return "Travel";
    case "school": return "School";
    case "work":   return "Work";
    case "daily":  return "Daily Life";
    default:       return "Food & Drink";
  }
}
topicTitleEl.textContent = topicLabel(CURRENT_TOPIC);
topicNameEl.textContent  = topicLabel(CURRENT_TOPIC);

// ====== TTS (Text-to-Speech) setup ======
const VOICE_KEY = "vocab_tts_voice_name";
const RATE_KEY  = "vocab_tts_rate";

let VOICES = [];
let EN_VOICE = null;
let TTS_RATE = parseFloat(localStorage.getItem(RATE_KEY) || "0.95");

const voiceSelect = document.querySelector("#voiceSelect");
const rateRange   = document.querySelector("#rateRange");
const rateValue   = document.querySelector("#rateValue");

// Chỉ giữ 4 loại giọng
const TARGETS = [
  { id: "us_male",   label: "English (US) – Male",   langs: [/^en(-|_)US/i], names: [/^Alex$/i, /Google US English/i, /Male/i] },
  { id: "us_female", label: "English (US) – Female", langs: [/^en(-|_)US/i], names: [/Samantha/i, /Google US English.*Female/i, /Female/i] },
  { id: "uk_male",   label: "English (UK) – Male",   langs: [/^en(-|_)GB/i], names: [/Daniel/i, /Google UK English.*Male/i, /Male/i] },
  { id: "uk_female", label: "English (UK) – Female", langs: [/^en(-|_)GB/i], names: [/Kate|Serena|Martha/i, /Google UK English.*Female/i, /Female/i] },
];

function pickPreferredSet(voices = []) {
  const out = {};
  TARGETS.forEach(t => {
    const candidates = voices.filter(v => t.langs.some(rx => rx.test(v.lang)));
    let chosen = null;
    for (const rx of t.names) {
      chosen = candidates.find(v => rx.test(v.name));
      if (chosen) break;
    }
    out[t.id] = chosen || candidates[0] || null;
  });
  return out;
}

function populateVoiceDropdown() {
  if (!voiceSelect) return;
  voiceSelect.innerHTML = "";

  const preferred = pickPreferredSet(VOICES);
  const items = TARGETS
    .map(t => ({ t, voice: preferred[t.id] }))
    .filter(x => !!x.voice);

  items.forEach(({ t, voice }) => {
    const opt = document.createElement("option");
    opt.value = voice.name;
    opt.textContent = `${t.label} (${voice.name})`;
    voiceSelect.appendChild(opt);
  });

  const savedName = localStorage.getItem(VOICE_KEY);
  const hasSaved  = [...voiceSelect.options].some(o => o.value === savedName);
  if (hasSaved) {
    voiceSelect.value = savedName;
    EN_VOICE = VOICES.find(v => v.name === savedName) || null;
  } else {
    voiceSelect.selectedIndex = 0;
    const first = voiceSelect.options[0];
    EN_VOICE = first ? VOICES.find(v => v.name === first.value) : null;
  }
}

function refreshVoices() {
  VOICES = window.speechSynthesis?.getVoices?.() || [];
  populateVoiceDropdown();
}

refreshVoices();
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = refreshVoices;
}

// rate UI
if (rateRange) {
  rateRange.value = String(TTS_RATE);
  if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
}
voiceSelect?.addEventListener("change", () => {
  const name = voiceSelect.value;
  EN_VOICE = (VOICES || []).find(v => v.name === name) || null;
  if (EN_VOICE) localStorage.setItem(VOICE_KEY, EN_VOICE.name);
});
rateRange?.addEventListener("input", () => {
  TTS_RATE = parseFloat(rateRange.value || "1");
  localStorage.setItem(RATE_KEY, String(TTS_RATE));
  if (rateValue) rateValue.textContent = `${TTS_RATE.toFixed(2)}×`;
});

// ---------- Local progress per UID + topic ----------
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
  streakDaysEl.textContent = data.streak || 1;
}
function peekStreak(){
  const raw = localStorage.getItem(STREAK_KEY);
  streakDaysEl.textContent = raw ? (JSON.parse(raw).streak || 0) : 0;
}

// ---------- TTS speak ----------
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

// ---------- Counters & render ----------
function countLearned(){ learnedCountEl.textContent = Object.values(PROG).filter(x=>x.learned).length; }
function countDue(){
  const now = Date.now();
  const idsDue = Object.entries(PROG).filter(([,v])=>v.next<=now).map(([id])=>id);
  dueCountEl.textContent = idsDue.length; return idsDue;
}
function showCard(i){
  const w = queue[i]; if(!w) return;
  wordEl.textContent = w.word; ipaEl.textContent = w.ipa||""; posEl.textContent = w.pos||"";
  meaningEl.textContent = w.vi||""; exEnEl.textContent = w.exEn||""; exViEl.textContent = w.exVi||"";
  cardBack.classList.add("hidden"); cardFront.classList.remove("hidden");
}

// ---------- SRS ----------
function gradeCurrent(grade){
  const w = queue[idx];
  const rec = PROG[w.id] || { ease:2.5, interval:0, next:0, learned:false };
  let { ease, interval } = rec;

  if(grade==="again"){ interval=0; ease=Math.max(1.3, ease-0.2); }
  else if(grade==="hard"){ interval=Math.max(1, Math.round((interval||1)*1.2)); ease=Math.max(1.3, ease-0.05); }
  else if(grade==="good"){ interval=Math.max(1, Math.round((interval||1)*ease)); }
  else if(grade==="easy"){ interval=Math.max(1, Math.round((interval||1)*(ease+0.15))); ease=Math.min(3.5, ease+0.05); }

  const next = Date.now() + interval*86400000;
  PROG[w.id] = { ease, interval, next, learned:true };
  saveProgress(PROG);
  updateStreak(); countLearned(); countDue();
  nextCard();
}
function nextCard(){ idx=(idx+1)%queue.length; showCard(idx); }
function prevCard(){ idx=(idx-1+queue.length)%queue.length; showCard(idx); }
function shuffle(){
  for(let i=queue.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [queue[i],queue[j]]=[queue[j],queue[i]]; }
  idx=0; showCard(idx);
}

// ---------- Events (study) ----------
$("#btn-show").addEventListener("click", ()=>{ cardFront.classList.add("hidden"); cardBack.classList.remove("hidden"); });
$("#btn-speak").addEventListener("click", ()=>speak(wordEl.textContent));
document.querySelectorAll(".srs-buttons button").forEach(b=>b.addEventListener("click", ()=>gradeCurrent(b.dataset.grade)));
$("#next").addEventListener("click", nextCard);
$("#prev").addEventListener("click", prevCard);
$("#shuffle").addEventListener("click", shuffle);
$("#btn-quiz").addEventListener("click", ()=>openQuiz(topicData));
$("#closeQuiz").addEventListener("click", ()=>document.querySelector("#quizModal").classList.add("hidden"));
$("#btn-back").addEventListener("click", ()=>showScreen("topics"));

// ---------- Topic screen events ----------
document.querySelectorAll(".topic-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const t = btn.dataset.topic;
    CURRENT_TOPIC = t; 
    localStorage.setItem(TOPIC_KEY, t);

    topicData = getDataset(t); 
    queue = [...topicData];

    topicTitleEl.textContent = topicLabel(t);
    topicNameEl.textContent  = topicLabel(t);
    totalCountEl.textContent = topicData.length.toString();

    PROG = loadProgressFor(getStorageKey());
    countLearned(); countDue(); showCard(idx=0);

    showScreen("study");
  });
});

// ---------- Auth UI ----------
const loginBtn  = $("#btn-login");
const logoutBtn = $("#btn-logout");
function setAuthUI(signedIn){
  if(loginBtn)  loginBtn.classList.toggle("hidden", signedIn);
  if(logoutBtn) logoutBtn.classList.toggle("hidden", !signedIn);
}
loginBtn?.addEventListener("click", async ()=>{
  try{ await fb.auth.signInWithPopup(fb.googleProvider); }
  catch(e){ alert("Đăng nhập thất bại: " + e.message); }
});
logoutBtn?.addEventListener("click", ()=>fb.auth.signOut());

// ---------- Cloud helpers (Firestore) ----------
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

// ---------- Auth state flow ----------
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
    }catch(e){ console.warn("Load cloud failed:", e); }

    countLearned(); countDue(); peekStreak();
    showCard(idx=0);
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
