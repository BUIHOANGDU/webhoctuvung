// quiz.js — Quiz đa dạng + ưu tiên từ khó/sai + chọn phạm vi + số câu
(function(){
  // ======= Public API =======
  window.openQuiz = function(topicWords){
    const modal = document.querySelector("#quizModal");
    const root  = document.querySelector("#quizRoot");
    if (!modal || !root) return;

    // Mở modal + khóa cuộn nền
    modal.classList.remove("hidden");
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Nút đóng
    const closeBtn = document.querySelector("#closeQuiz");
    if (closeBtn) closeBtn.onclick = closeModal;

    // Đóng khi click nền (tùy chọn)
    modal.addEventListener("click", (e)=>{
      if (e.target === modal) closeModal();
    }, { once:true });

    function closeModal(){
      modal.classList.add("hidden");
      document.body.style.overflow = oldOverflow || '';
    }

    // Màn cấu hình quiz
    renderSetup();

    function renderSetup(){
      const learnedCount = getAllLearnedWords().length;
      root.innerHTML = `
        <div class="quiz-setup">
          <div style="margin-bottom:10px;color:#666">Chọn chế độ kiểm tra</div>

          <label style="display:block;margin:6px 0;">
            Phạm vi:
            <select id="quizScope" style="margin-left:6px;">
              <option value="topic">Chủ đề hiện tại (${topicWords.length} từ)</option>
              <option value="all">Tất cả đã học (${learnedCount} từ)</option>
            </select>
          </label>

          <label style="display:block;margin:6px 0;">
            Dạng câu hỏi:
            <select id="quizType" style="margin-left:6px;">
              <option value="mixed">Ngẫu nhiên</option>
              <option value="mcq">Trắc nghiệm (EN→VI)</option>
              <option value="en-vi">Anh → Việt (nhập/chọn)</option>
              <option value="vi-en">Việt → Anh (nhập/chọn)</option>
              <option value="fill">Điền từ (hiện nghĩa → gõ tiếng Anh)</option>
              <option value="writing">Ghi chữ (nghe → gõ lại)</option>
            </select>
          </label>

          <label style="display:block;margin:6px 0;">
            Số câu:
            <select id="quizCount" style="margin-left:6px;">
              <option value="10" selected>10 câu</option>
              <option value="20">20 câu</option>
              <option value="30">30 câu</option>
            </select>
          </label>

          <div style="margin-top:14px;">
            <button id="quizStart" class="primary">Bắt đầu</button>
          </div>
        </div>
      `;

      document.getElementById("quizStart").onclick = ()=>{
        const scope = /** @type {'topic'|'all'} */(document.getElementById("quizScope").value);
        const type  = /** @type {'mixed'|'mcq'|'en-vi'|'vi-en'|'fill'|'writing'} */(document.getElementById("quizType").value);
        const count = parseInt(document.getElementById("quizCount").value,10);

        // Chọn pool
        const pool = (scope === "all") ? getAllLearnedWords() : dedupeWords(topicWords);
        if (!pool.length) {
          alert("Không có từ nào trong phạm vi đã chọn.");
          return;
        }
        // Sinh đề (có trọng số ưu tiên từ khó/sai)
        const questions = buildQuestions(pool, { type, count });
        renderQuiz(questions, pool, closeModal);
      };
    }
  };

  // ======= Core building =======
  function getAllDatasets(){
    const all = []
      .concat(window.DATA_FOOD  || [])
      .concat(window.DATA_FAMILY|| [])
      .concat(window.DATA_TRAVEL|| [])
      .concat(window.DATA_SCHOOL|| [])
      .concat(window.DATA_WORK  || [])
      .concat(window.DATA_DAILY || []);
    return dedupeWords(all);
  }
  function dedupeWords(list){
    const seen = new Set();
    return (list||[]).filter(w => w && w.id && !seen.has(w.id) && seen.add(w.id));
  }
  function getAllLearnedWords(){
    const all = getAllDatasets();
    try{
      return all.filter(w => (window.PROG && window.PROG[w.id]?.learned));
    }catch{ return []; }
  }

  // === Trọng số: ưu tiên từ khó/sai ===
  function weightForWord(w){
    const rec = (window.PROG || {})[w.id] || {};
    let wgt = 1;
    wgt += (rec.againCount || 0) * 2;     // từng "Again" -> +2
    wgt += (rec.hardCount  || 0) * 1;     // từng "Hard"  -> +1
    wgt += (rec.quizWrong  || 0) * 2;     // sai trong quiz -> +2
    // Sai gần đây (7 ngày) -> +3
    if (rec.lastWrongAt && Date.now() - rec.lastWrongAt < 7*86400000) wgt += 3;
    // ease thấp coi là khó
    if ((rec.ease || 2.5) < 2) wgt += 2;

    // Chặn trần để không bị thiên lệch quá
    return Math.min(12, Math.max(1, wgt));
  }
  function weightedSample(pool, n){
    const list = [...pool];
    const res = [];
    while (res.length < Math.min(n, list.length)) {
      const total = list.reduce((s, w) => s + weightForWord(w), 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < list.length; idx++){
        r -= weightForWord(list[idx]);
        if (r <= 0) break;
      }
      res.push(list[idx]);
      list.splice(idx, 1); // bỏ phần tử đã chọn để tránh lặp
    }
    return res;
  }

  function buildQuestions(pool, opts){
    const count = Math.min(opts.count || 10, pool.length);
    const types = (opts.type === "mixed")
      ? ["mcq","fill","en-vi","vi-en","writing"]
      : [opts.type];

    // Chọn câu hỏi theo trọng số
    const bag = weightedSample(pool, count);

    const qs = [];
    for (let i=0; i<bag.length; i++){
      const w = bag[i];
      const t = types[Math.floor(Math.random()*types.length)];
      qs.push(makeQuestion(w, t, pool));
    }
    return qs;
  }

  function makeQuestion(w, type, pool){
    // Chuẩn bị lựa chọn nhiễu
    const others = shuffle(pool.filter(x=>x.id!==w.id));
    const viDistractors = uniquePick(others.map(o=>o.vi), 3, [w.vi]);
    const enDistractors = uniquePick(others.map(o=>o.word), 3, [w.word]);

    if (type === "mcq") {
      const choices = shuffle([w.vi, ...viDistractors]);
      return { type, qPrompt: w.word, answer: w.vi, choices, word: w };
    }
    if (type === "en-vi") {
      if (Math.random() < 0.5) {
        return { type: "en-vi-input", qPrompt: w.word, answer: w.vi, word: w };
      } else {
        const choices = shuffle([w.vi, ...viDistractors]);
        return { type: "en-vi-mcq", qPrompt: w.word, answer: w.vi, choices, word: w };
      }
    }
    if (type === "vi-en") {
      if (Math.random() < 0.5) {
        return { type: "vi-en-input", qPrompt: w.vi, answer: w.word, word: w };
      } else {
        const choices = shuffle([w.word, ...enDistractors]);
        return { type: "vi-en-mcq", qPrompt: w.vi, answer: w.word, choices, word: w };
      }
    }
    if (type === "fill") {
      return { type: "fill", qPrompt: w.vi, answer: w.word, word: w };
    }
    if (type === "writing") {
      return { type: "writing", qPrompt: `Gõ lại từ:`, audio: w.word, answer: w.word, word: w };
    }
    // fallback
    const choices = shuffle([w.vi, ...viDistractors]);
    return { type: "mcq", qPrompt: w.word, answer: w.vi, choices, word: w };
  }

  // ======= Rendering =======
  function renderQuiz(questions, pool, closeModal){
    const root = document.getElementById("quizRoot");
    let idx = 0, correct = 0;
    const review = []; // {q, type, user, answer, isCorrect, wordId}

    showOne();

    function showOne(){
      const q = questions[idx];
      if (!q){
        renderResult();
        return;
      }
      // UI cho 1 câu
      let html = `
        <div class="quiz-q">
          <div style="margin-bottom:6px;color:#666">
            Câu ${idx+1}/${questions.length}
          </div>
          <h3 style="margin:.2rem 0 .6rem">${escapeHTML(q.qPrompt)}</h3>
      `;

      if (q.type === "mcq" || q.type === "en-vi-mcq" || q.type === "vi-en-mcq") {
        html += `<div id="opts"></div>`;
      } else {
        html += `
          <input id="quizInput" type="text" placeholder="Nhập câu trả lời" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;margin:10px 0;">
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            ${q.type==="writing" ? `<button id="quizAudio" class="secondary">🔊 Nghe</button>` : ""}
            <button id="quizSubmit" class="primary">Trả lời</button>
          </div>
        `;
      }
      html += `</div>`;
      root.innerHTML = html;

      // Multiple choice
      if (q.choices) {
        const opts = document.getElementById("opts");
        q.choices.forEach(opt=>{
          const b = document.createElement("button");
          b.className = "secondary";
          b.style.display = "block";
          b.style.margin  = "8px 0";
          b.textContent   = opt;
          b.onclick = ()=>{
            const user = opt;
            const isOK = normalize(user) === normalize(q.answer);
            handleAnswer(isOK, user, q);
          };
          opts.appendChild(b);
        });
      } else {
        // Input submit
        const submit = document.getElementById("quizSubmit");
        const input  = document.getElementById("quizInput");
        if (q.type === "writing") {
          const audioBtn = document.getElementById("quizAudio");
          if (audioBtn && typeof window.speak === "function") {
            audioBtn.onclick = ()=> window.speak(q.audio);
          }
        }
        submit.onclick = ()=>{
          const user = (input.value || "").trim();
          const isOK = checkAnswer(user, q.answer, q.type);
          handleAnswer(isOK, user, q);
        };
        // Enter để trả lời
        input?.addEventListener("keydown", (e)=>{
          if (e.key === "Enter") {
            e.preventDefault();
            submit.click();
          }
        });
      }
    }

    function handleAnswer(isOK, user, q){
      if (isOK) correct++;
      review.push({ q: q.qPrompt, type: q.type, user, answer: q.answer, isCorrect: isOK, wordId: q.word?.id });

      // Ghi lại từ sai để lần sau ưu tiên (quizWrong + lastWrongAt)
      if (!isOK && window.PROG && q.word?.id) {
        const rec = window.PROG[q.word.id] || {};
        rec.quizWrong = (rec.quizWrong || 0) + 1;
        rec.lastWrongAt = Date.now();
        window.PROG[q.word.id] = rec;
        if (typeof window.saveProgress === "function") window.saveProgress(window.PROG);
      }

      idx++; showOne();
    }

    function renderResult(){
      const ok = correct, total = questions.length;
      const wrong = review.filter(r=>!r.isCorrect);
      root.innerHTML = `
        <div>
          <h3>Kết quả: ${ok}/${total}</h3>
          ${
            wrong.length
              ? `<details open style="margin-top:8px">
                   <summary>Xem lại câu sai (${wrong.length})</summary>
                   <div style="margin-top:8px">${wrong.map(r=>`
                     <div style="border:1px solid #eee;border-radius:8px;padding:8px;margin:6px 0">
                       <div style="color:#555">Câu hỏi: ${escapeHTML(r.q)}</div>
                       <div>Đáp án đúng: <b>${escapeHTML(r.answer)}</b></div>
                       <div>Trả lời của bạn: <i>${escapeHTML(r.user||"(trống)")}</i></div>
                     </div>
                   `).join("")}</div>
                 </details>`
              : `<p>Tuyệt! Bạn không sai câu nào 🎉</p>`
          }
          <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
            <button id="quizAgain" class="secondary">Làm lại</button>
            <button id="quizClose" class="primary">Đóng</button>
          </div>
        </div>
      `;
      document.getElementById("quizAgain").onclick = ()=> {
        const questions2 = buildQuestions(pool, { type: "mixed", count: Math.min(10, pool.length) });
        idx = 0; correct = 0; review.length = 0;
        renderQuiz(questions2, pool, closeModal);
      };
      document.getElementById("quizClose").onclick = closeModal;
    }
  }

  // ======= Helpers =======
  function normalize(s){
    return (s||"")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"") // bỏ dấu VN
      .replace(/[^a-z0-9\s'-]/g,"")                   // bỏ ký tự lạ
      .replace(/\s+/g," ")
      .trim();
  }
  function checkAnswer(user, answer, type){
    const a = normalize(answer);
    const u = normalize(user);
    if (!u) return false;
    if (u === a) return true;

    // Nới lỏng cho viết tay / fill (Levenshtein)
    const dist = lev(u, a);
    const thresh = Math.max(1, Math.floor(a.length * 0.2)); // cho phép sai ~20%
    return dist <= thresh;
  }
  function uniquePick(arr, n, blacklist=[]){
    const out = [];
    const ban = new Set(blacklist || []);
    for (let i=0; i<arr.length && out.length<n; i++){
      const v = arr[i];
      if (!ban.has(v) && !out.includes(v)) out.push(v);
    }
    return out;
  }
  function shuffle(a){
    for (let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }
  function escapeHTML(s){
    return String(s||"").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }
  // Levenshtein distance
  function lev(a, b){
    const m = a.length, n = b.length;
    const dp = Array.from({length:m+1},()=>Array(n+1).fill(0));
    for(let i=0;i<=m;i++) dp[i][0]=i;
    for(let j=0;j<=n;j++) dp[0][j]=j;
    for(let i=1;i<=m;i++){
      for(let j=1;j<=n;j++){
        const cost = a[i-1]===b[j-1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i-1][j] + 1,      // delete
          dp[i][j-1] + 1,      // insert
          dp[i-1][j-1] + cost  // substitute
        );
      }
    }
    return dp[m][n];
  }
})();
