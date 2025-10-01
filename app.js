// =============== app.js (full) ===============
// + Thêm từ vào mọi chủ đề
// + Sửa/Xoá thẻ do người dùng thêm
// + Ảnh minh hoạ (bao gồm override ảnh cho từ có sẵn)
// + Giữ nguyên SRS/TTS/Quiz/Cloud Progress

// ---------- Topic & datasets ----------
const TOPIC_KEY = "vocab_current_topic";
const LOCAL_TOPICS_KEY = "vocab_local_topics_v1";      // để mở rộng sau (topic user tạo)
const EXTRAS_PREFIX = "vocab_topic_extras__";          // từ user thêm vào topic có sẵn
const USER_TOPIC_PREFIX = "vocab_topic_words__";        // từ thuộc topic user
const IMG_OVERRIDE_PREFIX = "vocab_img_override__";     // ảnh override cho từ builtin theo topic

const BUILTIN_TOPICS = [
  { id: "food",   label: "Food & Drink", icon: "🍔" },
  { id: "family", label: "Family",        icon: "👨‍👩‍👧" },
  { id: "travel", label: "Travel",        icon: "✈️" },
  { id: "school", label: "School",        icon: "🏫" },
  { id: "work",   label: "Work",          icon: "💼" },
  { id: "daily",  label: "Daily Life",    icon: "🌞" },
  { id: "custom", label: "Thẻ của tôi",   icon: "📌" },
];

const $ = (s) => document.querySelector(s);
const isBuiltin = (id) => BUILTIN_TOPICS.some(t => t.id === id);
const getLocalTopics = () => { try { return JSON.parse(localStorage.getItem(LOCAL_TOPICS_KEY) || "[]"); } catch { return []; } };
const getAllTopics = () => [...BUILTIN_TOPICS, ...getLocalTopics()];
const topicLabel = (id) => (getAllTopics().find(x => x.id === id)?.label || id);

const loadExtras          = (topicId) => { try { return JSON.parse(localStorage.getItem(EXTRAS_PREFIX + topicId) || "[]"); } catch { return []; } };
const saveExtras          = (topicId, arr) => localStorage.setItem(EXTRAS_PREFIX + topicId, JSON.stringify(arr || []));
const loadUserTopicWords  = (topicId) => { try { return JSON.parse(localStorage.getItem(USER_TOPIC_PREFIX + topicId) || "[]"); } catch { return []; } };
const saveUserTopicWords  = (topicId, arr) => localStorage.setItem(USER_TOPIC_PREFIX + topicId, JSON.stringify(arr || []));
const loadImgOverrides    = (topicId) => { try { return JSON.parse(localStorage.getItem(IMG_OVERRIDE_PREFIX + topicId) || "{}"); } catch { return {}; } };
const saveImgOverrides    = (topicId, map) => localStorage.setItem(IMG_OVERRIDE_PREFIX + topicId, JSON.stringify(map || {}));

function getDataset(topicId){
  if (isBuiltin(topicId)){
    let base = [];
    if (topicId==="food")   base = window.DATA_FOOD   || [];
    if (topicId==="family") base = window.DATA_FAMILY || [];
    if (topicId==="travel") base = window.DATA_TRAVEL || [];
    if (topicId==="school") base = window.DATA_SCHOOL || [];
    if (topicId==="work")   base = window.DATA_WORK   || [];
    if (topicId==="daily")  base = window.DATA_DAILY  || [];
    if (topicId==="custom") base = [];
    return [...base, ...loadExtras(topicId)];
  }
  return loadUserTopicWords(topicId);
}

// ---------- Render topic buttons (nếu màn chọn chủ đề dùng #topicList) ----------
function renderTopicButtons(){
  const wrap = $("#topicList");
  if (!wrap) return;
  wrap.innerHTML = "";
  getAllTopics().forEach(t=>{
    const btn=document.createElement("button");
    btn.className="topic-btn";
    btn.dataset.topic=t.id;
    btn.textContent=`${t.icon||""} ${t.label}`;
    btn.onclick=()=>switchTopic(t.id);
    wrap.appendChild(btn);
  });
}

