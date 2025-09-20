const topicData = window.DATA_FOOD || [];
const $ = (s) => document.querySelector(s);

// UI refs
const wordEl = $("#word");
const ipaEl = $("#ipa");
const posEl = $("#pos");
const meaningEl = $("#meaning");
const exEnEl = $("#exEn");
const exViEl = $("#exVi");
const cardBack = $("#cardBack");
const cardFront = $("#cardFront");
const learnedCountEl = $("#learnedCount");
const totalCountEl = $("#totalCount");
const dueCountEl = $("#dueCount");
const streakDaysEl = $("#streakDays");

let idx = 0;
let queue = [...topicData];
totalCountEl.textContent = topicData.length.toString();

// ==== Progress & streak keys ====
const TOPIC_ID = "food";
const BASE_KEY = `vocab_progress_${TOPIC_ID}_v1`;
const STREAK_KEY = "vocab_streak_day_v1";

// Helper: tạo key riêng cho từng user
function getStorageKey() {
  const uid = window.fb?.auth?.currentUser?.uid;
  return uid ? `${BASE_KEY}__uid_${uid}` : `${BASE_KEY}__guest`;
}

// Load / save local progress
function loadProgressFor(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    const init = Object.fromEntries(
      topicData.map((w) => [
        w.id,
        { ease: 2.5, interval: 0, next: 0, learned: false },
      ])
    );
    localStorage.setItem(key, JSON.stringify(init));
    return init;
  }
  return JSON.parse(raw);
}
function saveProgress(p) {
  localStorage.setItem(getStorageKey(), JSON.stringify(p));
}

// Streak
function todayDayNumber() {
  return Math.floor(Date.now() / 86400000);
}
function updateStreak() {
  const day = todayDayNumber();
  const raw = localStorage.getItem(STREAK_KEY);
  let data = raw ? JSON.parse(raw) : { last: null, streak: 0 };
  if (data.last !== day) {
    data.streak =
      data.last === day - 1 ? data.streak + 1 : Math.max(1, data.streak || 0);
    data.last = day;
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  }
  streakDaysEl.textContent = data.streak || 1;
}
function peekStreak() {
  const raw = localStorage.getItem(STREAK_KEY);
  const s = raw ? JSON.parse(raw).streak : 0;
  streakDaysEl.textContent = s || 0;
}

// TTS
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    speechSynthesis.speak(u);
  } catch (e) {}
}

// Khởi tạo progress hiện tại
let PROG = loadProgressFor(getStorageKey());

function countLearned() {
  const n = Object.values(PROG).filter((x) => x.learned).length;
  learnedCountEl.textContent = n.toString();
}
function countDue() {
  const now = Date.now();
  const idsDue = Object.entries(PROG)
    .filter(([, v]) => v.next <= now)
    .map(([id]) => id);
  dueCountEl.textContent = idsDue.length.toString();
  return idsDue;
}

function showCard(i) {
  const w = queue[i];
  if (!w) return;
  wordEl.textContent = w.word;
  ipaEl.textContent = w.ipa || "";
  posEl.textContent = w.pos || "";
  meaningEl.textContent = w.vi || "";
  exEnEl.textContent = w.exEn || "";
  exViEl.textContent = w.exVi || "";
  cardBack.classList.add("hidden");
  cardFront.classList.remove("hidden");
}

