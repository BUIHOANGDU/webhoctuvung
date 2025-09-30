// =============== app.js (full, multi-topic add) ===============

// ---------- Topic & datasets ----------
const TOPIC_KEY = "vocab_current_topic";
const LOCAL_TOPICS_KEY = "vocab_local_topics_v1"; // danh sách topic do người dùng tạo
const EXTRAS_PREFIX = "vocab_topic_extras__";     // từ do người dùng thêm vào 1 topic có sẵn
const USER_TOPIC_PREFIX = "vocab_topic_words__";   // từ của topic do người dùng tạo

// Chủ đề mặc định
const BUILTIN_TOPICS = [
  { id: "food",   label: "Food & Drink", icon: "🍔" },
  { id: "family", label: "Family",        icon: "👨‍👩‍👧" },
  { id: "travel", label: "Travel",        icon: "✈️" },
  { id: "school", label: "School",        icon: "🏫" },
  { id: "work",   label: "Work",          icon: "💼" },
  { id: "daily",  label: "Daily Life",    icon: "🌞" },
  { id: "custom", label: "Thẻ của tôi",   icon: "📌" }, // để tương thích
];

function $(s){ return document.querySelector(s); }
function isBuiltin(id){ return BUILTIN_TOPICS.some(t=>t.id===id); }
function loadLocalTopics(){ try{ return JSON.parse(localStorage.getItem(LOCAL_TOPICS_KEY)||"[]"); }catch{ return []; } }
function saveLocalTopics(list){ localStorage.setItem(LOCAL_TOPICS_KEY, JSON.stringify(list||[])); }
function loadExtras(topicId){ try{ return JSON.parse(localStorage.getItem(EXTRAS_PREFIX+topicId)||"[]"); }catch{ return []; } }
function saveExtras(topicId, arr){ localStorage.setItem(EXTRAS_PREFIX+topicId, JSON.stringify(arr||[])); }
function loadUserTopicWords(topicId){ try{ return JSON.parse(localStorage.getItem(USER_TOPIC_PREFIX+topicId)||"[]"); }catch{ return []; } }
function saveUserTopicWords(topicId, arr){ localStorage.setItem(USER_TOPIC_PREFIX+topicId, JSON.stringify(arr||[])); }
function getAllTopics(){ return [...BUILTIN_TOPICS, ...loadLocalTopics()]; }

function getDataset(topicId){
  if (isBuiltin(topicId)) {
    let base = [];
    if (topicId==="food")   base = window.DATA_FOOD   || [];
    if (topicId==="family") base = window.DATA_FAMILY || [];
    if (topicId==="travel") base = window.DATA_TRAVEL || [];
    if (topicId==="school") base = window.DATA_SCHOOL || [];
    if (topicId==="work")   base = window.DATA_WORK   || [];
    if (topicId==="daily")  base = window.DATA_DAILY  || [];
    if (topicId==="custom") base = []; // “Thẻ của tôi” bằng extras
    return [...base, ...loadExtras(topicId)];
  }
  // user topics
  return loadUserTopicWords(topicId);
}

function topicLabel(id){
  const t = getAllTopics().find(x=>x.id===id);
  return t ? t.label : id;
}

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
const cardEl = $("#card"); const btnShow = $("#btn-show");

const btnDelete = $("#btn-delete");   // xoá thẻ tự thêm
const btnAddWord = $("#btn-addWord");
const addWordModal = $("#addWordModal");
const closeAddWord = $("#closeAddWord");
const saveAddWord = $("#saveAddWord");
const addWordTopicSel = $("#addWordTopic");

// ---------- State ----------
let CURRENT_TOPIC = localStorage.getItem(TOPIC_KEY) || "food";
let topicData = getDataset(CURRENT_TOPIC);
let queue = [...topicData];
let idx = 0;

function applyTopicUI(){
  topicTitleEl && (topicTitleEl.textContent = topicLabel(CURRENT_TOPIC));
  topicNameEl  && (topicNameEl.textContent  = topicLabel(CURRENT_TOPIC));
  totalCountEl && (totalCountEl.textContent = String(topicData.length));
  setDeleteVisibility();
}
applyTopicUI();

function setDeleteVisibility(){
  // Chỉ được xoá nếu là từ do người dùng thêm trong topic hiện tại
  // Quy ước id: ext-<topic>-<time> cho extras, u-<topic>-<time> cho user topic
  const canDelete = true; // hiển thị nút; khi bấm sẽ kiểm tra từng thẻ
  btnDelete?.classList.toggle("hidden", !canDelete);
}

function switchTopic(id){
  CURRENT_TOPIC = id;
  localStorage.setItem(TOPIC_KEY, id);
  topicData = getDataset(id);
  queue = [...topicData];
  idx = 0;
  applyTopicUI();
  PROG = loadProgressFor(getStorageKey());
  window.PROG = PROG;
  countLearned(); countDue(); showCard(idx);
  showScreen("study");
}