// ---------- Switch topic ----------
let CURRENT_TOPIC = localStorage.getItem(TOPIC_KEY) || "food";
let topicData = getDataset(CURRENT_TOPIC);
let queue = [...topicData];
let idx = 0;

// UI refs
const wordEl=$("#word"), ipaEl=$("#ipa"), posEl=$("#pos");
const meaningEl=$("#meaning"), exEnEl=$("#exEn"), exViEl=$("#exVi");
const wordImg=$("#wordImg");

const learnedCountEl=$("#learnedCount"), totalCountEl=$("#totalCount");
const dueCountEl=$("#dueCount"), streakDaysEl=$("#streakDays");
const topicTitleEl=$("#topicTitle"), topicNameEl=$("#topicName");
const cardEl=$("#card"), btnShow=$("#btn-show");

const btnDelete=$("#btn-delete"), btnEdit=$("#btn-edit");
const btnAddWord=$("#btn-addWord");

// screens
const authScreen=$("#authScreen"), topicScreen=$("#topicScreen"), studyScreen=$("#studyScreen");
function showScreen(name){
  [authScreen, topicScreen, studyScreen].forEach(x=>x?.classList.add("hidden"));
  if(name==="auth")   authScreen?.classList.remove("hidden");
  if(name==="topics") topicScreen?.classList.remove("hidden");
  if(name==="study")  studyScreen?.classList.remove("hidden");
}

function applyTopicUI(){
  topicTitleEl && (topicTitleEl.textContent = topicLabel(CURRENT_TOPIC));
  topicNameEl  && (topicNameEl.textContent  = topicLabel(CURRENT_TOPIC));
  totalCountEl && (totalCountEl.textContent = String(topicData.length));
}

function switchTopic(id){
  CURRENT_TOPIC = id;
  localStorage.setItem(TOPIC_KEY, id);
  topicData = getDataset(id);
  queue = [...topicData];
  idx = 0;
  applyTopicUI();
  PROG = loadProgressFor(getStorageKey()); window.PROG = PROG;
  countLearned(); countDue(); showCard(idx);
  showScreen("study");
}

// ---------- TTS ----------
const VOICE_KEY="vocab_tts_voice_name", RATE_KEY="vocab_tts_rate";
let VOICES=[], EN_VOICE=null, TTS_RATE=parseFloat(localStorage.getItem(RATE_KEY)||"0.95");
function refreshVoices(){
  VOICES=window.speechSynthesis?.getVoices?.()||[];
  const saved=localStorage.getItem(VOICE_KEY);
  EN_VOICE = saved? VOICES.find(v=>v.name===saved) : VOICES.find(v=>/^en(-|_)US/i.test(v.lang));
}
refreshVoices();
if (typeof speechSynthesis!=="undefined") speechSynthesis.onvoiceschanged=refreshVoices;
function speak(text){
  try{
    const u=new SpeechSynthesisUtterance(text);
    if (EN_VOICE){ u.voice=EN_VOICE; u.lang=EN_VOICE.lang||"en-US"; } else u.lang="en-US";
    u.rate=TTS_RATE; u.pitch=1;
    if (speechSynthesis?.speaking) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){ console.warn("TTS error:",e); }
}
window.speak = speak;

// ---------- Progress ----------
const STREAK_KEY="vocab_streak_day_v1";
function baseKey(){ return `vocab_progress_${CURRENT_TOPIC}_v1`; }
function getStorageKey(){ const uid=window.fb?.auth?.currentUser?.uid; return uid? `${baseKey()}__uid_${uid}`:`${baseKey()}__guest`; }
function loadProgressFor(key){
  const raw=localStorage.getItem(key);
  if(!raw){
    const init=Object.fromEntries((topicData||[]).map(w=>[w.id,{ease:2.5,interval:0,next:0,learned:false}]));
    localStorage.setItem(key, JSON.stringify(init));
    return init;
  }
  return JSON.parse(raw);
}
function saveProgress(p){ localStorage.setItem(getStorageKey(), JSON.stringify(p)); }
let PROG = loadProgressFor(getStorageKey()); window.PROG = PROG;

