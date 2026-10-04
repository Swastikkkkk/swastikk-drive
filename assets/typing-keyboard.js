/* A Mac-style keyboard for the Typing Race (in the spirit of Aceternity UI's Keyboard component, built here in plain
   JS/CSS since this site has no React/Tailwind). Keys sink and light up as you press them, the next key you need glows
   (with Shift when the letter needs it), and an optional mechanical click is synthesised with Web Audio, so there are
   no sound files to ship. window.TypingKeyboard.mount(parent) returns the element; .hint(char), .flashChar(char). */
(function(){
  'use strict';
  const css=document.createElement('style');css.textContent=`
  .tkb{--k:clamp(22px,2.55vw,34px);--g:calc(var(--k)*.12);display:inline-flex;flex-direction:column;gap:var(--g);padding:calc(var(--k)*.32);
    background:linear-gradient(180deg,#1b1c20,#111215);border-radius:calc(var(--k)*.42);border:1px solid rgba(255,255,255,.07);
    box-shadow:0 30px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06),inset 0 -1px 0 rgba(0,0,0,.6);user-select:none;-webkit-user-select:none}
  .tkb-row{display:flex;gap:var(--g)}
  .tkb-k{position:relative;height:var(--k);width:var(--k);flex:0 0 auto;border-radius:calc(var(--k)*.16);
    background:linear-gradient(180deg,#0d0d0f,#08080a);color:#c9ccd3;
    box-shadow:0 0 0 1px rgba(255,255,255,.04),0 1px 0 rgba(0,0,0,.9),0 calc(var(--k)*.06) 0 #050506,inset 0 1px 0 rgba(255,255,255,.07),inset 0 -2px 3px rgba(0,0,0,.6);
    font:500 calc(var(--k)*.28)/1 "Manrope","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.01em;
    display:flex;align-items:center;justify-content:center;transition:transform .07s ease,box-shadow .07s ease,background .12s ease,color .12s}
  .tkb-k.sm{height:calc(var(--k)*.62)}
  .tkb-k .t2{display:flex;flex-direction:column;align-items:center;gap:calc(var(--k)*.06);font-size:calc(var(--k)*.25)}
  .tkb-k .t2 i{font-style:normal;opacity:.55;font-size:calc(var(--k)*.22)}
  .tkb-k.wide{justify-content:flex-start;align-items:flex-end;padding:0 0 calc(var(--k)*.14) calc(var(--k)*.18);font-size:calc(var(--k)*.22);color:#a8acb5}
  .tkb-k.wide.r{justify-content:flex-end;padding:0 calc(var(--k)*.18) calc(var(--k)*.14) 0}
  .tkb-k.mod{flex-direction:column;align-items:flex-start;justify-content:space-between;padding:calc(var(--k)*.12) calc(var(--k)*.14);font-size:calc(var(--k)*.19);color:#a8acb5}
  .tkb-k.mod.r{align-items:flex-end}
  .tkb-k.fn{font-size:calc(var(--k)*.2);color:#8f939c}
  .tkb-k.on{transform:translateY(calc(var(--k)*.05));background:linear-gradient(180deg,#26272c,#1c1d21);color:#fff;
    box-shadow:0 0 0 1px rgba(255,255,255,.1),0 0 0 #050506,inset 0 1px 0 rgba(255,255,255,.12),0 0 18px rgba(255,255,255,.12)}
  .tkb-k.next{color:#fff;box-shadow:0 0 0 1.5px #4d8dff,0 0 16px rgba(77,141,255,.55),0 calc(var(--k)*.06) 0 #050506,inset 0 1px 0 rgba(255,255,255,.1)}
  .tkb-k.miss{background:linear-gradient(180deg,#3a1416,#240c0e);color:#ffb4b8;box-shadow:0 0 0 1.5px #e5484d,0 0 16px rgba(229,72,77,.5)}
  .tkb-arrows{display:grid;grid-template-columns:repeat(3,var(--k));grid-template-rows:repeat(2,calc((var(--k) - var(--g))/2));gap:var(--g);align-self:flex-end}
  .tkb-arrows .tkb-k{height:auto;width:auto;font-size:calc(var(--k)*.2)}
  @media (max-width:760px),(pointer:coarse){.tkb{display:none}}`;
  document.head.appendChild(css);

  // [label, code, width (in keys), class, shifted label]
  const R=[
    [['esc','Escape',1.45,'fn sm'],...Array.from({length:12},(_,i)=>['F'+(i+1),'F'+(i+1),1,'fn sm']),['','Power',1,'fn sm']],
    [['`','Backquote',1,'','~'],...'1234567890'.split('').map((d,i)=>[d,'Digit'+d,1,'','!@#$%^&*()'[i]]),['-','Minus',1,'','_'],['=','Equal',1,'','+'],['delete','Backspace',1.55,'wide r']],
    [['tab','Tab',1.55,'wide'],...'QWERTYUIOP'.split('').map(c=>[c,'Key'+c,1]),['[','BracketLeft',1,'','{'],[']','BracketRight',1,'','}'],['\\','Backslash',1,'','|']],
    [['caps lock','CapsLock',1.85,'wide'],...'ASDFGHJKL'.split('').map(c=>[c,'Key'+c,1]),[';','Semicolon',1,'',':'],["'",'Quote',1,'','"'],['return','Enter',1.85,'wide r']],
    [['shift','ShiftLeft',2.35,'wide'],...'ZXCVBNM'.split('').map(c=>[c,'Key'+c,1]),[',','Comma',1,'','<'],['.','Period',1,'','>'],['/','Slash',1,'','?'],['shift','ShiftRight',2.35,'wide r']],
  ];
  const BOTTOM=[['fn','Fn',1,'mod','🌐'],['control','ControlLeft',1,'mod','⌃'],['option','AltLeft',1,'mod','⌥'],['command','MetaLeft',1.3,'mod','⌘'],['','Space',5.4,''],['command','MetaRight',1.3,'mod r','⌘'],['option','AltRight',1,'mod r','⌥']];
  const els=new Map();
  function key(spec){const [label,code,w,cls,alt]=spec,k=document.createElement('div');k.className='tkb-k '+(cls||'');
    k.style.width='calc(var(--k)*'+w+' + var(--g)*'+(w-1).toFixed(2)+')';
    if(cls&&cls.includes('mod')){k.innerHTML='<span>'+alt+'</span><span>'+label+'</span>'}
    else if(alt&&!cls){k.innerHTML='<span class="t2"><i>'+alt+'</i><span>'+label+'</span></span>'}
    else k.textContent=label;
    if(code==='Power')k.innerHTML='<span style="width:38%;height:38%;border-radius:50%;background:#1f2024;box-shadow:inset 0 1px 2px #000"></span>';
    els.set(code,k);return k}
  function build(){const kb=document.createElement('div');kb.className='tkb';kb.setAttribute('aria-hidden','true');
    R.forEach(r=>{const row=document.createElement('div');row.className='tkb-row';r.forEach(s=>row.appendChild(key(s)));kb.appendChild(row)});
    const row=document.createElement('div');row.className='tkb-row';BOTTOM.forEach(s=>row.appendChild(key(s)));
    const ar=document.createElement('div');ar.className='tkb-arrows';
    [['','',0],['▲','ArrowUp',1],['','',0],['◀','ArrowLeft',1],['▼','ArrowDown',1],['▶','ArrowRight',1]].forEach(([l,c,real])=>{const d=real?key([l,c,1,'fn']):document.createElement('span');ar.appendChild(d)});
    row.appendChild(ar);kb.appendChild(row);return kb}

  /* characters to the key that types them, and whether Shift is needed */
  const SH={'~':'Backquote','!':'Digit1','@':'Digit2','#':'Digit3','$':'Digit4','%':'Digit5','^':'Digit6','&':'Digit7','*':'Digit8','(':'Digit9',')':'Digit0','_':'Minus','+':'Equal','{':'BracketLeft','}':'BracketRight','|':'Backslash',':':'Semicolon','"':'Quote','<':'Comma','>':'Period','?':'Slash'};
  const PL={'`':'Backquote','-':'Minus','=':'Equal','[':'BracketLeft',']':'BracketRight','\\':'Backslash',';':'Semicolon',"'":'Quote',',':'Comma','.':'Period','/':'Slash',' ':'Space'};
  function codeOf(ch){if(!ch)return null;if(/[a-z]/.test(ch))return {c:'Key'+ch.toUpperCase(),s:false};if(/[A-Z]/.test(ch))return {c:'Key'+ch,s:true};
    if(/[0-9]/.test(ch))return {c:'Digit'+ch,s:false};if(SH[ch])return {c:SH[ch],s:true};if(PL[ch])return {c:PL[ch],s:false};return null}

  /* the click: a short filtered noise burst plus a little low thump, pitched a touch differently each time */
  let AC=null,noise=null,sound=(()=>{try{return localStorage.getItem('sl_kbsound')!=='0'}catch(e){return true}})();
  function click(heavy){if(!sound)return;try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();
      if(!noise){noise=AC.createBuffer(1,AC.sampleRate*.05,AC.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3)}
      const t=AC.currentTime,src=AC.createBufferSource(),bp=AC.createBiquadFilter(),g=AC.createGain();src.buffer=noise;
      bp.type='bandpass';bp.frequency.value=(heavy?1500:2600)+Math.random()*900;bp.Q.value=.9;g.gain.setValueAtTime(heavy?.32:.24,t);g.gain.exponentialRampToValueAtTime(.001,t+.05);
      src.connect(bp);bp.connect(g);g.connect(AC.destination);src.start(t);
      const o=AC.createOscillator(),og=AC.createGain();o.type='sine';o.frequency.setValueAtTime(heavy?120:170,t);o.frequency.exponentialRampToValueAtTime(60,t+.04);
      og.gain.setValueAtTime(.12,t);og.gain.exponentialRampToValueAtTime(.001,t+.05);o.connect(og);og.connect(AC.destination);o.start(t);o.stop(t+.06)}catch(e){}}

  let mounted=null,active=false;
  const down=e=>{if(!active)return;const k=els.get(e.code);if(!k)return;k.classList.add('on');if(!e.repeat)click(e.code==='Space'||e.code==='Enter'||e.code==='Backspace')};
  const up=e=>{const k=els.get(e.code);if(k)k.classList.remove('on')};
  addEventListener('keydown',down,true);addEventListener('keyup',up,true);
  addEventListener('blur',()=>els.forEach(k=>k.classList.remove('on')));

  window.TypingKeyboard={
    mount(parent){if(!mounted){mounted=build()}parent.appendChild(mounted);return mounted},
    set active(v){active=!!v;if(!v)els.forEach(k=>k.classList.remove('on','next','miss'))},
    hint(ch){els.forEach(k=>k.classList.remove('next'));const m=codeOf(ch);if(!m)return;const k=els.get(m.c);if(k)k.classList.add('next');
      if(m.s){const sl=els.get('ShiftLeft'),sr=els.get('ShiftRight');if(sl)sl.classList.add('next');if(sr)sr.classList.add('next')}},
    miss(ch){const m=codeOf(ch),k=m&&els.get(m.c);if(!k)return;k.classList.add('miss');setTimeout(()=>k.classList.remove('miss'),260)},
    // phones send no key codes: light the key for the character instead
    flashChar(ch){const m=codeOf(ch),k=m&&els.get(m.c);if(!k)return;k.classList.add('on');setTimeout(()=>k.classList.remove('on'),110)},
    get sound(){return sound},set sound(v){sound=!!v;try{localStorage.setItem('sl_kbsound',sound?'1':'0')}catch(e){}}};
})();