// ---------- Render topic buttons (nếu dùng render động) ----------
const topicList = $("#topicList");
if (topicList){
  function renderTopicButtons(){
    topicList.innerHTML = "";
    getAllTopics().forEach(t=>{
      const b = document.createElement("button");
      b.className = "topic-btn";
      b.dataset.topic = t.id;
      b.textContent = `${t.icon||""} ${t.label}`;
      b.onclick = ()=> switchTopic(t.id);
      topicList.appendChild(b);
    });
  }
  renderTopicButtons();
}

// ====== TTS setup ======
const VOICE_KEY = "vocab_tts_voice_name";
const RATE_KEY  = "vocab_tts_rate";
let VOICES = []; let EN_VOICE = null;
let TTS_RATE = parseFloat(localStorage.getItem(RATE_KEY) || "0.95");

function refreshVoices(){
  VOICES = window.speechSynthesis?.getVoices?.() || [];
  const savedName = localStorage.getItem(VOICE_KEY);
  if (savedName) EN_VOICE = VOICES.find(v=>v.name===savedName) || null;
  if (!EN_VOICE) EN_VOICE = VOICES.find(v=>/^en(-|_)US/i.test(v.lang)) || null;
}
refreshVoices();
if (typeof speechSynthesis!=="undefined"){
  speechSynthesis.onvoiceschanged = refreshVoices;
}
function speak(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    if (EN_VOICE){ u.voice = EN_VOICE; u.lang = EN_VOICE.lang || "en-US"; }
    else u.lang = "en-US";
    u.rate = TTS_RATE || 0.95; u.pitch = 1.0;
    if (window.speechSynthesis?.speaking) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){ console.warn("TTS error:", e); }
}
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
  if (!raw){
    const init = Object.fromEntries((topicData||[]).map(w=>[w.id,{ease:2.5, interval:0, next:0, learned:false}]));
    localStorage.setItem(key, JSON.stringify(init));
    return init;
  }
  return JSON.parse(raw);
}
function saveProgress(p){ localStorage.setItem(getStorageKey(), JSON.stringify(p)); }
let PROG = loadProgressFor(getStorageKey());
window.PROG = PROG;

// ---------- Streak ----------
function todayDayNumber(){ return Math.floor(Date.now()/86400000); }
function updateStreak(){
  const day = todayDayNumber();
  const raw = localStorage.getItem(STREAK_KEY);
  let data = raw ? JSON.parse(raw) : { last:null, streak:0 };
  if (data.last!==day){
    data.streak = (data.last===day-1) ? data.streak+1 : Math.max(1, data.streak||0);
    data.last = day;
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  }
  streakDaysEl && (streakDaysEl.textContent = data.streak || 1);
}
function peekStreak(){
  const raw = localStorage.getItem(STREAK_KEY);
  streakDaysEl && (streakDaysEl.textContent = raw ? (JSON.parse(raw).streak||0) : 0);
}

// ---------- Counters & render ----------
function countLearned(){ learnedCountEl && (learnedCountEl.textContent = Object.values(PROG).filter(x=>x.learned).length); }
function countDue(){
  const now = Date.now();
  const idsDue = Object.entries(PROG).filter(([,v])=>v.next<=now).map(([id])=>id);
  dueCountEl && (dueCountEl.textContent = idsDue.length);
  return idsDue;
}
function showCard(i){
  const w = queue[i];
  if (!w){
    wordEl && (wordEl.textContent = "Trống");
    ipaEl && (ipaEl.textContent = ""); posEl && (posEl.textContent = "");
    meaningEl && (meaningEl.textContent = "Bạn chưa có thẻ nào. Hãy thêm thẻ mới!");
    exEnEl && (exEnEl.textContent = ""); exViEl && (exViEl.textContent = "");
    return;
  }
  wordEl && (wordEl.textContent = w.word);
  ipaEl && (ipaEl.textContent = w.ipa||"");
  posEl && (posEl.textContent = w.pos||"");
  meaningEl && (meaningEl.textContent = w.vi||"");
  exEnEl && (exEnEl.textContent = w.exEn||"");
  exViEl && (exViEl.textContent = w.exVi||"");
  cardEl?.classList.remove("flipped");
}