function todayDayNumber(){ return Math.floor(Date.now()/86400000); }
function updateStreak(){
  const day=todayDayNumber(); const raw=localStorage.getItem(STREAK_KEY);
  let d=raw?JSON.parse(raw):{last:null,streak:0};
  if (d.last!==day){ d.streak=(d.last===day-1)?d.streak+1:Math.max(1,d.streak||0); d.last=day; localStorage.setItem(STREAK_KEY,JSON.stringify(d)); }
  streakDaysEl&&(streakDaysEl.textContent=d.streak||1);
}
function peekStreak(){ const raw=localStorage.getItem(STREAK_KEY); streakDaysEl&&(streakDaysEl.textContent= raw ? (JSON.parse(raw).streak||0):0); }
function countLearned(){ learnedCountEl&&(learnedCountEl.textContent=Object.values(PROG).filter(x=>x.learned).length); }
function countDue(){ const now=Date.now(); const ids=Object.entries(PROG).filter(([,v])=>v.next<=now).map(([id])=>id); dueCountEl&&(dueCountEl.textContent=ids.length); return ids; }

// ---------- Card height auto (để lật mượt) ----------
function adjustCardHeight(){
  const inner = cardEl?.querySelector(".card-inner");
  const front = cardEl?.querySelector(".card-front");
  const back  = cardEl?.querySelector(".card-back");
  if (!inner || !front || !back) return;
  // đo mặt đang hiển thị (đã rotateY xử lý), lấy max để không giật
  const h = Math.max(front.scrollHeight, back.scrollHeight);
  inner.style.height = h + "px";
}

// ---------- Show card ----------
function imgForWord(w){
  const map = loadImgOverrides(CURRENT_TOPIC);
  return w.img || map[w.id] || "";
}
function showImage(url){
  if (!wordImg) return;
  if (url){ wordImg.src=url; wordImg.style.display="block"; }
  else { wordImg.removeAttribute("src"); wordImg.style.display="none"; }
}
function showCard(i){
  const w=queue[i];
  if (!w){
    wordEl&&(wordEl.textContent="Trống");
    ipaEl&&(ipaEl.textContent=""); posEl&&(posEl.textContent="");
    meaningEl&&(meaningEl.textContent="Bạn chưa có thẻ nào. Hãy thêm thẻ mới!");
    exEnEl&&(exEnEl.textContent=""); exViEl&&(exViEl.textContent=""); showImage("");
    adjustCardHeight();
    return;
  }
  wordEl&&(wordEl.textContent=w.word);
  ipaEl&&(ipaEl.textContent=w.ipa||"");
  posEl&&(posEl.textContent=w.pos||"");
  meaningEl&&(meaningEl.textContent=w.vi||"");
  exEnEl&&(exEnEl.textContent=w.exEn||"");
  exViEl&&(exViEl.textContent=w.exVi||"");
  showImage(imgForWord(w));
  cardEl?.classList.remove("flipped");
  // nếu ảnh load chậm, set lại chiều cao sau khi ảnh load
  if (wordImg){
    wordImg.onload = () => adjustCardHeight();
    wordImg.onerror = () => adjustCardHeight();
  }
  adjustCardHeight();
}

