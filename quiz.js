function openQuiz(words){
  const root = document.querySelector("#quizRoot");
  const modal = document.querySelector("#quizModal");
  modal.classList.remove("hidden");
  root.innerHTML = "";

  const pool = [...words];
  shuffle(pool);
  const questions = pool.slice(0, Math.min(10, pool.length));

  let score = 0, qIndex = 0;

  function render(){
    if(qIndex >= questions.length){
      root.innerHTML = `<h3>Kết quả: ${score}/${questions.length}</h3>`;
      return;
    }
    const q = questions[qIndex];
    const others = words.filter(w=>w.id!==q.id);
    shuffle(others);
    const options = [q.vi, ...others.slice(0,3).map(o=>o.vi)];
    shuffle(options);

    root.innerHTML = `
      <div>
        <div style="margin-bottom:6px;color:#666">Câu ${qIndex+1}/${questions.length}</div>
        <h2>${q.word}</h2>
        <div id="opts"></div>
      </div>`;
    const opts = document.querySelector("#opts");
    options.forEach(opt=>{
      const b = document.createElement("button");
      b.textContent = opt;
      b.className="secondary";
      b.style.display="block"; b.style.margin="8px 0";
      b.onclick=()=>{ if(opt===q.vi) score++; qIndex++; render(); };
      opts.appendChild(b);
    });
  }
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
  document.querySelector("#closeQuiz").onclick = ()=>modal.classList.add("hidden");
  render();
}
window.openQuiz = openQuiz;
