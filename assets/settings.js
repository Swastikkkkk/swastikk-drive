/* Settings panel: audio mix, radio, graphics, display and the full list of controls.
   Values persist in localStorage ('sl_settings'). The game reads window.Settings.v and listens with
   Settings.on(fn(key, value)); Menu > Settings or O opens it, Esc closes it. While it is open,
   keys go to the panel, not the car. */
(function(window,document){
  'use strict';
  const DEF={master:80,engine:80,effects:70,music:60,quality:'auto',hints:true,units:'kmh'};
  let v=Object.assign({},DEF);
  try{const s=JSON.parse(localStorage.getItem('sl_settings')||'null');if(s&&typeof s==='object')for(const k in DEF)if(k in s&&typeof s[k]===typeof DEF[k])v[k]=s[k]}catch(e){}
  const subs=[];
  const save=()=>{try{localStorage.setItem('sl_settings',JSON.stringify(v))}catch(e){}};
  function set(k,val){v[k]=val;save();subs.forEach(f=>{try{f(k,val)}catch(e){}})}

  const KEYS=[
    ['W A S D / arrows','Drive'],['Space','Handbrake'],['Shift','Boost'],['H','Horn'],
    ['C','Change camera'],['V or Q','Look behind'],['Z','Rear-view mirror'],['F','Headlights'],
    ['N','Day / night'],['T','Radio: next station / off'],['L','Time a lap'],['B','Fastest laps'],
    ['M','Map'],['G','GPS'],['P','Autodrive'],['E','Interact (UFO, planets)'],['R','Reset car'],['O','Settings'],['Esc','Close panels']];

  const css=`
#dset{position:absolute;inset:0;z-index:30;display:none;place-items:center;background:rgba(6,7,9,.72);backdrop-filter:blur(8px);padding:20px}
#dset.on{display:grid}
#dset .st-in{width:min(560px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:linear-gradient(180deg,rgba(26,27,32,.95),rgba(13,14,17,.97));border:1px solid rgba(238,240,243,.12);border-radius:22px;padding:22px 24px 18px;color:var(--paper,#eef0f3);box-shadow:0 30px 80px rgba(0,0,0,.5)}
#dset .st-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
#dset h3{margin:0;font-size:26px;letter-spacing:-.01em}
#dset .st-x{background:rgba(238,240,243,.1);color:inherit;border:0;border-radius:999px;padding:8px 14px;font:600 12px var(--mono,monospace);cursor:pointer}
#dset h4{margin:18px 0 8px;font:600 11px var(--mono,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--mute,#828a98)}
#dset .st-row{display:grid;grid-template-columns:96px 1fr 40px;align-items:center;gap:12px;padding:6px 0}
#dset .st-row label{font-size:14px}
#dset .st-row output{font:600 13px var(--mono,monospace);text-align:right;color:var(--bone,#c5c8cf)}
#dset input[type=range]{width:100%;accent-color:#eef0f3;height:22px;cursor:pointer}
#dset .st-seg{display:flex;flex-wrap:wrap;gap:6px}
#dset .st-seg button{background:rgba(238,240,243,.08);color:inherit;border:1px solid rgba(238,240,243,.14);border-radius:999px;padding:7px 12px;font:600 12px var(--mono,monospace);cursor:pointer}
#dset .st-seg button.on{background:#eef0f3;color:#06070b;border-color:#eef0f3}
#dset .st-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;font-size:14px}
#dset .st-keys{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 18px}
#dset .st-keys div{display:flex;gap:10px;align-items:baseline;font-size:13px;padding:3px 0;border-bottom:1px solid rgba(238,240,243,.06)}
#dset kbd{font:600 11px var(--mono,monospace);background:rgba(238,240,243,.12);border-radius:6px;padding:2px 7px;white-space:nowrap;color:#eef0f3}
#dset .st-keys span{color:var(--bone,#c5c8cf)}
@media (max-width:520px){#dset .st-keys{grid-template-columns:1fr}#dset .st-row{grid-template-columns:80px 1fr 36px}}`;

  let el=null,isOpen=false;
  function seg(opts,cur,onPick){const d=document.createElement('div');d.className='st-seg';
    opts.forEach(([val,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.v=String(val);if(String(val)===String(cur))b.classList.add('on');
      b.onclick=()=>{d.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));onPick(val)};d.appendChild(b)});return d}
  function slider(k,label){const r=document.createElement('div');r.className='st-row';
    r.innerHTML=`<label for="st-${k}">${label}</label><input id="st-${k}" type="range" min="0" max="100" step="1" value="${v[k]}"><output>${v[k]}</output>`;
    const i=r.querySelector('input'),o=r.querySelector('output');i.oninput=()=>{o.textContent=i.value;set(k,+i.value)};return r}
  function h4(t){const h=document.createElement('h4');h.textContent=t;return h}
  function build(){
    const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    el=document.createElement('div');el.id='dset';el.setAttribute('role','dialog');el.setAttribute('aria-label','Settings');
    const inn=document.createElement('div');inn.className='st-in';el.appendChild(inn);
    inn.innerHTML='<div class="st-hd"><h3>Settings</h3><button class="st-x" type="button">Close · Esc</button></div>';
    inn.querySelector('.st-x').onclick=close;
    inn.appendChild(h4('Sound'));
    inn.appendChild(slider('master','Master'));inn.appendChild(slider('engine','Engine'));
    inn.appendChild(slider('effects','Effects'));inn.appendChild(slider('music','Music'));
    inn.appendChild(h4('Radio'));
    const R=window.Radio,rs=R?R.stations:[];
    const radioSeg=seg([[-1,'Off']].concat(rs.map((s,i)=>[i,s.fm+' '+s.name])),R?R.station():-1,i=>{if(window.Radio)Radio.tune(+i)});
    radioSeg.id='st-radio';inn.appendChild(radioSeg);
    inn.appendChild(h4('Graphics'));
    inn.appendChild(seg([['auto','Auto'],[0,'High'],[1,'Medium'],[2,'Low']],v.quality,q=>set('quality',q==='auto'?'auto':+q)));
    inn.appendChild(h4('Display'));
    {const l=document.createElement('div');l.className='st-line';l.innerHTML='<span>Controls bar at the top</span>';l.appendChild(seg([[true,'On'],[false,'Off']],v.hints,x=>set('hints',x==='true'||x===true)));inn.appendChild(l)}
    {const l=document.createElement('div');l.className='st-line';l.innerHTML='<span>Speed</span>';l.appendChild(seg([['kmh','km/h'],['mph','mph']],v.units,x=>set('units',x)));inn.appendChild(l)}
    inn.appendChild(h4('Controls'));
    const kd=document.createElement('div');kd.className='st-keys';
    KEYS.forEach(([k,d])=>{const r=document.createElement('div');r.innerHTML=`<kbd>${k}</kbd><span>${d}</span>`;kd.appendChild(r)});inn.appendChild(kd);
    el.addEventListener('pointerdown',e=>{if(e.target===el)close()});
    (document.getElementById('drive')||document.body).appendChild(el)}
  function refreshRadio(){if(!el||!window.Radio)return;const cur=String(Radio.station());el.querySelectorAll('#st-radio button').forEach(b=>b.classList.toggle('on',b.dataset.v===cur))}
  function open(){if(!el)build();refreshRadio();el.classList.add('on');isOpen=true;if(S.onOpen)S.onOpen()}
  function close(){if(!el)return;el.classList.remove('on');isOpen=false}
  // while open, the panel owns the keyboard (sliders take arrow keys) and Esc / O close it
  window.addEventListener('keydown',e=>{if(!isOpen)return;if(e.code==='Escape'||e.code==='KeyO'){close();e.preventDefault()}e.stopImmediatePropagation()},true);

  const S={v,set,on:f=>subs.push(f),open,close,toggle:()=>isOpen?close():open(),get isOpen(){return isOpen},refreshRadio,onOpen:null,KEYS};
  window.Settings=S;
})(window,document);