// ---------- SRS ----------
function gradeCurrent(grade){
  const w=queue[idx]; if(!w) return;
  const rec=PROG[w.id]||{ease:2.5,interval:0,next:0,learned:false};
  let {ease,interval}=rec;
  if (grade==="again"){interval=0; ease=Math.max(1.3,ease-0.2); rec.againCount=(rec.againCount||0)+1; rec.lastWrongAt=Date.now();}
  else if (grade==="hard"){interval=Math.max(1,Math.round((interval||1)*1.2)); ease=Math.max(1.3,ease-0.05); rec.hardCount=(rec.hardCount||0)+1; rec.lastWrongAt=Date.now();}
  else if (grade==="good"){interval=Math.max(1,Math.round((interval||1)*ease)); rec.goodCount=(rec.goodCount||0)+1;}
  else if (grade==="easy"){interval=Math.max(1,Math.round((interval||1)*(ease+0.15))); ease=Math.min(3.5,ease+0.05); rec.easyCount=(rec.easyCount||0)+1;}
  const next=Date.now()+interval*86400000;
  PROG[w.id]={...rec,ease,interval,next,learned:true}; saveProgress(PROG);
  updateStreak(); countLearned(); countDue();
  if (grade==="again"){ cardEl?.classList.remove("flipped"); showCard(idx); }
  else nextCard();
}

// ---------- Điều hướng ----------
function nextCard(){ if(!queue.length)return; idx=(idx+1)%queue.length; showCard(idx); }
function prevCard(){ if(!queue.length)return; idx=(idx-1+queue.length)%queue.length; showCard(idx); }
function shuffle(){ for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];} idx=0; showCard(idx); }

// ---------- Xoá thẻ ----------
btnDelete?.addEventListener("click", ()=>{
  const w=queue[idx]; if(!w) return;
  // Chỉ xoá được thẻ user-add (id bắt đầu ext- hoặc u-)
  if (!/^ext-|^u-/.test(w.id)){ alert("Thẻ mặc định không thể xoá."); return; }
  if (!confirm(`Xoá thẻ “${w.word}”?`)) return;

  if (isBuiltin(CURRENT_TOPIC)){
    const arr = loadExtras(CURRENT_TOPIC).filter(x=>x.id!==w.id); saveExtras(CURRENT_TOPIC,arr);
  } else {
    const arr = loadUserTopicWords(CURRENT_TOPIC).filter(x=>x.id!==w.id); saveUserTopicWords(CURRENT_TOPIC,arr);
  }
  if (PROG[w.id]){ delete PROG[w.id]; saveProgress(PROG); }

  topicData=getDataset(CURRENT_TOPIC); queue=[...topicData];
  totalCountEl&&(totalCountEl.textContent=String(topicData.length));
  countLearned(); countDue();
  if (!queue.length) idx=0; else if (idx>=queue.length) idx=0;
  showCard(idx);
});

// ---------- Events ----------
btnShow?.addEventListener("click",()=>{
  cardEl?.classList.toggle("flipped");
  // chờ khung xoay 1 tick rồi đo lại
  setTimeout(adjustCardHeight, 60);
});
$("#btn-speak")?.addEventListener("click",()=>speak(wordEl?.textContent||""));
document.querySelectorAll(".srs-buttons button").forEach(b=>b.addEventListener("click",()=>{
  const g=b.getAttribute("data-grade"); if(g) gradeCurrent(g);
  cardEl?.classList.remove("flipped");
  setTimeout(adjustCardHeight, 0);
}));
$("#next")?.addEventListener("click",nextCard);
$("#prev")?.addEventListener("click",prevCard);
$("#shuffle")?.addEventListener("click",shuffle);
$("#btn-quiz")?.addEventListener("click",()=>openQuiz(topicData));
$("#closeQuiz")?.addEventListener("click",()=>$("#quizModal")?.classList.add("hidden"));
$("#btn-back")?.addEventListener("click",()=>showScreen("topics"));

// ---------- Topic buttons (màn chọn chủ đề) ----------
function wireTopicButtons(){
  document.querySelectorAll(".topic-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> {
      const t=btn.getAttribute("data-topic"); if(!t) return;
      switchTopic(t);
    });
  });
}