// ==== SRS grading ====
function gradeCurrent(grade) {
  const w = queue[idx];
  const rec = PROG[w.id] || { ease: 2.5, interval: 0, next: 0, learned: false };
  let { ease, interval } = rec;

  if (grade === "again") {
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else if (grade === "hard") {
    interval = Math.max(1, Math.round((interval || 1) * 1.2));
    ease = Math.max(1.3, ease - 0.05);
  } else if (grade === "good") {
    interval = Math.max(1, Math.round((interval || 1) * ease));
  } else if (grade === "easy") {
    interval = Math.max(1, Math.round((interval || 1) * (ease + 0.15)));
    ease = Math.min(3.5, ease + 0.05);
  }

  const next = Date.now() + interval * 86400000;
  PROG[w.id] = { ease, interval, next, learned: true };
  saveProgress(PROG);
  updateStreak();
  countLearned();
  countDue();

  nextCard();
}

function nextCard() {
  idx = (idx + 1) % queue.length;
  showCard(idx);
}
function prevCard() {
  idx = (idx - 1 + queue.length) % queue.length;
  showCard(idx);
}
function shuffle() {
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  idx = 0;
  showCard(idx);
}

// Events
$("#btn-show").addEventListener("click", () => {
  cardFront.classList.add("hidden");
  cardBack.classList.remove("hidden");
});
$("#btn-speak").addEventListener("click", () => speak(wordEl.textContent));
document
  .querySelectorAll(".srs-buttons button")
  .forEach((btn) =>
    btn.addEventListener("click", () => gradeCurrent(btn.dataset.grade))
  );
$("#next").addEventListener("click", nextCard);
$("#prev").addEventListener("click", prevCard);
$("#shuffle").addEventListener("click", shuffle);
$("#btn-home").addEventListener("click", () =>
  document.querySelector(".card").scrollIntoView({ behavior: "smooth" })
);
$("#btn-review").addEventListener("click", () => {
  const dueIds = countDue();
  if (dueIds.length) {
    const firstId = dueIds[0];
    const pos = queue.findIndex((w) => w.id === firstId);
    if (pos >= 0) {
      idx = pos;
      showCard(idx);
    }
  }
});
$("#btn-quiz").addEventListener("click", () => openQuiz(topicData));
document
  .querySelector("#closeQuiz")
  .addEventListener("click", () =>
    document.querySelector("#quizModal").classList.add("hidden")
  );

// Init
showCard(idx);
countLearned();
countDue();
peekStreak();

/* ===== Firebase Auth + Sync ===== */
const loginBtn = document.querySelector("#btn-login");
const logoutBtn = document.querySelector("#btn-logout");

function setAuthUI(signedIn) {
  if (!loginBtn || !logoutBtn) return;
  if (signedIn) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    logoutBtn.classList.add("hidden");
    loginBtn.classList.remove("hidden");
  }
}

if (window.fb) {
  loginBtn?.addEventListener("click", async () => {
    try {
      await fb.auth.signInWithPopup(fb.googleProvider);
    } catch (e) {
      alert("Đăng nhập thất bại: " + e.message);
    }
  });
  logoutBtn?.addEventListener("click", () => fb.auth.signOut());
}

// Cloud helpers
async function cloudLoadProgress(uid) {
  const col = fb.db.collection("userProgress").doc(uid).collection(TOPIC_ID);
  const snap = await col.get();
  const remote = {};
  snap.forEach((doc) => (remote[doc.id] = doc.data()));
  return remote;
}
async function cloudSaveOne(uid, wordId, rec) {
  const ref = fb.db
    .collection("userProgress")
    .doc(uid)
    .collection(TOPIC_ID)
    .doc(wordId);
  await ref.set(rec, { merge: true });
}
function mergeProgress(localObj, remoteObj) {
  const out = { ...localObj };
  Object.keys(remoteObj).forEach((id) => {
    const a = localObj[id], b = remoteObj[id];
    if (!a) out[id] = b;
    else out[id] = (b?.next || 0) > (a?.next || 0) ? b : a;
  });
  return out;
}

if (window.fb) {
  fb.auth.onAuthStateChanged(async (user) => {
    setAuthUI(!!user);
    // load lại local cho đúng user
    PROG = loadProgressFor(getStorageKey());

    if (user) {
      try {
        const remote = await cloudLoadProgress(user.uid);
        PROG = mergeProgress(PROG, remote);
        saveProgress(PROG);
      } catch (e) {
        console.warn("Load cloud failed:", e);
      }
    }

    countLearned();
    countDue();
    peekStreak();
    showCard(idx);
  });
}

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