// ---------- SRS ----------
function gradeCurrent(grade){
  const w = queue[idx]; if (!w) return;
  const rec = PROG[w.id] || { ease:2.5, interval:0, next:0, learned:false };
  let { ease, interval } = rec;

  if (grade==="again"){
    interval = 0; ease = Math.max(1.3, ease-0.2);
    rec.againCount = (rec.againCount||0)+1; rec.lastWrongAt = Date.now();
  }else if (grade==="hard"){
    interval = Math.max(1, Math.round((interval||1)*1.2));
    ease = Math.max(1.3, ease-0.05);
    rec.hardCount = (rec.hardCount||0)+1; rec.lastWrongAt = Date.now();
  }else if (grade==="good"){
    interval = Math.max(1, Math.round((interval||1)*ease));
    rec.goodCount = (rec.goodCount||0)+1;
  }else if (grade==="easy"){
    interval = Math.max(1, Math.round((interval||1)*(ease+0.15)));
    ease = Math.min(3.5, ease+0.05);
    rec.easyCount = (rec.easyCount||0)+1;
  }

  const next = Date.now() + interval*86400000;
  PROG[w.id] = { ...rec, ease, interval, next, learned:true };
  saveProgress(PROG);
  updateStreak(); countLearned(); countDue();

  if (grade==="again"){ cardEl?.classList.remove("flipped"); showCard(idx); }
  else { nextCard(); }
}

// ---------- Điều hướng ----------
function nextCard(){ if (!queue.length) return; idx=(idx+1)%queue.length; showCard(idx); }
function prevCard(){ if (!queue.length) return; idx=(idx-1+queue.length)%queue.length; showCard(idx); }
function shuffle(){
  for(let i=queue.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [queue[i],queue[j]]=[queue[j],queue[i]]; }
  idx=0; showCard(idx);
}

// ---------- XÓA THẺ (cho từ do người dùng thêm) ----------
btnDelete?.addEventListener("click", ()=>{
  const w = queue[idx]; if (!w) return;
  // chỉ cho xoá nếu là từ có id bắt đầu bằng ext- hoặc u-
  if (!/^ext-|^u-/.test(w.id)){ alert("Thẻ mặc định không thể xoá."); return; }
  const ok = confirm(`Xoá thẻ “${w.word}”?`);
  if (!ok) return;

  if (isBuiltin(CURRENT_TOPIC)){
    const arr = loadExtras(CURRENT_TOPIC).filter(x=>x.id!==w.id);
    saveExtras(CURRENT_TOPIC, arr);
  } else {
    const arr = loadUserTopicWords(CURRENT_TOPIC).filter(x=>x.id!==w.id);
    saveUserTopicWords(CURRENT_TOPIC, arr);
  }
  // xoá progress
  if (PROG[w.id]){ delete PROG[w.id]; saveProgress(PROG); }

  topicData = getDataset(CURRENT_TOPIC);
  queue = [...topicData];
  totalCountEl && (totalCountEl.textContent = String(topicData.length));
  countLearned(); countDue();
  if (!queue.length) idx=0; else if (idx>=queue.length) idx=0;
  showCard(idx);
});

// ---------- Events ----------
btnShow?.addEventListener("click", ()=> cardEl?.classList.toggle("flipped"));
$("#btn-speak")?.addEventListener("click", ()=> speak(wordEl?.textContent||""));
document.querySelectorAll(".srs-buttons button").forEach(b=>{
  b.addEventListener("click", ()=>{
    const g = b.getAttribute("data-grade");
    if (g) gradeCurrent(g);
    cardEl?.classList.remove("flipped");
  });
});
$("#next")?.addEventListener("click", nextCard);
$("#prev")?.addEventListener("click", prevCard);
$("#shuffle")?.addEventListener("click", shuffle);
$("#btn-quiz")?.addEventListener("click", ()=> openQuiz(topicData));
$("#closeQuiz")?.addEventListener("click", ()=> $("#quizModal")?.classList.add("hidden"));
$("#btn-back")?.addEventListener("click", ()=> showScreen("topics"));

// ---------- Topic buttons (nếu chưa render động) ----------
document.querySelectorAll(".topic-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const t = btn.getAttribute("data-topic"); if (!t) return;
    switchTopic(t);
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
logoutBtn?.addEventListener("click", ()=> fb.auth.signOut());

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
  const out={...localObj};
  Object.keys(remoteObj).forEach(id=>{
    const a=localObj[id], b=remoteObj[id];
    if(!a) out[id]=b; else out[id]=((b?.next||0)>(a?.next||0)?b:a);
  });
  return out;
}

if (window.fb){
  fb.auth.onAuthStateChanged(async (user)=>{
    setAuthUI(!!user);
    if (!user){ showScreen("auth"); return; }
    showScreen("topics");
    PROG = loadProgressFor(getStorageKey());
    try{
      const remote = await cloudLoadProgress(user.uid);
      PROG = mergeProgress(PROG, remote);
      saveProgress(PROG);
      window.PROG = PROG;
    }catch(e){ console.warn("Load cloud failed:", e); }
    countLearned(); countDue(); peekStreak(); showCard(idx=0);
  });
}