// ---------- Auth ----------
const loginBtn=$("#btn-login"), logoutBtn=$("#btn-logout");
function setAuthUI(signedIn){ loginBtn?.classList.toggle("hidden",signedIn); logoutBtn?.classList.toggle("hidden",!signedIn); }
loginBtn?.addEventListener("click", async()=>{
  try{ await fb.auth.signInWithPopup(fb.googleProvider); }
  catch(e){ alert("Đăng nhập thất bại: "+e.message); }
});
logoutBtn?.addEventListener("click", ()=>fb.auth.signOut());

// ---------- Cloud ----------
async function cloudLoadProgress(uid){
  const col=fb.db.collection("userProgress").doc(uid).collection(CURRENT_TOPIC);
  const snap=await col.get(); const remote={}; snap.forEach(doc=>remote[doc.id]=doc.data()); return remote;
}
async function cloudSaveOne(uid, wordId, rec){
  const ref=fb.db.collection("userProgress").doc(uid).collection(CURRENT_TOPIC).doc(wordId);
  await ref.set(rec, { merge:true });
}
function mergeProgress(localObj, remoteObj){
  const out={...localObj}; Object.keys(remoteObj).forEach(id=>{
    const a=localObj[id], b=remoteObj[id]; out[id]= !a ? b : ((b?.next||0)>(a?.next||0)?b:a);
  }); return out;
}

// ---------- Auth flow ----------
if (window.fb){
  fb.auth.onAuthStateChanged(async (user)=>{
    setAuthUI(!!user);
    if (!user){ showScreen("auth"); return; }
    showScreen("topics");

    PROG = loadProgressFor(getStorageKey());
    try{
      const remote = await cloudLoadProgress(user.uid);
      PROG = mergeProgress(PROG, remote);
      saveProgress(PROG); window.PROG = PROG;
    }catch(e){ console.warn("Load cloud failed:", e); }

    countLearned(); countDue(); peekStreak();
    showCard(idx=0);
  });
}

// ---------- First render ----------
renderTopicButtons();
wireTopicButtons();
applyTopicUI();
countLearned(); countDue(); peekStreak(); showCard(idx=0);

// ---------- Save cloud mỗi lần grade ----------
const _oldGradeCurrent = gradeCurrent;
gradeCurrent = function (grade) {
  _oldGradeCurrent(grade);
  const user = window.fb?.auth?.currentUser;
  if (user) {
    const prevIndex = (idx - 1 + queue.length) % queue.length;
    const w = queue[prevIndex];
    if (w && PROG[w.id]) {
      cloudSaveOne(user.uid, w.id, PROG[w.id]).catch((e)=>console.warn("Save cloud fail",e));
    }
  }
};

// ---------- Settings modal ----------
const settingsModal=$("#settingsModal");
const closeSettings=$("#closeSettings");
const btnSettings=$("#btn-settings");
const voiceSelect=$("#voiceSelect");
const rateRange=$("#rateRange");
const rateValue=$("#rateValue");

btnSettings?.addEventListener("click",()=>settingsModal?.classList.remove("hidden"));
closeSettings?.addEventListener("click",()=>settingsModal?.classList.add("hidden"));
settingsModal?.addEventListener("click",(e)=>{ if (e.target===settingsModal) settingsModal.classList.add("hidden"); });

