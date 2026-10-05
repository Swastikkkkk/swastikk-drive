/* Daily Typing Race
   Your keyboard drives the car round one lap. Everyone gets the same sentence each UTC day (TYPING_POOL, in a
   fixed permutation so nothing repeats until the pool runs out), on the same ~490 m lap; only the weather and time
   of day change. The sentence stays hidden until you press Start, and the clock starts on your first key. The car's
   place on the lap is the share of the sentence you have typed correctly, chased smoothly, so typing faster is
   driving faster and the last letter takes it over the line. A wrong key never sends you back; it slows the car for
   a moment. The time goes on today's typing board. The car is the game's own, moved through window.GameBridge. */
(function(){
  'use strict';
  const POOL=window.TYPING_POOL||[];
  const G=()=>window.GameBridge;
  const WINDOW_S=4;let PENALTY_MS=700;   // live WPM over the last 4 s; a wrong key slows the car for 0.7 s
  const MAX_WPM=220;                       // above this a run is not believable and is not submitted

  /* ---------- today's sentence ---------- */
  function dayNum(){const n=new Date();return Math.floor(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate())/864e5)}
  function todaysText(){if(!POOL.length)return 'The quick brown fox jumps over the lazy dog.';
    // 61 is coprime with the pool size unless it is a multiple of 61, so this walks every sentence once per cycle
    const L=POOL.length,k=L%61===0?67:61;return POOL[((dayNum()*k)%L+L)%L]}
  const norm=c=>c==='’'||c==='‘'?"'":c==='“'||c==='”'?'"':c===' '?' ':c;

  /* ---------- styles (scoped to this mode) ---------- */
  const css=document.createElement('style');css.textContent=`
  #dtype{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(820px,calc(100% - 32px));z-index:30;display:none;
    color:#eef0f3;font-family:var(--mono,ui-monospace,monospace);pointer-events:auto}
  #dtype.on{display:block;animation:dtyIn .45s cubic-bezier(.2,.8,.2,1)}
  @keyframes dtyIn{from{opacity:0;transform:translate(-50%,18px)}to{opacity:1;transform:translate(-50%,0)}}
  #dtype .ty-card{background:linear-gradient(180deg,rgba(14,15,17,.62),rgba(8,8,9,.74));border:1px solid rgba(238,240,243,.12);border-radius:18px;
    box-shadow:0 24px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);padding:12px 16px 12px;overflow:hidden;position:relative}
  #dtype .ty-bar{position:absolute;left:0;top:0;height:3px;width:0;background:linear-gradient(90deg,#4d8dff,#b5d0ff);box-shadow:0 0 14px rgba(77,141,255,.8);transition:width .12s linear}
  #dtype .ty-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
  #dtype .ty-tag{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#4d8dff}
  #dtype .ty-x{background:transparent;border:1px solid rgba(238,240,243,.18);color:rgba(238,240,243,.7);border-radius:999px;font:500 10px var(--mono,monospace);letter-spacing:.14em;padding:5px 11px;cursor:pointer;text-transform:uppercase}
  #dtype .ty-x:hover{color:#fff;border-color:rgba(238,240,243,.5)}
  #dtype .ty-text{font:500 clamp(18px,2vw,26px)/1.45 var(--mono,ui-monospace,monospace);letter-spacing:.01em;word-break:break-word;min-height:1.5em}
  #dtype .ty-text span{transition:color .08s}
  #dtype .ty-text .d{color:#eef0f3;text-shadow:0 0 18px rgba(77,141,255,.25)}
  #dtype .ty-text .t{color:rgba(238,240,243,.32)}
  #dtype .ty-text .c{color:#fff;background:#4d8dff;border-radius:3px;box-shadow:0 0 0 2px rgba(77,141,255,.25);animation:dtyBlink 1s steps(2) infinite}
  #dtype .ty-text .c.err{background:#e5484d;color:#fff;animation:dtyShake .18s}
  @keyframes dtyBlink{50%{box-shadow:0 0 0 2px rgba(77,141,255,.05)}}
  @keyframes dtyShake{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
  #dtype.err .ty-card{border-color:rgba(229,72,77,.55)}
  #dtype .ty-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(238,240,243,.08)}
  #dtype .ty-st b{display:block;font:600 clamp(15px,1.6vw,19px)/1 var(--serif,Georgia,serif);color:#fff;font-variant-numeric:tabular-nums}
  #dtype .ty-st span{display:block;margin-top:3px;font-size:8px;letter-spacing:.24em;text-transform:uppercase;color:rgba(238,240,243,.45)}
  #dtype .ty-st.speed b{color:#8db7ff}
  #dtype input{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;left:0;top:0}
  #dtype .ty-kbwrap{display:flex;justify-content:center;margin-top:10px}
  #dtype.nokb .ty-kbwrap{display:none}
  /* Type Faster: a smaller panel so the car stays in view; three lines show, the text scrolls with the cursor */
  #dtype.fast .ty-text{font-size:clamp(15px,1.45vw,21px);max-height:calc(1.45em * 3);overflow:hidden;scroll-behavior:smooth}
  #dtype.fast .ty-card{padding:10px 14px}
  #dtype.fast .ty-stats{margin-top:6px;padding-top:6px}
  #dtype .tkb{--k:clamp(15px,1.65vw,23px);background:rgba(17,18,21,.55)}
  @media (max-width:760px),(pointer:coarse){#dtype .ty-kbwrap{display:none}}
  #dtypecd{position:absolute;inset:0;z-index:31;display:none;place-items:start center;padding-top:9vh;pointer-events:none}
  #dtypecd.on{display:grid}
  #dtypecd b{font:700 clamp(64px,13vw,170px)/1 var(--serif,Georgia,serif);color:#fff;letter-spacing:-.03em;text-shadow:0 10px 60px rgba(0,0,0,.6)}
  #dtypecd b.go{color:#8db7ff}
  #dtypecd small{display:block;text-align:center;font:500 12px var(--mono,monospace);letter-spacing:.4em;color:rgba(238,240,243,.75);margin-top:10px;text-transform:uppercase}
  #dtypecd .pop{animation:dtyPop .8s cubic-bezier(.2,.8,.2,1)}
  @keyframes dtyPop{0%{opacity:0;transform:scale(1.6)}25%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.92)}}
  #dtypelines{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .25s;
    background:repeating-conic-gradient(from 0deg at 50% 46%,rgba(255,255,255,.0) 0deg,rgba(255,255,255,.0) 3.2deg,rgba(255,255,255,.11) 3.6deg,rgba(255,255,255,0) 4deg);
    -webkit-mask:radial-gradient(circle at 50% 46%,transparent 0 26%,#000 62%);mask:radial-gradient(circle at 50% 46%,transparent 0 26%,#000 62%)}
  #dtyperes{position:absolute;inset:0;z-index:40;display:none;place-items:center;background:radial-gradient(ellipse at 50% 30%,rgba(10,18,40,.55),rgba(6,6,7,.92));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:20px;overflow-y:auto}
  #dtyperes.on{display:grid;animation:dtyIn2 .5s cubic-bezier(.2,.8,.2,1)}
  @keyframes dtyIn2{from{opacity:0}to{opacity:1}}
  #dtyperes .rs{width:min(560px,100%);text-align:center;color:#eef0f3}
  #dtyperes .rs-k{font:500 11px var(--mono,monospace);letter-spacing:.34em;color:#4d8dff;text-transform:uppercase}
  #dtyperes h2{font:700 clamp(40px,7vw,72px)/1 var(--serif,Georgia,serif);margin:8px 0 6px;letter-spacing:-.03em}
  #dtyperes .rs-badge{display:inline-block;margin:6px 0 4px;padding:7px 14px;border-radius:999px;font:600 11px var(--mono,monospace);letter-spacing:.16em;text-transform:uppercase}
  #dtyperes .rs-badge.pb{background:rgba(77,141,255,.16);color:#b5d0ff;border:1px solid rgba(77,141,255,.4)}
  #dtyperes .rs-badge.one{background:rgba(77,141,255,.18);color:#8db7ff;border:1px solid rgba(77,141,255,.5)}
  #dtyperes .rs-time{font:700 clamp(54px,10vw,96px)/1 var(--serif,Georgia,serif);letter-spacing:-.03em;margin:14px 0 2px;font-variant-numeric:tabular-nums;
    background:linear-gradient(180deg,#fff,#b5d0ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  #dtyperes .rs-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0 18px}
  #dtyperes .rs-grid div{background:rgba(238,240,243,.05);border:1px solid rgba(238,240,243,.1);border-radius:14px;padding:14px 6px}
  #dtyperes .rs-grid b{display:block;font:600 24px/1 var(--serif,Georgia,serif);font-variant-numeric:tabular-nums}
  #dtyperes .rs-grid span{display:block;margin-top:6px;font:500 9px var(--mono,monospace);letter-spacing:.22em;color:rgba(238,240,243,.5);text-transform:uppercase}
  #dtyperes .rs-note{font:500 11px var(--mono,monospace);color:rgba(238,240,243,.55);min-height:1.4em;letter-spacing:.06em}
  #dtyperes .rs-btns{display:flex;gap:10px;margin-top:16px}
  #dtyperes .rs-btns button{flex:1;padding:14px;border-radius:12px;border:1px solid rgba(238,240,243,.18);font:600 12px var(--mono,monospace);letter-spacing:.16em;text-transform:uppercase;cursor:pointer;background:rgba(238,240,243,.06);color:#eef0f3}
  #dtyperes .rs-btns button.pri{background:linear-gradient(180deg,#6aa2ff,#2f6ff0);color:#140f04;border-color:transparent}
  #drive.typing #dmob,#drive.typing .dbr,#drive.typing #dhint,#drive.typing #dauto,#drive.typing #dnav{display:none!important}
  /* daily modal tabs */
  .ty-tabs{display:flex;gap:6px;padding:4px;background:rgba(238,240,243,.06);border:1px solid rgba(238,240,243,.1);border-radius:12px;margin-bottom:16px}
  .ty-tabs button{flex:1;padding:10px 8px;border:0;border-radius:9px;background:transparent;color:rgba(238,240,243,.6);font:600 11px var(--mono,monospace);letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
  .ty-tabs button.on{background:#eef0f3;color:#0b0b0a}
  .ty-pane ol{list-style:none;margin:0 0 18px;padding:0;border-top:1px solid rgba(238,240,243,.1);max-height:230px;overflow-y:auto}
  .ty-pane li{display:grid;grid-template-columns:38px 1fr 76px 52px 56px;gap:8px;align-items:center;padding:9px 4px;border-bottom:1px solid rgba(238,240,243,.07);font:500 13px var(--mono,monospace)}
  .ty-pane li.h{font-size:9px;letter-spacing:.2em;color:rgba(238,240,243,.45);padding:7px 4px}
  .ty-pane li.me{background:rgba(77,141,255,.14)}
  .ty-pane li .r{color:#4d8dff;font-weight:700}.ty-pane li .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--serif,Georgia,serif);font-size:15px}
  .ty-pane li .num{text-align:right;font-variant-numeric:tabular-nums}
  @media (max-width:640px){#dtype .ty-stats{grid-template-columns:repeat(3,1fr)}#dtype .ty-st.hide-s{display:none}#dtyperes .rs-grid{grid-template-columns:repeat(2,1fr)}
    .ty-pane li{grid-template-columns:30px 1fr 64px 44px;font-size:12px}.ty-pane li .acc{display:none}}`;
  document.head.appendChild(css);

  const sec=document.getElementById('drive')||document.body;
  const mk=(tag,attrs,html)=>{const e=document.createElement(tag);Object.assign(e,attrs||{});if(html!=null)e.innerHTML=html;return e};

  /* ---------- race HUD ---------- */
  const hud=mk('div',{id:'dtype'},`<div class="ty-card"><div class="ty-bar"></div>
      <div class="ty-head"><span class="ty-tag">Daily Typing Race</span><span style="display:flex;gap:8px"><button class="ty-x ty-snd" type="button">Sound on</button><button class="ty-x" type="button" data-q="1">Quit · Esc</button></span></div>
      <div class="ty-text" aria-live="off"></div>
      <div class="ty-stats">
        <div class="ty-st speed"><b data-k="kmh">0</b><span>km/h</span></div>
        <div class="ty-st"><b data-k="wpm">0</b><span>WPM</span></div>
        <div class="ty-st"><b data-k="acc">100%</b><span>Accuracy</span></div>
        <div class="ty-st hide-s"><b data-k="prog">0%</b><span>Progress</span></div>
        <div class="ty-st hide-s"><b data-k="time">0.00s</b><span>Time</span></div>
      </div></div>
      <input type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" aria-label="Type the sentence">`);
  const cd=mk('div',{id:'dtypecd'}),lines=mk('div',{id:'dtypelines'}),res=mk('div',{id:'dtyperes'});
  sec.appendChild(lines);sec.appendChild(hud);sec.appendChild(cd);sec.appendChild(res);
  const input=hud.querySelector('input'),textEl=hud.querySelector('.ty-text'),bar=hud.querySelector('.ty-bar'),stat={};
  hud.querySelectorAll('[data-k]').forEach(b=>stat[b.dataset.k]=b);
  hud.querySelector('[data-q]').onclick=()=>quit();
  // the keyboard under the stats (assets/typing-keyboard.js); hidden on phones, which bring their own
  const KB=window.TypingKeyboard;
  if(KB){const wrap=document.createElement('div');wrap.className='ty-kbwrap';hud.querySelector('.ty-card').appendChild(wrap);KB.mount(wrap);
    const sb=hud.querySelector('.ty-snd'),paintS=()=>{sb.textContent=KB.sound?'Sound on':'Sound off'};paintS();sb.onclick=()=>{KB.sound=!KB.sound;paintS();setTimeout(()=>input.focus(),0)}}
  else hud.querySelector('.ty-snd').style.display='none';
  hud.querySelector('.ty-card').addEventListener('pointerdown',()=>setTimeout(()=>input.focus(),0));

  /* ---------- state ---------- */
  let mode='daily',tfOpts=null;   // 'daily' (the shared sentence and board) or 'fast' (Type Faster practice)
  let st='idle',text='',spans=[],pos=0,keys=0,correct=0,errors=0,t0=0,stamps=[],penaltyTill=0,maxKmh=0,raf=0,rejected='',cdTimers=[];
  const now=()=>performance.now();

  function paintText(errAt){
    for(let i=0;i<spans.length;i++){const cls=i<pos?'d':i===pos?'c':'t';const sp=spans[i];if(sp.className!==cls)sp.className=cls}
    if(KBR())KBR().hint(text[pos]);
    // keep the line being typed in view (Type Faster shows three lines of a longer text)
    if(mode==='fast'&&spans[pos]){const lh=spans[pos].offsetHeight||24,y=spans[pos].offsetTop-textEl.offsetTop;if(y-textEl.scrollTop>lh*1.2||y<textEl.scrollTop)textEl.scrollTop=Math.max(0,y-lh)}
    if(errAt!=null&&spans[pos]){spans[pos].classList.add('err');hud.classList.add('err');clearTimeout(paintText._t);paintText._t=setTimeout(()=>{hud.classList.remove('err');if(spans[pos])spans[pos].classList.remove('err')},220)}}
  function buildText(){textEl.innerHTML='';spans=[...text].map(ch=>{const s=document.createElement('span');s.textContent=ch;textEl.appendChild(s);return s});paintText()}

  /* ---------- typing ---------- */
  const KBR=()=>window.TypingKeyboard;
  function onChar(ch,t){
    if(st==='ready'){st='racing';t0=t;cd.classList.remove('on')}   // the clock starts on your first key, not on a countdown
    if(st!=='racing')return;ch=norm(ch);keys++;if(KBR())KBR().flashChar(ch);
    if(ch===text[pos]){pos++;correct++;stamps.push(t);paintText();G().typeTarget(pos/text.length);if(pos>=text.length)finish(t)}
    else{errors++;penaltyTill=t+PENALTY_MS;G().typePenalty(PENALTY_MS);if(KBR())KBR().miss(ch);paintText(true);try{G().shake(.18)}catch(e){}}}
  input.addEventListener('input',e=>{
    const v=input.value;input.value='';
    if(!e.isTrusted||(st!=='racing'&&st!=='ready'))return;
    const kind=e.inputType||'';
    if(/paste|drop|Replacement|Yank/i.test(kind)){toast('Pasting is switched off · type it');return}
    // a keyboard sends one character at a time; a whole word at once is autocomplete or a macro
    if(v.length>2&&!/Composition/i.test(kind)){rejected=rejected||'multi-character input';}
    const t=now();for(const ch of v)onChar(ch,t)});
  input.addEventListener('paste',e=>{e.preventDefault();toast('Pasting is switched off · type it')});
  input.addEventListener('drop',e=>e.preventDefault());
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();quit()}});
  input.addEventListener('blur',()=>{if(st==='racing'||st==='ready')setTimeout(()=>{if(st==='racing'||st==='ready')input.focus()},50)});

  /* ---------- the speed model ---------- */
  function rollingWpm(t){const from=t-WINDOW_S*1000;let n=0;for(let i=stamps.length-1;i>=0&&stamps[i]>=from;i--)n++;
    const span=Math.max(1,Math.min(WINDOW_S,(t-t0)/1000));return n/5/(span/60)}
  function frame(){
    raf=requestAnimationFrame(frame);if(st!=='racing'&&st!=='done')return;
    const t=now(),el=(st==='done'?doneT:t)-t0,b=G(),sp=b.typeSpeedKmh();   // the car's real pace round the lap
    maxKmh=Math.max(maxKmh,sp);
    const mins=Math.max(1/60,el/60000),wpm=correct/5/mins,acc=keys?correct/keys*100:100;
    stat.kmh.textContent=Math.round(sp);stat.wpm.textContent=Math.round(st==='racing'?rollingWpm(t):wpm);
    stat.acc.textContent=acc.toFixed(acc>=99.95?0:1)+'%';stat.prog.textContent=Math.round(pos/text.length*100)+'%';stat.time.textContent=(el/1000).toFixed(2)+'s';
    bar.style.width=(pos/text.length*100)+'%';
    // speed reads as speed: streaks past 90 km/h, a little shake near the top end
    lines.style.opacity=String(Math.max(0,Math.min(.85,(sp-85)/90)));
    if(sp>150&&Math.random()<.25)b.shake(.06)}

  /* ---------- flow ---------- */
  function toast(m){try{G().toast(m)}catch(e){}}
  function start(opts){
    const b=G();if(!b){alert('The game is still loading');return}
    opts=opts&&opts.text?opts:null;mode=opts?'fast':'daily';tfOpts=opts;
    closeResults();text=opts?opts.text:todaysText();pos=keys=correct=errors=0;stamps=[];maxKmh=0;penaltyTill=0;rejected='';
    PENALTY_MS=opts?opts.penalty:700;
    hud.querySelector('.ty-tag').textContent=opts?'Type Faster · '+opts.label:'Daily Typing Race';
    hud.classList.toggle('nokb',!!(opts&&!opts.keyboard));hud.classList.toggle('fast',!!opts);
    b.toTypingLap(dayNum(),opts?text.length*7:0);buildText();sec.classList.add('typing');hud.classList.add('on');
    const dm=document.getElementById('ddaily-modal');if(dm)dm.style.display='none';
    stat.kmh.textContent='0';stat.wpm.textContent='0';stat.acc.textContent='100%';stat.prog.textContent='0%';stat.time.textContent='0.00s';bar.style.width='0';
    // no countdown: the car waits on the line and the clock starts with your first key
    st='ready';t0=0;input.value='';input.focus();if(KBR()){KBR().active=true;KBR().hint(text[0])}
    cd.innerHTML='<div><b style="font-size:clamp(28px,4vw,44px)">Start typing</b></div>';cd.classList.add('on');
    if(!raf)raf=requestAnimationFrame(frame)}
  let doneT=0;
  function finish(t){st='done';doneT=t;lines.style.opacity='0';if(KBR())KBR().active=false;
    const ms=Math.round(t-t0),acc=correct/keys*100,wpm=correct/5/(ms/60000);
    // fairness: believable speed, real keystrokes, not a stream of key events spaced by a machine
    let fast=0;for(let i=1;i<stamps.length;i++)if(stamps[i]-stamps[i-1]<12)fast++;
    if(!rejected&&wpm>MAX_WPM)rejected='faster than any human typist';
    if(!rejected&&stamps.length>8&&fast/stamps.length>.2)rejected='key timing looked automated';
    if(!rejected&&keys<text.length)rejected='keystrokes missing';
    const r={ms,acc,wpm,chars:text.length,keys,maxKmh:Math.round(maxKmh)},t1=now();
    // the result appears as the car crosses the line (it chases your last letter for a moment)
    (function wait(){if(G().typeU()>=1||now()-t1>2500)setTimeout(()=>mode==='fast'?showFastResults(r):showResults(r),600);else requestAnimationFrame(wait)})()}
  function quit(){if(st==='idle')return;st='idle';cdTimers.forEach(clearTimeout);cd.classList.remove('on');hud.classList.remove('on');sec.classList.remove('typing');
    lines.style.opacity='0';if(KBR())KBR().active=false;try{G().typeEnd()}catch(e){}input.blur()}

  /* ---------- leaderboard (Supabase typing_times; the database re-checks every stat) ---------- */
  const Board={
    url(){const s=G()&&G().supa;return s?s.url+'/rest/v1/typing_times':null},
    head(){const k=G().supa.key;return {'Content-Type':'application/json',apikey:k,Authorization:'Bearer '+k}},
    async fetch(day){try{const u=this.url();if(!u)return null;const r=await fetch(u+'?select=name,ms,wpm,acc&day=eq.'+day+'&order=ms.asc&limit=300',{headers:this.head()});if(!r.ok)return null;
      const best=new Map();(await r.json()).forEach(x=>{const k=String(x.name).toLowerCase();if(!best.has(k))best.set(k,x)});return [...best.values()]}catch(e){return null}},
    async submit(rec){try{const u=this.url();if(!u)return false;const r=await fetch(u,{method:'POST',headers:Object.assign({Prefer:'return=minimal'},this.head()),body:JSON.stringify(rec)});return r.ok}catch(e){return false}}};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const myName=()=>{const n=G()&&G().name();return n||'Driver'};

  async function showResults(r){
    const day=G().day(),pbKey='sl_type_pb_'+day;let pb=0;try{pb=+localStorage.getItem(pbKey)||0}catch(e){}
    const newPb=!rejected&&(!pb||r.ms<pb);if(newPb)try{localStorage.setItem(pbKey,String(r.ms))}catch(e){}
    res.innerHTML=`<div class="rs"><div class="rs-k">Daily Typing Race · ${day}</div><h2>🏁 Finished!</h2>
      <div class="rs-badges"></div><div class="rs-time">${(r.ms/1000).toFixed(2)}s</div>
      <div class="rs-grid"><div><b>${Math.round(r.wpm)}</b><span>WPM</span></div><div><b>${r.acc.toFixed(1)}%</b><span>Accuracy</span></div>
        <div><b>${r.maxKmh}</b><span>Max km/h</span></div><div><b class="rs-pos">…</b><span>Today</span></div></div>
      <div class="rs-note"></div>
      <div class="rs-btns"><button class="rs-board" type="button">View leaderboard</button><button class="pri rs-again" type="button">Try again</button></div></div>`;
    res.classList.add('on');
    const badges=res.querySelector('.rs-badges'),note=res.querySelector('.rs-note'),posEl=res.querySelector('.rs-pos');
    res.querySelector('.rs-again').onclick=()=>{closeResults();start()};
    res.querySelector('.rs-board').onclick=()=>{closeResults();quit();openDaily('type')};
    if(newPb)badges.innerHTML+='<span class="rs-badge pb">🔥 New personal best!</span> ';
    if(rejected){note.textContent='Not submitted: '+rejected+'.';posEl.textContent='—';return}
    note.textContent='Saving to today\'s board…';
    const rec={day,name:myName().slice(0,24),ms:r.ms,wpm:+r.wpm.toFixed(1),acc:+r.acc.toFixed(1),chars:r.chars,keys:r.keys,max_kmh:r.maxKmh};
    const ok=await Board.submit(rec);
    const rows=await Board.fetch(day);
    note.textContent=ok?'Saved to the global board for '+day+' (UTC).':'Could not reach the board · your best is kept on this device.';
    if(rows){const mine=myName().toLowerCase(),others=rows.filter(x=>String(x.name).toLowerCase()!==mine),myBest=Math.min(r.ms,...rows.filter(x=>String(x.name).toLowerCase()===mine).map(x=>x.ms));
      const place=others.filter(x=>x.ms<myBest).length+1;posEl.textContent='#'+place;
      if(place===1&&r.ms===myBest)badges.innerHTML+='<span class="rs-badge one">🏆 You are today\'s fastest typer!</span>'}
    else posEl.textContent='—'}
  function closeResults(){res.classList.remove('on')}

  /* ---------- the Daily modal: Track of the Day | Typing Race ---------- */
  const modal=document.getElementById('ddaily-modal'),inner=modal&&modal.querySelector('.bd-in');
  let pane=null,tabBtns=[];
  if(inner){
    const orig=[...inner.children];
    const tabs=mk('div',{className:'ty-tabs'},'<button type="button" data-t="track" class="on">Track of the Day</button><button type="button" data-t="type">🏎️ Typing Race</button>');
    inner.prepend(tabs);tabBtns=[...tabs.children];
    pane=mk('div',{className:'ty-pane'},`<div class="mono" style="color:#4d8dff">Daily Typing Race</div>
      <h3 class="disp" style="font-size:34px;margin:4px 0 6px">Race with your keyboard</h3>
      <div class="mono" style="color:var(--bone);margin-bottom:6px">Today's typing leaderboard</div><ol></ol>
      <div style="display:flex;gap:10px"><button type="button" class="dbtn mono ty-go" style="background:#4d8dff;color:#06070b;font-weight:700;flex:1">Start typing race</button>
      <button type="button" class="dbtn mono ty-close bd-x" style="margin-top:0">Close</button></div>`);
    pane.style.display='none';inner.appendChild(pane);
    pane.querySelector('.ty-go').onclick=()=>start();
    pane.querySelector('.ty-close').onclick=()=>{modal.style.display='none'};
    // the Daily modal has its own addresses: /daily (track) and /daily/typer (typing race), so either can be shared
    const setPath=p=>{try{if(location.pathname!==p)history.replaceState(null,'',p+location.search+location.hash)}catch(_){}};
    const show=t=>{setPath(t==='type'?'/daily/typer':'/daily');tabBtns.forEach(b=>b.classList.toggle('on',b.dataset.t===t));orig.forEach(e=>e.style.display=t==='type'?'none':'');pane.style.display=t==='type'?'':'none';if(t==='type')renderPane()};
    tabBtns.forEach(b=>b.onclick=()=>show(b.dataset.t));
    window.__dailyTab=show;
    // every time the Daily modal opens it starts on the track tab
    new MutationObserver(()=>{if(modal.style.display!=='none'&&!modal._ty){modal._ty=1;show(modal._want||'track');modal._want=null}if(modal.style.display==='none'){modal._ty=0;if(/^\/daily/.test(location.pathname))setPath(document.getElementById('dlanding')&&document.getElementById('dlanding').style.display!=='none'?'/':'/play')}}).observe(modal,{attributes:true,attributeFilter:['style']})}
  function openDaily(tab){const b=document.getElementById('dmdaily');if(modal)modal._want=tab;if(b)b.click();else if(modal)modal.style.display='grid'}
  async function renderPane(){if(!pane)return;
    const day=(G()&&G().day())||new Date().toISOString().slice(0,10),ol=pane.querySelector('ol');
    const head='<li class="h"><span>#</span><span>Player</span><span class="num">Time</span><span class="num">WPM</span><span class="num acc">Acc</span></li>';
    ol.innerHTML=head+'<li><span></span><span style="opacity:.5">Loading…</span></li>';
    const rows=await Board.fetch(day),me=myName().toLowerCase();
    if(!rows){ol.innerHTML=head+'<li><span></span><span style="opacity:.55">Board unavailable right now.</span></li>';return}
    ol.innerHTML=head+(rows.length?rows.slice(0,50).map((r,i)=>`<li class="${String(r.name).toLowerCase()===me?'me':''}"><span class="r">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</span><span class="n">${esc(r.name)}</span><span class="num">${(r.ms/1000).toFixed(2)}s</span><span class="num">${Math.round(r.wpm)}</span><span class="num acc">${Math.round(r.acc)}%</span></li>`).join('')
      :'<li><span></span><span style="opacity:.55">No typists yet today. Set the pace.</span></li>')}

  /* ---------- Type Faster: practice with the 1000+ sentence bank (assets/typing-bank.js) ----------
     Pick a difficulty and a length, switch capitals, punctuation and numbers on or off, choose how hard a wrong
     key slows you down. The car drives ~7 m for every character, so a longer text is a longer drive and the
     speed you see is the speed you type. Bests are kept on this device, per difficulty. */
  const BANK=window.TYPING_BANK||{medium:POOL};
  const TF_DEF={diff:'medium',count:3,caps:true,punct:true,nums:true,penalty:'normal',keyboard:false};
  let TF=Object.assign({},TF_DEF);try{const o=JSON.parse(localStorage.getItem('sl_typefast')||'null');if(o)for(const k in TF_DEF)if(k in o&&typeof o[k]===typeof TF_DEF[k])TF[k]=o[k]}catch(e){}
  const saveTF=()=>{try{localStorage.setItem('sl_typefast',JSON.stringify(TF))}catch(e){}};
  const DIFFS=[['easy','Easy'],['medium','Medium'],['hard','Hard'],['expert','Expert'],['mixed','Mixed']],PEN={light:350,normal:700,harsh:1500};
  let recent=[];try{recent=JSON.parse(localStorage.getItem('sl_typefast_recent')||'[]')}catch(e){}
  function buildFastText(){
    let pool=TF.diff==='mixed'?Object.values(BANK).flat():(BANK[TF.diff]||BANK.medium);
    if(!TF.nums){const f=pool.filter(x=>!/[0-9]/.test(x));if(f.length>=TF.count)pool=f}
    const fresh=pool.filter(x=>!recent.includes(x)),src=fresh.length>=TF.count?fresh:pool,pick=[];
    while(pick.length<TF.count&&pick.length<src.length){const x=src[Math.floor(Math.random()*src.length)];if(!pick.includes(x))pick.push(x)}
    recent=recent.concat(pick).slice(-120);try{localStorage.setItem('sl_typefast_recent',JSON.stringify(recent))}catch(e){}
    let t=pick.join(' ');
    if(!TF.caps)t=t.toLowerCase();
    if(!TF.punct)t=t.replace(/[^\p{L}\p{N}\s']/gu,' ');
    if(!TF.nums)t=t.replace(/[0-9]/g,' ');
    return t.replace(/\s+/g,' ').trim()||'the quick brown fox jumps over the lazy dog'}
  function startFast(){saveTF();const label=DIFFS.find(d=>d[0]===TF.diff)[1];
    setP.classList.remove('on');start({text:buildFastText(),label,penalty:PEN[TF.penalty]||700,keyboard:TF.keyboard,diff:TF.diff})}
  const bestKey=()=>'sl_typefast_best_'+TF.diff;
  function showFastResults(r){
    let best=null;try{best=JSON.parse(localStorage.getItem(bestKey())||'null')}catch(e){}
    const isBest=!rejected&&(!best||r.wpm>best.wpm);if(isBest)try{localStorage.setItem(bestKey(),JSON.stringify({wpm:r.wpm,acc:r.acc}))}catch(e){}
    const label=DIFFS.find(d=>d[0]===TF.diff)[1];
    res.innerHTML=`<div class="rs"><div class="rs-k">Type Faster · ${label} · ${r.chars} characters · ${(r.chars*7/1000).toFixed(1)} km</div><h2>🏁 Finished!</h2>
      <div class="rs-badges">${isBest?'<span class="rs-badge pb">🔥 New best for '+label+'!</span>':''}</div>
      <div class="rs-time" data-unit="wpm">${Math.round(r.wpm)} <span style="font-size:.4em">WPM</span></div>
      <div class="rs-grid"><div><b>${(r.ms/1000).toFixed(2)}s</b><span>Time</span></div><div><b>${r.acc.toFixed(1)}%</b><span>Accuracy</span></div>
        <div><b>${r.maxKmh}</b><span>Max km/h</span></div><div><b>${best&&!isBest?Math.round(best.wpm):Math.round(r.wpm)}</b><span>Best WPM</span></div></div>
      <div class="rs-note">${rejected?'Not counted as a best: '+rejected+'.':''}</div>
      <div class="rs-btns"><button class="rs-set" type="button">Settings</button><button class="pri rs-again" type="button">Next text</button></div></div>`;
    res.classList.add('on');
    res.querySelector('.rs-again').onclick=()=>{closeResults();startFast()};
    res.querySelector('.rs-set').onclick=()=>{closeResults();quit();openFast()}}
  // the setup panel
  const css2=document.createElement('style');css2.textContent=`
  #dtfset{position:absolute;inset:0;z-index:45;display:none;place-items:center;background:radial-gradient(ellipse at 50% 20%,rgba(10,18,40,.6),rgba(6,6,7,.9));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:16px;overflow-y:auto}
  #dtfset.on{display:grid;animation:dtyIn2 .3s ease}
  #dtfset .tf{width:min(560px,100%);background:linear-gradient(180deg,rgba(26,27,32,.95),rgba(13,14,17,.97));border:1px solid rgba(238,240,243,.12);border-radius:22px;padding:22px 22px 18px;color:#eef0f3;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  #dtfset .tf-k{font:600 10px var(--mono,monospace);letter-spacing:.3em;color:#4d8dff;text-transform:uppercase}
  #dtfset h3{margin:6px 0 4px;font:700 34px/1.05 var(--serif,Georgia,serif);letter-spacing:-.02em}
  #dtfset p{margin:0 0 12px;color:rgba(238,240,243,.6);font-size:13px;line-height:1.45}
  #dtfset .tf-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid rgba(238,240,243,.07);flex-wrap:wrap}
  #dtfset .tf-row>span{font-size:14px}
  #dtfset .tf-seg{display:flex;flex-wrap:wrap;gap:6px}
  #dtfset .tf-seg button{background:rgba(238,240,243,.07);color:inherit;border:1px solid rgba(238,240,243,.14);border-radius:999px;padding:8px 12px;font:600 11px var(--mono,monospace);letter-spacing:.06em;cursor:pointer}
  #dtfset .tf-seg button.on{background:#eef0f3;color:#06070b;border-color:#eef0f3}
  #dtfset .tf-prev{margin:10px 0 2px;padding:12px 14px;border-radius:12px;background:rgba(238,240,243,.05);border:1px solid rgba(238,240,243,.1);font:500 13px/1.5 var(--mono,monospace);color:rgba(238,240,243,.8);min-height:3em}
  #dtfset .tf-meta{font:500 10px var(--mono,monospace);letter-spacing:.14em;color:rgba(238,240,243,.45);text-transform:uppercase;margin-top:6px}
  #dtfset .tf-btns{display:flex;gap:10px;margin-top:16px}
  #dtfset .tf-btns button{flex:1;padding:14px;border-radius:12px;border:1px solid rgba(238,240,243,.18);font:700 12px var(--mono,monospace);letter-spacing:.16em;text-transform:uppercase;cursor:pointer;background:rgba(238,240,243,.06);color:#eef0f3}
  #dtfset .tf-btns .go{background:linear-gradient(180deg,#6aa2ff,#2f6ff0);color:#06070b;border-color:transparent}
  @media (max-height:520px){#dtfset .tf{padding:14px 16px}#dtfset h3{font-size:24px}#dtfset .tf-row{padding:5px 0}}`;
  document.head.appendChild(css2);
  const setP=mk('div',{id:'dtfset'});sec.appendChild(setP);
  function seg(key,opts){return `<div class="tf-seg" data-key="${key}">`+opts.map(([v,l])=>`<button type="button" data-v="${v}" class="${String(TF[key])===String(v)?'on':''}">${l}</button>`).join('')+'</div>'}
  function renderSet(){
    const n=TF.diff==='mixed'?Object.values(BANK).reduce((a,b)=>a+b.length,0):(BANK[TF.diff]||[]).length;
    let best=null;try{best=JSON.parse(localStorage.getItem(bestKey())||'null')}catch(e){}
    setP.innerHTML=`<div class="tf"><div class="tf-k">Type Faster</div><h3>Your typing drives the car</h3>
      <p>Every correct key moves the car about 7 m, so the faster you type the faster you go, and a longer text is a longer drive.</p>
      <div class="tf-row"><span>Difficulty</span>${seg('diff',DIFFS)}</div>
      <div class="tf-row"><span>Length</span>${seg('count',[[1,'1 sentence'],[3,'3'],[5,'5'],[10,'10']])}</div>
      <div class="tf-row"><span>Capitals</span>${seg('caps',[[true,'On'],[false,'Off']])}</div>
      <div class="tf-row"><span>Punctuation</span>${seg('punct',[[true,'On'],[false,'Off']])}</div>
      <div class="tf-row"><span>Numbers</span>${seg('nums',[[true,'On'],[false,'Off']])}</div>
      <div class="tf-row"><span>Mistake slow-down</span>${seg('penalty',[['light','Light'],['normal','Normal'],['harsh','Harsh']])}</div>
      <div class="tf-row"><span>On-screen keyboard</span>${seg('keyboard',[[true,'Show'],[false,'Hide']])}</div>
      <div class="tf-meta">${n} sentences at this level${best?' · your best: '+Math.round(best.wpm)+' WPM':''}</div>
      <div class="tf-btns"><button type="button" class="tf-x">Close</button><button type="button" class="go">Start · Enter</button></div></div>`;
    setP.querySelectorAll('.tf-seg').forEach(g=>g.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=g.dataset.key,v=b.dataset.v;
      TF[k]=typeof TF_DEF[k]==='boolean'?v==='true':typeof TF_DEF[k]==='number'?+v:v;saveTF();renderSet()}));
    setP.querySelector('.go').onclick=startFast;setP.querySelector('.tf-x').onclick=()=>setP.classList.remove('on')}
  function openFast(){renderSet();setP.classList.add('on')}
  setP.addEventListener('pointerdown',e=>{if(e.target===setP)setP.classList.remove('on')});
  addEventListener('keydown',e=>{if(!setP.classList.contains('on'))return;if(e.key==='Enter'){e.preventDefault();startFast()}else if(e.key==='Escape')setP.classList.remove('on');e.stopImmediatePropagation()},true);

  window.TypingRace={start,quit,todaysText,openFast,get state(){return st}};
})();
