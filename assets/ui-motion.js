/* Motion for the interface, with GSAP. It only watches the page: when a screen opens (a class or a
   display change the game already makes) it animates it in, so none of the game's own code depends on
   this file. Nothing here runs when the visitor has asked for reduced motion, or if GSAP failed to load. */
(function(){
  'use strict';
  const gsap=window.gsap;
  if(!gsap||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const $=s=>document.querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const EASE='power3.out',EXPO='expo.out';
  // the CSS entrance animations would fight these, so they step aside
  const st=document.createElement('style');
  st.textContent='#dgarage.on,#dboard.on,#dmp.on,#dresults.on,#dtyperes.on,#dtype.on,.drow.open,#dbig.on #dbigc{animation:none!important}';
  document.head.appendChild(st);

  function watch(el,test,fn){if(!el)return;let was=test(el);
    new MutationObserver(()=>{const now=test(el);if(now&&!was)fn(el);was=now}).observe(el,{attributes:true,attributeFilter:['class','style']})}
  const isOn=el=>el.classList.contains('on'),shown=el=>el.style.display&&el.style.display!=='none';

  /* ---- cards: rise in, then their contents settle one after another ---- */
  function cardIn(overlay,cardSel){
    const card=overlay.querySelector(cardSel)||overlay.firstElementChild;if(!card)return;
    gsap.fromTo(overlay,{opacity:0},{opacity:1,duration:.35,ease:'power1.out',clearProps:'opacity'});
    gsap.fromTo(card,{y:34,scale:.965,opacity:0},{y:0,scale:1,opacity:1,duration:.7,ease:EXPO,clearProps:'transform,opacity'});
    const kids=[...card.children].filter(k=>k.offsetParent!==null);
    gsap.fromTo(kids,{y:14,opacity:0},{y:0,opacity:1,duration:.55,ease:EASE,stagger:.045,delay:.08,clearProps:'transform,opacity'})}
  watch($('#dgarage'),isOn,o=>cardIn(o,'.gg-in'));
  watch($('#dboard'),isOn,o=>cardIn(o,'.bd-in'));
  watch($('#dmp'),isOn,o=>cardIn(o,'#dmp-in[style*="block"], .bd-in'));
  watch($('#dqr-modal'),isOn,o=>cardIn(o,'.bd-in'));
  watch($('#dresults'),isOn,o=>cardIn(o,'.bd-in'));
  watch($('#ddaily-modal'),shown,o=>cardIn(o,'.bd-in'));

  /* ---- the menu sheet unfolds from its button, items cascade ---- */
  const menu=$('#drow');
  watch(menu,el=>el.classList.contains('open'),m=>{
    gsap.fromTo(m,{y:-10,scaleY:.94,opacity:0,transformOrigin:'top right'},{y:0,scaleY:1,opacity:1,duration:.42,ease:EXPO,clearProps:'transform,opacity'});
    gsap.fromTo($$(':scope>*',m).filter(k=>k.offsetParent!==null),{y:-6,opacity:0},{y:0,opacity:1,duration:.35,ease:EASE,stagger:.018,delay:.05,clearProps:'transform,opacity'})});

  /* ---- garage: the next car slides in from the side you swiped to, the bars fill ---- */
  {const name=$('#dgcname'),count=$('#dgcount'),cls=$('#dgcclass'),stats=$('#dgstats'),cv=$('#dgcanvas');
   let lastIdx=null;
   if(name&&count)new MutationObserver(()=>{
     const m=/^(\d+)/.exec(count.textContent||''),i=m?+m[1]:0,n=+((/\/\s*(\d+)/.exec(count.textContent)||[])[1]||1);
     let dir=1;if(lastIdx!=null){let d=i-lastIdx;if(d>n/2)d-=n;if(d<-n/2)d+=n;dir=d<0?-1:1;if(d===0){lastIdx=i;return}}lastIdx=i;
     gsap.fromTo([cls,name],{x:46*dir,opacity:0},{x:0,opacity:1,duration:.6,ease:EXPO,stagger:.04,clearProps:'transform,opacity'});
     if(cv)gsap.fromTo(cv,{x:70*dir,opacity:0,scale:.94},{x:0,opacity:1,scale:1,duration:.75,ease:EXPO,clearProps:'transform,opacity'})}).observe(count,{childList:true,characterData:true,subtree:true});
   if(stats)new MutationObserver(()=>{
     gsap.from($$('.gg-st b i',stats),{width:0,duration:.9,ease:'power4.out',stagger:.06});
     gsap.from($$('.gg-st span:last-child',stats),{opacity:0,y:6,duration:.5,ease:EASE,stagger:.06})}).observe(stats,{childList:true})}

  /* ---- toasts pop and settle ---- */
  watch($('#dtoast'),el=>el.classList.contains('show'),t=>{
    gsap.fromTo(t,{opacity:0,y:18,scale:.94,filter:'blur(8px)'},{opacity:1,y:0,scale:1,filter:'blur(0px)',duration:.55,ease:EXPO,clearProps:'opacity,transform,filter'})});

  /* ---- the driving HUD arrives in pieces when you start ---- */
  watch($('#dhud'),isOn,h=>{
    gsap.fromTo($$('.dright,.dbr,.dtl',h),{opacity:0,y:-12},{opacity:1,y:0,duration:.7,ease:EXPO,stagger:.08,delay:.15,clearProps:'transform,opacity'})});

  /* ---- typing race: the panel rises, the result time counts up ---- */
  watch($('#dtype'),isOn,p=>{const c=p.querySelector('.ty-card');if(c)gsap.fromTo(c,{y:40,opacity:0},{y:0,opacity:1,duration:.7,ease:EXPO,clearProps:'transform,opacity'})});   // the card, not the centred panel
  watch($('#dtyperes'),isOn,r=>{
    const rs=r.querySelector('.rs');if(!rs)return;
    gsap.fromTo([...rs.children],{y:22,opacity:0},{y:0,opacity:1,duration:.6,ease:EXPO,stagger:.07,clearProps:'transform,opacity'});
    const t=rs.querySelector('.rs-time');if(t){const end=parseFloat(t.textContent)||0,o={v:0};
      gsap.to(o,{v:end,duration:1.1,ease:'power2.out',delay:.15,onUpdate:()=>{t.textContent=o.v.toFixed(2)+'s'}})}
    gsap.fromTo(rs.querySelectorAll('.rs-grid>div'),{scale:.9,opacity:0},{scale:1,opacity:1,duration:.55,ease:'back.out(1.6)',stagger:.06,delay:.25,clearProps:'transform,opacity'})});

  /* ---- buttons: a soft spring on press ---- */
  document.addEventListener('pointerdown',e=>{const b=e.target.closest&&e.target.closest('.dbtn,.gg-arr,#dgpick,.rs-btns button,.ty-tabs button');
    if(b)gsap.fromTo(b,{scale:.96},{scale:1,duration:.45,ease:'elastic.out(1,.5)',clearProps:'transform'})},{passive:true});
})();