// Save cloud mỗi lần grade
const _oldGradeCurrent = gradeCurrent;
gradeCurrent = function(grade){
  _oldGradeCurrent(grade);
  const user = window.fb?.auth?.currentUser;
  if (user){
    const prevIndex = (idx-1+queue.length)%queue.length;
    const w = queue[prevIndex];
    if (w && PROG[w.id]){
      cloudSaveOne(user.uid, w.id, PROG[w.id]).catch(e=>console.warn("Save cloud fail", e));
    }
  }
};

// ---------- Settings ----------
const settingsModal = $("#settingsModal");
const closeSettings = $("#closeSettings");
const btnSettings   = $("#btn-settings");
const voiceSelect   = $("#voiceSelect");
const rateRange     = $("#rateRange");
const rateValue     = $("#rateValue");

btnSettings?.addEventListener("click", ()=> settingsModal?.classList.remove("hidden"));
closeSettings?.addEventListener("click", ()=> settingsModal?.classList.add("hidden"));
settingsModal?.addEventListener("click", (e)=>{ if (e.target===settingsModal) settingsModal.classList.add("hidden"); });

function refreshVoiceListUI(){
  if (!voiceSelect) return;
  VOICES = speechSynthesis.getVoices() || [];
  voiceSelect.innerHTML = "";
  const englishVoices = VOICES.filter(v=>/^en(-|_)/i.test(v.lang));
  englishVoices.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v.name; opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
  const saved = localStorage.getItem(VOICE_KEY);
  if (saved && englishVoices.some(v=>v.name===saved)){
    voiceSelect.value = saved; EN_VOICE = englishVoices.find(v=>v.name===saved);
  } else if (englishVoices.length){
    voiceSelect.value = englishVoices[0].name; EN_VOICE = englishVoices[0];
  }
}
refreshVoiceListUI();
if (typeof speechSynthesis!=="undefined"){ speechSynthesis.onvoiceschanged = refreshVoiceListUI; }
voiceSelect?.addEventListener("change", ()=>{
  localStorage.setItem(VOICE_KEY, voiceSelect.value);
  EN_VOICE = VOICES.find(v=>v.name===voiceSelect.value) || EN_VOICE;
});
if (rateRange){
  rateRange.value = String(TTS_RATE);
  rateValue && (rateValue.textContent = `${TTS_RATE.toFixed(2)}×`);
  rateRange.addEventListener("input", ()=>{
    TTS_RATE = parseFloat(rateRange.value);
    localStorage.setItem(RATE_KEY, String(TTS_RATE));
    rateValue && (rateValue.textContent = `${TTS_RATE.toFixed(2)}×`);
  });
}

// ---------- Add word (to any topic) ----------
btnAddWord?.addEventListener("click", ()=>{
  // đổ danh sách topic vào select
  if (addWordTopicSel){
    addWordTopicSel.innerHTML = "";
    getAllTopics().forEach(t=>{
      const opt = document.createElement("option");
      opt.value = t.id; opt.textContent = `${t.icon||""} ${t.label}`;
      addWordTopicSel.appendChild(opt);
    });
    addWordTopicSel.value = CURRENT_TOPIC;
  }
  addWordModal?.classList.remove("hidden");
});
closeAddWord?.addEventListener("click", ()=> addWordModal?.classList.add("hidden"));
addWordModal?.addEventListener("click", (e)=>{ if (e.target===addWordModal) addWordModal.classList.add("hidden"); });

saveAddWord?.addEventListener("click", ()=>{
  const targetTopic = addWordTopicSel?.value || CURRENT_TOPIC;
  const w = {
    id: (isBuiltin(targetTopic) ? `ext-${targetTopic}-` : `u-${targetTopic}-`) + Date.now(),
    word: $("#addWordEn")?.value.trim(),
    ipa:  $("#addWordIpa")?.value.trim(),
    pos:  $("#addWordPos")?.value.trim(),
    vi:   $("#addWordVi")?.value.trim(),
    exEn: $("#addWordExEn")?.value.trim(),
    exVi: $("#addWordExVi")?.value.trim(),
  };
  if (!w.word || !w.vi){ alert("Cần nhập tối thiểu: Tiếng Anh + Nghĩa."); return; }

  if (isBuiltin(targetTopic)){
    const arr = loadExtras(targetTopic); arr.push(w); saveExtras(targetTopic, arr);
  }else{
    const arr = loadUserTopicWords(targetTopic); arr.push(w); saveUserTopicWords(targetTopic, arr);
  }

  if (CURRENT_TOPIC === targetTopic){
    topicData.push(w); queue.push(w);
    totalCountEl && (totalCountEl.textContent = String(topicData.length));
    idx = topicData.length-1; showCard(idx);
  }
  addWordModal?.classList.add("hidden");
  alert("Đã thêm từ!");
});

// ---------- First render ----------
countLearned(); countDue(); peekStreak(); showCard(idx);