function refreshVoiceListUI(){
  if (!voiceSelect) return;
  VOICES = speechSynthesis.getVoices() || [];
  voiceSelect.innerHTML = "";
  const englishVoices = VOICES.filter(v=>/^en(-|_)/i.test(v.lang));
  englishVoices.forEach(v=>{
    const opt=document.createElement("option"); opt.value=v.name; opt.textContent=`${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
  const saved=localStorage.getItem(VOICE_KEY);
  if (saved && englishVoices.some(v=>v.name===saved)){ voiceSelect.value=saved; EN_VOICE=englishVoices.find(v=>v.name===saved); }
  else if (englishVoices.length){ voiceSelect.value=englishVoices[0].name; EN_VOICE=englishVoices[0]; }
}
refreshVoiceListUI();
if (typeof speechSynthesis!=="undefined") speechSynthesis.onvoiceschanged = refreshVoiceListUI;

voiceSelect?.addEventListener("change", ()=>{ localStorage.setItem(VOICE_KEY, voiceSelect.value); EN_VOICE = VOICES.find(v=>v.name===voiceSelect.value)||EN_VOICE; });
if (rateRange){
  rateRange.value = String(TTS_RATE);
  rateValue && (rateValue.textContent = `${TTS_RATE.toFixed(2)}×`);
  rateRange.addEventListener("input", ()=>{
    TTS_RATE = parseFloat(rateRange.value); localStorage.setItem(RATE_KEY, String(TTS_RATE));
    rateValue && (rateValue.textContent = `${TTS_RATE.toFixed(2)}×`);
  });
}

// ---------- Add / Edit Word (modal) ----------
const addWordModal=$("#addWordModal");
const closeAddWord=$("#closeAddWord");
const saveAddWord=$("#saveAddWord");
const addWordTopicSel=$("#addWordTopic");
const addWordImage=$("#addWordImage");
const addWordPreview=$("#addWordPreview");
const clearImageBtn=$("#clearImage");
const deleteWordInModal=$("#deleteWordInModal");

let EDIT_MODE = false; // false: thêm, true: sửa

function populateTopicSelect(){
  if (!addWordTopicSel) return;
  addWordTopicSel.innerHTML = "";
  getAllTopics().forEach(t=>{
    const opt=document.createElement("option");
    opt.value=t.id; opt.textContent=`${t.icon||""} ${t.label}`;
    addWordTopicSel.appendChild(opt);
  });
  addWordTopicSel.disabled=false;
  addWordTopicSel.value = CURRENT_TOPIC;
}
function fillForm(data={}){
  $("#addWordEn").value  = data.word||"";
  $("#addWordIpa").value = data.ipa||"";
  $("#addWordPos").value = data.pos||"";
  $("#addWordVi").value  = data.vi||"";
  $("#addWordExEn").value= data.exEn||"";
  $("#addWordExVi").value= data.exVi||"";
  addWordImage && (addWordImage.value = data.img||"");
  previewImage(data.img||"");
}
function previewImage(url){
  if (!addWordPreview) return;
  if (url){ addWordPreview.src=url; addWordPreview.style.display="block"; }
  else { addWordPreview.removeAttribute("src"); addWordPreview.style.display="none"; }
}
addWordImage?.addEventListener("input", ()=> previewImage(addWordImage.value.trim()));
clearImageBtn?.addEventListener("click", ()=>{ addWordImage.value=""; previewImage(""); });
function toggleDeleteInModal(show){ deleteWordInModal?.classList.toggle("hidden", !show); }

// mở modal thêm
btnAddWord?.addEventListener("click", ()=>{
  EDIT_MODE=false;
  populateTopicSelect();
  fillForm(); toggleDeleteInModal(false);
  addWordModal?.classList.remove("hidden");
});
// mở modal sửa
btnEdit?.addEventListener("click", ()=>{
  const w=queue[idx]; if(!w) return;
  EDIT_MODE=true;
  populateTopicSelect();
  addWordTopicSel.value = CURRENT_TOPIC;
  addWordTopicSel.disabled = true;

  const map = loadImgOverrides(CURRENT_TOPIC);
  fillForm({ word:w.word, ipa:w.ipa||"", pos:w.pos||"", vi:w.vi||"", exEn:w.exEn||"", exVi:w.exVi||"", img: w.img || map[w.id] || "" });
  toggleDeleteInModal(/^ext-|^u-/.test(w.id));
  addWordModal?.classList.remove("hidden");
});
// đóng modal
closeAddWord?.addEventListener("click", ()=>addWordModal?.classList.add("hidden"));
addWordModal?.addEventListener("click", (e)=>{ if (e.target===addWordModal) addWordModal.classList.add("hidden"); });
// xoá trong modal
deleteWordInModal?.addEventListener("click", ()=>{
  const w=queue[idx]; if(!w || !/^ext-|^u-/.test(w.id)) return;
  if(!confirm(`Xoá thẻ “${w.word}”?`)) return;
  if (isBuiltin(CURRENT_TOPIC)){
    saveExtras(CURRENT_TOPIC, loadExtras(CURRENT_TOPIC).filter(x=>x.id!==w.id));
  }else{
    saveUserTopicWords(CURRENT_TOPIC, loadUserTopicWords(CURRENT_TOPIC).filter(x=>x.id!==w.id));
  }
  if (PROG[w.id]){ delete PROG[w.id]; saveProgress(PROG); }
  topicData=getDataset(CURRENT_TOPIC); queue=[...topicData];
  totalCountEl&&(totalCountEl.textContent=String(topicData.length));
  countLearned(); countDue(); idx=0; showCard(idx);
  addWordModal?.classList.add("hidden");
});
// lưu (thêm mới / sửa)
saveAddWord?.addEventListener("click", ()=>{
  const targetTopic = addWordTopicSel?.value || CURRENT_TOPIC;
  const payload = {
    word: $("#addWordEn").value.trim(),
    ipa:  $("#addWordIpa").value.trim(),
    pos:  $("#addWordPos").value.trim(),
    vi:   $("#addWordVi").value.trim(),
    exEn: $("#addWordExEn").value.trim(),
    exVi: $("#addWordExVi").value.trim(),
    img:  addWordImage ? addWordImage.value.trim() : "",
  };
  if (!payload.word || !payload.vi){ alert("Cần nhập tối thiểu: Tiếng Anh + Nghĩa."); return; }

  if (!EDIT_MODE){
    const id = (isBuiltin(targetTopic)? `ext-${targetTopic}-`:`u-${targetTopic}-`) + Date.now();
    const w = { id, ...payload };
    if (isBuiltin(targetTopic)){ const arr=loadExtras(targetTopic); arr.push(w); saveExtras(targetTopic,arr); }
    else { const arr=loadUserTopicWords(targetTopic); arr.push(w); saveUserTopicWords(targetTopic,arr); }
    if (CURRENT_TOPIC===targetTopic){
      topicData.push(w); queue.push(w);
      totalCountEl&&(totalCountEl.textContent=String(topicData.length));
      idx=topicData.length-1; showCard(idx);
    }
    addWordModal?.classList.add("hidden");
    return;
  }

  // EDIT_MODE
  const cur=queue[idx]; if(!cur) return;
  if (/^ext-|^u-/.test(cur.id)){
    if (isBuiltin(CURRENT_TOPIC)){
      const arr=loadExtras(CURRENT_TOPIC); const i=arr.findIndex(x=>x.id===cur.id);
      if (i>-1){ arr[i]={...arr[i], ...payload}; saveExtras(CURRENT_TOPIC,arr); }
    }else{
      const arr=loadUserTopicWords(CURRENT_TOPIC); const i=arr.findIndex(x=>x.id===cur.id);
      if (i>-1){ arr[i]={...arr[i], ...payload}; saveUserTopicWords(CURRENT_TOPIC,arr); }
    }
  }else{
    // builtin: chỉ override ảnh (không ghi vào dataset gốc)
    const map = loadImgOverrides(CURRENT_TOPIC);
    if (payload.img) map[cur.id] = payload.img; else delete map[cur.id];
    saveImgOverrides(CURRENT_TOPIC, map);
    // có thể cho phép chỉnh text hiển thị cục bộ (không ghi file gốc)
    cur.ipa=payload.ipa; cur.pos=payload.pos; cur.vi=payload.vi; cur.exEn=payload.exEn; cur.exVi=payload.exVi;
  }
  // refresh
  topicData=getDataset(CURRENT_TOPIC); queue=[...topicData];
  const newIdx = queue.findIndex(x=>x.id===cur.id); idx = newIdx>-1? newIdx:0;
  showCard(idx);
  addWordModal?.classList.add("hidden");
});

