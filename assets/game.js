const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
(function(){
  if(window.PhoneController&&window.PhoneController.isControllerMode)return;   // this tab is a phone gamepad, not a game
  const show3DFallback=()=>{
    const loading=$('#dload');
    if(loading){loading.textContent='This game requires WebGL for the full 3D experience. Please use a modern browser with hardware acceleration enabled.';loading.style.cssText='position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:28px;background:#06070b;color:#f2eee6;font:500 15px/1.6 system-ui,sans-serif;text-align:center;letter-spacing:0;text-transform:none'}
  };
  if(!window.THREE||!window.CANNON){show3DFallback();return}
  try{const probe=document.createElement('canvas');if(!(probe.getContext('webgl')||probe.getContext('experimental-webgl'))){show3DFallback();return}}catch(e){show3DFallback();return}
  /* the weather turns as you go round the loop: [how far round it is (0..1), weather] */
  const ACTS=[[.008,'day'],[.075,'day'],[.145,'day'],[.215,'day'],[.295,'rain'],[.395,'dusk'],[.5,'dusk'],[.575,'day'],[.65,'dusk'],[.762,'day'],[.845,'autumn'],[.905,'autumn'],[.962,'dusk']];
  const CHMOOD=ACTS.map(a=>a[1]);
  const VEHS={
    car:{label:'Car',engine:650,max:30.8,slip:2.4,xw:1.05,zf:1.35,zb:-1.35,r:.46,rest:.42,steer:.55,roll:.02},
  };
  let MODE='world';
  /* ---------- damage system ---------- */
  let vehicleDamage=0;
  let damageEffects={engine:0,transmission:0,suspension:0,aero:0,tires:0};
  /* ---------- fuel/tire wear system ---------- */
  let fuelLevel=100;
  let tireWear=[0,0,0,0];
  let lastPitStop=0;
  /* ---------- coins: a simple economy, no backend - earn from laps/missions, spend on cars ---------- */
  let coins=(()=>{try{return Math.max(0,parseInt(localStorage.getItem('sl_coins'))||0)}catch(e){return 0}})();
  function saveCoins(){try{localStorage.setItem('sl_coins',String(coins))}catch(e){}}
  function saveUnlocked(){try{localStorage.setItem('sl_unlocked',JSON.stringify([...unlocked]))}catch(e){}}
  const unlockedRaw=(()=>{try{return localStorage.getItem('sl_unlocked')}catch(e){return null}})();
  const unlocked=(()=>{let arr=[];try{const p=JSON.parse(unlockedRaw||'[]');if(Array.isArray(p))arr=p}catch(e){}
    const set=new Set(arr);
    // this system didn't exist before - grandfather in whatever car a returning player already
    // had selected, so shipping this doesn't retroactively lock people out of their own car
    if(unlockedRaw==null){try{const sc=JSON.parse(localStorage.getItem('sl_car')||'null');if(sc&&sc.id)set.add(sc.id)}catch(e){}}
    return set})();
  unlocked.add('aster'); // the starter car is always free, regardless of what's saved
  if(unlockedRaw==null)saveUnlocked();
  let updCoinsUI=()=>{}; // the garage UI wiring below replaces this once #dgcoins exists
  // state-only on purpose: callers fold the amount into whatever toast they're already showing
  // (mission-done, lap-done, etc), since the single-element toast would otherwise overwrite itself
  function earnCoins(n){coins+=n;saveCoins();updCoinsUI()}
  /* ---------- garage: 6 cars, 2 body kits (buildEV / buildCar) sharing the same physics rig ---------- */
  /* Supabase project used for multiplayer rooms and the global boards. This is the public "anon" key: it is
     meant to ship in the browser, and what it can do is limited by the database's row-level security policies.
     Defined once here so every caller shares it. */
  const SUPA={url:'https://oceaylrebzflgyxfjqfb.supabase.co',key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZWF5bHJlYnpmbGd5eGZqcWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NDk5ODUsImV4cCI6MjEwNjAyNTk4NX0.RTdGpoSF7ZX8oaIrLEY4VAmV14GVHY8rYT1H5j18OHs'};
  const GARAGE=[
    {id:'aster',label:'Aster',type:'ev',blurb:'Balanced',mass:190,F:2.42,B:-2.36,W:2.3,price:0,
     V:{engine:650,max:30.8,slip:2.4,xw:1.05,zf:1.35,zb:-1.35,r:.46,rest:.42,steer:.55,roll:.02},
     paints:[0x640c0e,0x14161b,0xd9d4c6,0x27476b]},
    {id:'voltgt',label:'Volt GT',type:'ev',blurb:'Wide, low, fast',mass:198,F:2.4,B:-2.32,W:2.42,price:400,
     V:{engine:760,max:34.5,slip:2.6,xw:1.14,zf:1.3,zb:-1.3,r:.42,rest:.36,steer:.5,roll:.016},
     paints:[0x18345c,0x14161b,0xc7cbce,0x7a1620]},
    {id:'phantom',label:'Phantom',type:'ev',blurb:'Longest, top speed, twitchy',mass:210,F:2.7,B:-2.62,W:2.28,price:600,
     V:{engine:820,max:37.5,slip:2.1,xw:1.08,zf:1.55,zb:-1.55,r:.46,rest:.4,steer:.58,roll:.024},
     paints:[0x121216,0x2c2c30,0xd9d4c6,0x5c1418]},
    {id:'kestrel',label:'Kestrel',type:'car',blurb:'Sedan, agile',mass:165,F:2.05,B:-2.05,W:1.92,wagon:false,price:150,
     V:{engine:600,max:29,slip:2.55,xw:.92,zf:1.15,zb:-1.15,r:.4,rest:.38,steer:.66,roll:.018},
     paints:[0x1f7a3d,0x14161b,0xd9d4c6,0x27476b]},
    {id:'ridgeback',label:'Ridgeback',type:'car',blurb:'Wagon, heavy, grippy',mass:235,F:2.2,B:-2.35,W:2.05,wagon:true,price:300,
     V:{engine:640,max:27.5,slip:2.9,xw:1.0,zf:1.35,zb:-1.35,r:.44,rest:.44,steer:.48,roll:.026},
     paints:[0x3a4550,0x14161b,0xd9d4c6,0x5c3a1e]},
    {id:'mamba',label:'Mamba',type:'car',blurb:'Sedan, quick, loose',mass:175,F:2.1,B:-2.1,W:1.95,wagon:false,price:220,
     V:{engine:700,max:31.5,slip:2.15,xw:.95,zf:1.2,zb:-1.2,r:.4,rest:.36,steer:.6,roll:.016},
     paints:[0xb33a1e,0x14161b,0xd9d4c6,0x27476b]},
    {id:'f1apex',label:'F1 Apex',type:'f1',blurb:'Formula 1 Single-Seater',mass:135,F:1.8,B:-1.7,W:1.6,price:800,
     V:{engine:900,max:44,slip:3.6,xw:1.1,zf:1.4,zb:-1.4,r:.38,rest:.35,steer:.8,roll:.01},
     paints:[0xdc143c,0x1a1a2e,0xf0e68c,0x00ffff]},
    {id:'titan4x4',label:'Titan 4x4',type:'suv',blurb:'Rugged Off-Road SUV',mass:290,F:2.5,B:-2.4,W:2.2,wagon:true,price:500,
     V:{engine:680,max:28,slip:3.0,xw:1.2,zf:1.5,zb:-1.5,r:.52,rest:.52,steer:.45,roll:.03},
     paints:[0x2d4a22,0x1a1a1a,0xd4a843,0x4a4a4a]},
    {id:'phantombike',label:'Phantom Bike',type:'bike',blurb:'Aerodynamic Superbike',mass:110,F:1.5,B:-1.5,W:1.0,price:600,
     V:{engine:850,max:42,slip:2.8,xw:0.42,zf:1.0,zb:-1.0,r:.35,rest:.3,steer:.9,roll:.005},
     paints:[0x1a1a2e,0xff6b35,0x00d4aa,0xffd700]},
    {id:'valkyrie',label:'Valkyrie LeMans',type:'hypercar',blurb:'Le Mans Hypercar',mass:165,F:2.0,B:-1.9,W:1.8,price:1000,
     V:{engine:1050,max:46.5,slip:3.2,xw:1.15,zf:1.35,zb:-1.35,r:.4,rest:.32,steer:.7,roll:.01},
     paints:[0x0d1b2a,0xff0033,0x00ff88,0xffd700]},
    {id:'rx7spirit',label:'RX-7 Spirit',type:'car',blurb:'JDM Legend, rotary scream',mass:160,F:2.1,B:-2.0,W:1.85,price:450,
     V:{engine:750,max:33,slip:2.7,xw:.98,zf:1.25,zb:-1.25,r:.4,rest:.38,steer:.68,roll:.015},
     paints:[0x1a1a2e,0xff6b35,0x00d4aa,0xffd700]},
    {id:'skyline',label:'Skyline GTR',type:'car',blurb:'Godzilla, AWD legend',mass:180,F:2.2,B:-2.1,W:1.9,price:500,
     V:{engine:800,max:35,slip:3.0,xw:1.05,zf:1.3,zb:-1.3,r:.42,rest:.4,steer:.6,roll:.02},
     paints:[0x0066cc,0x1a1a2e,0xd9d4c6,0xffd700]},
    {id:'countach',label:'Countach LP500',type:'car',blurb:'Wedge icon, scissor doors',mass:170,F:2.0,B:-1.9,W:1.8,price:700,
     V:{engine:780,max:34,slip:2.5,xw:1.1,zf:1.4,zb:-1.4,r:.4,rest:.35,steer:.6,roll:.018},
     paints:[0xff6b35,0x1a1a2e,0xf0e68c,0x00ffff]},
    {id:'truck',label:'Titan Hauler',type:'truck',blurb:'Heavy hauler, 18-wheeler',mass:450,F:3.0,B:-4.0,W:2.5,wagon:true,price:800,
     V:{engine:900,max:25,slip:3.5,xw:1.4,zf:2.0,zb:-2.0,r:.6,rest:.6,steer:.35,roll:.04},
     paints:[0x8b4513,0x2d4a22,0x1a1a2e,0xd4a843]},
    {id:'classicmini',label:'Mini Classic',type:'car',blurb:'Tiny tossable go-kart',mass:80,F:1.5,B:-1.4,W:1.4,price:200,
     V:{engine:500,max:26,slip:2.2,xw:.8,zf:1.0,zb:-1.0,r:.35,rest:.3,steer:.85,roll:.01},
     paints:[0x0066cc,0xcc0000,0xf0e68c,0x00ffff]},
    {id:'gt40',label:'GT40 MkII',type:'car',blurb:'Le Mans winner, Ford vs Ferrari',mass:140,F:1.9,B:-1.8,W:1.7,price:900,
     V:{engine:850,max:38,slip:3.3,xw:1.0,zf:1.3,zb:-1.3,r:.38,rest:.33,steer:.75,roll:.012},
     paints:[0x0066cc,0xf0e68c,0xd4a83a,0x1a1a2e]},
  ];
  /* every car free for now: flip to false to bring prices back (nothing is saved, so nobody keeps them) */
  const FREE_CARS=true;
  if(FREE_CARS)GARAGE.forEach(c=>unlocked.add(c.id));
  const WEATHERS=[
    {id:'day',label:'Day',bg:0x9dc0dd,fog:[110,300],hemi:.62,sun:0xfff7e8,sunI:1.12,ground:0x5c6b44,leaf:0x39672b,part:null,slip:1,skyTop:0x4a86c6,skyBottom:0xc3d9ea,star:0,sunA:.7,terr:[1.06,1.1,.98],snow:0,water:0x2f6f8c,ridge:[.46,.53,.62]},
    {id:'dusk',label:'Dusk',bg:0x2e2418,fog:[80,240],hemi:.5,sun:0xffcf92,sunI:1.0,ground:0x3a3124,leaf:0x3d4a2c,part:null,slip:1,skyTop:0x3d4a72,skyBottom:0xd98f4e,star:.72,sunA:1,terr:[1.16,1,.82],snow:0,water:0x3c4f5e,ridge:[.3,.28,.3]},
    {id:'rain',label:'Rain',bg:0x5b656d,fog:[45,175],hemi:.52,sun:0xc3d0dc,sunI:.42,ground:0x15171a,leaf:0x27342c,part:'rain',slip:.75,skyTop:0x4d5760,skyBottom:0x707a82,star:.04,sunA:.25,terr:[.8,.88,.96],snow:0,water:0x25404e,ridge:[.16,.18,.22]},
    {id:'snow',label:'Snow',bg:0xc4cad0,fog:[38,160],hemi:.66,sun:0xffffff,sunI:.62,ground:0xd8dde1,leaf:0xdfe6ea,part:'snow',slip:.55,skyTop:0xf0f4f8,skyBottom:0xc4cad0,star:0,sunA:.5,terr:[1.02,1.04,1.08],snow:.88,water:0x5d7581,ridge:[.62,.66,.72]},
    {id:'autumn',label:'Autumn',bg:0x6a4a2c,fog:[75,240],hemi:.54,sun:0xffc082,sunI:1.02,ground:0x2a2016,leaf:0xc2561f,part:'leaves',slip:.95,skyTop:0x6c5330,skyBottom:0xb08046,star:.34,sunA:.85,terr:[1.42,1.04,.68],snow:0,water:0x3d4a44,ridge:[.3,.22,.15]},
    /* Night. The only light is the moon, so the key light goes cold and dim, the ground
       loses most of its colour, and the stars come all the way up. The sun sprite is left
       faintly on rather than off — a pinhole low on the horizon reads as the last of the
       day going, which is kinder than a hard cut to black. */
    {id:'night',label:'Night',bg:0x070b16,fog:[64,250],hemi:.30,sun:0xbcd0f2,sunI:.42,ground:0x121722,leaf:0x1b2a22,part:null,slip:.95,skyTop:0x05080f,skyBottom:0x172542,star:1,sunA:.22,terr:[.70,.78,.98],snow:0,water:0x15273a,ridge:[.09,.12,.20]},
    {id:'overcast',label:'Overcast',bg:0x9aa3ab,fog:[70,240],hemi:.62,sun:0xdfe6ec,sunI:.55,ground:0x4d5a40,leaf:0x33502b,part:null,slip:.95,skyTop:0x7d8791,skyBottom:0xb4bcc3,star:0,sunA:.12,terr:[.92,.98,.94],snow:0,water:0x3a5666,ridge:[.4,.44,.5]},
    {id:'sunset',label:'Sunset',bg:0xc98a52,fog:[90,280],hemi:.55,sun:0xffb066,sunI:1.15,ground:0x4a3b28,leaf:0x5a5a2a,part:null,slip:1,skyTop:0x59608f,skyBottom:0xeba15e,star:.1,sunA:1,terr:[1.22,1.02,.8],snow:0,water:0x6a5a58,ridge:[.4,.29,.27]},
    {id:'storm',label:'Storm',bg:0x2b3138,fog:[30,130],hemi:.38,sun:0x8d9db0,sunI:.22,ground:0x0f1114,leaf:0x1c2820,part:'rain',slip:.62,skyTop:0x1f252b,skyBottom:0x454e56,star:0,sunA:.05,terr:[.66,.74,.82],snow:0,water:0x1b3140,ridge:[.10,.12,.15]},
    {id:'fog',label:'Fog',bg:0xb7bec2,fog:[8,85],hemi:.7,sun:0xf0f0ea,sunI:.5,ground:0x56624c,leaf:0x38553a,part:null,slip:.9,skyTop:0xc3c9cc,skyBottom:0xb7bec2,star:0,sunA:.1,terr:[.95,1,.96],snow:0,water:0x5b6f76,ridge:[.6,.63,.65]},
    {id:'sand',label:'Sandstorm',bg:0xc9a266,fog:[14,110],hemi:.6,sun:0xffe0a0,sunI:.55,ground:0x8a6f44,leaf:0x7c6a3a,part:'sand',slip:.8,skyTop:0xb8935c,skyBottom:0xd2ac6e,star:0,sunA:.2,terr:[1.35,1.1,.72],snow:0,water:0x7a6a4a,ridge:[.55,.43,.27]},
    {id:'blizzard',label:'Blizzard',bg:0xdfe6ea,fog:[10,75],hemi:.72,sun:0xffffff,sunI:.4,ground:0xe6eaed,leaf:0xe6eef2,part:'snow',slip:.48,skyTop:0xeaf0f4,skyBottom:0xdfe6ea,star:0,sunA:.1,terr:[1.05,1.07,1.1],snow:.95,water:0x6f8794,ridge:[.7,.74,.78]},
  ];
  /* how the falling stuff behaves per weather: size, fall speed, sideways wind */
  const PSTYLE={rain:{size:.16,fall:38,wind:0,col:0x9fb4c8},storm:{size:.2,fall:54,wind:9,col:0x8fa4b8},snow:{size:.34,fall:4,wind:0,col:0xffffff},blizzard:{size:.5,fall:11,wind:16,col:0xffffff},sand:{size:.3,fall:1.2,wind:26,col:0xd8b070},autumn:{size:.5,fall:3,wind:0,col:0xd0692a}};
  /* ---------- dom ---------- */
  const sec=$('#drive'),cv=$('#dc'),hud=$('#dhud'),hint=$('#dhint'),toast=$('#dtoast'),mm=$('#dmap'),mx2=mm.getContext('2d'),spd=$('#dspeed'),bigmap=$('#dbig'),bmc=$('#dbigc'),mob=$('#dmob'),mute=$('#dmute');
  let W=sec.clientWidth,H=sec.clientHeight,active=false,driving=false,muted=false;
  const LOW=!matchMedia('(hover:hover)').matches;const TOUCH=matchMedia('(pointer:coarse)').matches||LOW;
  /* ---------- renderer / scene ---------- */
  let R;
  try{R=new THREE.WebGLRenderer({canvas:cv,antialias:!LOW,powerPreference:'high-performance'})}
  catch(e){show3DFallback();return}
  R.shadowMap.enabled=!LOW;R.shadowMap.type=THREE.PCFSoftShadowMap;R.debug.checkShaderErrors=false;
  /* One quality: Ultra, and it is not a menu. Everything the old tiers used to switch off
     is simply on — shadows, grass, dust, stars, the full particle budget. The only thing
     that still varies is the pixel-ratio cap, because resolution is the one cost that
     scales with the panel instead of with the scene: a 3x phone screen would otherwise
     render nine times the pixels for a picture the same size. Everything else is kept
     cheap by construction (Lambert materials, instanced scatter, a shadow map redrawn
     every third frame, boards culled by distance) rather than by asking the player. */
  const ULTRA={dpr:1.3,dprLow:1.15,shEvery:2};
  /* Quality used to be decided once, from a coarse touch/mouse guess, and never
     revisited — so a weak laptop with a mouse got full shadows and 1.3 DPR for
     the entire drive regardless of actual frame rate. This instead watches the
     real FPS while driving and steps quality down (then back up) to match. */
  let qTier=LOW?1:0;             // 0 full, 1 reduced, 2 minimum
  /* The downgrade used to need a full 1.2s of bad frames per step, so a weak phone
     stuttered for ~2.5s before reaching the cheapest tier. The first drop is now quick
     and the second only slightly slower; the upgrade stays deliberately slow so quality
     can't oscillate. */
  let Q_UP_MS=4000;let qGoodT=0,qBadT=0;
  const qDownMs=()=>qTier===0?450:900;
  function tierCfg(t){
    return t===2?{dpr:.75,shadow:!LOW,shEvery:8}
         : t===1?{dpr:LOW?1.0:1.05,shadow:!LOW,shEvery:5}
         :        {dpr:ULTRA.dpr,shadow:true,shEvery:2};
  }
  function setTier(t){
    if(t===qTier)return;if(t>qTier)Q_UP_MS=Math.min(30000,Q_UP_MS*2);qTier=t;const c=tierCfg(t);
    R.setPixelRatio(Math.min(devicePixelRatio||1,c.dpr));R.setSize(W,H,false);
    R.shadowMap.enabled=c.shadow;if(sun){sun.castShadow=c.shadow;sun.shadow.needsUpdate=true}
    if(carShadow)carShadow.visible=!c.shadow;
    ULTRA.shEvery=c.shEvery;
  }
  function watchFps(dt){
    if(!active||!driving||dt<=0)return;
    const fps=1/dt;
    if(fps<42){qGoodT=0;qBadT+=dt*1000;if(qBadT>qDownMs()&&qTier<2){setTier(qTier+1);qBadT=0}}
    else if(fps>56){qBadT=0;qGoodT+=dt*1000;if(qGoodT>Q_UP_MS&&qTier>0){setTier(qTier-1);qGoodT=0}}
    else{qGoodT=0;qBadT=0}
  }
  const SCN={grass:null,dust:null,stars:null};
  const DPR=()=>Math.min(devicePixelRatio||1,LOW?ULTRA.dprLow:ULTRA.dpr);
  function applyQ(){
    const c=tierCfg(qTier);
    R.setPixelRatio(Math.min(devicePixelRatio||1,c.dpr));R.setSize(W,H,false);
    R.shadowMap.enabled=c.shadow;
    if(typeof sun!=='undefined'&&sun){sun.castShadow=c.shadow;sun.shadow.needsUpdate=true}
    try{if(carShadow)carShadow.visible=!c.shadow}catch(e){}   // may run before the contact blob exists
    if(SCN.grass)SCN.grass.visible=true;
    if(SCN.dust)SCN.dust.visible=true;
    if(SCN.stars)SCN.stars.visible=true;
    if(typeof pGeo!=='undefined'&&pGeo)pGeo.setDrawRange(0,PCOUNT);
  }

  if('outputEncoding' in R)R.outputEncoding=THREE.sRGBEncoding;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=.98;
  const S=new THREE.Scene();S.background=new THREE.Color(0x0e0e0d);S.fog=new THREE.Fog(0x0e0e0d,55,170);
  const C=new THREE.PerspectiveCamera(50,W/H,.1,320);
  /* ---------- rearview mirror camera ---------- */
  const rearCam=new THREE.PerspectiveCamera(60,280/90,.5,200);
  let rearMirrorOn=false;
  const rearEl=document.getElementById('drear');
  /* The mirror is drawn into a texture first and then onto the frame flipped left to right, the way a
     real mirror shows the road, inside whatever box #drear occupies (it used to be a fixed patch of
     screen that drifted off the frame). It takes the scene you are in, so on the Moon it shows the Moon. */
  const mirRT=new THREE.WebGLRenderTarget(4,4),mirScene=new THREE.Scene(),mirCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  mirRT.texture.repeat.set(-1,1);mirRT.texture.offset.set(1,0);
  mirScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:mirRT.texture,depthTest:false,depthWrite:false})));
  const _mo=new THREE.Vector3(),_ml=new THREE.Vector3();
  function renderMirror(scene,origin,quat,yOff){
    if(!rearEl||rearEl.style.display==='none')return;
    const br=cv.getBoundingClientRect(),r=rearEl.getBoundingClientRect();
    const mw=Math.round(r.width-4),mh=Math.round(r.height-4);if(mw<8||mh<8)return;
    const mx=Math.round(r.left-br.left+2),my=Math.round(br.bottom-r.bottom+2);
    const pr=R.getPixelRatio(),tw=Math.round(mw*pr),th=Math.round(mh*pr);
    if(mirRT.width!==tw||mirRT.height!==th)mirRT.setSize(tw,th);
    // eye just behind the tail at roof height, looking back down the road
    _mo.set(0,yOff+FP.top+.3,FP.back-.25).applyQuaternion(quat).add(origin);
    _ml.set(0,yOff+1.1,FP.back-30).applyQuaternion(quat).add(origin);
    rearCam.position.copy(_mo);rearCam.up.set(0,1,0).applyQuaternion(quat);rearCam.lookAt(_ml);
    if(rearCam.aspect!==mw/mh){rearCam.aspect=mw/mh;rearCam.updateProjectionMatrix()}
    const prevT=R.getRenderTarget();R.setRenderTarget(mirRT);R.clear();R.render(scene,rearCam);R.setRenderTarget(prevT);
    const ac=R.autoClear;R.autoClear=false;R.setViewport(mx,my,mw,mh);R.setScissor(mx,my,mw,mh);R.setScissorTest(true);
    R.render(mirScene,mirCam);R.setScissorTest(false);R.setViewport(0,0,W,H);R.autoClear=ac}
  let ZN={drag:0,fog:1,tint:[1,1,1]},fogFar0=170,fogNear0=55,hemi0=.55,sunI0=1.05;
  let progU=0;
  const hemi=new THREE.HemisphereLight(0xdfeaff,0x3c3a30,.55);S.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff2dd,1.05);sun.position.set(18,34,12);sun.castShadow=!LOW;sun.shadow.mapSize.set(LOW?512:1024,LOW?512:1024);sun.shadow.autoUpdate=false;sun.shadow.bias=-.0004;sun.shadow.normalBias=.035;Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:110});S.add(sun);S.add(sun.target);
  const SUN_DIR=new THREE.Vector3(18,34,12).normalize();
  const MOON_DIR=new THREE.Vector3(-20,26,-14).normalize(); // rides opposite the sun
  const SUN_OFF_DEFAULT=new THREE.Vector3(18,34,12);
  const SUN_OFF_LOW=new THREE.Vector3(34,8,22); // a low, golden-hour sun angle, used only while parked at the summit
  const SUN_DIR_LOW=SUN_OFF_LOW.clone().normalize();
  let recapCam=false;
  const fillL=new THREE.DirectionalLight(0x8fa8ff,.1);fillL.position.set(-16,9,-11);S.add(fillL);
  /* ---------- sky dome, sun glow, stars, dust: atmosphere so the world isn't just flat fog ---------- */
  const skyMat=new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color(0x323a52)},bottomColor:{value:new THREE.Color(0x0e0e0d)},offset:{value:9},exponent:{value:.68}},
    vertexShader:'varying vec3 vWP;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}',
    fragmentShader:'uniform vec3 topColor;uniform vec3 bottomColor;uniform float offset;uniform float exponent;varying vec3 vWP;void main(){float h=normalize(vWP+vec3(0.0,offset,0.0)).y;gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.0),exponent),0.0)),1.0);}',
    side:THREE.BackSide,fog:false,depthWrite:false});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(280,20,14),skyMat);S.add(sky);
  const sunTexC=document.createElement('canvas');sunTexC.width=sunTexC.height=128;
  {const gx=sunTexC.getContext('2d'),gr=gx.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,246,222,1)');gr.addColorStop(.35,'rgba(255,224,168,.5)');gr.addColorStop(1,'rgba(255,224,168,0)');gx.fillStyle=gr;gx.fillRect(0,0,128,128)}
  const sunSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(sunTexC),color:0xfff2dd,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  sunSprite.scale.set(50,50,1);sunSprite.position.copy(sun.position).normalize().multiplyScalar(260);S.add(sunSprite);
  /* ---------- the night sky ----------
     Two hundred identical white dots read as static, so this is a real star field:
     sizes and colours vary, roughly a third of them are pulled into a tilted band so
     there is a milky way to look up at, and each one twinkles on its own phase. It is
     still a single draw call — the variation lives in attributes, the twinkle in the
     vertex shader, so none of it costs anything per frame on the CPU. */
  const STARN=LOW?240:560;
  const starPos=new Float32Array(STARN*3),starSize=new Float32Array(STARN),
        starPhase=new Float32Array(STARN),starTint=new Float32Array(STARN*3);
  {const BAND=new THREE.Vector3(.42,.62,.66).normalize();  // the milky way's tilt
   const t1=new THREE.Vector3(),t2=new THREE.Vector3(),p=new THREE.Vector3();
   t1.set(-BAND.y,BAND.x,0).normalize();t2.crossVectors(BAND,t1).normalize();
   for(let i=0;i<STARN;i++){
     const inBand=i%3===0;   // a third of the sky's stars belong to the band
     if(inBand){const a=Math.random()*Math.PI*2,spread=(Math.random()+Math.random()-1)*.20;
       p.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2,Math.sin(a)).addScaledVector(BAND,spread).normalize()}
     else{const th=Math.random()*Math.PI*2,ph=Math.acos(Math.random()*.9);
       p.set(Math.sin(ph)*Math.cos(th),Math.cos(ph),Math.sin(ph)*Math.sin(th))}
     if(p.y<0)p.y=-p.y;                       // keep them all above the horizon
     const r=272;
     starPos[i*3]=p.x*r;starPos[i*3+1]=p.y*r*.9+20;starPos[i*3+2]=p.z*r;
     // a few bright ones, most of them faint; band stars sit smaller and denser
     const big=Math.random();
     starSize[i]=(inBand?.7:1)*(big>.965?3.4:big>.85?2.1:1.25)*(LOW?1.15:1);
     starPhase[i]=Math.random()*6.283;
     // real stars are not white: lean a little warm or a little blue
     const warm=Math.random();
     const c=warm>.72?[1,.86,.7]:warm>.4?[1,.98,.94]:[.78,.86,1];
     starTint[i*3]=c[0];starTint[i*3+1]=c[1];starTint[i*3+2]=c[2]}}
  const starGeo=new THREE.BufferGeometry();
  starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
  starGeo.setAttribute('aSize',new THREE.BufferAttribute(starSize,1));
  starGeo.setAttribute('aPhase',new THREE.BufferAttribute(starPhase,1));
  starGeo.setAttribute('aTint',new THREE.BufferAttribute(starTint,3));
  const starMat=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uOpacity:{value:.6},uPix:{value:Math.min(devicePixelRatio||1,2)}},
    transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute float aSize;attribute float aPhase;attribute vec3 aTint;
      uniform float uTime,uOpacity,uPix;varying float vA;varying vec3 vT;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
        float tw=.58+.42*sin(uTime*1.6+aPhase);vA=uOpacity*tw;vT=aTint;
        gl_PointSize=aSize*uPix;}`,
    fragmentShader:`varying float vA;varying vec3 vT;
      void main(){vec2 d=gl_PointCoord-vec2(.5);float r=length(d);if(r>.5)discard;
        float a=1.-smoothstep(0.,.5,r);a*=a;gl_FragColor=vec4(vT,vA*a);}`});
  const stars=new THREE.Points(starGeo,starMat);stars.frustumCulled=false;S.add(stars);SCN.stars=stars;
  /* The moon. Rides opposite the sun, fades in with the stars, and carries its own soft
     halo so it reads as light rather than a pasted-on disc. */
  const moonC=document.createElement('canvas');moonC.width=moonC.height=128;
  {const g=moonC.getContext('2d');
   const hal=g.createRadialGradient(64,64,10,64,64,64);
   hal.addColorStop(0,'rgba(226,232,246,.95)');hal.addColorStop(.34,'rgba(206,216,238,.30)');
   hal.addColorStop(1,'rgba(180,196,230,0)');g.fillStyle=hal;g.fillRect(0,0,128,128);
   g.beginPath();g.arc(64,64,25,0,6.283);g.fillStyle='#eef1fa';g.fill();
   g.globalAlpha=.16;g.fillStyle='#8f9ab4';
   [[56,55,7],[72,70,5],[62,76,4],[75,56,3],[52,68,3]].forEach(([x,y,r])=>{g.beginPath();g.arc(x,y,r,0,6.283);g.fill()})}
  const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(moonC),
    transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,opacity:0}));
  moon.scale.set(34,34,1);moon.frustumCulled=false;S.add(moon);
  /* A shooting star every so often, but only when there are stars out to shoot across.
     One reused line, so it costs nothing when it is not running. */
  const shootGeo=new THREE.BufferGeometry();
  shootGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const shootMat=new THREE.LineBasicMaterial({color:0xfdf6e6,transparent:true,opacity:0,depthWrite:false,fog:false,blending:THREE.AdditiveBlending});
  const shootL=new THREE.Line(shootGeo,shootMat);shootL.frustumCulled=false;shootL.visible=false;S.add(shootL);
  const shoot={t:0,dur:0,next:4+Math.random()*9,from:new THREE.Vector3(),dir:new THREE.Vector3()};
  const DUSTN=LOW?40:100;const dustPos=new Float32Array(DUSTN*3);
  for(let i=0;i<DUSTN;i++){dustPos[i*3]=(Math.random()-.5)*76;dustPos[i*3+1]=Math.random()*9+.5;dustPos[i*3+2]=(Math.random()-.5)*76}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
  const dustMat=new THREE.PointsMaterial({color:0xffe6bd,size:.11,transparent:true,opacity:.4,depthWrite:false});
  const dust=new THREE.Points(dustGeo,dustMat);S.add(dust);SCN.dust=dust;
  /* Lambert, not Standard. Every lit surface out here is matte low-poly, and the PBR shader
     was costing a full physically-based BRDF per pixel for a look that Lambert reproduces
     almost exactly. On an integrated GPU this is the difference between a smooth drive and a
     slideshow, because the scene is fill-rate bound rather than geometry bound. The PBR-only
     options are dropped on the way in so the rest of the code can keep passing them. */
  const PBRONLY=['roughness','metalness','normalMap','normalScale','roughnessMap','metalnessMap','envMap','envMapIntensity','clearcoat','flatShading'];
  const M=(c,o={})=>{const q=Object.assign({color:c},o);PBRONLY.forEach(k=>delete q[k]);return new THREE.MeshLambertMaterial(q)};
  const paper=M(0xf2eee6),ink=M(0x15140f),bone=M(0xc9c2b4),red=M(0xb8322f),blue=M(0x2f4f9e),green=M(0x3f8a56),yellow=M(0xd9b23a),steel=M(0xa9a59d,{metalness:.45,roughness:.4}),gold=M(0xd4a83a,{metalness:.75,roughness:.28}),glow=new THREE.MeshBasicMaterial({color:0xf2eee6}),rubber=M(0x232220,{roughness:.95}),skin=M(0xe2b48f),tankM=M(0x2c5bd6),hairM=M(0x1d1915);
  const groundM=M(0x1c1b18),roadM=M(0x57544d,{roughness:.88}),edgeM=M(0x81786a),skirtM=M(0x26241f,{side:THREE.DoubleSide}),leafM=M(0x33402c),trunkM=M(0x3a2c20);
  /* ---------- physics ---------- */
  const world=new CANNON.World();world.gravity.set(0,-24,0);world.broadphase=new CANNON.SAPBroadphase(world);world.allowSleep=true;world.defaultContactMaterial.friction=.3;
  const gM=new CANNON.Material('g'),oM=new CANNON.Material('o');world.addContactMaterial(new CANNON.ContactMaterial(gM,oM,{friction:.5,restitution:.1}));
  const barM=new CANNON.Material('barrier');world.addContactMaterial(new CANNON.ContactMaterial(barM,oM,{friction:.03,restitution:.18}));   // track barriers: glance off and keep going
  // no infinite ground plane: the world heightfield below is the only ground, which is what lets the pond have a real bed
  const MK=2.1,LAND=1.75,VK=MK/1.45,RWX=3.4;/* RWX = extra half-width the roads gained */const BOUND=Math.round(192*MK*LAND);[[BOUND,0,0,.5,8,BOUND],[-BOUND,0,0,.5,8,BOUND],[0,0,BOUND,BOUND,8,.5],[0,0,-BOUND,BOUND,8,.5]].forEach(([x,y,z,a,b,c])=>{const w=new CANNON.Body({mass:0});w.addShape(new CANNON.Box(new CANNON.Vec3(a,b,c)));w.position.set(x,y,z);world.addBody(w)});
  /* Heightfield half-extent and grid spacing, declared early because the branch and
     summit road below need them. The terrain is one mesh that is never frustum culled,
     so its vertex count is paid on every single frame: at ES=2 a world this size is
     42k vertices, which is what made the bigger map stutter. Coarsening the grid is
     far cheaper than shrinking the world, and the roads survive it because their
     corridor is flattened ten metres wide either side and the tarmac is drawn from
     this same field, so the road can never disagree with the ground it sits on. */
  const WS=Math.round(205*MK*LAND),ES=LOW?7:5;
  const dyn=[],dynI=[],dynITouched=new Set();
  const dynIP=new THREE.Vector3(),dynIQ=new THREE.Quaternion(),dynIS=new THREE.Vector3(1,1,1),dynIM=new THREE.Matrix4(),dynIM2=new THREE.Matrix4();
  function staticBox(x,y,z,a,b,c,ry=0){const w=new CANNON.Body({mass:0,material:oM});w.addShape(new CANNON.Box(new CANNON.Vec3(a,b,c)));w.position.set(x,y,z);w.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),ry);world.addBody(w);return w}
  // for clusters of small knockable props (crates/cones/tires/pins): one physics body driving one or more
  // InstancedMesh slots, instead of a whole Object3D per prop - same knockable behavior, far fewer draw calls
  function dynBoxI(parts,x,y,z,a,b,c,mass,ry=0){
    const bd=new CANNON.Body({mass,material:oM});bd.addShape(new CANNON.Box(new CANNON.Vec3(a,b,c)));
    bd.position.set(x,y,z);bd.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),ry);
    bd.angularDamping=.5;bd.linearDamping=.2;bd.sleepSpeedLimit=.3;world.addBody(bd);
    dynI.push({parts,body:bd,home:new CANNON.Vec3(x,y,z),q:bd.quaternion.clone()});
    return bd}
  /* ---------- road spline ---------- */
  const PTS=[[0,-38],[38,-70],[83,-54],[99,-10],[80,35],[35,58],[-22,51],[-64,26],[-77,-22],[-48,-51]].map(([x,z])=>new THREE.Vector3(x*MK,0,z*MK));
  const curve=new THREE.CatmullRomCurve3(PTS,true,'catmullrom',.55);
  const N=600,SAMP=[];for(let i=0;i<=N;i++)SAMP.push(curve.getPointAt(i/N));
  /* Two rises. HILLS[0] is a long climb the car has to fight up. HILLS[1] comes later on the
     loop and is the higher of the two. */
  const HILLS=[{a:.265,b:.385,c:.475,d:.595,H:11},{a:.645,b:.755,c:.805,d:.915,H:13}];
  const HILL=HILLS[0];
  function hAt(u){u=((u%1)+1)%1;let out=0;
    for(let i=0;i<HILLS.length;i++){const {a,b,c,d,H}=HILLS[i];if(u<=a||u>=d)continue;let h;
      if(u<b){const t=(u-a)/(b-a);h=H*t*t*(3-2*t)}else if(u<=c)h=H;else{const t=(d-u)/(d-c);h=H*t*t*(3-2*t)}
      if(h>out)out=h}
    return out}
  const at=u=>{const p=curve.getPointAt(((u%1)+1)%1),tg=curve.getTangentAt(((u%1)+1)%1);p.y=hAt(u);return {p,tg,n:new THREE.Vector3(-tg.z,0,tg.x),ry:Math.atan2(tg.x,tg.z)}};
  /* ---------- side road: a spur off the main loop that climbs to a west-side summit.
     It leaves the circuit at the top of the second hill, passes the
     ramp yard, then keeps climbing out to a lookout at the map's edge for the sunset.
     peakR is hard-clamped to stay inside the heightfield/physics walls no matter where
     BR_U actually lands on the spline, so a bad guess here can't put anything out of bounds. */
  const BR_U=.775,BR_LEN=34*MK,PEAK_DIST=62*MK,PEAK_RISE=10;
  const PTS_CTR=PTS.reduce((a,p)=>a.add(p),new THREE.Vector3()).divideScalar(PTS.length);
  const BR_START=curve.getPointAt(BR_U).clone();BR_START.y=0;
  const BR_OUT=BR_START.clone().sub(PTS_CTR);BR_OUT.y=0;BR_OUT.normalize();
  const BR_H=hAt(BR_U);
  const RAMPYARD={x:BR_START.x+BR_OUT.x*BR_LEN,z:BR_START.z+BR_OUT.z*BR_LEN};
  const SAFE_R=WS-20;
  let peakX=RAMPYARD.x+BR_OUT.x*PEAK_DIST,peakZ=RAMPYARD.z+BR_OUT.z*PEAK_DIST;
  const peakR=Math.hypot(peakX,peakZ);
  if(peakR>SAFE_R){const s=SAFE_R/peakR;peakX*=s;peakZ*=s}
  const PEAK={x:peakX,z:peakZ};
  const PEAK_H=BR_H+PEAK_RISE;
  const BR_MID=new THREE.Vector3(BR_START.x+BR_OUT.x*BR_LEN*.55+BR_OUT.z*6,0,BR_START.z+BR_OUT.z*BR_LEN*.55-BR_OUT.x*6);
  const BR_END=new THREE.Vector3(RAMPYARD.x,0,RAMPYARD.z);
  const BR_MID2=new THREE.Vector3((RAMPYARD.x+PEAK.x)/2+BR_OUT.z*7,0,(RAMPYARD.z+PEAK.z)/2-BR_OUT.x*7);
  const BR_PEAKV=new THREE.Vector3(PEAK.x,0,PEAK.z);
  const brCurveToYard=new THREE.CatmullRomCurve3([BR_START,BR_MID,BR_END],false,'catmullrom',.5);
  const BR_YARD_LEN=brCurveToYard.getLength();
  const brCurve=new THREE.CatmullRomCurve3([BR_START,BR_MID,BR_END,BR_MID2,BR_PEAKV],false,'catmullrom',.5);
  const U_YARD=Math.min(.92,BR_YARD_LEN/brCurve.getLength());
  const BN=90,BSAMP=[];for(let i=0;i<=BN;i++)BSAMP.push(brCurve.getPointAt(i/BN));
  // match the branch's road texture density to the main loop's (34 repeats over its full length)
  const BR_REP=brCurve.getLength()/12;
  const brSmooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
  /* The climb finishes at U_TOP rather than at the very end of the curve, so the last
     stretch of road is already level at PEAK_H by the time it reaches the lookout's flat
     pad. Running the rise all the way to u=1 left the road still climbing into ground
     that had already been flattened, and the two met in a step. */
  /* The ring road: a circle laid round the ramp yard, flat at the yard's own height.
     The branch arrives, and instead of a dead end there is something to lap — the three
     ramps sit inside it, so you can cut across the middle or stay on the tarmac. */
  const RING={x:RAMPYARD.x,z:RAMPYARD.z,r:19};
  const U_TOP=.93;
  function brHAt(u){if(u<=U_YARD)return BR_H;
    return BR_H+(PEAK_H-BR_H)*brSmooth(Math.min(1,(u-U_YARD)/Math.max(.001,U_TOP-U_YARD)))}
  const bAt=u=>{const uc=Math.max(0,Math.min(1,u));const p=brCurve.getPointAt(uc),tg=brCurve.getTangentAt(Math.max(.001,Math.min(.999,uc)));p.y=brHAt(uc);return {p,tg,n:new THREE.Vector3(-tg.z,0,tg.x)}};
  const SM=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
  const LRP=(a,b,t)=>a+(b-a)*t;
  /* ---------- value noise + procedural textures (no external assets: single-file site) ---------- */
  function hash2(x,z){const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s)}
  function noise2(x,z){const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);const a=hash2(xi,zi),b=hash2(xi+1,zi),c=hash2(xi,zi+1),d=hash2(xi+1,zi+1);return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v}
  function fbm2(x,z){return noise2(x,z)*1+noise2(x*2.3,z*2.3)*.5+noise2(x*5.1,z*5.1)*.22}
  // soft organic grain, tiled over the ground so it reads as soil and not as flat polygons
  function grainTex(px,scl,rep,lo){const c=document.createElement('canvas');c.width=c.height=px;const cx=c.getContext('2d');const im=cx.createImageData(px,px);
    for(let j=0;j<px;j++)for(let i=0;i<px;i++){const n=(noise2(i*scl,j*scl)*.6+noise2(i*scl*3.1,j*scl*3.1)*.28+noise2(i*scl*8.3,j*scl*8.3)*.12)/1;
      const v=Math.max(0,Math.min(1,lo+(1-lo)*n))*255;const k=(j*px+i)*4;im.data[k]=im.data[k+1]=im.data[k+2]=v|0;im.data[k+3]=255}
    cx.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);t.anisotropy=4;return t}
  // tiling ripple normal map for the water surface
  function waterNormTex(){const px=256,c=document.createElement('canvas');c.width=c.height=px;const cx=c.getContext('2d');const im=cx.createImageData(px,px);
    const wav=(i,j)=>{const u=i/px*Math.PI*2,v=j/px*Math.PI*2;
      return Math.sin(u*2+v*1)*.5+Math.sin(u*3-v*4)*.3+Math.sin(u*6+v*5)*.14+(noise2(i*.09,j*.09)-.5)*.5};
    for(let j=0;j<px;j++)for(let i=0;i<px;i++){
      const dx=wav((i+1)%px,j)-wav((i-1+px)%px,j),dy=wav(i,(j+1)%px)-wav(i,(j-1+px)%px);
      const k=(j*px+i)*4;im.data[k]=Math.max(0,Math.min(255,128+dx*120));im.data[k+1]=Math.max(0,Math.min(255,128+dy*120));im.data[k+2]=252;im.data[k+3]=255}
    cx.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);t.anisotropy=4;return t}
  /* ---------- zones (terrain is carved around them, so they come first) ---------- */
  const POND={x:30*MK,z:16*MK,r:14,depth:2.3},PG={x:2*MK,z:-14*MK};
  const WATER_Y=.02;
  function edgeR(a){return POND.r*(1+(noise2(Math.cos(a)*2+9,Math.sin(a)*2+9)-.5)*.34)}
  const pondR=(x,z)=>edgeR(Math.atan2(z-POND.z,x-POND.x));
  /* ---------- level pads, so nothing is built on a slope ---------- */
  function placeAt(u,side,dist){dist+=dist>=3?RWX:0;const {p,n}=at(u);return {x:p.x+n.x*side*dist,y:p.y,z:p.z+n.z*side*dist,ry:Math.atan2(-n.x*side,-n.z*side)}}
  /* placeAt turns a board square-on to the road, which is exactly how you end up reading a
     sign out of the side window at 70 km/h. faceAt keeps the same spot and turns the board
     up the road instead, to the angle you actually approach it from: deg is measured off the
     driving line, so a small number is a board aimed straight at the windscreen and 90 is the
     old square-on placement. Because the road curves, the angle is taken from the tangent at
     that point, so every board stays readable from the direction you arrive. */
  function faceAt(u,side,dist,deg){dist+=dist>=3?RWX:0;const {p,n,tg}=at(u);const a=(deg===undefined?26:deg)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
    const dx=-tg.x*ca-n.x*side*sa,dz=-tg.z*ca-n.z*side*sa;
    return {x:p.x+n.x*side*dist,y:p.y,z:p.z+n.z*side*dist,ry:Math.atan2(dx,dz)}}
  const LEN=curve.getLength();
  const PADS=[];
  PADS.push({x:PG.x,z:PG.z,y:0,r:17,f:28});
  // the pad has to hold the whole ring, not just the ramps, or the circle rides a slope
  PADS.push({x:RAMPYARD.x,z:RAMPYARD.z,y:BR_H,r:RING.r+5,f:RING.r+15});
  PADS.push({x:PEAK.x,z:PEAK.z,y:PEAK_H,r:8,f:16});
  /* ---------- the outer valley: a stunt park, a UFO field and a volcano ----------
     All of it sits outside the loop, on land the valley gained when it was widened, and each
     one gets a dirt track off the main road so you can find it without the map. */
  const VZ={stunt:{x:12*VK,z:176*VK,r:60},ufo:{x:-208*VK,z:-58*VK,r:17},volc:{x:-196*VK,z:190*VK,R:88,H:54,cr:13}};
  PADS.push({x:VZ.stunt.x,z:VZ.stunt.z,y:.6,r:VZ.stunt.r,f:VZ.stunt.r+26},{x:VZ.ufo.x,z:VZ.ufo.z,y:.6,r:VZ.ufo.r,f:VZ.ufo.r+22});
  function volcH(x,z){const v=VZ.volc,d=Math.hypot(x-v.x,z-v.z);if(d>v.R)return -99;const hc=q=>v.H*Math.pow(1-q/v.R,1.35);
    if(d<v.cr){const hr=hc(v.cr),fl=hr-9;return fl+(hr-fl)*(d/v.cr)**2}
    return hc(d)*(1+(fbm2(x*.07,z*.07)-.5)*.18*Math.min(1,(d-v.cr)/10))}
  const SPURS=[];
  function spurTo(q,stop){let bi=0,bd=1e9;for(let i=0;i<N;i+=2){const d=(SAMP[i].x-q.x)**2+(SAMP[i].z-q.z)**2;if(d<bd){bd=d;bi=i}}
    const p=SAMP[bi],dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz),L=l-stop,pts=[];for(let s=7;s<=L;s+=2)pts.push([p.x+dx/l*s,p.z+dz/l*s]);SPURS.push(pts)}
  spurTo(VZ.stunt,VZ.stunt.r-6);spurTo(VZ.ufo,VZ.ufo.r-2);spurTo(VZ.volc,VZ.volc.R*.92);
  function zoneHit(x,z,m=0){for(const k of ['stunt','ufo']){const q=VZ[k];if((x-q.x)**2+(z-q.z)**2<(q.r+m)**2)return true}
    const v=VZ.volc;if((x-v.x)**2+(z-v.z)**2<(v.R*.8+m)**2)return true;
    for(const S2 of SPURS)for(let i=0;i<S2.length;i+=2){const dx=S2[i][0]-x,dz=S2[i][1]-z;if(dx*dx+dz*dz<(5+m)*(5+m))return true}return false}
  /* ---------- one world heightfield: rolling land, a real mountain, a pond basin, a valley rim ---------- */
  /* One sample run and one bounding box per hill: a single box round both would drag every
     grid point between them through the inner loop for nothing. */
  const MASS=HILLS.map(HL=>{const pts=[];
    for(let i=Math.floor(HL.a*N)-3;i<=Math.ceil(HL.d*N)+3;i+=2){const k=(i+N)%N,h=hAt(i/N);if(h>0)pts.push({x:SAMP[k].x,z:SAMP[k].z,h})}
    let a=1e9,b=-1e9,c=1e9,d=-1e9;pts.forEach(s=>{a=Math.min(a,s.x);b=Math.max(b,s.x);c=Math.min(c,s.z);d=Math.max(d,s.z)});
    return {pts,bb:{a:a-36,b:b+36,c:c-36,d:d+36}}});
  function roadNear(x,z){let bi=0,bd=1e9;
    for(let i=0;i<N;i+=6){const dx=SAMP[i].x-x,dz=SAMP[i].z-z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i}}
    for(let i=bi-6;i<=bi+6;i++){const k=(i+N)%N,dx=SAMP[k].x-x,dz=SAMP[k].z-z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=k}}
    let bestD=bd,bestU=bi/N,branch=false,ring=false;
    // the branch spur is short, so a full linear scan of it is cheap
    for(let i=0;i<=BN;i++){const dx=BSAMP[i].x-x,dz=BSAMP[i].z-z,d=dx*dx+dz*dz;if(d<bestD){bestD=d;bestU=i/BN;branch=true}}
    /* The ring road is a circle, so it needs no samples at all: how far you are from the
       tarmac is just how far your radius is from the circle's. One subtraction beats
       walking a polyline, which matters because this runs for every cell of the heightfield. */
    {const dx=x-RING.x,dz=z-RING.z,dr=Math.abs(Math.hypot(dx,dz)-RING.r),d=dr*dr;
     if(d<bestD){bestD=d;bestU=0;branch=true;ring=true}}
    return {d:Math.sqrt(bestD),u:bestU,branch,ring}}
  function rollingH(x,z){return (fbm2(x*.0115+3,z*.0115-5)-.52)*15+(fbm2(x*.046-8,z*.046+2)-.5)*4.4+(fbm2(x*.15+21,z*.15-13)-.5)*1.1}
  function mountH(x,z){let h=0,md=1e9,any=false;
    for(let m=0;m<MASS.length;m++){const BB=MASS[m].bb;if(x<BB.a||x>BB.b||z<BB.c||z>BB.d)continue;any=true;
    const HSAMP=MASS[m].pts;
    for(let i=0;i<HSAMP.length;i++){const s=HSAMP[i],dd=Math.hypot(s.x-x,s.z-z);if(dd<md)md=dd;
      let f;if(dd<5.5)f=1;else if(dd<34){const q=1-(dd-5.5)/28.5;f=q*q*(3-2*q)}else continue;
      const hh=s.h*f;if(hh>h)h=hh}}
    if(!any)return 0;
    if(h>.2){const rr=(fbm2(x*.055+4,z*.055-6)-.5)*(5.4+h*.5)+(fbm2(x*.17-11,z*.17+8)-.5)*2.1;
      h=Math.max(.2,h+rr*SM((md-9)/13)*Math.min(1,h/3))}
    return h}
  function terrainH(x,z){
    let h=rollingH(x,z);
    const m=mountH(x,z);if(m>h)h=m;
    {const vh=volcH(x,z);if(vh>-50)h=Math.max(h,vh+Math.min(h,0))}
    // the pond sits in its own shallow hollow, then the bed is carved below the waterline
    const pd=Math.hypot(x-POND.x,z-POND.z),pr=pondR(x,z);
    if(pd<pr*2.7){const lw=(1-SM((pd-pr*1.1)/(pr*1.55)))*.92;h=h*(1-lw)+.3*lw}
    if(pd<pr*1.32){const bw=1-SM((pd-pr*.94)/(pr*.36));h=h*(1-bw)+(-POND.depth*SM((pr*.99-pd)/(pr*.52)))*bw}
    // valley rim, so the world has a horizon instead of an edge
    const de=Math.max(Math.abs(x),Math.abs(z));
    if(de>116*MK*LAND){const t=SM((de-116*MK*LAND)/(32*MK));h+=t*(18+(fbm2(x*.04+7,z*.04-3)-.5)*20)}
    // the road corridor stays true to the spline, and wins over everything
    const rn=roadNear(x,z),fw=1-SM((rn.d-(9.8+RWX))/30);
    if(fw>0)h=h*(1-fw)+(rn.ring?BR_H:rn.branch?brHAt(rn.u):hAt(rn.u))*fw;
    for(let i=0;i<PADS.length;i++){const p=PADS[i],dd=Math.hypot(p.x-x,p.z-z);
      if(dd<p.f){const w=1-SM((dd-p.r)/(p.f-p.r));h=h*(1-w)+p.y*w}}
    return h}
  const rockPts=[];
  const terrainM=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,map:grainTex(160,.07,Math.round(120*MK*LAND),.55)});
  const HF=(function(){
    const nx=Math.round(WS*2/ES)+1,nz=nx,minX=-WS,maxZ=WS;
    const data=[],slope=new Float32Array(nx*nz);
    let lo=1e9;
    for(let i=0;i<nx;i++){const row=new Array(nz),x=minX+i*ES;
      for(let j=0;j<nz;j++){const h=terrainH(x,maxZ-j*ES);row[j]=h;if(h<lo)lo=h}
      data.push(row)}
    /* cannon builds each heightfield cell as a convex pillar whose base is pinned at local -1, so any
       sample at or below that collapses the pillar and the solver spits out NaN the moment a wheel
       touches it. That is what launched the car in the pond. Lift the whole field into positive space,
       pin minValue at 0 so every pillar has real volume, and drop the body back down by the same amount. */
    const OFF=2-Math.min(0,lo);
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++)data[i][j]+=OFF;
    const shape=new CANNON.Heightfield(data,{elementSize:ES,minValue:0});
    const body=new CANNON.Body({mass:0,material:gM});body.addShape(shape);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);body.position.set(minX,-OFF,maxZ);world.addBody(body);
    const pos=new Float32Array(nx*nz*3),col=new Float32Array(nx*nz*3),uv=new Float32Array(nx*nz*2),idx=[];
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const k=i*nz+j;
      pos[k*3]=minX+i*ES;pos[k*3+1]=data[i][j]-OFF-.02;pos[k*3+2]=maxZ-j*ES;
      uv[k*2]=i/(nx-1);uv[k*2+1]=1-j/(nz-1);
      const hx=(data[Math.min(nx-1,i+1)][j]-data[Math.max(0,i-1)][j])/(2*ES),hz=(data[i][Math.min(nz-1,j+1)]-data[i][Math.max(0,j-1)])/(2*ES);
      slope[k]=Math.hypot(hx,hz)}
    // wind CCW when seen from above, otherwise every normal points down and the ground renders unlit
    for(let i=0;i<nx-1;i++)for(let j=0;j<nz-1;j++){const a=i*nz+j,b=(i+1)*nz+j;idx.push(a,b,a+1,b,b+1,a+1)}
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,terrainM);mesh.receiveShadow=true;S.add(mesh);
    // altitude + slope painting, repainted when the weather changes so snow actually settles
    function paint(snowAmt,tint){
      const col=g.attributes.color.array; // the attribute owns its own copy, so write into that one
      for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const k=i*nz+j,x=minX+i*ES,z=maxZ-j*ES,h=data[i][j]-OFF,sl=slope[k];
        let r=.215,g2=.365,b=.135;
        const dry=noise2(x*.062+5,z*.062-2)-.5,fine=noise2(x*.33-3,z*.33+7)-.5;r+=dry*.1+fine*.05;g2+=dry*.05+fine*.05;b+=dry*.015+fine*.035;
        const patch=noise2(x*.021-14,z*.021+9);r=LRP(r,.3,SM((patch-.55)/.4)*.55);g2=LRP(g2,.335,SM((patch-.55)/.4)*.55);b=LRP(b,.16,SM((patch-.55)/.4)*.55);
        const dirt=SM((sl-.3)/.45)*.7;r=LRP(r,.34,dirt);g2=LRP(g2,.245,dirt);b=LRP(b,.15,dirt);
        const rk=Math.max(SM((sl-.62)/.5),SM((h-9)/10)*.85);r=LRP(r,.42,rk);g2=LRP(g2,.4,rk);b=LRP(b,.365,rk);
        const sc=Math.max(SM((h-16.5)/5.5)*(1-SM((sl-1.3)/.6)*.75),snowAmt);r=LRP(r,.93,sc);g2=LRP(g2,.95,sc);b=LRP(b,.98,sc);
        const pd=Math.hypot(x-POND.x,z-POND.z),pr=pondR(x,z);
        if(pd<pr*1.55&&h<1.2){const sand=SM((1.2-h)/1.05)*SM((pr*1.55-pd)/(pr*.5))*(1-snowAmt*.8);r=LRP(r,.7,sand);g2=LRP(g2,.61,sand);b=LRP(b,.42,sand)}
        {const V=VZ.volc,vd=Math.hypot(x-V.x,z-V.z);if(vd<V.R*1.08){const vb=SM((V.R*1.08-vd)/(V.R*.3));r=LRP(r,.12,vb);g2=LRP(g2,.105,vb);b=LRP(b,.1,vb);
          if(vd<V.cr*1.3){const gl=SM((V.cr*1.3-vd)/(V.cr*.45));r=LRP(r,.62,gl);g2=LRP(g2,.2,gl);b=LRP(b,.08,gl)}}}
        col[k*3]=r*tint[0];col[k*3+1]=g2*tint[1];col[k*3+2]=b*tint[2]}
      g.attributes.color.needsUpdate=true}
    const hAcc=(x,z)=>{const fi=(x-minX)/ES,fj=(maxZ-z)/ES;if(fi<0||fj<0||fi>=nx-1||fj>=nz-1)return 0;const i=fi|0,j=fj|0,tx=fi-i,tz=fj-j;
      return ((data[i][j]*(1-tx)+data[i+1][j]*tx)*(1-tz)+(data[i][j+1]*(1-tx)+data[i+1][j+1]*tx)*tz)-OFF};
    const slAcc=(x,z)=>{const fi=Math.round((x-minX)/ES),fj=Math.round((maxZ-z)/ES);if(fi<0||fj<0||fi>nx-1||fj>nz-1)return 0;return slope[fi*nz+fj]};
    // boulders, on the steep flanks only, clear of the road
    {let seed=53;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;let tries=0;
      while(rockPts.length<230&&tries<30000){tries++;const x=(rnd()-.5)*(374*MK*LAND),z=(rnd()-.5)*(374*MK*LAND);if(zoneHit(x,z,4))continue;const hh=hAcc(x,z);
        if(hh<.5)continue;if(slAcc(x,z)<.42)continue;if(roadNear(x,z).d<11+RWX)continue;
        rockPts.push([x,hh,z,.65+rnd()*1.7,rnd()*Math.PI*2])}}
    const rockIM=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),M(0x585349,{roughness:.98,flatShading:true,map:grainTex(64,.09,2,.52)}),rockPts.length);
    rockIM.receiveShadow=true;
    {const o=new THREE.Object3D();rockPts.forEach(([x,hh,z,s,ry],i)=>{o.position.set(x,hh+s*.22,z);o.scale.set(s,s*.78,s*.92);o.rotation.set(ry*.5,ry,ry*.3);o.updateMatrix();rockIM.setMatrixAt(i,o.matrix)});S.add(rockIM)}
    return {h:hAcc,slope:slAcc,paint,mesh}})();
  /* ---------- distant ridge line, so the horizon is land and not fog ---------- */
  const farRidge=(function(){const pos=[],idx=[],col=[];const SEG=84,R0=268;
    for(let i=0;i<=SEG;i++){const a=i/SEG*Math.PI*2;const hh=16+fbm2(Math.cos(a)*7+31,Math.sin(a)*7-12)*30;
      const r=R0+noise2(Math.cos(a)*4,Math.sin(a)*4)*22;
      pos.push(Math.cos(a)*r,-4,Math.sin(a)*r,Math.cos(a)*r,hh,Math.sin(a)*r);
      col.push(.20,.21,.25,.30,.32,.38);
      if(i<SEG){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,fog:true,transparent:true,opacity:.9,depthWrite:false}));m.renderOrder=-1;S.add(m);return m})();
  function ridgeTint(t){const c=farRidge.geometry.attributes.color,a=c.array;
    for(let i=0;i<a.length;i+=6){a[i]=t[0];a[i+1]=t[1];a[i+2]=t[2];a[i+3]=Math.min(1,t[0]*1.45);a[i+4]=Math.min(1,t[1]*1.45);a[i+5]=Math.min(1,t[2]*1.45)}
    c.needsUpdate=true}
  /* ---------- road surface ----------
     Asphalt is painted once into a texture: dark aggregate, faint wear in the wheel tracks,
     solid edge lines and a dashed centre line baked in, so the markings are crisp at any
     distance instead of being a scatter of floating quads. */
  const ROAD_REP=Math.round(curve.getLength()/(12+RWX*4));
  function roadTex(){const W=256,H=512,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
    x.fillStyle='#303134';x.fillRect(0,0,W,H);const im=x.getImageData(0,0,W,H),d=im.data;
    for(let jj=0;jj<H;jj++)for(let ii=0;ii<W;ii++){const k=(jj*W+ii)*4,u=ii/W;
      let n=(hash2(ii*1.73+.5,jj*1.31+.5)-.5)*22+(noise2(ii*.045,jj*.045)-.5)*16+(noise2(ii*.19,jj*.19)-.5)*7;
      n-=(Math.exp(-((u-.27)**2)/.0035)+Math.exp(-((u-.73)**2)/.0035))*6;d[k]+=n;d[k+1]+=n;d[k+2]+=n+1}
    x.putImageData(im,0,0);
    x.fillStyle='rgba(236,232,222,.93)';x.fillRect(W*.045,0,W*.03,H);x.fillRect(W*(1-.045-.03),0,W*.03,H);
    x.fillStyle='rgba(236,232,222,.9)';for(let s=0;s<2;s++)x.fillRect(W*.488,H*(s*.5+.12),W*.024,H*.25);
    const t=new THREE.CanvasTexture(c);t.wrapS=THREE.ClampToEdgeWrapping;t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t}
  function curbTex(){const c=document.createElement('canvas');c.width=16;c.height=64;const x=c.getContext('2d');
    x.fillStyle='#b8322f';x.fillRect(0,0,16,32);x.fillStyle='#ece7db';x.fillRect(0,32,16,32);
    const t=new THREE.CanvasTexture(c);t.wrapS=THREE.ClampToEdgeWrapping;t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.NearestFilter;t.anisotropy=8;return t}
  function strip(w,yo,mat){const pos=[],idx=[],uv=[];for(let i=0;i<=N;i++){const {p,n}=at(i/N);n.multiplyScalar(w/2);
      pos.push(p.x-n.x,p.y+yo,p.z-n.z,p.x+n.x,p.y+yo,p.z+n.z);uv.push(0,i/N*ROAD_REP,1,i/N*ROAD_REP);
      if(i<N){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.receiveShadow=true;S.add(m);return m}
  // same recipe as strip(), but walks the short branch spur instead of the main loop
  /* The branch road is laid on the heightfield itself rather than on the ideal curve
     height. The two are not the same thing: roadNear quantises u to one of BN steps and
     the field is sampled on a 2m grid, and up at the summit the lookout's pad flattens
     the ground to PEAK_H while the curve is still climbing towards it. Drawing the ideal
     height left the tarmac and the surface you actually drive on disagreeing by up to
     half a metre on the climb, which is what put the car underneath the road. Sampling
     HF.h per vertex means the road cannot disagree with the ground by construction. */
  function stripB(w,yo,mat){const pos=[],idx=[],uv=[];for(let i=0;i<=BN;i++){const {p,n}=bAt(i/BN);n.multiplyScalar(w/2);
      const lx=p.x-n.x,lz=p.z-n.z,rx=p.x+n.x,rz=p.z+n.z;
      pos.push(lx,HF.h(lx,lz)+yo,lz,rx,HF.h(rx,rz)+yo,rz);uv.push(0,i/BN*BR_REP,1,i/BN*BR_REP);
      if(i<BN){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.receiveShadow=true;S.add(m);return m}
  roadM.color.setHex(0xffffff);roadM.map=roadTex();edgeM.color.setHex(0x6d685e);
  edgeM.map=grainTex(64,.12,1,.6);edgeM.map.repeat.set(3,1);
  strip(7.6+RWX*2,.04,edgeM);strip(5.8+RWX*2,.09,roadM);
  stripB(7+RWX*1.6,.04,edgeM);stripB(5.2+RWX*1.6,.09,roadM);
  /* kerbs on the bends, so the tight corners read before you are in them */
  (function(){const R=[],mat=new THREE.MeshLambertMaterial({map:curbTex()});
    for(let i=0;i<N;i++){const a=at(i/N).tg,b=at((i+2)/N).tg;R.push(Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.z*b.z))))}
    const on=R.map((k,i)=>k>.052);const dil=on.map((_,i)=>{for(let q=-4;q<=4;q++)if(on[(i+q+N)%N])return true;return false});
    const runs=[];let st=-1;for(let i=0;i<=N;i++){const v=i<N&&dil[i];if(v&&st<0)st=i;if(!v&&st>=0){runs.push([st,i]);st=-1}}
    const seg=curve.getLength()/N;
    runs.forEach(([a,b])=>{if(b-a<4)return;[1,-1].forEach(sd=>{const pos=[],uv=[],idx=[];let k=0;
      for(let i=a;i<=b;i++){const {p,n}=at(i/N),o1=2.9+RWX,o2=3.5+RWX;
        pos.push(p.x+n.x*sd*o1,p.y+.1,p.z+n.z*sd*o1,p.x+n.x*sd*o2,p.y+.13,p.z+n.z*sd*o2);
        const v=(i-a)*seg/2;uv.push(0,v,1,v);if(i<b){idx.push(k,k+1,k+2,k+1,k+3,k+2)}k+=2}
      if(sd<0){for(let q=0;q<idx.length;q+=3){const t=idx[q+1];idx[q+1]=idx[q+2];idx[q+2]=t}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
      const m=new THREE.Mesh(g,mat);m.receiveShadow=true;S.add(m)})})})();
  /* The ring, built the same way as the branch: a band swept round the circle with its
     height read off the heightfield, so the tarmac sits on the ground rather than near it. */
  function stripRing(w,yo,mat){const SEG=72,pos=[],idx=[],uv=[];
    for(let i=0;i<=SEG;i++){const a=i/SEG*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
      const ix=RING.x+ca*(RING.r-w/2),iz=RING.z+sa*(RING.r-w/2);
      const ox=RING.x+ca*(RING.r+w/2),oz=RING.z+sa*(RING.r+w/2);
      pos.push(ix,HF.h(ix,iz)+yo,iz,ox,HF.h(ox,oz)+yo,oz);
      uv.push(0,i/SEG*10,1,i/SEG*10);
      if(i<SEG){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.receiveShadow=true;S.add(m);return m}
  stripRing(7,.04,edgeM);stripRing(5.2,.09,roadM);
  const prog=strip(.28,.11,glow);prog.geometry.setDrawRange(0,0);
  // lamp posts (instanced posts + instanced bulbs so it is 2 draw calls, not 60)
  const lamps=[];
  (function(){const US=[];for(let i=0;i<N;i+=15)US.push(i/N);
    const postIM=new THREE.InstancedMesh(new THREE.CylinderGeometry(.06,.08,3.2,6),steel,US.length);
    const bulbGeo=new THREE.SphereGeometry(.22,8,8);const o=new THREE.Object3D();
    US.forEach((u,i)=>{const {p,n}=at(u);const bx=p.x+n.x*(4.6+RWX),bz=p.z+n.z*(4.6+RWX);
      o.position.set(bx,p.y+1.6,bz);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.updateMatrix();postIM.setMatrixAt(i,o.matrix);
      const bulb=new THREE.Mesh(bulbGeo,M(0x3a3733));bulb.position.set(bx,p.y+3.3,bz);S.add(bulb);lamps.push({u,bulb})});
    S.add(postIM)})();
  /* ---------- boost pads on the straights ---------- */
  const padList=[];let padT=0,padCool=0;
  (function(){const c=document.createElement('canvas');c.width=128;c.height=160;const x=c.getContext('2d');
    x.strokeStyle='#ffd257';x.lineWidth=15;x.lineCap='round';x.lineJoin='round';
    for(let s=0;s<3;s++){const y=34+s*46;x.globalAlpha=.55+s*.2;x.beginPath();x.moveTo(20,y+34);x.lineTo(64,y);x.lineTo(108,y+34);x.stroke()}
    const tex=new THREE.CanvasTexture(c);tex.anisotropy=8;
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
    const geoP=new THREE.PlaneGeometry(2.4+RWX*1.2,3.2+RWX).rotateX(-Math.PI/2);const us=[];const cand=[];
    for(let u=.04;u<.96;u+=.004){const t1=at(u-.01).tg,t2=at(u+.01).tg,k=Math.acos(Math.max(-1,Math.min(1,t1.x*t2.x+t1.z*t2.z)));
      if(Math.abs(hAt(u+.01)-hAt(u-.01))>.25)continue;
      
      cand.push([u,k])}
    cand.sort((A,B)=>A[1]-B[1]);for(const [u] of cand){if(us.length>=5)break;if(us.some(v=>Math.abs(v-u)<.12&&Math.abs(v-u)<.88))continue;us.push(u)}
    us.forEach((u,i)=>{const {p,tg}=at(u),m=new THREE.Mesh(geoP,mat);m.position.set(p.x,p.y+.12,p.z);m.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI;S.add(m);
      padList.push({x:p.x,y:p.y,z:p.z,m,ph:i})});padList.mat=mat})();
  /* ---------- water ---------- */
  const pondPts=[];{const K=34;for(let k=0;k<K;k++){const a=k/K*Math.PI*2,rr=edgeR(a);pondPts.push({a,rr,x:POND.x+Math.cos(a)*rr,z:POND.z+Math.sin(a)*rr})}}
  const waterNorm=waterNormTex();
  const waterM=new THREE.MeshPhongMaterial({color:0x2f5566,shininess:64,specular:0x6f8f9f,transparent:true,opacity:.86,normalMap:waterNorm,normalScale:new THREE.Vector2(.45,.45)});
  const water=(function(){const s=new THREE.Shape();pondPts.forEach((p,k)=>{const x=Math.cos(p.a)*p.rr*1.02,z=Math.sin(p.a)*p.rr*1.02;k===0?s.moveTo(x,z):s.lineTo(x,z)});s.closePath();
    const g=new THREE.ShapeGeometry(s,26);const m=new THREE.Mesh(g,waterM);m.rotation.x=-Math.PI/2;m.position.set(POND.x,WATER_Y,POND.z);S.add(m);return m})();
  const ripple=new THREE.Mesh(new THREE.RingGeometry(.9,1.1,28),new THREE.MeshBasicMaterial({color:0xdfe9ef,transparent:true,opacity:0,depthWrite:false}));ripple.rotation.x=-Math.PI/2;S.add(ripple);
  /* ---------- pond dressing: instanced boulders, reeds and lilies ---------- */
  (function(){
    const rocks=[],reeds=[],lilies=[];let seed=17;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    pondPts.forEach((p,i)=>{if(i%2===0){const s=.4+rnd()*.8;rocks.push([p.x+Math.cos(p.a)*1.25,p.z+Math.sin(p.a)*1.25,s,rnd()*6.3])}
      for(let k=0;k<3;k++){const rx=p.x+(rnd()-.5)*2.2,rz=p.z+(rnd()-.5)*2.2;reeds.push([rx,rz,.8+rnd()*1.05,rnd()*6.3])}});
    for(let i=0;i<7;i++){const a=rnd()*6.3,rr=(.25+rnd()*.5)*POND.r;lilies.push([POND.x+Math.cos(a)*rr,POND.z+Math.sin(a)*rr,.26+rnd()*.22])}
    const o=new THREE.Object3D();
    const rIM=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),M(0x5f584c,{roughness:.96,flatShading:true}),rocks.length);rIM.castShadow=!LOW;rIM.receiveShadow=true;
    rocks.forEach(([x,z,s,ry],i)=>{o.position.set(x,HF.h(x,z)+s*.3,z);o.scale.set(s,s*.8,s);o.rotation.set(ry*.4,ry,ry*.2);o.updateMatrix();rIM.setMatrixAt(i,o.matrix)});S.add(rIM);
    const reedGeo=new THREE.ConeGeometry(.05,1,4);const reedIM=new THREE.InstancedMesh(reedGeo,M(0x3f5228,{roughness:.95}),reeds.length*3);
    let k=0;reeds.forEach(([x,z,h,ry])=>{const gy=HF.h(x,z);for(let b=0;b<3;b++){const hh=h*(.7+((b*37)%10)/22);
      o.position.set(x+Math.cos(ry+b*2.1)*.13,gy+hh/2,z+Math.sin(ry+b*2.1)*.13);o.scale.set(1,hh,1);o.rotation.set(Math.cos(ry+b)*.07,ry,Math.sin(ry+b)*.07);o.updateMatrix();reedIM.setMatrixAt(k++,o.matrix)}});
    reedIM.count=k;S.add(reedIM);
    const lilyIM=new THREE.InstancedMesh(new THREE.CircleGeometry(1,10),M(0x2e4a26,{roughness:.6,side:THREE.DoubleSide}),lilies.length);
    lilies.forEach(([x,z,s],i)=>{o.position.set(x,WATER_Y+.03,z);o.scale.set(s,s,s);o.rotation.set(-Math.PI/2,0,i);o.updateMatrix();lilyIM.setMatrixAt(i,o.matrix)});S.add(lilyIM)})();
  SCN.grass=null;
  /* ---------- labels ---------- */
  function label(txt,sub,w=1024,h=256,dark=false){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=dark?'#f2eee6':'#15140f';x.fillRect(0,0,w,h);x.fillStyle=dark?'#15140f':'#f2eee6';x.textAlign='center';x.textBaseline='middle';x.font=`600 ${sub?h*.4:h*.5}px -apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,"Helvetica Neue",Arial,sans-serif`;x.fillText(txt,w/2,sub?h*.38:h*.5,w*.94);if(sub){x.font=`600 ${h*.12}px ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace`;x.fillStyle=dark?'#6b675f':'#9a958c';x.fillText(sub.toUpperCase(),w/2,h*.78,w*.94)}const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t}
  function signPost(x,z,y,txt,sub,dark,ry){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=ry;S.add(g);const post=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,3.2,6),steel);post.position.y=1.6;g.add(post);const b=new THREE.Mesh(new THREE.BoxGeometry(6.4,1.8,.2),dark?paper:ink);b.position.y=3.8;g.add(b);const pl=new THREE.Mesh(new THREE.PlaneGeometry(6.2,1.6),new THREE.MeshBasicMaterial({map:label(txt,sub,1024,264,dark)}));pl.position.set(0,3.8,.12);g.add(pl);const p2=pl.clone();p2.rotation.y=Math.PI;p2.position.z=-.12;g.add(p2);staticBox(x,y+1.6,z,.15,1.6,.15);return g}
  signPost(POND.x+POND.r+2,POND.z,0,'The pond','drive in · you can swim',false,-Math.PI/2);
  signPost(PG.x,PG.z+15,0,'Playground','ramps · crates · cones',false,0);
  signPost(RAMPYARD.x,RAMPYARD.z+13,BR_H,'Ramp yard','launch off all three',false,0);
  /* was 4m from the centre line, i.e. a solid pole on the asphalt since the road was widened; 9m puts it on the verge */
  signPost(BR_START.x-BR_OUT.x*9,BR_START.z-BR_OUT.z*9,BR_H,'Ramp yard →','off the main road',false,Math.atan2(BR_OUT.x,BR_OUT.z));
  signPost(PEAK.x-BR_OUT.x*7,PEAK.z-BR_OUT.z*7,PEAK_H,'The summit','stop for the view',false,Math.atan2(BR_OUT.x,BR_OUT.z));
  const CULL=[];
  /* ---------- playground obstacles: instanced so 10 crates + 7 cones + 5 tires cost a handful of draw
     calls instead of ~40, while staying individually knockable via dynBoxI ---------- */
  const crateIM=new THREE.InstancedMesh(new THREE.BoxGeometry(1.1,1.1,1.1),M(0xd9d2c2),10);crateIM.castShadow=true;S.add(crateIM);
  {let n=0;for(let i=0;i<4;i++)for(let j=0;j<4-i;j++)dynBoxI([{im:crateIM,idx:n++}],PG.x-8+(j-1.5+i*.5)*1.15,i*1.12+.6,PG.z-6,.55,.55,.55,6)}
  const coneBodies=[];
  const coneIM=new THREE.InstancedMesh(new THREE.ConeGeometry(.35,1,10),red,7);coneIM.castShadow=true;S.add(coneIM);
  const coneBaseIM=new THREE.InstancedMesh(new THREE.BoxGeometry(.8,.08,.8),ink,7);S.add(coneBaseIM);
  const coneBaseOff=new THREE.Matrix4().makeTranslation(0,-.46,0);
  function cone(x,z,idx){const b=dynBoxI([{im:coneIM,idx},{im:coneBaseIM,idx,offset:coneBaseOff}],x,.5,z,.35,.5,.35,1);coneBodies.push({b,x,z})}
  for(let i=0;i<7;i++)cone(PG.x+8,PG.z-10+i*3.2,i);
  const tireIM=new THREE.InstancedMesh(new THREE.TorusGeometry(.5,.24,8,16),rubber,5);S.add(tireIM);
  const tireOff=new THREE.Matrix4().makeRotationX(Math.PI/2);
  function tire(x,z,idx){dynBoxI([{im:tireIM,idx,offset:tireOff}],x,.3,z,.75,.25,.75,4)}
  for(let i=0;i<5;i++)tire(PG.x-3+i*1.6,PG.z+6,i);
  function ramp(x,z,ry,ang=.2,base=0){const y=base+.5;const m=new THREE.Mesh(new THREE.BoxGeometry(4,.5,7),M(0x8f2a2a));m.position.set(x,y,z);m.rotation.set(-ang,ry,0,'YXZ');m.castShadow=true;m.receiveShadow=true;S.add(m);const b=new CANNON.Body({mass:0,material:gM});b.addShape(new CANNON.Box(new CANNON.Vec3(2,.25,3.5)));b.position.set(x,y,z);const q1=new CANNON.Quaternion();q1.setFromAxisAngle(new CANNON.Vec3(0,1,0),ry);const q2=new CANNON.Quaternion();q2.setFromAxisAngle(new CANNON.Vec3(1,0,0),-ang);b.quaternion=q1.mult(q2);world.addBody(b)}
  ramp(PG.x,PG.z-2,0);ramp(PG.x-2,PG.z+12,Math.PI/2,.16);
  /* ---------- the outer valley, built ---------- */
  const SWAY={value:0};
  /* wind: foliage sways a little, per tree, in the vertex shader, so it costs nothing on the CPU */
  function addSway(m,amp){m.customProgramCacheKey=()=>'sway'+amp;m.onBeforeCompile=sh=>{sh.uniforms.uSway=SWAY;sh.vertexShader='uniform float uSway;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\n{float ph=instanceMatrix[3].x*.11+instanceMatrix[3].z*.13;float k=max(0.,position.y+.6);transformed.x+=sin(uSway*1.7+ph)*'+amp+'*k;transformed.z+=cos(uSway*1.3+ph*1.3)*'+amp+'*.7*k;}\n#endif')};return m}
  /* pooled soft sprites: tyre smoke, dirt spray, water splash, volcano smoke */
  function makeFX(n){const c=document.createElement('canvas');c.width=c.height=64;{const x=c.getContext('2d'),g=x.createRadialGradient(32,32,2,32,32,31);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.5,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64)}
    const tex=new THREE.CanvasTexture(c),P=[];for(let i=0;i<n;i++){const m=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,opacity:0});const s=new THREE.Sprite(m);s.visible=false;S.add(s);P.push({s,m,life:0,max:1,vx:0,vy:0,vz:0,s0:1,s1:2,a:.5,grav:0})}
    let k=0;return {emit(x,y,z,col,o){const p=P[k];k=(k+1)%n;p.s.position.set(x,y,z);p.m.color.setHex(col);p.life=0;p.max=o.life||1;p.vx=o.vx||0;p.vy=o.vy||0;p.vz=o.vz||0;p.s0=o.s0||.6;p.s1=o.s1||2.2;p.a=o.a||.45;p.grav=o.grav||0;p.s.visible=true},
      upd(dt){for(let i=0;i<n;i++){const p=P[i];if(!p.s.visible)continue;p.life+=dt;const t=p.life/p.max;if(t>=1){p.s.visible=false;continue}
        p.vy-=p.grav*dt;p.s.position.x+=p.vx*dt;p.s.position.y+=p.vy*dt;p.s.position.z+=p.vz*dt;const sc=p.s0+(p.s1-p.s0)*t;p.s.scale.set(sc,sc,1);p.m.opacity=p.a*(1-t)*(t<.12?t/.12:1)}}}}
  const FX=makeFX(LOW?40:90),SMOKE=makeFX(LOW?16:34);
  const tiltBody=(x,y,z,a,b,c,ry,pitch)=>{const w=new CANNON.Body({mass:0,material:oM});w.addShape(new CANNON.Box(new CANNON.Vec3(a,b,c)));w.position.set(x,y,z);
    const q1=new CANNON.Quaternion(),q2=new CANNON.Quaternion();q1.setFromAxisAngle(new CANNON.Vec3(0,1,0),ry);q2.setFromAxisAngle(new CANNON.Vec3(1,0,0),pitch);w.quaternion=q1.mult(q2);world.addBody(w);return w};
  /* a solid wedge you can drive up: the visual is a true triangle prism, the collider a slab along its slope plus a back wall */
  function wedge(x,z,ry,L,rise,w,mat){const y=HF.h(x,z)-.04,s=new THREE.Shape();s.moveTo(-L/2,0);s.lineTo(L/2,0);s.lineTo(L/2,rise);s.lineTo(-L/2,0);
    const g=new THREE.ExtrudeGeometry(s,{depth:w,bevelEnabled:false});g.translate(0,0,-w/2);g.rotateY(-Math.PI/2);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=!LOW;m.receiveShadow=true;S.add(m);
    const a=Math.atan2(rise,L),T=.6,hyp=Math.hypot(L,rise),yc=rise/2-Math.cos(a)*T/2,zc=Math.sin(a)*T/2;
    tiltBody(x+Math.sin(ry)*zc,y+yc,z+Math.cos(ry)*zc,w/2,T/2,hyp/2,ry,-a);
    staticBox(x+Math.sin(ry)*(L/2-.2),y+rise/2,z+Math.cos(ry)*(L/2-.2),w/2,rise/2,.2,ry);return m}
  const concM=M(0xc9c4b8,{map:grainTex(64,.12,3,.62)}),stuntRed=M(0xb8322f,{map:grainTex(64,.12,3,.7)});
  // dirt tracks from the loop out to each zone
  {const dirtM=M(0x7a6548,{map:grainTex(64,.16,1,.55),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
   SPURS.forEach(pts=>{const pos=[],uv=[],idx=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let tx=b[0]-a[0],tz=b[1]-a[1];const l=Math.hypot(tx,tz)||1;
     const nx=-tz/l*3,nz=tx/l*3,[x,z]=pts[i];pos.push(x+nx,HF.h(x+nx,z+nz)+.09,z+nz,x-nx,HF.h(x-nx,z-nz)+.09,z-nz);uv.push(0,i*.6,1,i*.6);if(i)idx.push((i-1)*2,(i-1)*2+1,i*2,(i-1)*2+1,i*2+1,i*2)}
     const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
     const m=new THREE.Mesh(g,dirtM);m.receiveShadow=true;S.add(m)});
   const SIGN=[['Stunt park','mega ramp · giant pins · trampolines'],['The UFO','drive under the light'],['The volcano','hot. do not swim.']];
   SPURS.forEach((pts,i)=>{if(pts.length<8)return;const [x,z]=pts[5],[x2,z2]=pts[6],dx=x2-x,dz=z2-z,l=Math.hypot(dx,dz)||1;let sx=x-dz/l*5.5,sz=z+dx/l*5.5;
     /* since the road was widened one of these posts landed on the asphalt (a solid pole in the racing line): walk it out to the verge */
     for(let k=0;k<40&&roadNear(sx,sz).d<8.5;k++){let bi=0,bd=1e18;for(let j=0;j<N;j++){const ex=sx-SAMP[j].x,ez=sz-SAMP[j].z,e=ex*ex+ez*ez;if(e<bd){bd=e;bi=j}}
       const ex=sx-SAMP[bi].x,ez=sz-SAMP[bi].z,el=Math.hypot(ex,ez)||1;sx+=ex/el*.5;sz+=ez/el*.5}

     signPost(sx,sz,HF.h(sx,sz),SIGN[i][0],SIGN[i][1],i%2===1,Math.atan2(-dx,-dz))})}
  /* --- stunt park ---
     One axis runs straight through the park, lined up with the dirt track in, so the mega
     jump finally has a run-up: boost pad, a 24 m kicker, a table top with the ring of fire
     on it, and a long landing. Miss the speed and you land on the table, not a wall.
     Everything else sits either side of that line. */
  const TRAMP=[],PINS=[];let BOWL=null;
  /* the ball slides on a near-frictionless contact and its spin is set from its speed, so a
     shove from a bumper that sits below its centre cannot put backspin on it */
  const ballPM=new CANNON.Material('ball');world.addContactMaterial(new CANNON.ContactMaterial(gM,ballPM,{friction:.008,restitution:.05}));world.addContactMaterial(new CANNON.ContactMaterial(oM,ballPM,{friction:.04,restitution:.35}));
  const SAX=(function(){const sp=SPURS[0],a=sp[0],b=sp[sp.length-1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;return {ax:dx/l,az:dz/l,ry:Math.atan2(dx/l,dz/l)}})();
  const SP=(s,t)=>{const q=VZ.stunt;return [q.x+SAX.ax*s+SAX.az*t,q.z+SAX.az*s-SAX.ax*t]};
  (function(){const q=VZ.stunt,gy=HF.h(q.x,q.z),ry=SAX.ry;
    const pad=new THREE.Mesh(new THREE.CircleGeometry(q.r-1,64).rotateX(-Math.PI/2),M(0x3b3c3f,{map:grainTex(64,.2,10,.55),polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));pad.position.set(q.x,gy+.03,q.z);pad.receiveShadow=true;S.add(pad);
    // run-up stripe so you can see the line from the track
    {const c=document.createElement('canvas');c.width=64;c.height=512;const x=c.getContext('2d');x.clearRect(0,0,64,512);x.fillStyle='rgba(242,238,230,.85)';for(let i=0;i<512;i+=64)x.fillRect(26,i,12,36);
     const t=new THREE.CanvasTexture(c);const m=new THREE.Mesh(new THREE.PlaneGeometry(1.2,40).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
     const [x0,z0]=SP(-58+20,0);m.position.set(x0,gy+.05,z0);m.rotation.y=ry;S.add(m)}
    // the mega jump: kicker, table top, landing
    {const [x,z]=SP(-26,0);wedge(x,z,ry,24,6,9,stuntRed)}
    {const [x,z]=SP(-1,0),L=26.2,H=6,m=new THREE.Mesh(new THREE.BoxGeometry(9,H,L),concM);m.position.set(x,gy+H/2-.04,z);m.rotation.y=ry;m.castShadow=!LOW;m.receiveShadow=true;S.add(m);staticBox(x,gy+H/2-.04,z,4.5,H/2,L/2,ry)}
    {const [x,z]=SP(27,0);wedge(x,z,ry+Math.PI,30,6,9,concM)}
    {const [x,z]=SP(-46,0),m=new THREE.Mesh(new THREE.PlaneGeometry(2.4,3.2).rotateX(-Math.PI/2),padList.mat);m.position.set(x,gy+.12,z);m.rotation.y=ry+Math.PI;S.add(m);padList.push({x,y:gy,z,m,ph:9})}
    // kickers and trampolines, off the main line
    {let [x,z]=SP(-6,34);wedge(x,z,ry,8,1.9,5,concM);[x,z]=SP(22,32);wedge(x,z,ry,8,1.9,5,concM);[x,z]=SP(46,12);wedge(x,z,ry+Math.PI/2,9,2.3,5,concM)}
    [SP(-30,22),SP(4,22),SP(34,24)].forEach(([x,z])=>{const y=HF.h(x,z),g=new THREE.Group();g.position.set(x,y,z);S.add(g);
      const mat=new THREE.Mesh(new THREE.CircleGeometry(2.5,28).rotateX(-Math.PI/2),M(0x141414));mat.position.y=.1;g.add(mat);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(2.7,.22,8,32).rotateX(Math.PI/2),M(0x2f4f9e));rim.position.y=.14;g.add(rim);TRAMP.push({x,y,z,mat,c:0,b:0})});
    {const [x,z]=SP(-57,7);signPost(x,z,gy,'Mega ramp','line up · hit the boost · through the fire',false,ry+Math.PI)}
    /* --- bowling: a real lane with rails, a ball you shove with the car, and a scoreboard ---
       Push the ball down the lane (or drive through the pins yourself). Once everything
       settles the pins are counted, the board updates, and the lane re-racks itself. */
    const LT=-26,S0=-40,S1=36,LW=12,LL=S1-S0,BR=1;
    const lp=(s,t)=>SP(s,LT+t);
    {const c=document.createElement('canvas');c.width=256;c.height=2048;const x=c.getContext('2d'),py=s=>(s-S0)/LL*2048,px=t=>(t/LW+.5)*256;
     for(let i=0;i<24;i++){const l=48+((i*37)%9)*3;x.fillStyle='rgb('+(170+l*.4|0)+','+(126+l*.3|0)+','+(78+l*.2|0)+')';x.fillRect(i*256/24,0,256/24+1,2048)}
     x.fillStyle='rgba(60,35,15,.25)';for(let i=0;i<=24;i++)x.fillRect(i*256/24,0,1,2048);
     x.fillStyle='rgba(20,14,8,.85)';x.fillRect(0,py(-30)-3,256,6);
     x.fillStyle='rgba(30,18,10,.7)';for(let k=-3;k<=3;k++){const cx=px(k*1.3),cy=py(-18)+Math.abs(k)*14;x.beginPath();x.moveTo(cx,cy-16);x.lineTo(cx+6,cy+8);x.lineTo(cx-6,cy+8);x.closePath();x.fill()}
     for(let k=-4;k<=4;k++){x.beginPath();x.arc(px(k*1.1),py(-25),3,0,6.283);x.fill()}
     x.fillStyle='rgba(255,248,235,.35)';x.fillRect(0,py(21),256,py(S1)-py(21));
     x.fillStyle='rgba(40,25,12,.6)';for(let r=0;r<4;r++)for(let cc=0;cc<=r;cc++){x.beginPath();x.ellipse(px((cc-r/2)*3),py(24+r*3.1),9,5,0,0,6.283);x.fill()}
     const t=new THREE.CanvasTexture(c);t.anisotropy=4;
     const [x0,z0]=lp((S0+S1)/2,0),lane=new THREE.Mesh(new THREE.BoxGeometry(LW,.1,LL),new THREE.MeshPhongMaterial({map:t,specular:0x6a5a48,shininess:70,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3}));
     lane.position.set(x0,gy+.01,z0);lane.rotation.y=ry;lane.receiveShadow=true;S.add(lane)}
    // rails down both sides, a pit wall behind the pins
    {const railM=M(0x1c1d20),stripe=M(0xb8322f);[-1,1].forEach(sd=>{const [x,z]=lp((S0+S1)/2+1,sd*(LW/2+.3));
       const r=new THREE.Mesh(new THREE.BoxGeometry(.6,1,LL+2),railM);r.position.set(x,gy+.5,z);r.rotation.y=ry;r.castShadow=!LOW;S.add(r);
       const st=new THREE.Mesh(new THREE.BoxGeometry(.62,.14,LL+2.02),stripe);st.position.set(x,gy+.82,z);st.rotation.y=ry;S.add(st);staticBox(x,gy+.5,z,.3,.5,(LL+2)/2,ry)});
     const [x,z]=lp(S1+1.6,0),w=new THREE.Mesh(new THREE.BoxGeometry(LW+1.8,4.4,1),railM);w.position.set(x,gy+2.2,z);w.rotation.y=ry;w.castShadow=!LOW;S.add(w);staticBox(x,gy+2.2,z,(LW+1.8)/2,2.2,.5,ry)}
    // pins
    const pr=[[0,-2.1],[.45,-2.1],[.62,-1.5],[.75,-.6],[.62,.3],[.34,.9],[.3,1.3],[.4,1.75],[.3,2.05],[0,2.1]].map(p=>new THREE.Vector2(p[0],p[1]));
    const pg=new THREE.LatheGeometry(pr,18),pm=M(0xf4f1ea),sm=M(0xb8322f),sg=new THREE.TorusGeometry(.36,.07,6,18).rotateX(Math.PI/2);
    // 10 pins as 2 InstancedMeshes (bodies, stripes) instead of 30 individual meshes
    const pinBodyIM=new THREE.InstancedMesh(pg,pm,10);pinBodyIM.castShadow=!LOW;S.add(pinBodyIM);
    const pinStripeIM=new THREE.InstancedMesh(sg,sm,20);S.add(pinStripeIM);
    const stripeOff=[new THREE.Matrix4().makeTranslation(0,1.15,0),new THREE.Matrix4().makeTranslation(0,1.42,0)];
    let pinN=0;
    for(let r=0;r<4;r++)for(let c=0;c<=r;c++){const [x,z]=lp(24+r*3.1,(c-r/2)*3),idx=pinN++;
      const y=HF.h(x,z)+2.12;
      const b=dynBoxI([{im:pinBodyIM,idx},{im:pinStripeIM,idx:idx*2,offset:stripeOff[0]},{im:pinStripeIM,idx:idx*2+1,offset:stripeOff[1]}],x,y,z,.7,2.1,.7,5);
      PINS.push({b,x,y,z})}
    // the ball: glossy, marbled, three finger holes
    const bc=document.createElement('canvas');bc.width=512;bc.height=256;{const x=bc.getContext('2d'),im=x.createImageData(512,256),d=im.data;
      for(let j=0;j<256;j++)for(let i=0;i<512;i++){const u=i/512*6.283,v=j/256*3.1416,w=Math.sin(u*3+Math.sin(v*4+u)*2.2)+Math.sin(v*6+Math.cos(u*2)*1.6),k=(j*512+i)*4,m=.5+.5*Math.sin(w*2.1);
        d[k]=20+m*40|0;d[k+1]=24+m*52|0;d[k+2]=70+m*120|0;d[k+3]=255}x.putImageData(im,0,0);
      x.fillStyle='#050608';[[250,40,13],[274,40,13],[262,78,15]].forEach(([cx,cy,r])=>{x.beginPath();x.ellipse(cx,cy,r,r*.8,0,0,6.283);x.fill()})}
    const ballM=new THREE.MeshPhongMaterial({map:new THREE.CanvasTexture(bc),specular:0xffffff,shininess:110});
    const ball=new THREE.Mesh(new THREE.SphereGeometry(BR,32,22),ballM);ball.castShadow=!LOW;S.add(ball);
    const [hx,hz]=lp(-34,0),bb=new CANNON.Body({mass:60,material:ballPM});bb.addShape(new CANNON.Sphere(BR));bb.position.set(hx,HF.h(hx,hz)+BR+.02,hz);bb.linearDamping=.02;bb.angularDamping=.12;bb.sleepSpeedLimit=.12;world.addBody(bb);
    dyn.push({mesh:ball,body:bb,home:bb.position.clone(),q:bb.quaternion.clone()});
    // scoreboard over the pin deck
    const sc=document.createElement('canvas');sc.width=1024;sc.height=300;const st=new THREE.CanvasTexture(sc);
    {const [x,z]=lp(S1+1.2,0),g=new THREE.Group();g.position.set(x,gy,z);g.rotation.y=ry+Math.PI;S.add(g);
     const fr=new THREE.Mesh(new THREE.BoxGeometry(11.2,3.5,.3),M(0x121316));fr.position.y=7.4;g.add(fr);
     const f=new THREE.Mesh(new THREE.PlaneGeometry(10.8,3.16),new THREE.MeshBasicMaterial({map:st}));f.position.set(0,7.4,.16);g.add(f);
     [-1,1].forEach(s=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.3,5.6,.3),M(0x121316));p.position.set(s*5,2.8,-.2);g.add(p)})}
    {const [x,z]=lp(S0-4,9);signPost(x,z,gy,'Bowling','push the ball · knock the ten',true,ry+Math.PI)}
    BOWL={ball:bb,R:BR,home:bb.position.clone(),wait:(()=>{const [x,z]=lp(S0-3,LW/2+3);return new CANNON.Vec3(x,HF.h(x,z)+BR+.05,z)})(),racked:false,st:0,t:0,slow:0,last:null,best:0,strikes:0,rolls:0,s0:S0,s1:S1,sc,tex:st,
      along:(x,z)=>{const q=VZ.stunt;return (x-q.x)*SAX.ax+(z-q.z)*SAX.az}};
    drawBowl()})();
  function drawBowl(){const B=BOWL,c=B.sc,x=c.getContext('2d');x.fillStyle='#0b0c0e';x.fillRect(0,0,1024,300);
    x.fillStyle='#e8c28a';x.font='600 30px ui-monospace,"SF Mono",Menlo,Consolas,monospace';x.textBaseline='top';x.fillText('LANE 1 · GIANT BOWLING',40,30);
    const cols=[['LAST',B.last==null?'–':String(B.last)],['BEST',String(B.best)],['STRIKES',String(B.strikes)],['ROLLS',String(B.rolls)]];
    cols.forEach(([k,v],i)=>{const x0=40+i*245;x.fillStyle='rgba(242,238,230,.55)';x.font='500 24px ui-monospace,"SF Mono",Menlo,Consolas,monospace';x.fillText(k,x0,100);
      x.fillStyle=i===0&&B.last===10?'#ff6a4a':'#f2eee6';x.font='700 120px -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif';x.fillText(v,x0-4,132)});
    B.tex.needsUpdate=true}
  function pinsDown(){let n=0;const up=new CANNON.Vec3(),Y=new CANNON.Vec3(0,1,0);PINS.forEach(P=>{P.b.quaternion.vmult(Y,up);if(up.y<.8||Math.hypot(P.b.position.x-P.x,P.b.position.z-P.z)>1.3)n++});return n}
  function rackBowl(){const B=BOWL,cp=chassisB.position;
    if(!B.racked){const q=VZ.stunt,dx=cp.x-q.x,dz=cp.z-q.z,s=dx*SAX.ax+dz*SAX.az,t=dx*SAX.az-dz*SAX.ax;if(s>B.s1-18&&Math.abs(t+26)<8)return false;
      PINS.forEach(P=>{P.b.position.set(P.x,P.y,P.z);P.b.quaternion.set(0,0,0,1);P.b.velocity.set(0,0,0);P.b.angularVelocity.set(0,0,0);P.b.wakeUp()});B.racked=true;
      if(B.along(B.ball.position.x,B.ball.position.z)>B.s1-20){B.ball.position.copy(B.wait);B.ball.velocity.set(0,0,0);B.ball.angularVelocity.set(0,0,0)}}
    if(Math.hypot(cp.x-B.home.x,cp.z-B.home.z)<3.6)return false;
    B.ball.position.copy(B.home);B.ball.velocity.set(0,0,0);B.ball.angularVelocity.set(0,0,0);B.ball.quaternion.set(0,0,0,1);B.ball.wakeUp();B.racked=false;return true}
  /* --- the UFO --- */
  const UFO=(function(){const q=VZ.ufo,gy=HF.h(q.x,q.z),g=new THREE.Group();g.position.set(q.x,gy+18,q.z);S.add(g);
    const hull=new THREE.MeshPhongMaterial({color:0xb9bec4,specular:0xffffff,shininess:90});
    const pr=[[0,-1.3],[3.2,-1.1],[7.6,-.2],[8,0],[7.6,.25],[3.4,.9],[0,1.1]].map(p=>new THREE.Vector2(p[0],p[1]));
    const body=new THREE.Mesh(new THREE.LatheGeometry(pr,40),hull);body.castShadow=!LOW;g.add(body);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(3,24,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshPhongMaterial({color:0x6fe3ff,emissive:0x1d6f86,specular:0xffffff,shininess:120,transparent:true,opacity:.85}));dome.position.y=.9;g.add(dome);
    const lm=[new THREE.MeshBasicMaterial({color:0xfff1a8}),new THREE.MeshBasicMaterial({color:0x5cf2ff})],lg=new THREE.SphereGeometry(.28,8,6);
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2,s=new THREE.Mesh(lg,lm[i%2]);s.position.set(Math.cos(a)*7.2,-.05,Math.sin(a)*7.2);g.add(s)}
    const bc=document.createElement('canvas');bc.width=4;bc.height=64;{const x=bc.getContext('2d'),gr=x.createLinearGradient(0,0,0,64);gr.addColorStop(0,'rgba(140,255,240,.75)');gr.addColorStop(1,'rgba(140,255,240,.06)');x.fillStyle=gr;x.fillRect(0,0,4,64)}
    const bm=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(bc),transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.2,6.5,18,32,1,true),bm);beam.position.y=-9.5;g.add(beam);
    const cc=document.createElement('canvas');cc.width=cc.height=256;{const x=cc.getContext('2d');x.strokeStyle=x.fillStyle='rgba(222,206,140,.9)';x.lineWidth=7;
      [120,92,64].forEach(r=>{x.beginPath();x.arc(128,128,r,0,6.283);x.stroke()});for(let i=0;i<6;i++){const a=i/6*6.283;x.beginPath();x.arc(128+Math.cos(a)*92,128+Math.sin(a)*92,14,0,6.283);x.fill()}x.beginPath();x.arc(128,128,30,0,6.283);x.fill()}
    const crop=new THREE.Mesh(new THREE.PlaneGeometry(30,30).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cc),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));crop.position.set(q.x,gy+.06,q.z);S.add(crop);
    return {g,gy,lm,bm,x:q.x,z:q.z,hit:false,cool:false,abT:0,t:0}})();
  /* --- the volcano: basalt cone, a lava lake, three flows and a smoke column --- */
  const VOLC=(function(){const v=VZ.volc,fy=HF.h(v.x,v.z),lavaM=new THREE.MeshBasicMaterial({color:0xff5a1f,side:THREE.DoubleSide});
    const disc=new THREE.Mesh(new THREE.CircleGeometry(v.cr*.85,32).rotateX(-Math.PI/2),lavaM);disc.position.set(v.x,fy+.5,v.z);S.add(disc);
    [.5,2.4,4.3].forEach(a0=>{const pos=[],idx=[];let a=a0,i=0;for(let d=v.cr*.95;d<v.R*.72;d+=2,i++){a+=Math.sin(d*.09+a0)*.035;const cx=v.x+Math.cos(a)*d,cz=v.z+Math.sin(a)*d,w=2.8-1.6*d/v.R,nx=-Math.sin(a)*w,nz=Math.cos(a)*w;
      pos.push(cx+nx,HF.h(cx+nx,cz+nz)+.2,cz+nz,cx-nx,HF.h(cx-nx,cz-nz)+.2,cz-nz);if(i)idx.push((i-1)*2,(i-1)*2+1,i*2,(i-1)*2+1,i*2+1,i*2)}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);S.add(new THREE.Mesh(g,lavaM))});
    const gc=document.createElement('canvas');gc.width=gc.height=64;{const x=gc.getContext('2d'),gr=x.createRadialGradient(32,32,2,32,32,31);gr.addColorStop(0,'rgba(255,130,50,.8)');gr.addColorStop(1,'rgba(255,90,30,0)');x.fillStyle=gr;x.fillRect(0,0,64,64)}
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(gc),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.55}));glow.scale.set(38,24,1);glow.position.set(v.x,fy+7,v.z);S.add(glow);
    return {lavaM,fy,x:v.x,z:v.z,t:0}})();
  /* --- wind turbines along the east ridge --- */
  const TURB=[];[-96,-36,24,84,144].forEach((z,i)=>{const x=234-(i%2)*14;if(zoneHit(x,z,8))return;const y=HF.h(x,z),g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=-Math.PI/2+.25;S.add(g);
    const wm=M(0xeceae4),tw=new THREE.Mesh(new THREE.CylinderGeometry(.55,1,40,12),wm);tw.position.y=20;tw.castShadow=!LOW;g.add(tw);const nc=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,4),wm);nc.position.set(0,40.5,.6);g.add(nc);
    const rot=new THREE.Group();rot.position.set(0,40.5,2.8);g.add(rot);rot.add(new THREE.Mesh(new THREE.SphereGeometry(.9,12,10),wm));
    for(let k=0;k<3;k++){const bg=new THREE.BoxGeometry(.9,15,.25);bg.translate(0,7.8,0);const b=new THREE.Mesh(bg,wm);b.rotation.z=k*Math.PI*2/3;rot.add(b)}
    staticBox(x,y+10,z,1,10,1);TURB.push({rot,sp:.8+i*.08})});
  /* --- hot air balloons drifting over the valley --- */
  const BAL=[];[['#b8322f','#f2eee6'],['#2f4f9e','#d9b23a'],['#3f8a56','#f2eee6'],['#d9b23a','#b8322f']].forEach(([a,b],i)=>{
    const c=document.createElement('canvas');c.width=128;c.height=64;const x=c.getContext('2d');for(let s=0;s<8;s++){x.fillStyle=s%2?a:b;x.fillRect(s*16,0,16,64)}
    const g=new THREE.Group(),env=new THREE.Mesh(new THREE.SphereGeometry(6,20,16),M(0xffffff,{map:new THREE.CanvasTexture(c)}));env.scale.y=1.18;env.position.y=9;g.add(env);
    const sk=new THREE.Mesh(new THREE.CylinderGeometry(2.6,1.1,3.4,14,1,true),M(new THREE.Color(a).getHex(),{side:THREE.DoubleSide}));sk.position.y=2.4;g.add(sk);
    const bk=new THREE.Mesh(new THREE.BoxGeometry(1.4,1,1.4),M(0x7a5a36));bk.position.y=-.4;g.add(bk);S.add(g);
    BAL.push({g,a:i*1.57,r:110+i*28,h:58+i*10,sp:.01+i*.004,cx:i%2?50:-40,cz:i<2?30:-50})});
  /* --- clouds: a soft layer that rides with the camera, like the sky it sits in --- */
  const CLOUDM=new THREE.SpriteMaterial({transparent:true,opacity:.8,fog:false,depthWrite:false});
  const CLOUD=new THREE.Group();S.add(CLOUD);{const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');
    for(let i=0;i<14;i++){const px=40+Math.random()*176,py=52+Math.random()*36,r=20+Math.random()*28,g=x.createRadialGradient(px,py,2,px,py,r);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,256,128)}
    CLOUDM.map=new THREE.CanvasTexture(c);
    for(let i=0;i<(LOW?8:16);i++){const s=new THREE.Sprite(CLOUDM),sc=50+Math.random()*50;s.scale.set(sc,sc*.45,1);s.position.set((Math.random()-.5)*400,90+Math.random()*25,(Math.random()-.5)*300);CLOUD.add(s)}}
  /* --- more chaos: a ring of fire over the gap, boulders off the volcano, a shark, fireworks, a speed trap --- */
  const FIRE=(function(){const q=VZ.stunt,gy=HF.h(q.x,q.z),R=3.2,[x,z]=SP(-2,0),g=new THREE.Group();g.position.set(x,gy+6+R+.06,z);g.rotation.y=SAX.ry;S.add(g);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R,.3,10,48),new THREE.MeshBasicMaterial({color:0xff7a22})));
    [-1,1].forEach(s=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.35,1.3,.6),M(0x2a2a2a));p.position.set(s*R*.62,-R*.9,0);g.add(p)});
    return {x:g.position.x,y:g.position.y,z:g.position.z,R,ry:SAX.ry,hit:0}})();
  const ROCKS=[];{const rm=M(0x2b2522,{flatShading:true});for(let i=0;i<3;i++){const r=2+i*.4,mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),rm);mesh.castShadow=!LOW;S.add(mesh);
    const b=new CANNON.Body({mass:500,material:oM});b.addShape(new CANNON.Sphere(r));b.angularDamping=.1;b.sleepSpeedLimit=.4;world.addBody(b);ROCKS.push({mesh,b,r,t:99,a:.3+i*2.1})}}
  /* the boulders start on the volcano, not wherever the physics world was at birth */
  setTimeout(()=>ROCKS.forEach(k=>dropRock(k)),0);
  function dropRock(k){const v=VZ.volc,a=k.a+Math.random()*.7,d=v.cr+4,x=v.x+Math.cos(a)*d,z=v.z+Math.sin(a)*d;k.b.position.set(x,HF.h(x,z)+k.r+1,z);k.b.velocity.set(Math.cos(a)*5,0,Math.sin(a)*5);k.b.angularVelocity.set(0,0,0);k.t=Math.random()*4}
  const FIN=(function(){const s=new THREE.Shape();s.moveTo(-.55,0);s.lineTo(.55,0);s.quadraticCurveTo(.05,.5,-.6,1.2);s.lineTo(-.55,0);const g=new THREE.ExtrudeGeometry(s,{depth:.12,bevelEnabled:false});g.translate(0,0,-.06);
    const m=new THREE.Mesh(g,M(0x5d6770));S.add(m);return {m,a:0}})();
  const TRAP=(function(){const {p,n,tg}=at(.33),g=new THREE.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=Math.atan2(tg.x,tg.z);S.add(g);
    [-1,1].forEach(s=>{const po=new THREE.Mesh(new THREE.BoxGeometry(.3,6.4,.3),M(0x2a2a2a));po.position.set(s*(6+RWX),3.2,0);g.add(po)});
    const bm=new THREE.Mesh(new THREE.BoxGeometry(12.4+RWX*2,.9,.3),M(0x15140f));bm.position.y=6.2;g.add(bm);
    const pl=new THREE.Mesh(new THREE.PlaneGeometry(6,.8),new THREE.MeshBasicMaterial({map:label('Speed trap','how fast are you',1024,140,false),side:THREE.DoubleSide}));pl.position.set(0,6.2,-.17);pl.rotation.y=Math.PI;g.add(pl);
    return {x:p.x,z:p.z,c:0,best:0}})();
  let fwT=3;
  function WORLD2(dt,now){const t=now/1000;
    FIN.a+=dt*.35;const fr=POND.r*.55;FIN.m.position.set(POND.x+Math.cos(FIN.a)*fr,WATER_Y-.1+Math.sin(t*2)*.05,POND.z+Math.sin(FIN.a)*fr);FIN.m.rotation.y=-FIN.a;
    const near=(x,z,r)=>Math.hypot(C.position.x-x,C.position.z-z)<r;
    if(near(FIRE.x,FIRE.z,160)){for(let k=0;k<2;k++){const a=Math.random()*6.283;FX.emit(FIRE.x+Math.cos(a)*FIRE.R*Math.cos(FIRE.ry),FIRE.y+Math.sin(a)*FIRE.R,FIRE.z-Math.cos(a)*FIRE.R*Math.sin(FIRE.ry),Math.random()<.5?0xff8a2a:0xffc24a,{life:.55,vy:2.2,s0:.9,s1:2.2,a:.75})}}
    if(near(VZ.volc.x,VZ.volc.z,280))ROCKS.forEach(k=>{k.t+=dt;if(k.t>16||k.b.position.y<-20)dropRock(k);k.mesh.position.copy(k.b.position);k.mesh.quaternion.copy(k.b.quaternion)});
    fwT-=dt;if(fwT<=0&&near(VZ.stunt.x,VZ.stunt.z,300)){fwT=4+Math.random()*4;const x=VZ.stunt.x+(Math.random()-.5)*60,z=VZ.stunt.z+(Math.random()-.5)*60,y=HF.h(x,z)+42+Math.random()*18,col=[0xff5a5a,0x5ad1ff,0xffe15a,0xa6ff6a,0xff8ae0][Math.random()*5|0];
      for(let k=0;k<18;k++){const a=k/18*6.283,e=(Math.random()-.3)*1.2;FX.emit(x,y,z,col,{life:1.7,vx:Math.cos(a)*9,vz:Math.sin(a)*9,vy:e*8,grav:5,s0:1.2,s1:.5,a:.95})}if(near(x,z,120))blip(180+Math.random()*80,.25,.06)}
    if(active&&driving){const cp=car.position,v=chassisB.velocity;
      const fdx=cp.x-FIRE.x,fdz=cp.z-FIRE.z,fal=fdx*SAX.ax+fdz*SAX.az,flt=fdx*SAX.az-fdz*SAX.ax;if(Math.abs(fal)<2.6&&Math.hypot(flt,cp.y-FIRE.y)<FIRE.R+.3&&now-FIRE.hit>3000){FIRE.hit=now;toastMsg('Through the fire');missSet('fire',1);blip(520,.3,.12)}
      TRAP.c=Math.max(0,TRAP.c-dt);if(TRAP.c<=0&&Math.hypot(cp.x-TRAP.x,cp.z-TRAP.z)<7){TRAP.c=4;const kmh=Math.round(Math.hypot(v.x,v.z)*3.6);const nb=kmh>TRAP.best;if(nb)TRAP.best=kmh;toastMsg('Speed trap · '+kmh+' km/h'+(nb?' · new best':' · best '+TRAP.best));blip(nb?900:600,.15,.08)}}}
  let offD=0,smokeT=0;
  function WORLDFX(dt,now){const t=now/1000;SWAY.value=t;
    CLOUD.position.set(C.position.x,0,C.position.z);CLOUD.children.forEach(s=>{s.position.x+=dt*2.2;if(s.position.x>200)s.position.x=-200});
    TURB.forEach(T=>T.rot.rotation.z-=dt*T.sp);
    BAL.forEach((B,i)=>{B.a+=dt*B.sp;B.g.position.set(B.cx+Math.cos(B.a)*B.r,B.h+Math.sin(t*.35+i)*2.2,B.cz+Math.sin(B.a)*B.r)});
    VOLC.t+=dt;VOLC.lavaM.color.setHSL(.045,1,.5+.07*Math.sin(VOLC.t*2.1));
    smokeT-=dt;if(smokeT<=0&&Math.hypot(C.position.x-VOLC.x,C.position.z-VOLC.z)<340){smokeT=.35;SMOKE.emit(VOLC.x+(Math.random()-.5)*6,VOLC.fy+4,VOLC.z+(Math.random()-.5)*6,Math.random()<.5?0x2f2c2a:0x46423e,{life:9,vy:4+Math.random()*2,vx:1.6,vz:.4,s0:7,s1:30,a:.6})}
    {const U=UFO;U.t+=dt;U.g.rotation.y+=dt*.18;U.g.position.y=U.gy+18+Math.sin(U.t*1.1)*.6;U.bm.opacity=.32+.14*Math.sin(U.t*5);if(frameN%14===0)U.lm[0].color.setHex((frameN/14|0)%2?0xfff1a8:0xff6a3a)}
    if(active&&driving){const cp=car.position,v=chassisB.velocity,sp2=Math.hypot(v.x,v.z);
      // trampolines
      TRAMP.forEach(T=>{T.c=Math.max(0,T.c-dt);T.b=Math.max(0,T.b-dt*3);T.mat.position.y=.1-T.b*.35;
        if(T.c<=0&&Math.hypot(cp.x-T.x,cp.z-T.z)<2.7&&cp.y<T.y+2.2){v.y=17;T.c=.9;T.b=1;shake=Math.max(shake,.25);blip(420,.18,.1);setTimeout(()=>blip(840,.2,.08),80);
          for(let k=0;k<6;k++)FX.emit(T.x,T.y+.4,T.z,0xd8d2c4,{life:.8,vy:2,vx:(Math.random()-.5)*4,vz:(Math.random()-.5)*4,s0:.6,s1:2.4,a:.35})}});
      // too hot
      if(Math.hypot(cp.x-VOLC.x,cp.z-VOLC.z)<VZ.volc.cr*.85&&cp.y<VOLC.fy+2.5){toastMsg('Too hot. Back to the road.');resetCar()}
      // bowling: wait for a roll, let it settle, count, show it, re-rack
      if(BOWL){const B=BOWL,bb=B.ball,bs=Math.hypot(bb.velocity.x,bb.velocity.z),al=B.along(bb.position.x,bb.position.z);
        if(bs>.15&&bb.position.y<B.home.y+.4)bb.angularVelocity.set(bb.velocity.z/B.R,0,-bb.velocity.x/B.R);
        if(B.st===0){if(bs>1.2||(frameN%10===0&&pinsDown()>0)){B.st=1;B.t=now;B.slow=0}}
        else if(B.st===1){B.slow=bs<.5?B.slow+dt:0;if(al>B.s1-2||B.slow>1.4||now-B.t>16000||bb.position.y<-4){B.st=2;B.t=now}}
        else if(B.st===2){if(now-B.t>2600){const n=pinsDown();B.rolls++;B.last=n;B.best=Math.max(B.best,n);
            if(n===10){B.strikes++;toastMsg('STRIKE · all ten down');blip(660,.2,.12);setTimeout(()=>blip(880,.25,.12),120);setTimeout(()=>blip(1320,.4,.1),240);shake=Math.max(shake,.25)}
            else if(n===0)toastMsg('Gutter ball · 0 pins');else{toastMsg(n+(n===1?' pin':' pins')+' down'+(n>=8?' · so close':''));blip(520+n*30,.18,.1)}
            if(n>0)missSet('strike',n);drawBowl();B.st=3;B.t=now}}
        else if(B.st===3){if(now-B.t>2400&&rackBowl()){B.st=0}}}
      // tyre smoke, dirt spray, splashes
      if(frameN%4===0)offD=roadNear(cp.x,cp.z).d;
      for(let i=2;i<4;i++){const w=veh.wheelInfos[i],rr=w.raycastResult;if(!w.isInContact||!rr||!rr.hitPointWorld)continue;const hp=rr.hitPointWorld;
        if(sub>.05){if(sp2>2&&Math.random()<.5)FX.emit(hp.x,hp.y+.3,hp.z,0xdcecf2,{life:.8,vy:3+Math.random()*2,vx:(Math.random()-.5)*2,vz:(Math.random()-.5)*2,grav:9,s0:.5,s1:1.7,a:.55});continue}
        const slide=sp2>4&&(w.skidInfo<.75||(key.h&&sp2>5));
        if(slide&&offD<7.5+RWX){if(Math.random()<.6)FX.emit(hp.x,hp.y+.25,hp.z,0xc9c6bf,{life:1.4,vy:.7,vx:(Math.random()-.5)*.8,vz:(Math.random()-.5)*.8,s0:.7,s1:3.2,a:.3})}
        else if(offD>6.5+RWX&&sp2>5&&Math.random()<Math.min(.65,sp2/32))FX.emit(hp.x,hp.y+.2,hp.z,0x8a7556,{life:1,vy:1.1+Math.random(),vx:-v.x*.08+(Math.random()-.5),vz:-v.z*.08+(Math.random()-.5),grav:1.5,s0:.5,s1:2.5,a:.36})}}
    FX.upd(dt);SMOKE.upd(dt)}
  /* ---------- ramp yard: three jumps down the side spur, for the ramp-rally mission.
     The yard sits on top of the Platform hill, not at ground level, so every prop here
     is based off BR_H instead of the 0 the playground's props assume. */
  const RAMPS=[{x:RAMPYARD.x-6,z:RAMPYARD.z-5,ry:0},{x:RAMPYARD.x+6,z:RAMPYARD.z+1,ry:Math.PI/2},{x:RAMPYARD.x-1,z:RAMPYARD.z+9,ry:Math.PI}];
  RAMPS.forEach((r,i)=>{r.id=i;ramp(r.x,r.z,r.ry,.22,BR_H)});
  const rampHit=new Set();
  /* ---------- woodland: two species, clustered into copses, all instanced ---------- */
  const treePts=[];
  (function(){
    let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const okSpot=(x,z,minRoad)=>{if(zoneHit(x,z,6))return false;
      if(roadNear(x,z).d<minRoad)return false;
      if((x-POND.x)**2+(z-POND.z)**2<(POND.r+6)**2)return false;
      if((x-PG.x)**2+(z-PG.z)**2<24*24)return false;
      if(PADS.some(p=>(p.x-x)**2+(p.z-z)**2<p.r*p.r))return false;
      const h=HF.h(x,z);if(h<.35)return false;
      if(HF.slope(x,z)>1.35)return false;
      return true};
    // copses first, then loners, so the woods clump the way real ones do
    const centres=[];let tries=0;
    while(centres.length<110&&tries<5200){tries++;const x=(rnd()-.5)*(360*MK*LAND),z=(rnd()-.5)*(360*MK*LAND);if(okSpot(x,z,26))centres.push([x,z])}
    centres.forEach(([cx,cz])=>{const n=7+(rnd()*11|0);
      for(let i=0;i<n;i++){const a=rnd()*6.283,r=rnd()*18+2,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
        if(!okSpot(x,z,13))continue;treePts.push([x,z,.78+rnd()*.85,rnd()<.62?0:1,rnd()*6.283])}});
    tries=0;while(treePts.length<900&&tries<26000){tries++;const x=(rnd()-.5)*(368*MK*LAND),z=(rnd()-.5)*(368*MK*LAND);
      if(!okSpot(x,z,13))continue;treePts.push([x,z,.7+rnd()*.8,rnd()<.5?0:1,rnd()*6.283])}
    const conifer=treePts.filter(t=>t[3]===0),broad=treePts.filter(t=>t[3]===1);
    const o=new THREE.Object3D();
    const barkM=M(0x40301f,{roughness:1,map:grainTex(48,.14,2,.55)});
    const needleM=addSway(leafM,'0.05'),broadM=addSway(M(0x47632a,{roughness:.96}),'0.04');
    // conifers: a trunk plus three stacked cones
    if(conifer.length){
      const trIM=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.28,2.6,6),barkM,conifer.length);
      const tiers=[[3.0,1.95,1.55],[4.3,1.5,1.35],[5.4,1.05,1.05]];
      const tierIM=tiers.map(()=>new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,8),needleM,conifer.length));
      tierIM.forEach(m=>{m.castShadow=!LOW;m.receiveShadow=true});
      conifer.forEach(([x,z,s,,ry],i)=>{const y=HF.h(x,z);
        o.position.set(x,y+1.3*s,z);o.scale.set(s,s,s);o.rotation.set(0,ry,0);o.updateMatrix();trIM.setMatrixAt(i,o.matrix);
        tiers.forEach(([ty,rad,hh],k)=>{o.position.set(x,y+ty*s,z);o.scale.set(rad*s,hh*s,rad*s);o.rotation.set(0,ry+k*.7,0);o.updateMatrix();tierIM[k].setMatrixAt(i,o.matrix)})});
      S.add(trIM);tierIM.forEach(m=>S.add(m))}
    // broadleaf: short trunk, three offset canopy blobs
    if(broad.length){
      const trIM=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.32,2.1,6),barkM,broad.length);
      const blobs=[[0,2.9,0,1.55],[.7,3.5,.25,1.15],[-.6,3.3,-.35,1.05]];
      const blobIM=blobs.map(()=>new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),broadM,broad.length));
      blobIM.forEach(m=>{m.castShadow=!LOW;m.receiveShadow=true});
      broad.forEach(([x,z,s,,ry],i)=>{const y=HF.h(x,z);
        o.position.set(x,y+1.05*s,z);o.scale.set(s,s,s);o.rotation.set(0,ry,0);o.updateMatrix();trIM.setMatrixAt(i,o.matrix);
        blobs.forEach(([bx,by,bz,br],k)=>{o.position.set(x+bx*s,y+by*s,z+bz*s);o.scale.set(br*s,br*s*.85,br*s);o.rotation.set(ry+k,ry*.5,k*.6);o.updateMatrix();blobIM[k].setMatrixAt(i,o.matrix)})});
      S.add(trIM);blobIM.forEach(m=>S.add(m))}
    // only the roadside trees need to be solid; the rest are scenery and cost nothing
    treePts.forEach(([x,z,s])=>{if(roadNear(x,z).d<42+RWX)staticBox(x,HF.h(x,z)+1.2,z,.34,1.2,.34)});
  })();
  /* ---------- missions ---------- */
  const MSAVE=(()=>{try{return JSON.parse(localStorage.getItem('sl_miss')||'{}')}catch(e){return{}}})();
  const LAP_TARGET=Math.round(80000*MK/1000)*1000;
  const MISSIONS=[
    {id:'cones',name:'Cone slalom',hint:'Knock over seven cones at the playground',goal:7},
    {id:'swim',name:'Take it swimming',hint:'Drive into the pond and wade through',goal:1},
    {id:'air',name:'Send it',hint:'Catch a full second of air off a ramp',goal:1},
    {id:'ramps',name:'Ramp rally',hint:'Take the side road and launch off all three yard ramps',goal:3},
    {id:'strike',name:'Strike',hint:'Knock down all ten giant pins in the stunt park, north of the loop',goal:10},
    {id:'fire',name:'Ring of fire',hint:'Jump the mega ramp through the ring of fire',goal:1},
    {id:'ufo',name:'Close encounter',hint:'Follow the dirt track west and drive under the UFO',goal:1},
    {id:'lap',name:'Hot lap',hint:'Time a lap under '+(LAP_TARGET/1000)+'s',goal:1},
  ];
  MISSIONS.forEach(m=>{m.prog=0;if(MSAVE[m.id]){m.done=true;m.prog=m.goal}});
  const missEl=$('#dmiss'),missH=$('#dmissh'),missS=$('#dmisss'),missC=$('#dmissc');
  function missSave(){try{const o={};MISSIONS.forEach(m=>{if(m.done)o[m.id]=1});localStorage.setItem('sl_miss',JSON.stringify(o))}catch(e){}}
  const curMission=()=>MISSIONS.find(m=>!m.done)||null;
  function missUI(){const m=curMission(),n=MISSIONS.filter(x=>x.done).length;
    missC.textContent=n+'/'+MISSIONS.length;
    if(!m){missH.textContent='All missions cleared';missS.textContent='You ate. No crumbs left.';}
    else{missH.textContent=m.name;missS.textContent=m.hint+(m.goal>1?'  ·  '+Math.min(m.prog,m.goal)+'/'+m.goal:'')}}
  function missSet(id,v){const m=MISSIONS.find(x=>x.id===id);if(!m||m.done)return;
    if(v<=m.prog)return;m.prog=v;
    if(m.prog>=m.goal){m.done=true;missSave();earnCoins(50);blip(680,.3,.13);toastMsg('Mission done · '+m.name+' · +50 coins');
      }
    else blip(560,.16,.1);
    missUI()}
  missUI();
  /* ---------- circuit: the road is a closed loop, so it is also a race track ---------- */
  const TLEN=curve.getLength();
  const lapEl=$('#dlap'),lapT=$('#dlapt'),lapN=$('#dlapn'),lapB=$('#dlapb'),lapSecs=$$('#dlap .lsec i');
  const boardEl=$('#dboard'),bdList=$('#dbdlist'),bdName=$('#dbdname'),bdSave=$('#dbdsave'),bdNote=$('#dbdnote'),raceBtn=$('#drace');
  function fmtT(ms){if(!isFinite(ms)||ms<=0)return '--:--.--';const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000),c=Math.floor(ms%1000/10);
    return m+':'+String(s).padStart(2,'0')+'.'+String(c).padStart(2,'0')}
  let LAPS=(()=>{try{const a=JSON.parse(localStorage.getItem('sl_laps')||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}})();
  let raceMode=false,lapArmed=false,lapStart=0,lapProg=0,lapNo=0,lapVoid=false,offT=0,lapU=0,lapInit=false,
      bestMs=LAPS.reduce((a,l)=>Math.min(a,l.ms||Infinity),Infinity),lastMs=0,pendingMs=0;
  function startRace(){
    if(raceMode){stopRace();return}
    raceMode=true;lapArmed=true;lapVoid=false;lapProg=0;lapNo=0;lapInit=false;offT=0;
    lapEl.classList.add('on');lapEl.classList.remove('void','best');raceBtn.textContent='Stop timing';
    lapT.textContent='--:--.--';lapN.textContent='Cross the line';lapB.textContent='Best '+fmtT(bestMs);
    toastMsg('Timing armed · cross the start gate to begin');blip(700,.14)}
  function stopRace(){raceMode=false;lapArmed=false;lapEl.classList.remove('on');raceBtn.textContent='Time a lap'}
  function lapRow(l,me){return '<li class="'+(me?'me pend':'')+'"><span class="p">'+l.p+'</span><span><span class="n">'+
    String(l.n||'Anon').replace(/[<>&]/g,'')+'</span> <span class="v">'+String(l.veh||'').replace(/[<>&]/g,'')+'</span></span><span class="t">'+fmtT(l.ms)+'</span></li>'}
  function renderBoard(){
    const base=LAPS.slice();
    const saved=LAPS.some(l=>l.ms===pendingMs);
    // the lap you just set shows straight away, marked unsaved until you put a name to it
    if(pendingMs&&!saved)base.push({n:(function(){try{return localStorage.getItem('sl_name')||'You'}catch(e){return 'You'}})(),ms:pendingMs,veh:V.label,pend:true});
    const rows=base.sort((a,b)=>a.ms-b.ms).slice(0,8);
    bdList.innerHTML=rows.length?rows.map((l,i)=>lapRow(Object.assign({p:i+1},l),!!l.pend)).join('')
      :'<li class="em">No laps yet. Hit \u201cTime a lap\u201d, cross the start gate and go round once.</li>';
    bdNote.textContent=pendingMs&&!saved?('Your last lap: '+fmtT(pendingMs)+' \u00b7 add a name and save it')
      :'Times are kept on this device.'}
  function openBoard(){boardEl.classList.add('on');try{bdName.value=localStorage.getItem('sl_name')||''}catch(e){}
    bdSave.disabled=!pendingMs;renderBoard()}
  function closeBoard(){boardEl.classList.remove('on')}
  raceBtn.onclick=startRace;$('#dboardb').onclick=openBoard;$('#dboardx').onclick=closeBoard;
  boardEl.addEventListener('click',e=>{if(e.target===boardEl)closeBoard()});
  bdSave.onclick=()=>{if(!pendingMs)return;
    const nm=(bdName.value||'').trim().slice(0,14)||'Anon';try{localStorage.setItem('sl_name',nm)}catch(e){}
    LAPS.push({n:nm,ms:pendingMs,veh:V.label,at:Date.now()});LAPS.sort((a,b)=>a.ms-b.ms);LAPS=LAPS.slice(0,8);
    try{localStorage.setItem('sl_laps',JSON.stringify(LAPS))}catch(e){}
    bdSave.disabled=true;bdSave.textContent='Saved';renderBoard();setTimeout(()=>{bdSave.textContent='Save my time'},1900)};
  function lapDone(ms){
    lastMs=ms;pendingMs=ms;
    const isBest=ms<bestMs;if(isBest)bestMs=ms;
    lapEl.classList.toggle('best',isBest);
    blip(isBest?880:640,.35,.14);
    const reward=isBest?30:10;earnCoins(reward);
    toastMsg((isBest?'New best lap · ':'Lap · ')+fmtT(ms)+' · +'+reward+' coins');
    if(ms<LAP_TARGET)missSet('lap',1);
    lapB.textContent='Best '+fmtT(bestMs);
    setTimeout(()=>lapEl.classList.remove('best'),2600);
    // submit to global leaderboard
    submitToLeaderboard(ms,V.label);
}
async function submitToLeaderboard(ms,vehicle){
    const name=localStorage.getItem('sl_name')||'Anon';
    const entry={n:name,ms,veh:vehicle,at:Date.now()};
    try{
      const res=await fetch(SUPA.url+'/rest/v1/leaderboard',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':SUPA.key,
          'Authorization':'Bearer '+SUPA.key
        },
        body:JSON.stringify(entry)
      });
      if(res.ok)toastMsg('Time uploaded to global leaderboard!');
    }catch(e){console.warn('Leaderboard submit failed:',e)}
  }
  /* ---------- start / finish gantry ---------- */
  (function(){const {p,ry,n}=at(0);
    // painted line
    const lw=6.2+RWX*2,seg=10;const cg=document.createElement('canvas');cg.width=seg*2;cg.height=8;const cx=cg.getContext('2d');
    for(let i=0;i<seg;i++)for(let j=0;j<2;j++){cx.fillStyle=(i+j)%2?'#f2eee6':'#1b1a16';cx.fillRect(i*2,j*4,2,4)}
    const lt=new THREE.CanvasTexture(cg);lt.magFilter=THREE.NearestFilter;
    const line=new THREE.Mesh(new THREE.PlaneGeometry(lw,1.5),new THREE.MeshBasicMaterial({map:lt}));
    line.rotation.set(-Math.PI/2,0,-ry);line.position.set(p.x,p.y+.115,p.z);S.add(line);
    const g=new THREE.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=ry;S.add(g);
    [-1,1].forEach(s=>{const post=new THREE.Mesh(new THREE.BoxGeometry(.4,7,.4),paper);post.position.set(s*(4.6+RWX),3.5,0);post.castShadow=!LOW;g.add(post);
      staticBox(p.x+Math.cos(ry)*s*(4.6+RWX),p.y+3,p.z-Math.sin(ry)*s*(4.6+RWX),.26,3,.26)});
    const top=new THREE.Mesh(new THREE.BoxGeometry(10+RWX*2,1.5,.45),ink);top.position.y=7.3;g.add(top);
    const lab=new THREE.Mesh(new THREE.PlaneGeometry(9.6+RWX*2,1.3),new THREE.MeshBasicMaterial({map:label('START · FINISH','one lap · beat the board',1024,150,false)}));
    lab.position.set(0,7.3,.26);g.add(lab);const l2=lab.clone();l2.rotation.y=Math.PI;l2.position.z=-.26;g.add(l2)})();
  /* ---------- checkpoint/lap validation anti-cheat system ---------- */
  const CHECKPOINT_COUNT=8;
  const checkpoints=[];
  function initCheckpoints(){
    checkpoints.length=0;
    for(let i=0;i<CHECKPOINT_COUNT;i++){
      const u=i/CHECKPOINT_COUNT;
      const {p,n}=at(i/CHECKPOINT_COUNT);
      checkpoints.push({u,p,n,passed:false});
    }
  }
  let lastCpIndex=-1,lastCpTime=0,cpViolations=0,lastLapStart=0,lapValid=true;
  function checkCheckpoints(wrapFwd){
    if(!raceMode||lapArmed)return;
    const now=performance.now();
    for(let i=0;i<checkpoints.length;i++){
      const cp=checkpoints[i];
      const dx=car.position.x-cp.p.x;
      const dz=car.position.z-cp.p.z;
      const dist=Math.hypot(dx,dz);
      const forward=dx*cp.n.x+dz*cp.n.z;
      if(dist<15 && forward>0 && !cp.passed){
        // check if this is the next expected checkpoint
        const expectedIdx=(lastCpIndex+1)%checkpoints.length;
        if(i===expectedIdx){
          cp.passed=true;
          lastCpIndex=i;
          lastCpTime=performance.now();
        }else if(i!==lastCpIndex && !cp.passed){
          // skipped checkpoint or went backwards
          cpViolations++;
          lapValid=false;
          if(cpViolations>3){
            invalidateLap();
          }
        }
      }
    }
    // reset checkpoints on lap completion
    if(wrapFwd && lapArmed===false){
      if(lapValid && cpViolations===0 && lastCpIndex===CHECKPOINT_COUNT-1){
        // valid lap completed
      }else{
        invalidateLap();
      }
      // reset for next lap
      checkpoints.forEach(cp=>cp.passed=false);
      lastCpIndex=-1;
      cpViolations=0;
      lapValid=true;
    }
    // speed hack detection
    const speed=Math.hypot(chassisB.velocity.x,chassisB.velocity.z);
    const maxAllowedSpeed=V.max*1.8;   // boost and long downhills legitimately pass V.max; only flag truly impossible speed
    if(speed>maxAllowedSpeed){
      cpViolations++;
      if(cpViolations>5){
        invalidateLap();
      }
    }
    // teleport detection (position change too large)
    if(lastCpTime>0){
      const dt=(performance.now()-lastCpTime)/1000;
      if(dt>0){
        const maxDist=V.max*1.5*dt;
        // position change would be checked against last known valid position
      }
    }
  }
  function invalidateLap(){
    lapVoid=true;
    lapEl.classList.add('void');
    lapT.textContent='VOID';
    offT=0;
    lapValid=false;
    // reset checkpoints
    checkpoints.forEach(cp=>cp.passed=false);
    lastCpIndex=-1;
    cpViolations=0;
  }
  initCheckpoints();
  /* ---------- anti-cheat system ---------- */
  let acPosHistory=[],acInputHistory=[],acLastValidPos=null,acLastValidTime=0;
  function recordAntiCheatState(){
    if(!active||!driving)return;
    const pos=car.position.clone();
    const inputs={f:key.f,b:key.b,l:key.l,r:key.r,h:key.h,boost:key.boost};
    acPosHistory.push({pos,time:performance.now()});
    acInputHistory.push({inputs,time:performance.now()});
    if(acPosHistory.length>600)acPosHistory.shift();
    if(acInputHistory.length>600)acInputHistory.shift();
  }
  window.recordAntiCheatState = recordAntiCheatState;
  function validateAntiCheat(){
    if(!active||!driving||!acLastValidPos)return;
    const now=performance.now();
    const dt=(now-acLastValidTime)/1000;
    if(dt<0.1)return;
    // position change validation
    const dx=car.position.x-acLastValidPos.x;
    const dz=car.position.z-acLastValidPos.z;
    const dist=Math.hypot(dx,dz);
    const maxDist=V.max*1.5*dt/1000;
    if(dist>maxDist+5){
      console.warn('[AntiCheat] Teleport detected:',dist,'max:',maxDist);
      cpViolations+=3;
      if(cpViolations>5)invalidateLap();
      car.position.copy(acLastValidPos);
      return;
    }
    // input validation - check for impossible inputs
    const recentInputs=acInputHistory.slice(-60);
    let simultaneousInputs=0;
    recentInputs.forEach(i=>{
      if(i.inputs.f && i.inputs.b)simultaneousInputs++;
      if(i.inputs.l && i.inputs.r)simultaneousInputs++;
    });
    if(simultaneousInputs>45){
      console.warn('[AntiCheat] Impossible input pattern detected');
      cpViolations+=2;
    }
    // wall hack detection - check if car is inside terrain
    const terrainHeight=terrainH(car.position.x,car.position.z);
    if(car.position.y<terrainHeight-2){
      console.warn('[AntiCheat] Underground detected');
      cpViolations+=2;
      car.position.y=terrainHeight+1;
    }
    acLastValidPos=car.position.clone();
    acLastValidTime=now;
  }
  // server-side validation for multiplayer
  function validatePeer(P){
    if(!P.got)return true;
    if(!P.tp)return true;
    const speed=Math.hypot(P.vx,P.vz);
    if(speed>V.max*1.2)return false;
    return true;
  }
  /* ---------- traffic lights ----------
     Placed clear of the two overtaking stretches, so they never hold a car up in
     the middle of an overtake or fight the overtake logic. The AI
     reads them: amber and red both bring a car down to a stop a few metres short of
     the line, and it pulls away again when the light goes green. You are not forced
     to stop — this is a playground, not a driving test — but the traffic behaves. */
  const LIGHTS=[{u:.185,off:0},{u:.545,off:9.5}];
  const L_CYCLE=20,L_GREEN=11,L_AMBER=2;
  const lightPhase=(L,ts)=>{const t=((ts+L.off)%L_CYCLE+L_CYCLE)%L_CYCLE;
    return t<L_GREEN?0:t<L_GREEN+L_AMBER?1:2};   // 0 green, 1 amber, 2 red
  (function(){
    const housing=M(0x15140f);
    LIGHTS.forEach(L=>{
      const q=faceAt(L.u,1,7,14);
      const g=new THREE.Group();g.position.set(q.x,q.y,q.z);g.rotation.y=q.ry;S.add(g);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.115,4.4,7),steel);pole.position.y=2.2;g.add(pole);
      const box=new THREE.Mesh(new THREE.BoxGeometry(.52,1.34,.34),housing);box.position.set(0,4.15,.1);g.add(box);
      const hood=new THREE.Mesh(new THREE.BoxGeometry(.6,.08,.42),housing);hood.position.set(0,4.86,.14);g.add(hood);
      // top to bottom: red, amber, green
      L.lamps=[0,1,2].map(k=>{
        const m=new THREE.MeshBasicMaterial({color:0x201f1c,fog:true});
        const s=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),m);
        s.position.set(0,4.58-k*.42,.28);g.add(s);return m});
      staticBox(q.x,q.y+2,q.z,.17,2,.17);
      CULL.push(g)})})();
  const L_ON=[0xe0352b,0xf0a828,0x35c05a],L_OFF=[0x2c1512,0x2b2412,0x13291a];
  function updLights(ts){for(let i=0;i<LIGHTS.length;i++){const L=LIGHTS[i],ph=lightPhase(L,ts);
    for(let k=0;k<3;k++)L.lamps[k].color.setHex(ph===k?L_ON[k]:L_OFF[k])}}
  /* ---------- car models ----------
     Real silhouettes instead of stacked boxes. The side profile is drawn once as a shape
     with proper wheel arches and extruded with a rounded bevel, the glasshouse sits on top
     and tucks in towards the roof, and paint, glass and chrome get a small reflection map
     so the bodywork catches the sky the way lacquer does. Player and traffic share it. */
  const CARENV=(function(){const cv=(fn)=>{const c=document.createElement('canvas');c.width=c.height=64;fn(c.getContext('2d'));return c};
    const side=cv(x=>{const g=x.createLinearGradient(0,0,0,64);g.addColorStop(0,'#566b82');g.addColorStop(.46,'#9aa6b0');g.addColorStop(.52,'#3c3b37');g.addColorStop(1,'#161513');x.fillStyle=g;x.fillRect(0,0,64,64)});
    const up=cv(x=>{x.fillStyle='#4e6178';x.fillRect(0,0,64,64);const g=x.createRadialGradient(32,32,2,32,32,30);g.addColorStop(0,'#aab6c2');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64)});
    const dn=cv(x=>{x.fillStyle='#22211e';x.fillRect(0,0,64,64)});
    const t=new THREE.CubeTexture([side,side,up,dn,side,side]);t.needsUpdate=true;return t})();
  const CARMATS=[];const phong=(c,o)=>{const m=new THREE.MeshPhongMaterial(Object.assign({color:c,specular:0x3a3a3a,shininess:60,envMap:CARENV,reflectivity:.1,combine:THREE.MixOperation},o||{}));CARMATS.push(m);return m};
  const carGlassM=phong(0x080b0e,{specular:0x8a8a8a,shininess:110,reflectivity:.16,side:THREE.DoubleSide});
  const chromeM=phong(0xd2d4d6,{specular:0xffffff,shininess:120,reflectivity:.7});
  const alloyM=phong(0xb2b5b8,{specular:0xbbbbbb,shininess:80,reflectivity:.42});
  const gunM=phong(0x3a3d41,{specular:0x777777,shininess:90,reflectivity:.3});
  const trimM=new THREE.MeshPhongMaterial({color:0x131313,specular:0x1c1c1c,shininess:18,side:THREE.DoubleSide});
  const tyreM=new THREE.MeshLambertMaterial({color:0x1c1c1c,side:THREE.DoubleSide});
  const discM=new THREE.MeshLambertMaterial({color:0x6a6966}),plateM=new THREE.MeshLambertMaterial({color:0xefece4});
  const evGlassM=phong(0x040506,{specular:0x9a9a9a,shininess:120,reflectivity:.1});
  const npcHeadM=new THREE.MeshLambertMaterial({color:0xfff2c0,emissive:0xfff2c0,emissiveIntensity:1});
  /* bake a group's meshes into one mesh per material, so a car is a handful of draw calls */
  function bakeGroup(root){root.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(),byM=new Map(),kill=[],mx=new THREE.Matrix4();
    root.traverse(o=>{if(!o.isMesh||o.userData.keep)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      mx.multiplyMatrices(inv,o.matrixWorld);g.applyMatrix4(mx);
      if(mx.determinant()<0){const p=g.attributes.position.array,n=g.attributes.normal.array;for(let i=0;i<p.length;i+=9)for(let k=0;k<3;k++){let t=p[i+3+k];p[i+3+k]=p[i+6+k];p[i+6+k]=t;t=n[i+3+k];n[i+3+k]=n[i+6+k];n[i+6+k]=t}}
      if(!byM.has(o.material))byM.set(o.material,[]);byM.get(o.material).push(g);kill.push(o)});
    kill.forEach(o=>o.parent.remove(o));
    byM.forEach((gs,m)=>{let n=0;gs.forEach(g=>n+=g.attributes.position.count);const P=new Float32Array(n*3),N=new Float32Array(n*3);let off=0;
      gs.forEach(g=>{P.set(g.attributes.position.array,off*3);N.set(g.attributes.normal.array,off*3);off+=g.attributes.position.count;g.dispose()});
      const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.BufferAttribute(P,3));bg.setAttribute('normal',new THREE.BufferAttribute(N,3));bg.computeBoundingSphere();
      const me=new THREE.Mesh(bg,m);me.userData.keep=true;me.castShadow=!LOW&&m!==carGlassM;me.receiveShadow=false;root.add(me)})}
  /* smooth the panels but keep real creases: normals are averaged only across faces within 38 degrees */
  function crease(g,deg){g=g.index?g.toNonIndexed():g;const p=g.attributes.position.array,cnt=p.length/9,fn=[],map=new Map(),
      K=i=>Math.round(p[i]*500)+'_'+Math.round(p[i+1]*500)+'_'+Math.round(p[i+2]*500),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let f=0;f<cnt;f++){a.fromArray(p,f*9);b.fromArray(p,f*9+3);c.fromArray(p,f*9+6);const n=c.clone().sub(b).cross(a.clone().sub(b)).normalize();fn.push(n);
      for(let k=0;k<3;k++){const kk=K(f*9+k*3);let L=map.get(kk);if(!L)map.set(kk,L=[]);L.push(f)}}
    const N=new Float32Array(p.length),ct=Math.cos(deg*Math.PI/180),sv=new THREE.Vector3();
    for(let f=0;f<cnt;f++)for(let k=0;k<3;k++){sv.set(0,0,0);if(Math.abs(fn[f].x)>.975){N[f*9+k*3]=fn[f].x;N[f*9+k*3+1]=fn[f].y;N[f*9+k*3+2]=fn[f].z;continue}const L=map.get(K(f*9+k*3));for(let q=0;q<L.length;q++){const m=fn[L[q]];if(m.dot(fn[f])>=ct&&Math.abs(m.x)<=.975)sv.add(m)}
      if(sv.lengthSq()<1e-8)sv.copy(fn[f]);sv.normalize();N[f*9+k*3]=sv.x;N[f*9+k*3+1]=sv.y;N[f*9+k*3+2]=sv.z}
    g.setAttribute('normal',new THREE.BufferAttribute(N,3));return g}
  function extrudeSide(shape,width,bev){const g=new THREE.ExtrudeGeometry(shape,{depth:width-bev*2,bevelEnabled:true,bevelThickness:bev,bevelSize:bev*.8,bevelSegments:3,curveSegments:12});
    g.translate(0,0,-(width-bev*2)/2);g.rotateY(-Math.PI/2);return g}
  /* Wheels: a real tyre section (rounded shoulders, a bit of sidewall bulge, tread
     grooves), a deep barrel, a machined lip, and a dished twin-spoke face in dark
     gunmetal. The player's car also gets a vented disc and a caliper that does not spin. */
  const tyreM2=new THREE.MeshPhongMaterial({color:0x161616,specular:0x2c2c2c,shininess:9});
  const grooveM=new THREE.MeshLambertMaterial({color:0x060606});
  const barrelM=new THREE.MeshLambertMaterial({color:0x0c0c0d,side:THREE.DoubleSide});
  const spokeM=phong(0x24272b,{specular:0x9a9a9a,shininess:85,reflectivity:.22});
  const lipM=phong(0xc9ccd0,{specular:0xffffff,shininess:120,reflectivity:.55});
  const discM2=new THREE.MeshPhongMaterial({color:0x76746f,specular:0x555555,shininess:40});
  const hatM=new THREE.MeshLambertMaterial({color:0x2b2b2b});
  const calM=new THREE.MeshPhongMaterial({color:0xb8322f,specular:0x664444,shininess:50});
  function makeWheel(r,wd,sx,detail,aero){const w=new THREE.Group();w.rotation.order='YXZ';const spin=new THREE.Group();w.add(spin);const inn=new THREE.Group();inn.scale.x=sx;spin.add(inn);
    const put=(geo,m,x,y,z,rx)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y||0,z||0);if(rx)o.rotation.x=rx;inn.add(o);return o};
    const seg=detail?44:22,rr=r*.7;
    // tyre: inner bead to outer bead
    const pr=[[rr,-wd*.47],[r*.8,-wd*.5],[r*.9,-wd*.49],[r*.965,-wd*.44],[r*.993,-wd*.34],[r,-wd*.2],[r,wd*.2],[r*.993,wd*.34],[r*.965,wd*.44],[r*.9,wd*.49],[r*.8,wd*.5],[rr,wd*.47]].map(p=>new THREE.Vector2(p[0],p[1]));
    put(new THREE.LatheGeometry(pr,seg).rotateZ(Math.PI/2),tyreM2,0);
    if(detail)[-.12,0,.12].forEach(o=>put(new THREE.CylinderGeometry(r*1.001,r*1.001,.018,seg,1,true).rotateZ(Math.PI/2),grooveM,wd*o));
    // barrel and lip
    put(new THREE.CylinderGeometry(rr*.99,rr*.99,wd*.9,seg,1,true).rotateZ(Math.PI/2),barrelM,-wd*.02);
    put(new THREE.TorusGeometry(rr*.985,.02,8,seg).rotateY(Math.PI/2),lipM,wd*.43);
    // dished twin spokes: the hub sits deeper than the lip
    const NS=5,xi=wd*.24,xo=wd*.42,ri=r*.17,ro=rr*.95,L=Math.hypot(xo-xi,ro-ri),th=Math.atan2(xo-xi,ro-ri);
    const sg=new THREE.BoxGeometry(detail?.05:.06,L,detail?.048:.06);sg.rotateZ(-th);sg.translate((xi+xo)/2,(ri+ro)/2,0);
    for(let k=0;k<NS;k++){const a0=k/NS*Math.PI*2;(detail?[-.11,.11]:[0]).forEach(d=>{const m=new THREE.Mesh(sg,spokeM);m.rotation.x=a0+d;inn.add(m)})}
    put(new THREE.CylinderGeometry(r*.19,r*.21,.06,18).rotateZ(Math.PI/2),spokeM,xi);
    put(new THREE.CylinderGeometry(r*.075,r*.075,.07,12).rotateZ(Math.PI/2),lipM,xi+.012);
    if(detail){for(let k=0;k<5;k++){const a=k/5*Math.PI*2+.3;put(new THREE.CylinderGeometry(.013,.013,.07,6).rotateZ(Math.PI/2),lipM,xi+.01,Math.cos(a)*r*.12,Math.sin(a)*r*.12)}
      put(new THREE.CylinderGeometry(rr*.78,rr*.78,.03,32).rotateZ(Math.PI/2),discM2,wd*.02);
      put(new THREE.CylinderGeometry(r*.27,r*.27,.08,20).rotateZ(Math.PI/2),hatM,wd*.08)}
    bakeGroup(spin);
    if(detail){const cg=new THREE.Group();cg.scale.x=sx;w.add(cg);
      const c=new THREE.Mesh(new THREE.TorusGeometry(rr*.66,.055,6,10,1.1).rotateY(Math.PI/2),calM);c.scale.set(1.6,1,1);c.rotation.x=-.2;c.position.set(wd*.12,0,0);cg.add(c)}
    return {w,spin}}
  window.makeWheel = makeWheel;
  /* o: paint, roof (colour or null), r wheel radius, zf/zb axle z, F/B nose and tail z, W width, xw/ww wheel track and width, wagon, head/tail materials, wheels */
  function buildCar(o){const g=new THREE.Group(),body=new THREE.Group();g.add(body);
    const {r,zf,zb,F,B,W}=o,A=r+.13,rc=r,sill=.27,belt=.9;
    const paint=phong(o.paint),roofM=o.roof!=null?phong(o.roof,{reflectivity:.1,specular:0x3a3a3a}):paint;
    const tailM2=o.tail||new THREE.MeshLambertMaterial({color:0xff3b30,emissive:0xff2a20,emissiveIntensity:.55}),headM3=o.head||npcHeadM;
    // lower body: bumper to bumper with the arches cut into the bottom edge
    const s=new THREE.Shape();s.moveTo(F-.06,.3);s.lineTo(zf+A,.3);s.lineTo(zf+A,rc);s.absarc(zf,rc,A,0,Math.PI,false);s.lineTo(zf-A,sill);s.lineTo(zb+A,sill);s.lineTo(zb+A,rc);
    s.absarc(zb,rc,A,0,Math.PI,false);s.lineTo(zb-A,.3);s.lineTo(B+.08,.3);s.quadraticCurveTo(B-.04,.34,B-.02,.56);s.lineTo(B-.01,.78);s.quadraticCurveTo(B,belt+.03,B+.16,belt+.03);
    s.quadraticCurveTo(B+.6,belt+.05,zb+.2,belt+.02);if(o.ev){s.lineTo(zf-.3,belt-.02);s.quadraticCurveTo(F-.45,belt-.14,F-.08,.64);s.quadraticCurveTo(F+.05,.61,F+.05,.52);s.lineTo(F+.04,.46)}
    else{s.lineTo(zf-.4,belt);s.quadraticCurveTo(F-.5,belt-.08,F-.12,.74);s.quadraticCurveTo(F+.03,.71,F+.04,.6);s.lineTo(F+.03,.5)}s.quadraticCurveTo(F+.02,.34,F-.06,.3);
    const bw=W-.04;const lb=new THREE.Mesh(crease(extrudeSide(s,bw,o.ev?.12:.09),38),paint);body.add(lb);
    // glasshouse, pulled in towards the roof (tumblehome)
    const wsB=zf-(o.ev?.36:.4),rf=o.ev?-.1:o.wagon?-.25:.02,rr=o.ev?B+.95:o.wagon?B+.45:B+1.25,rb=o.ev?B+.3:o.wagon?B+.25:B+.52,rt=belt+(o.ev?.5:.54);
    const P0=new THREE.Vector2(wsB,belt-.04),C0=new THREE.Vector2(wsB-(o.ev?.5:.42),belt+(o.ev?.44:.44)),P1=new THREE.Vector2(rf-.05,rt-.02);
    const C1=new THREE.Vector2((rf+rr)/2,rt+.06),P2=new THREE.Vector2(rr,rt-.04),C2=o.ev?new THREE.Vector2(rr-.55,rt-.04):o.wagon?new THREE.Vector2(rb-.02,rt-.1):new THREE.Vector2(rr-.4,belt+.34),P3=new THREE.Vector2(rb,belt-.02);
    const cs=new THREE.Shape();cs.moveTo(P3.x,belt-.06);cs.lineTo(P0.x,belt-.06);cs.lineTo(P0.x,P0.y);cs.quadraticCurveTo(C0.x,C0.y,P1.x,P1.y);cs.quadraticCurveTo(C1.x,C1.y,P2.x,P2.y);cs.quadraticCurveTo(C2.x,C2.y,P3.x,P3.y);
    const cw=W-.32,cb=.1,TH=.3;
    const tumble=geo=>{const p=geo.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);if(y>belt)p.setX(i,p.getX(i)*(1-(y-belt)*TH))}p.needsUpdate=true;return geo};
    const cab=new THREE.Mesh(crease(tumble(extrudeSide(cs,cw,cb)),38),o.ev?evGlassM:roofM);body.add(cab);
    // windscreen and rear glass follow the cabin curve, lifted just off it
    const strip=(a,c,b,t0,t1,hw)=>{const pos=[],idx=[],SEG=10,q=new THREE.QuadraticBezierCurve(a,c,b);
      for(let i=0;i<=SEG;i++){const t=t0+(t1-t0)*i/SEG,p=q.getPoint(t),d=q.getTangent(t),nz=d.y,ny=-d.x,off=cb*.8+.012;
        const y=p.y+ny*off,z=p.x+nz*off;pos.push(-hw,y,z,hw,y,z);if(i<SEG){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
      const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));gg.setIndex(idx);gg.computeVertexNormals();return tumble(gg)};
    const hw=cw/2-cb-.05;if(!o.ev)body.add(new THREE.Mesh(strip(P0,C0,P1,.15,.92,hw),carGlassM));body.add(new THREE.Mesh(strip(P2,C2,P3,.1,.9,hw),carGlassM));
    // side windows: flat panes on the cabin flank, split by the B pillar
    const pane=(pts,sd)=>{const sh=new THREE.Shape(pts.map(p=>new THREE.Vector2(p[0],p[1])));const sg=new THREE.ShapeGeometry(sh).toNonIndexed();const p=sg.attributes.position;
      for(let i=0;i<p.count;i++){const zz=p.getX(i),yy=p.getY(i);p.setXYZ(i,sd*(cw/2+.006),yy,zz)}if(sd>0){const a=p.array;for(let i=0;i<a.length;i+=9)for(let k=0;k<3;k++){const t=a[i+3+k];a[i+3+k]=a[i+6+k];a[i+6+k]=t}}
      sg.computeVertexNormals();return new THREE.Mesh(tumble(sg),carGlassM)};
    const bp=(rf+wsB)/2-.35,b2=bp-.12;
    const fw=[[wsB-.14,belt+.03],[wsB-.42,belt+.24],[rf-.02,rt-.1],[bp,rt-.1],[bp,belt+.03]];
    const rw=o.wagon?[[b2,belt+.03],[b2,rt-.1],[rr+.12,rt-.12],[rb+.12,belt+.26],[rb+.14,belt+.03]]:[[b2,belt+.03],[b2,rt-.1],[rr+.1,rt-.12],[rr-.28,belt+.24],[rb+.3,belt+.03]];
    if(!o.ev)[1,-1].forEach(sd=>{body.add(pane(fw,sd));body.add(pane(rw,sd))});
    // lamps, grille, trim
    const box=(w,h,d,m,x,y,z,ry)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.set(x,y,z);if(ry)b.rotation.y=ry;body.add(b);return b};
    if(o.ev){box(W-.5,.03,.05,headM3,0,.6,F+.1);box(W-.2,.05,.06,tailM2,0,.86,B-.07);box(W-.3,.04,.3,trimM,0,.27,F-.02);
      [1,-1].forEach(sd=>{box(.44,.06,.1,headM3,sd*(W/2-.34),.58,F+.07,sd*-.26)})}
    [1,-1].forEach(sd=>{if(!o.ev)box(.46,.11,.12,headM3,sd*(W/2-.36),.66,F+.06,sd*-.22);if(!o.ev){box(.5,.16,.08,trimM,sd*(W/2-.37),.66,F+.03,sd*-.22);
      box(.34,.13,.08,tailM2,sd*(W/2-.26),.8,B-.05,sd*.2)}
      box(.1,.1,.2,roofM,sd*(cw/2+.1),belt+.12,wsB-.18);box(.12,.03,.05,trimM,sd*(cw/2+.02),belt+.08,wsB-.18);
      box(.04,.08,zf-zb-2*A-.1,trimM,sd*(bw/2-.01),sill+.03,(zf+zb)/2);
      [bp+.38,b2-.05].forEach(z=>box(.03,.035,.17,o.ev?trimM:chromeM,sd*(bw/2+.005),belt-.14,z-.3));
      [zf-A-.05,bp-.06,zb+A+.05].forEach(z=>box(.012,.5,.012,trimM,sd*(bw/2+.003),.58,z));
      const lin=new THREE.Mesh(new THREE.CylinderGeometry(A-.02,A-.02,bw-.3,14,1,true,0,Math.PI).rotateZ(Math.PI/2),trimM);[zf,zb].forEach(z=>{const l=lin.clone();l.position.set(0,rc,z);body.add(l)})});
    if(!o.ev){box(W-.9,.05,.06,tailM2,0,.84,B-.06);box(.88,.17,.06,trimM,0,.47,F+.1)}
    box(W-.5,.11,.06,trimM,0,.34,F+.06);
    box(W-.4,.13,.08,trimM,0,.35,B-.06);box(.52,.13,.02,plateM,0,.56,B-.1);
    if(!o.ev)[1,-1].forEach(sd=>{const e=new THREE.Mesh(new THREE.CylinderGeometry(.05,.055,.16,10).rotateX(Math.PI/2),chromeM);e.position.set(sd*.46,.32,B-.1);body.add(e)});
    bakeGroup(body);
    const wheels=[];if(o.wheels){[[1,zf],[-1,zf],[1,zb],[-1,zb]].forEach(([sx,z])=>{const k=makeWheel(r,o.ww||.3,sx,false);k.w.position.set(sx*o.xw,r,z);g.add(k.w);wheels.push(k)})}
    return {g,body,wheels,tail:tailM2,paint}}
  /* ---------- the player's car ----------
     One continuous shell, lofted through ~170 cross sections. Each section is a real body
     section: a flat floor, a rounded sill, a flank with a slight bulge, a rounded shoulder,
     then a glasshouse that leans in and rolls over into the roof. Lamps, grille, pillars,
     door shuts, handles and cladding are regions of that same surface with their own
     material, not boxes stuck on top, so nothing overlaps and nothing flickers. */
  function buildEV(o){const g=new THREE.Group(),body=new THREE.Group();g.add(body);
    const {r,zf,zb,F,B,W}=o,A=r+.08,rc=r,zc=(F+B)/2,HL=(F-B)/2,HW=W/2;
    const paint=phong(o.paint,{specular:0x8a8a8a,shininess:120,reflectivity:.09}),tailM2=o.tail,headM3=o.head;
    const revM=new THREE.MeshLambertMaterial({color:0xeeeeea,emissive:0xffffff,emissiveIntensity:0});
    const grilleM=new THREE.MeshPhongMaterial({color:0x0a0a0b,specular:0x333333,shininess:30});
    const houseM=new THREE.MeshPhongMaterial({color:0x0c0d0f,specular:0xbbbbbb,shininess:130});
    const lensM=new THREE.MeshPhongMaterial({color:0x4a0808,specular:0xffffff,shininess:140});
    const cl=(v,a,b)=>Math.max(a,Math.min(b,v)),sm=t=>{t=cl(t,0,1);return t*t*(3-2*t)};
    const zw=zf-.22,zrf=zw-1.05,zrr=B+1.2,zrb=B+.5,ROOF=1.6,bp=(zw+zrr)/2+.05;
    const ybF=z=>{if(z>zw){const t=cl((F-z)/(F-zw),0,1);return .88+.2*Math.sqrt(t)}
      if(z>zrb)return 1.08+(zw-z)/(zw-zrb)*.04;const t=cl((zrb-z)/(zrb-B),0,1);return 1.12-t*t*.12};
    const ytF=z=>{const yb=ybF(z);
      if(z<=zw&&z>zrf){const t=(zw-z)/(zw-zrf);return yb+(ROOF-yb)*(1-Math.pow(1-t,2.2))}
      if(z<=zrf&&z>=zrr){const m=(zrf+zrr)/2,h=(zrf-zrr)/2;return ROOF+.015-.015*((z-m)/h)**2}
      if(z<zrr&&z>zrb){const t=(zrr-z)/(zrr-zrb);return yb+(ROOF-yb)*(1-Math.pow(t,1.6))}
      return yb};
    const y0F=z=>{let y=.3;const fz=zf+A,bz=zb-A;if(z>fz)y+=sm((z-fz)/(F-fz))*.1;if(z<bz)y+=sm((bz-z)/(bz-B))*.12;
      for(const az of [zf,zb]){const d=z-az;if(Math.abs(d)<A)y=Math.max(y,rc+Math.sqrt(A*A-d*d))}return Math.min(y,ybF(z)-.12)};
    const wF=z=>{const t=cl(Math.abs(z-zc)/HL,0,1);return HW*Math.pow(1-Math.pow(t,5),1/5)};
    // rows: dense at the nose and tail, plus exact rows for every shut line and handle edge
    const GAPS=[zf-A-.07,bp,zb+A+.07],HAND=[zf-A-.42,bp-.36],zs=[];
    for(let i=0;i<=150;i++)zs.push(zc+HL*Math.sin((-1+2*i/150)*Math.PI/2));
    GAPS.forEach(z=>zs.push(z-.007,z+.007));HAND.forEach(z=>zs.push(z-.1,z+.1));[bp-.065,bp+.065,zw-.3,zrr-.05,zrf,zrr].forEach(z=>zs.push(z));
    zs.sort((a,b)=>a-b);for(let i=zs.length-2;i>=1;i--)if(zs[i+1]-zs[i]<.002||(i===1&&zs[1]-zs[0]<.002))zs.splice(i,1);
    // one half-section, bottom centre to roof centre; each point carries what part of the body it is
    function half(z){const w=Math.max(.002,wF(z)),f=w/HW,y0=y0F(z),yb=ybF(z),h=Math.max(.03*f,ytF(z)-yb),H=yb-y0,P=[];
      const rbx=Math.min(.16,w*.45),rby=Math.min(.15,H*.3),rtx=Math.min(.12,w*.4),rty=Math.min(.1,H*.25),wg=w-rtx;
      P.push([0,y0,'F'],[w-rbx,y0,'F']);
      for(let k=1;k<=4;k++){const a=k/4*Math.PI/2;P.push([w-rbx+rbx*Math.sin(a),y0+rby-rby*Math.cos(a),'K'])}
      for(let j=1;j<=5;j++){const y=y0+rby+(H-rby-rty)*j/6;P.push([w+.016*f*Math.sin(Math.PI*j/6),y,'S'])}
      for(let k=0;k<=4;k++){const a=k/4*Math.PI/2;P.push([w-rtx+rtx*Math.cos(a),yb-rty+rty*Math.sin(a),'T'])}
      P.push([wg-.006,yb+.035,'G',.001]);
      for(let i=1;i<=10;i++){const ph=Math.PI/2*i/10,y=yb+h*Math.pow(Math.sin(ph),2/3.2);P.push([Math.max(0,wg*Math.pow(Math.cos(ph),2/3.2)-(y-yb)*.28),y,'G',ph])}
      return {P,cab:ytF(z)-yb>.1}}
    // what the surface is at a given spot
    function region(x,y,z,part,ph,cab,i){const t=Math.abs(z-zc)/HL,front=z>zc,xr=Math.abs(x)/HW;
      if(part==='G'){if(!cab)return paint;if(i===0)return chromeM;
        if(ph<.95){if(Math.abs(z-bp)<.065||z>zw-.3)return trimM;if(z<zrr-.05)return paint;return evGlassM}
        if(z>zrf||z<zrr)return evGlassM;return ph>1.2?evGlassM:paint}
      if(part==='F')return trimM;
      for(const az of [zf,zb])if(Math.abs(z-az)<A+.12&&y<y0F(z)+.12)return trimM;
      if(part==='K')return trimM;
      if(part==='S'){const yb=ybF(z),y0=y0F(z);
        for(const gz of GAPS)if(Math.abs(z-gz)<.008&&y>y0+.12&&y<yb-.05)return trimM;
        for(const hz of HAND)if(Math.abs(z-hz)<.1&&y>yb-.21&&y<yb-.14)return chromeM}
      return paint}
    const pos=[],rows=[],bucket=new Map();let ring=0;
    zs.forEach(z=>{const {P,cab}=half(z),R=P.length;ring=2*R-2;const row={z,P,cab};rows.push(row);
      const sh=v=>{const [x,y]=v;let zz=z;if(z>zf)zz-=Math.max(0,y-.5)*.22*sm((z-zf)/(F-zf));if(z<zb)zz+=Math.max(0,y-.6)*.12*sm((zb-z)/(zb-B));return zz};
      for(let k=0;k<R;k++)pos.push(P[k][0],P[k][1],sh(P[k]));for(let k=R-2;k>=1;k--)pos.push(-P[k][0],P[k][1],sh(P[k]))});
    const R=rows[0].P.length;
    for(let i=1;i<rows.length;i++){const a0=(i-1)*ring,a1=i*ring,zm=(rows[i].z+rows[i-1].z)/2,cab=rows[i].cab&&rows[i-1].cab,P=rows[i].P,Q=rows[i-1].P;
      for(let k=0;k<ring;k++){const k2=(k+1)%ring,hi=q=>q<R?q:ring-q,ha=hi(k),hb=hi(k2),top=Math.max(ha,hb),sg=k<R-1?1:-1,
          x=(P[ha][0]+P[hb][0]+Q[ha][0]+Q[hb][0])/4*sg,y=(P[ha][1]+P[hb][1]+Q[ha][1]+Q[hb][1])/4,pt=P[top],gi=pt[2]==='G'?top-(R-11):0;
        const m=region(x,y,zm,pt[2],pt[3]||0,cab,gi);if(!bucket.has(m))bucket.set(m,[]);bucket.get(m).push(a0+k,a1+k,a0+k2,a0+k2,a1+k,a1+k2)}}
    const all=[];bucket.forEach(L=>all.push(...L));
    const base=new THREE.BufferGeometry();base.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));base.setIndex(all);base.computeVertexNormals();
    {let sx=0;const n=base.attributes.normal,p=base.attributes.position;for(let v=0;v<n.count;v++)if(p.getX(v)>HW*.8)sx+=n.getX(v);
     if(sx<0){bucket.forEach(L=>{for(let q=0;q<L.length;q+=3){const t=L[q+1];L[q+1]=L[q+2];L[q+2]=t}});const all2=[];bucket.forEach(L=>all2.push(...L));base.setIndex(all2);base.computeVertexNormals()}}
    bucket.forEach((L,m)=>{const gg=new THREE.BufferGeometry();gg.setAttribute('position',base.attributes.position);gg.setAttribute('normal',base.attributes.normal);gg.setIndex(L);body.add(new THREE.Mesh(gg,m))});
    /* Lamps, intakes and the diffuser are drawn, not modelled: decals on the shell's own
       front and rear triangles, pushed forward with polygon offset. Their edges are real
       curves at any distance, and they cannot fight the paint for the same pixels. */
    {const pa=base.attributes.position,na=base.attributes.normal,FT=[],RT=[];
     bucket.forEach((L,m)=>{if(m===evGlassM||m===chromeM)return;for(let q=0;q<L.length;q+=3){const a=L[q],b=L[q+1],c=L[q+2],cz=(pa.getZ(a)+pa.getZ(b)+pa.getZ(c))/3,nz=na.getZ(a)+na.getZ(b)+na.getZ(c);
       if(cz>zc+HL*.76&&nz>.3)FT.push(a,b,c);else if(cz<zc-HL*.76&&nz<-.3)RT.push(a,b,c)}});
     const dgeo=(T,sg)=>{const n=T.length,P=new Float32Array(n*3),N=new Float32Array(n*3),U=new Float32Array(n*2);
       T.forEach((ix,k)=>{const x=pa.getX(ix),y=pa.getY(ix);P[k*3]=x;P[k*3+1]=y;P[k*3+2]=pa.getZ(ix);N[k*3]=na.getX(ix);N[k*3+1]=na.getY(ix);N[k*3+2]=na.getZ(ix);U[k*2]=.5+sg*x/(2*HW);U[k*2+1]=y-.15});
       const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3));g.setAttribute('uv',new THREE.BufferAttribute(U,2));g.computeBoundingSphere();return g};
     const CW=LOW?512:1024,CH=CW/2,cv=()=>{const c=document.createElement('canvas');c.width=CW;c.height=CH;return c},
       X=u=>(u+1)/2*CW,Y=y=>(1-(y-.15))*CH,Mx=m=>m/(2*HW)*CW,My=m=>m*CH,
       rr=(x,l,t,w,h,r,col)=>{x.fillStyle=col;x.beginPath();x.moveTo(l+r,t);x.arcTo(l+w,t,l+w,t+h,r);x.arcTo(l+w,t+h,l,t+h,r);x.arcTo(l,t+h,l,t,r);x.arcTo(l,t,l+w,t,r);x.closePath();x.fill()},
       poly=(x,pts,sd)=>{x.beginPath();pts.forEach(([u,v],i)=>i?x.lineTo(X(sd*u),Y(v)):x.moveTo(X(sd*u),Y(v)));x.closePath()};
     // front: lamp housings with two projectors, corner curtains, a slim intake and a lip
     const fH=cv();{const x=fH.getContext('2d');x.lineJoin='round';
       [1,-1].forEach(sd=>{x.fillStyle=x.strokeStyle='#0a0b0d';x.lineWidth=CW/110;poly(x,[[.43,.807],[.9,.793],[.93,.738],[.885,.708],[.5,.722]],sd);x.fill();x.stroke();
         const g=x.createLinearGradient(0,Y(.8),0,Y(.72));g.addColorStop(0,'#323740');g.addColorStop(1,'#0d0e11');x.fillStyle=g;poly(x,[[.5,.788],[.87,.778],[.89,.742],[.86,.726],[.54,.736]],sd);x.fill();
         [.63,.76].forEach(u=>{x.fillStyle='#050608';x.beginPath();x.arc(X(sd*u),Y(.756),Mx(.034),0,6.283);x.fill();x.fillStyle='#a9b3be';x.beginPath();x.arc(X(sd*u),Y(.756),Mx(.019),0,6.283);x.fill()});
         rr(x,X(sd*.855)-Mx(.05),Y(.63),Mx(.1),My(.13),Mx(.02),'#0c0d0f')});
       rr(x,X(-.56),Y(.54),X(.56)-X(-.56),My(.085),My(.03),'#0b0b0c');x.fillStyle='#202124';for(let i=1;i<4;i++)x.fillRect(X(-.53),Y(.54)+i*My(.021),X(.53)-X(-.53),Math.max(1,My(.005)));
       rr(x,X(-.94),Y(.44),X(.94)-X(-.94),My(.032),My(.014),'#111214')}
     const fL=cv();{const x=fL.getContext('2d');x.strokeStyle=x.fillStyle='#fff';x.lineCap=x.lineJoin='round';
       [1,-1].forEach(sd=>{x.lineWidth=My(.017);x.beginPath();x.moveTo(X(sd*.46),Y(.798));x.lineTo(X(sd*.89),Y(.786));x.lineTo(X(sd*.908),Y(.748));x.stroke();
         [.63,.76].forEach(u=>{x.beginPath();x.arc(X(sd*u),Y(.756),Mx(.012),0,6.283);x.fill()})});
       x.lineWidth=My(.008);x.beginPath();x.moveTo(X(-.42),Y(.842));x.lineTo(X(.42),Y(.842));x.stroke()}
     // rear: a smoked band across the tail, red light line and corner units, reverse lamps, diffuser
     const rL=cv();{const x=rL.getContext('2d');
       rr(x,X(-.95),Y(.955),X(.95)-X(-.95),My(.07),My(.022),'#0c0708');
       [1,-1].forEach(sd=>rr(x,sd>0?X(.6):X(-.95),Y(.952),X(.95)-X(.6),My(.064),My(.02),'#2a080b'));
       rr(x,X(-.8),Y(.54),X(.8)-X(-.8),My(.1),My(.03),'#0c0c0d');x.fillStyle='#24252a';for(let i=-3;i<=3;i++)x.fillRect(X(i*.21)-Mx(.007),Y(.54),Mx(.014),My(.1));
       [1,-1].forEach(sd=>rr(x,sd>0?X(.8):X(-.93),Y(.585),X(.93)-X(.8),My(.022),My(.009),'#5c0b0c'))}
     const rT=cv();{const x=rT.getContext('2d');x.fillStyle='#fff';x.fillRect(X(-.93),Y(.926),X(.93)-X(-.93),My(.012));
       [1,-1].forEach(sd=>{for(let i=0;i<3;i++)x.fillRect(sd>0?X(.63):X(-.93),Y(.946-i*.02),X(.93)-X(.63),My(.009))})}
     const rR=cv();{const x=rR.getContext('2d');[1,-1].forEach(sd=>rr(x,sd>0?X(.34):X(-.5),Y(.906),X(.5)-X(.34),My(.014),My(.006),'#fff'))}
     const dm=(m,c,glow,k)=>{const t=new THREE.CanvasTexture(c);t.anisotropy=4;m.map=t;if(glow)m.emissiveMap=t;m.alphaTest=.5;m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-2*k;m.needsUpdate=true;return m};
     const fg=dgeo(FT,1),rg=dgeo(RT,-1);
     [[fg,dm(new THREE.MeshPhongMaterial({color:0xffffff,specular:0xcccccc,shininess:120}),fH,false,1)],[fg,dm(headM3,fL,true,2)],
      [rg,dm(new THREE.MeshPhongMaterial({color:0xffffff,specular:0xbbbbbb,shininess:110}),rL,false,1)],[rg,dm(tailM2,rT,true,2)],[rg,dm(revM,rR,true,3)]]
       .forEach(([g,m])=>{const me=new THREE.Mesh(g,m);me.userData.keep=true;body.add(me)})}
    // mirrors, plate, arch liners: the only separate pieces, and none of them sit on the paint
    [1,-1].forEach(sd=>{const z=zw-.14,x=sd*(wF(z)-.02),y=ybF(z)+.14;
      const mh=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),paint);mh.scale.set(.1,.075,.16);mh.position.set(x,y,z);body.add(mh);
      const mg=new THREE.Mesh(new THREE.SphereGeometry(1,14,10,Math.PI*.5,Math.PI),evGlassM);mg.scale.set(.02,.06,.13);mg.rotation.y=sd>0?0:Math.PI;mg.position.set(x+sd*.08,y,z-.02);body.add(mg);
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.18,.03,.05),trimM);arm.position.set(x-sd*.12,y-.05,z);body.add(arm)});
    {const lin=new THREE.Mesh(new THREE.CylinderGeometry(A-.03,A-.03,W-.4,16,1,true,0,Math.PI).rotateZ(Math.PI/2),trimM);[zf,zb].forEach(zz=>{const l=lin.clone();l.position.set(0,rc,zz);body.add(l)})}
    {const pl=new THREE.Mesh(new THREE.BoxGeometry(.52,.12,.012),plateM);pl.position.set(0,.62,B-.014);body.add(pl)}
    bakeGroup(body);
    return {g,body,wheels:[],tail:tailM2,paint,rev:revM}}
  window.buildCar = buildCar;
  window.buildEV = buildEV;
  /* ---------- traffic: other cars actually driving the loop ---------- */
  const traffic=[];
  const TRAFFIC_COLORS=[0x1f3b73,0xb9bcbf,0x1b1b1d,0xe8e6e0,0x2e4a3a,0x6e1a1c,0xc4bca6];
  (function(){
    const n=LOW?3:7;
    for(let i=0;i<n;i++){
      const lane=(i%2?1:-1)*(2.05+RWX*.62);
      const bd=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC,material:oM});
      bd.addShape(new CANNON.Box(new CANNON.Vec3(.95,.62,2.05)));world.addBody(bd);
      const c=buildCar({paint:TRAFFIC_COLORS[i%TRAFFIC_COLORS.length],r:.42,zf:1.3,zb:-1.3,F:2.05,B:-2.05,W:2,xw:.84,ww:.3,wagon:i%3===2,wheels:true});
      c.g.rotation.order='YXZ';S.add(c.g);
      traffic.push({u:(i+.35)/n,lane,base:6.5+((i*53)%10)/10*5.5,spd:0,bd,car:c,pv:0,dive:0,wa:0,py:null})}})();
  function updTraffic(dt,now){
    for(let i=0;i<traffic.length;i++){const t=traffic[i];
      const {p,tg,n}=at(t.u);
      const x=p.x+n.x*t.lane,z=p.z+n.z*t.lane,y=p.y;
      // ease off if the player is right in front, so they nose along instead of ramming through
      let want=t.base;
      if(active){const dx=car.position.x-x,dz=car.position.z-z,ahead=dx*tg.x+dz*tg.z,off=Math.abs(dx*n.x+dz*n.z);
        const d2=Math.hypot(dx,dz);
        const OV=(progU>.100&&progU<.178)||(progU>.252&&progU<.338);
        if(ahead>0&&ahead<13&&off<2.6)want=Math.max(1.2,t.base*(ahead/13));
        else if(OV&&ahead>-7&&ahead<36&&off<9)want=t.base*2.4;
        if(d2>150)want=t.base}
      /* A light that is not green brings them down to a stop about four metres short
         of it. The ramp is on distance rather than a hard brake, so they roll up to the
         line and ease away again when it turns, instead of snapping to a halt. */
      {let sd=Infinity;
       for(let li=0;li<LIGHTS.length;li++){const L=LIGHTS[li];
         if(lightPhase(L,now/1000)===0)continue;
         let du=L.u-t.u;if(du<0)du+=1;
         const d=du*TLEN;if(d<30&&d<sd)sd=d}
       if(sd<30)want=Math.min(want,Math.max(0,(sd-4)/9)*t.base)}
      t.spd+=(want-t.spd)*Math.min(1,dt*1.4);
      t.u=(t.u+(t.spd*dt)/TLEN)%1;
      const yaw=Math.atan2(tg.x,tg.z);
      const pitch=Math.atan2(hAt(t.u+.004)-hAt(t.u-.004),TLEN*.008);
      /* the body dives when they brake, the brake lights come on, wheels roll by distance and the fronts steer into the bend */
      const G=t.car.g;G.position.set(x,y,z);G.rotation.set(-pitch,yaw,0);
      const acc=(t.spd-t.pv)/Math.max(dt,.001);t.pv=t.spd;
      t.dive+=(Math.max(-.03,Math.min(.03,acc*.012))-t.dive)*Math.min(1,dt*5);t.car.body.rotation.x=t.dive;
      t.car.tail.emissiveIntensity=(acc<-.6||t.spd<.4)?1.9:.55;
      let dy=t.py==null?0:yaw-t.py;if(dy>Math.PI)dy-=Math.PI*2;if(dy<-Math.PI)dy+=Math.PI*2;t.py=yaw;
      const stA=Math.max(-.45,Math.min(.45,dy/Math.max(dt,.001)/Math.max(1,t.spd)*2.6));
      t.wa+=t.spd*dt/.42;const W4=t.car.wheels;for(let w=0;w<4;w++){W4[w].spin.rotation.x=t.wa;if(w<2)W4[w].w.rotation.y+=(stA-W4[w].w.rotation.y)*Math.min(1,dt*6)}
t.bd.position.set(x,y+.86,z);
      t.bd.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
      t.bd.velocity.set(tg.x*t.spd,0,tg.z*t.spd);
      t.bd.aabbNeedsUpdate=true}}
  /* ---------- AI Racing Traffic ---------- */
  const aiRacers=[];
  const AI_COUNT=4;
  const AISkill=['rookie','amateur','pro','alien'];
  function spawnAIRacers(){
    aiRacers.length=0;
    for(let i=0;i<AI_COUNT;i++){
      const skill=AISkill[i];
      /* was skill.indexOf(skill) (always 0), so every racer was the same slow rookie */
      const baseSpeed=17+i*4;            // ~61 / 76 / 90 / 104 km/h
      const aggression=0.3+i*0.2;
      const overtakeThreshold=8-i*1.5;
      const car=buildCar({paint:TRAFFIC_COLORS[i%TRAFFIC_COLORS.length],r:.42,zf:1.3,zb:-1.3,F:2.05,B:-2.05,W:2,xw:.84,ww:.3,wagon:false,wheels:true});
      car.g.rotation.order='YXZ';S.add(car.g);
      const bd=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC,material:oM});
      bd.addShape(new CANNON.Box(new CANNON.Vec3(.95,.62,2.05)));world.addBody(bd);
      aiRacers.push({
        u:(i+0.2)/AI_COUNT,
        lane:0,
        base:baseSpeed,
        spd:0,
        bd,
        car,
        skill,
        aggression,
        overtakeThreshold,
        state:'racing',
        targetLane:0,
        overtakeTimer:0,
        mistakeTimer:Math.random()*30,
        lastOvertake:0,
        // animation state: left undefined these went NaN on the first frame, which hid the car's
        // body and wheels while its physics box stayed solid on the road (an invisible wall)
        pv:0,dive:0,wa:0,py:null
      });
    }
  }
  const AI_UP=new CANNON.Vec3(0,1,0);   // shared, instead of a new vector per racer per frame
  function updateAIRacers(dt,now){
    if(!active||!driving)return;
    for(let i=0;i<aiRacers.length;i++){
      const ai=aiRacers[i];
      const {p,tg,n}=at(ai.u);
      const x=p.x+n.x*ai.lane,z=p.z+n.z*ai.lane,y=p.y;
      let want=ai.base;
      // check player proximity
      if(active){
        const dx=car.position.x-x,dz=car.position.z-z;
        const ahead=dx*tg.x+dz*tg.z;
        const off=Math.abs(dx*n.x+dz*n.z);
        const d2=Math.hypot(dx,dz);
        // overtaking logic
        if(ahead>0&&ahead<ai.overtakeThreshold&&off<3.5&&ai.overtakeTimer<=0){
          ai.targetLane=ai.lane>0?-3:3;
          ai.overtakeTimer=3+Math.random()*2;
          ai.state='overtaking';
        }
        if(ai.state==='overtaking'){
          ai.overtakeTimer-=dt;
          if(ai.overtakeTimer<=0){
            ai.state='racing';
            ai.targetLane=0;
          }
        }
        // defensive driving
        if(ahead>0&&ahead<15&&off<3){
          want=Math.min(want,ai.base*0.6);
        }
        // random mistakes
        ai.mistakeTimer-=dt;
        if(ai.mistakeTimer<=0){
          ai.mistakeTimer=20+Math.random()*40;
          want*=0.5+Math.random()*0.3;
        }
        // catch up if too far behind
        const progDiff=progU-ai.u;
        if(progDiff>0.15){
          want*=1.3;
        }else if(progDiff<-0.15){
          want*=0.8;
        }
      }
      // traffic lights
      {let sd=Infinity;
        for(let li=0;li<LIGHTS.length;li++){const L=LIGHTS[li];
          if(lightPhase(L,now/1000)===0)continue;
          let du=L.u-ai.u;if(du<0)du+=1;
          const d=du*TLEN;if(d<30&&d<sd)sd=d}
        if(sd<30)want=Math.min(want,Math.max(0,(sd-4)/9)*ai.base)}
      // night: a bit slower. (This used to multiply ai.base by .85 every frame, so within a
      // second of nightfall every racer stopped dead in the middle of the road.)
      if(nightOn||wxLock==='night'||wxB.id==='night')want*=.85;
      if(!isFinite(want)||want<0)want=0;
      ai.spd+=(want-ai.spd)*Math.min(1,dt*1.4);
      if(!isFinite(ai.spd)||ai.spd<0)ai.spd=0;
      // steer between lanes over ~1s instead of teleporting the solid body sideways into whoever is there
      ai.lane+=((ai.targetLane||0)-ai.lane)*Math.min(1,dt*1.2);
      ai.u=(ai.u+(ai.spd*dt)/TLEN)%1;
      const yaw=Math.atan2(tg.x,tg.z);
      const pitch=Math.atan2(hAt(ai.u+.004)-hAt(ai.u-.004),TLEN*.008);
      const G=ai.car.g;G.position.set(x,y,z);G.rotation.set(-pitch,yaw,0);
      const acc=(ai.spd-ai.pv)/Math.max(dt,.001);ai.pv=ai.spd;
      ai.dive+=(Math.max(-.03,Math.min(.03,acc*.012))-ai.dive)*Math.min(1,dt*5);ai.car.body.rotation.x=ai.dive;
      ai.car.tail.emissiveIntensity=(acc<-.6||ai.spd<.4)?1.9:.55;
      let dy=ai.py==null?0:yaw-ai.py;if(dy>Math.PI)dy-=Math.PI*2;if(dy<-Math.PI)dy+=Math.PI*2;ai.py=yaw;
      const stA=Math.max(-.45,Math.min(.45,dy/Math.max(dt,.001)/Math.max(1,ai.spd)*2.6));
      ai.wa+=ai.spd*dt/.42;const W4=ai.car.wheels;for(let w=0;w<4;w++){W4[w].spin.rotation.x=ai.wa;if(w<2)W4[w].w.rotation.y+=(stA-W4[w].w.rotation.y)*Math.min(1,dt*6)}
      ai.bd.position.set(x,y+.86,z);
      ai.bd.quaternion.setFromAxisAngle(AI_UP,yaw);
      ai.bd.velocity.set(tg.x*ai.spd,0,tg.z*ai.spd);
      ai.bd.aabbNeedsUpdate=true;
      // update last overtake time
      if(ai.state==='overtaking' && ai.overtakeTimer<=0){
        ai.lastOvertake=now;
      }
    }
  }
  /* ---------- animals: circling birds, grazing herds, ducks on the pond ---------- */
  function bird(){const g=new THREE.Group();const bm=new THREE.MeshBasicMaterial({color:0x232220,side:THREE.DoubleSide});
    const body=new THREE.Mesh(new THREE.ConeGeometry(.1,.46,6),bm);body.rotation.x=Math.PI/2;g.add(body);
    const wL=new THREE.Mesh(new THREE.PlaneGeometry(.58,.16),bm);wL.position.x=-.28;g.add(wL);const wR=wL.clone();wR.position.x=.28;g.add(wR);
    return {g,wL,wR}}
  const birds=[];for(let i=0;i<5;i++){const b=bird();const y=8+((i*37)%10)/10*4;b.g.position.set(POND.x+(i-2)*4,y,POND.z+(i%2?4:-4));S.add(b.g);
    birds.push({...b,a:i*1.26,r:8+((i*53)%10),sp:.14+((i*29)%10)/10*.14,y})}
  // grazers: a neck that actually drops to the grass, and they scatter when a car comes at them
  function grazer(hex){const g=new THREE.Group();const bm=M(hex,{roughness:.95});
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.05,.58,.46),bm);body.position.y=.72;body.castShadow=!LOW;g.add(body);
    const rump=new THREE.Mesh(new THREE.BoxGeometry(.3,.44,.42),bm);rump.position.set(-.6,.7,0);g.add(rump);
    const tail=new THREE.Mesh(new THREE.BoxGeometry(.07,.3,.07),bm);tail.position.set(-.76,.56,0);g.add(tail);
    const neck=new THREE.Group();neck.position.set(.48,.86,0);g.add(neck);
    const nk=new THREE.Mesh(new THREE.BoxGeometry(.24,.42,.26),bm);nk.position.set(.05,-.14,0);nk.rotation.z=-.35;neck.add(nk);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.34,.24,.26),bm);head.position.set(.24,-.34,0);neck.add(head);
    const muzzle=new THREE.Mesh(new THREE.BoxGeometry(.13,.14,.2),M(0x2a2622,{roughness:.9}));muzzle.position.set(.42,-.38,0);neck.add(muzzle);
    [-1,1].forEach(s=>{const ear=new THREE.Mesh(new THREE.BoxGeometry(.06,.14,.1),bm);ear.position.set(.14,-.19,s*.13);ear.rotation.z=.4;neck.add(ear)});
    const legs=[];for(const sx of[-1,1])for(const sz of[-1,1]){const lg=new THREE.Mesh(new THREE.BoxGeometry(.13,.62,.13),bm);
      lg.position.set(.34*sx,.34,.16*sz);g.add(lg);legs.push(lg)}
    return {g,legs,neck,tail}}
  const critters=[];const CRIT_COL=[0x6b4a30,0x8a7458,0x4c4842,0x715a3e,0x93785a];
  {let seed=311;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const herds=[];let tries=0;
    while(herds.length<(LOW?2:3)&&tries<900){tries++;const x=(rnd()-.5)*(220*MK),z=(rnd()-.5)*(220*MK);
      if(roadNear(x,z).d<26)continue;
      if((x-POND.x)**2+(z-POND.z)**2<(POND.r+14)**2)continue;if((x-PG.x)**2+(z-PG.z)**2<30*30)continue;
      if(HF.h(x,z)<.4||HF.slope(x,z)>.55)continue;
      if(herds.some(h=>(h[0]-x)**2+(h[1]-z)**2<70*70))continue;
      herds.push([x,z])}
    herds.forEach(([hx,hz])=>{const n=3+(rnd()*3|0);
      for(let i=0;i<n;i++){const a=rnd()*6.283,r=rnd()*9;
        const x=hx+Math.cos(a)*r,z=hz+Math.sin(a)*r;
        const c=grazer(CRIT_COL[(critters.length)%CRIT_COL.length]);
        c.g.position.set(x,HF.h(x,z),z);c.g.rotation.y=rnd()*6.283;S.add(c.g);
        critters.push({...c,herd:{x:hx,z:hz},tgt:{x,z},t:1+rnd()*7,state:'graze',ry:c.g.rotation.y,spd:0})}})}
  const ducks=[];
  {let seed=1207;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const bodyM=M(0xe8e4da,{roughness:.8}),headM2=M(0x2f4a33,{roughness:.7}),beakM=M(0xd9a83a,{roughness:.6});
    for(let i=0;i<(LOW?2:4);i++){const g=new THREE.Group();
      const b=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),bodyM);b.scale.set(1.35,.8,.9);g.add(b);
      const t=new THREE.Mesh(new THREE.ConeGeometry(.11,.28,6),bodyM);t.position.set(-.3,.06,0);t.rotation.z=-1.9;g.add(t);
      const nk=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,.2,8),headM2);nk.position.set(.19,.16,0);g.add(nk);
      const hd=new THREE.Mesh(new THREE.SphereGeometry(.11,10,8),headM2);hd.position.set(.22,.29,0);g.add(hd);
      const bk2=new THREE.Mesh(new THREE.ConeGeometry(.05,.13,6),beakM);bk2.position.set(.33,.27,0);bk2.rotation.z=-1.57;g.add(bk2);
      const a=rnd()*6.283,rr=POND.r*(.25+rnd()*.45);
      g.position.set(POND.x+Math.cos(a)*rr,WATER_Y+.1,POND.z+Math.sin(a)*rr);S.add(g);
      ducks.push({g,a,r:rr,sp:(.12+rnd()*.2)*(rnd()<.5?-1:1),bob:rnd()*6.283})}}
  /* ---------- weather particles ---------- */
  const PCOUNT=LOW?500:1200;const pGeo=new THREE.BufferGeometry();const pPos=new Float32Array(PCOUNT*3);for(let i=0;i<PCOUNT;i++){pPos[i*3]=(Math.random()-.5)*90;pPos[i*3+1]=Math.random()*40;pPos[i*3+2]=(Math.random()-.5)*90}pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
  const pMat=new THREE.PointsMaterial({color:0xffffff,size:.3,transparent:true,opacity:.8,depthWrite:false});const parts=new THREE.Points(pGeo,pMat);parts.frustumCulled=false;parts.visible=false;S.add(parts);
  /* ---------- the sky follows the road, not a button ----------
     There is no weather picker. Each stretch of road names a mood, and the world cross-fades
     into it over a few seconds while you keep driving: the climb clouds over, the summit goes
     gold, the last stretch warms up. The fade is nothing but value-lerping across a handful of
     colours and light intensities — no terrain repaint, no rebuilt geometry, nothing that can
     spike a frame halfway through a corner. The ground tint rides on the terrain material,
     which multiplies the vertex colours the heightfield was painted with once at startup. */
  const DUSTA={day:.1,dusk:.34,rain:0,snow:.05,autumn:.3,night:.14,overcast:.04,sunset:.3,storm:0,fog:0,sand:.5,blizzard:.05};
  const wxOf=id=>WEATHERS.find(w=>w.id===id)||WEATHERS[0];
  const wxCopy=w=>({id:w.id,bg:w.bg,fog:[w.fog[0],w.fog[1]],hemi:w.hemi,sun:w.sun,sunI:w.sunI,ground:w.ground,leaf:w.leaf,
    part:w.part,slip:w.slip,skyTop:w.skyTop,skyBottom:w.skyBottom,star:w.star,sunA:w.sunA,water:w.water,
    terr:[w.terr[0],w.terr[1],w.terr[2]],ridge:[w.ridge[0],w.ridge[1],w.ridge[2]],dust:DUSTA[w.id]||0});
  let wx=wxCopy(wxOf(CHMOOD[0])),wxA=wxCopy(wx),wxB=wxCopy(wx),wxT=1,wxDur=1,partA=wx.part?1:0,ridgeN=0;
  const _cA=new THREE.Color(),_cB=new THREE.Color();
  const mixHex=(a,b,t)=>_cA.setHex(a).lerp(_cB.setHex(b),t).getHex();
  const mixN=(a,b,t)=>a+(b-a)*t;
  const snapWx=w=>({id:w.id,bg:w.bg,fog:[w.fog[0],w.fog[1]],hemi:w.hemi,sun:w.sun,sunI:w.sunI,ground:w.ground,leaf:w.leaf,
    part:w.part,slip:w.slip,skyTop:w.skyTop,skyBottom:w.skyBottom,star:w.star,sunA:w.sunA,water:w.water,
    terr:[w.terr[0],w.terr[1],w.terr[2]],ridge:[w.ridge[0],w.ridge[1],w.ridge[2]],dust:w.dust});
  function applyWx(full){
    S.background.setHex(wx.bg);S.fog.color.setHex(wx.bg);S.fog.near=wx.fog[0];S.fog.far=wx.fog[1];
    hemi.intensity=wx.hemi;sun.color.setHex(wx.sun);sun.intensity=wx.sunI;
    /* the weather owns these numbers; the bands below only bend them, so the
       baseline is re-read here rather than sampled once on the first frame. */
    fogNear0=wx.fog[0];fogFar0=wx.fog[1];hemi0=wx.hemi;sunI0=wx.sunI;
    groundM.color.setHex(wx.ground);leafM.color.setHex(wx.leaf);waterM.color.setHex(wx.water);
    terrainM.color.setRGB(wx.terr[0],wx.terr[1],wx.terr[2]);
    skyMat.uniforms.topColor.value.setHex(wx.skyTop);skyMat.uniforms.bottomColor.value.setHex(wx.skyBottom);
    starMat.uniforms.uOpacity.value=wx.star;moon.material.opacity=Math.min(1,wx.star*1.35);
    sunSprite.material.color.setHex(wx.sun);sunSprite.material.opacity=wx.sunA;dustMat.opacity=wx.dust;
    if(full||ridgeN++%6===0)ridgeTint(wx.ridge);
    parts.visible=partA>.02;pMat.opacity=.8*partA;
    {const ps=PSTYLE[wxB.id]||PSTYLE[wx.part==='leaves'?'autumn':wx.part]||PSTYLE.snow;pMat.color.setHex(ps.col);pMat.size=ps.size}
    applyVehicle()}
  function mood(id,dur){const t=wxOf(id);if(t.id===wxB.id)return;wxA=snapWx(wx);wxB=wxCopy(t);wxT=0;wxDur=dur||6}
  /* Night is a mode you hold, not a mood the road hands you. While it is on it outranks
     the road's moods and the summit's dusk, so driving into a new stretch does not
     yank the sky back to daylight underneath you; turning it off hands control back. */
  let nightOn=false,ltT=4,flashV=0,thunderAt=0,wxLock=null;
  function setWeather(id,quiet){
    if(id==='auto'||!id){wxLock=null;nightOn=false;mood(MODE==='circuit'?'day':(atSummit?'dusk':(CHMOOD[act]||'day')),4);if(!quiet)toastMsg('Weather · auto')}
    else{wxLock=id;nightOn=true;mood(id,3.5);if(!quiet)toastMsg(wxOf(id).label)}
    const nb=$('#dnight');if(nb)nb.textContent=wxLock==='night'?'Daylight':'Night';
    $$('#dwxl button').forEach(b=>b.classList.toggle('on',b.dataset.w===(wxLock||'auto')))}
  function toggleNight(){
    if(wxLock==='night'){setWeather('auto',true);toastMsg('Daylight')}
    else{setWeather('night',true);toastMsg('Night · press N to bring the day back')}}
  function stepWx(dt){
    if(wxT>=1)return;
    wxT=Math.min(1,wxT+dt/wxDur);const e=wxT*wxT*(3-2*wxT);
    wx.bg=mixHex(wxA.bg,wxB.bg,e);wx.sun=mixHex(wxA.sun,wxB.sun,e);wx.ground=mixHex(wxA.ground,wxB.ground,e);
    wx.leaf=mixHex(wxA.leaf,wxB.leaf,e);wx.water=mixHex(wxA.water,wxB.water,e);
    wx.skyTop=mixHex(wxA.skyTop,wxB.skyTop,e);wx.skyBottom=mixHex(wxA.skyBottom,wxB.skyBottom,e);
    wx.fog[0]=mixN(wxA.fog[0],wxB.fog[0],e);wx.fog[1]=mixN(wxA.fog[1],wxB.fog[1],e);
    wx.hemi=mixN(wxA.hemi,wxB.hemi,e);wx.sunI=mixN(wxA.sunI,wxB.sunI,e);
    wx.star=mixN(wxA.star,wxB.star,e);wx.sunA=mixN(wxA.sunA,wxB.sunA,e);
    wx.dust=mixN(wxA.dust,wxB.dust,e);wx.slip=mixN(wxA.slip,wxB.slip,e);
    for(let i=0;i<3;i++){wx.terr[i]=mixN(wxA.terr[i],wxB.terr[i],e);wx.ridge[i]=mixN(wxA.ridge[i],wxB.ridge[i],e)}
    if(wxA.part===wxB.part){wx.part=wxB.part;partA=wxB.part?1:0}
    else if(e<.5){wx.part=wxA.part;partA=wxA.part?1-e*2:0}
    else{wx.part=wxB.part;partA=wxB.part?(e-.5)*2:0}
    if(wxT>=1)wx.id=wxB.id;
    applyWx(wxT>=1)}
  /* ---------- vehicle ---------- */
  const car=new THREE.Group();S.add(car);
  const chassisB=new CANNON.Body({mass:190,material:oM});chassisB.addShape(new CANNON.Box(new CANNON.Vec3(1,.32,2)),new CANNON.Vec3(0,.2,0));chassisB.addShape(new CANNON.Box(new CANNON.Vec3(.7,.3,.9)),new CANNON.Vec3(0,.8,-.2));chassisB.angularDamping=.4;chassisB.allowSleep=false;
  {const {p,tg}=at(.004);chassisB.position.set(p.x,1.2,p.z);chassisB.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.atan2(tg.x,tg.z))}
  const veh=new CANNON.RaycastVehicle({chassisBody:chassisB,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
  const wo={radius:.46,directionLocal:new CANNON.Vec3(0,-1,0),suspensionStiffness:40,suspensionRestLength:.42,frictionSlip:2.4,dampingRelaxation:2.8,dampingCompression:4.8,maxSuspensionForce:1e5,rollInfluence:.02,axleLocal:new CANNON.Vec3(-1,0,0),chassisConnectionPointLocal:new CANNON.Vec3(),maxSuspensionTravel:.4,customSlidingRotationalSpeed:-30,useCustomSlidingRotationalSpeed:true};
  [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(([x,z])=>{wo.chassisConnectionPointLocal.set(x,.05,z);veh.addWheel(wo)});
  veh.addToWorld(world);
  /* Chassis dynamics constants. A raycast vehicle with none of this leans like a boat,
     keeps full grip on a wheel that is barely touching the road, and has no idea how
     fast it is going. Front bar is stiffer than the rear on purpose: that biases the
     car towards understeer, which is what you want on a road you are reading signs off.
     Drag is quadratic so the top end tapers on its own instead of hitting the governor,
     and downforce is taken along the body's own up axis so it plants the floor, not the world. */
  const ARB_F=5200,ARB_R=4200,AERO_DRAG=.3,LOAD_CAP=1.6,LOAD_EXP=.6;
  /* Cornering limit per car, in g: what full steering lock asks of the tyres at speed (see the
     steering code). Road cars sit around 1.45 g, the race cars well above, the heavy ones below.
     BRAKE_DECEL is the service-brake deceleration in m/s^2, about 1.2 g: 100 to 0 in roughly 32 m. */
  const LAT_G={f1apex:2.3,valkyrie:1.9,gt40:1.75,phantombike:1.35,truck:.85,titan4x4:1.0,ridgeback:1.15,classicmini:1.3,
    countach:1.55,skyline:1.55,rx7spirit:1.6,mamba:1.5,kestrel:1.5,phantom:1.55,voltgt:1.5,aster:1.4};
  const latG=id=>LAT_G[id]||1.45,BRAKE_DECEL=12;
  /* Careful with applyForce in this build of cannon: the second argument is a point in
     WORLD space, not an offset from the centre of mass, whatever the docs say. Passing
     a small offset silently applies the force way out near the world origin instead, and
     the lever arm that gives you grows the further you drive from spawn — which reads as
     the car spontaneously backflipping off a jump. Pass chassisB.position for a force
     through the centre of mass, or the actual contact point to apply it at a wheel. */
  const bodyUp=new CANNON.Vec3(),UPV=new CANNON.Vec3(0,1,0),fScratch=new CANNON.Vec3(),
        lvScratch=new CANNON.Vec3(),qScratch=new CANNON.Quaternion(),fwdScratch=new CANNON.Vec3(),
        wComp=[0,0,0,0],wLoad=[0,0,0,0];
  // visuals
  const vis={car:new THREE.Group()};car.add(vis.car);vis.body=new THREE.Group();vis.body.position.y=.55;vis.car.add(vis.body);vis.bodyIn=new THREE.Group();vis.bodyIn.position.y=-.55;vis.body.add(vis.bodyIn);
  const SKN=420;let skI=0;const skLast=[null,null,null,null];
  const skid=new THREE.InstancedMesh(new THREE.PlaneGeometry(.32,.66).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x080808,transparent:true,opacity:.38,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),SKN);
  skid.count=0;skid.frustumCulled=false;if(skid.instanceMatrix.setUsage)skid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);S.add(skid);
  const add=(g,geo,m,x,y,z,sh=true)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=sh;g.add(o);return o};
  const headM=M(0xfff2c0,{emissive:0xfff2c0,emissiveIntensity:1.3}),tailM=M(0xff3b30,{emissive:0xff3b30,emissiveIntensity:.5});
  let PCAR=null;
  let wv=null;
  /* soft contact shadow so the car sits on the road instead of hovering over it */
  let carShadow=null;
  {const c=document.createElement('canvas');c.width=64;c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(32,64,4,32,64,62);g.addColorStop(0,'rgba(0,0,0,.75)');g.addColorStop(.6,'rgba(0,0,0,.35)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,128);
   const sh=new THREE.Mesh(new THREE.PlaneGeometry(2.9,5.4).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
   sh.position.y=.05-(VEHS.car.rest-.07)-.02;sh.renderOrder=1;vis.car.add(sh);carShadow=sh;sh.visible=!R.shadowMap.enabled}
  /* real headlights once the light drops: one spot on the road ahead, no shadow */
  let carHL=null;if(!LOW){carHL=new THREE.SpotLight(0xfff1d6,0,70,.52,.55,1.1);carHL.position.set(0,.1,2.3);carHL.target.position.set(0,-1.4,16);vis.car.add(carHL);vis.car.add(carHL.target)}
  /* light you can see: two soft beams in front of the car after dark */
  let beams=null;if(!LOW){const c=document.createElement('canvas');c.width=4;c.height=64;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,64);g.addColorStop(0,'rgba(255,244,214,.6)');g.addColorStop(1,'rgba(255,244,214,0)');x.fillStyle=g;x.fillRect(0,0,4,64);
    const bm=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const bg=new THREE.ConeGeometry(2.8,15,20,1,true);bg.rotateX(-Math.PI/2);bg.translate(0,0,7.5);
    beams={m:bm,list:[1,-1].map(sd=>{const b=new THREE.Mesh(bg,bm);b.position.set(sd*.72,-.1,2.42);b.rotation.x=.08;b.visible=false;vis.car.add(b);return b})}}
  /* real reflections: a small cube map rendered from the car, one face every few frames, so the
     paint and glass pick up the actual trees, sky and road around you */
  let cubeCam=null,cubeRT=null,cubeFace=0,cubeInit=false,cubeSun=0,cubeX=0,cubeZ=0;
  /* nothing that wears the reflection may be drawn into it, or the GPU reads and writes one texture at once */
  const cubeHidden=[];
  const hideCars=v=>{
    if(!v){cubeHidden.length=0;const tex=cubeRT&&cubeRT.texture;
      S.traverseVisible(o=>{const m=o.material;if(!m||!tex)return;
        if(Array.isArray(m)?m.some(x=>x&&x.envMap===tex):m.envMap===tex)cubeHidden.push(o)});
      car.visible=false;for(let i=0;i<cubeHidden.length;i++)cubeHidden[i].visible=false}
    else{car.visible=true;for(let i=0;i<cubeHidden.length;i++)cubeHidden[i].visible=true;cubeHidden.length=0}};
  if(!LOW){try{cubeRT=new THREE.WebGLCubeRenderTarget(128,{format:THREE.RGBFormat,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});cubeCam=new THREE.CubeCamera(1,420,cubeRT);S.add(cubeCam);
    CARMATS.forEach(m=>{m.envMap=cubeRT.texture;m.needsUpdate=true})}catch(e){cubeCam=null}}
  const V=VEHS.car;
  function applyVehicle(){veh.wheelInfos.forEach((w,i)=>{const sx=i%2?-1:1;w.chassisConnectionPointLocal.set(sx*V.xw,.05,i<2?V.zf:V.zb);w.radius=V.r;w.suspensionRestLength=V.rest;w.frictionSlip=V.slip*wx.slip;w.rollInfluence=V.roll});chassisB.angularDamping=.4}
  /* ---------- swap the whole car: physics rig, body mesh, wheels, mass, shadow ---------- */
  let curCarId='aster',mpCarNotify=null;
  /* Where the first-person cameras and the mirror sit on the current body, measured from the mesh
     itself (body-local: y=0 is the ground, +z forward). One fixed height used to put the bonnet cam
     inside the truck's cab and floating over the F1. */
  let FP={bonnet:{y:1.25,z:.6},bumper:{y:.5,z:2.5},top:1.4,back:-2.4,off:0};
  function measureBody(g,spec){
    const rc=new THREE.Raycaster(),o=new THREE.Vector3(),d=new THREE.Vector3(0,-1,0),py=g.position.y;
    g.position.set(0,0,0);g.updateMatrixWorld(true);
    // generated bodies edit vertices after building, so the raycaster's cached bounds can be stale and skip a mesh
    g.traverse(m=>{if(m.isMesh&&m.geometry){m.geometry.computeBoundingSphere();m.geometry.computeBoundingBox()}});
    const solid=[];g.traverse(m=>{if(m.isMesh&&m.visible&&m.material&&!(m.material.opacity<.3))solid.push(m)});
    const all=[];g.traverse(m=>{if(m.isMesh&&m.visible)all.push(m)});   // glass included: a camera must not sit behind a tinted screen
    const top=z=>{let h=null;for(const x of [0,-.25,.25]){o.set(x,12,z);rc.set(o,d);const hit=rc.intersectObjects(solid,false)[0];if(hit&&(h==null||hit.point.y>h))h=hit.point.y}return h};
    const F=spec.F,B=spec.B,prof=[];let mx=0;
    for(let z=F-.05;z>=B;z-=.1){const h=top(z);prof.push([z,h]);if(h!=null&&h>mx)mx=h}
    // bonnet: the cabin is where the body comes within 35 cm of the roof; the camera sits just ahead of it,
    // above the highest point of the bonnet in front (a long sloping bonnet no longer reads as the screen)
    const ref=[F-.4,top(F-.4)||mx*.7];let bz=null;
    for(const q of prof){if(q[1]!=null&&q[0]<F-.3&&q[1]>=mx-.35){bz=q[0];break}}
    if(bz!=null&&bz<F-.6){let hood=0;for(const q of prof)if(q[1]!=null&&q[0]>bz+.25&&q[0]<bz+.9)hood=Math.max(hood,q[1]);if(hood>0)ref[1]=hood}
    let bonnet;
    const up=new THREE.Vector3(0,1,0),roofed=(y,z)=>{o.set(0,y,z);rc.set(o,up);return rc.intersectObjects(all,false).length>0};
    if(bz!=null&&bz<F-.6){let hz=bz+.3,hh=ref[1];
      // a cab or a visor overhead means the camera is still inside: slide it forward over the hood
      while(hz<F-.3&&roofed(hh+.32,hz))hz+=.1;
      // and lift it until the view straight ahead is clear of grille, lights and mirrors
      const fwd=new THREE.Vector3(0,0,1),blocked=(y,z)=>{for(const x of [-.15,0,.15]){o.set(x,y,z);rc.set(o,fwd);rc.far=2.5;const h=rc.intersectObjects(all,false).length>0;rc.far=Infinity;if(h)return true}return false};
      let by=hh+.32;while(by<mx+.3&&blocked(by,hz))by+=.05;
      bonnet={y:by,z:hz}}
    else if(spec.type==='f1'||spec.type==='bike'){const hz=Math.max(B*.15,.1);bonnet={y:(top(hz)||mx)+.32,z:hz}}   // open cockpit or bike: sit over the rider
    else{ // low hypercars: just ahead of where the roof starts, a little over the bonnet, never above the roof
      const zr=(prof.find(q=>q[1]!=null&&q[0]<F-.3&&q[1]>=mx-.12)||[0])[0],hz=Math.min(F-.5,zr+.5),hh=top(hz)||mx*.8;
      bonnet={y:Math.min(hh+.3,mx+.05),z:hz}}
    // a face the rays miss (inverted winding) can still leave the camera inside a part: check boxes too
    {const boxes=[];g.traverse(m=>{if(!m.isMesh||!m.geometry)return;if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();
       const bb=m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld),sz=bb.getSize(new THREE.Vector3());if(sz.x>.3&&sz.y>.15&&sz.z>.3&&sz.z<(F-B)*.6)boxes.push(bb)});   // parts, not the whole shell
     for(let k=0;k<6;k++){const pt=new THREE.Vector3(0,bonnet.y,bonnet.z),inb=boxes.find(bb=>bb.containsPoint(pt));if(!inb)break;bonnet.y=inb.max.y+.3}}
    // keep a road car's camera over the back half of its bonnet so the bonnet is in view, re-seating it on the surface
    if(spec.type!=='f1'&&spec.type!=='bike'&&bonnet.z>F*.45){const hz=F*.45,hh=top(hz);bonnet={z:hz,y:hh!=null?Math.max(hh+.3,Math.min(bonnet.y,hh+.45)):bonnet.y}}
    // hand-set where no rule fits: the hauler's tallest part is its trailer, and the wedge has no screen line
    const FP_SET={truck:{y:2.05,z:2.8},countach:{y:1.27,z:.75}};if(FP_SET[spec.id])bonnet=Object.assign({},FP_SET[spec.id]);
    const nose=top(F-.15)||.6;
    const out={bonnet,bumper:{y:Math.max(.32,Math.min(.75,nose*.55)),z:F+.12},top:mx,back:B};
    if(window.__dev)out.prof=prof.filter((q,i)=>i%2===0).map(q=>[+q[0].toFixed(1),q[1]==null?null:+q[1].toFixed(2)]);
    g.position.y=py;g.updateMatrixWorld(true);return out}
  window.__fp=()=>FP;
  const GARAGE_BASE_LEN=2.42-(-2.36);
  function garageOf(id){return GARAGE.find(g=>g.id===id)||GARAGE[0]}
  /* the body mesh for one garage entry; shared by the car you drive and the garage preview */
  function makeBody(spec,o){
    // lofted bodies (assets/vehicles.js) for every model it knows; the EVs and the F1 keep their own builders
    if (window.VehicleKit && window.VehicleKit.has(spec.id)) {
      return window.VehicleKit.build(spec.id, o);
    } else if (spec.type==='f1' && window.CarBuilder && window.CarBuilder.buildF1) {
      return window.CarBuilder.buildF1(o);
    } else if (spec.type==='suv' && window.CarBuilder && window.CarBuilder.buildSUV) {
      return window.CarBuilder.buildSUV(o);
    } else if (spec.type==='bike' && window.CarBuilder && window.CarBuilder.buildBike) {
      return window.CarBuilder.buildBike(o);
    } else if (spec.type==='hypercar' && window.CarBuilder && window.CarBuilder.buildHypercar) {
      return window.CarBuilder.buildHypercar(o);
    } else if (spec.type==='truck' && window.CarBuilder && window.CarBuilder.buildTruck) {
      return window.CarBuilder.buildTruck(o);
    } else if (spec.type==='ev') {
      return buildEV(o);
    } else {
      return buildCar(Object.assign(o,{wagon:!!spec.wagon,wheels:false}));
    }
  }
  function wheelWdOf(spec){return spec.type==='bike'?.18:spec.type==='truck'?.5:spec.type==='f1'?.46:spec.type==='suv'?.42:.36}
  function setCar(id,paint,quiet){
    const spec=garageOf(id);curCarId=spec.id;
    const paintHex=paint!=null?paint:spec.paints[0];
    Object.assign(V,spec.V);V.label=spec.label;
    applyVehicle();
    chassisB.mass=spec.mass;chassisB.updateMassProperties();
    if(PCAR)vis.bodyIn.remove(PCAR.g);
    const o={paint:paintHex,r:V.r,zf:V.zf,zb:V.zb,F:spec.F,B:spec.B,W:spec.W,xw:V.xw,head:headM,tail:tailM};
    PCAR=makeBody(spec,o);FP=measureBody(PCAR.g,spec);
    PCAR.glass=[];PCAR.g.traverse(m=>{if(m.isMesh&&m.material&&m.material.transparent&&m.material.opacity<.8)PCAR.glass.push(m)});
    PCAR.g.position.y=.05-(V.rest-.07)-V.r;FP.off=PCAR.g.position.y;vis.bodyIn.add(PCAR.g);
    if(cubeRT)PCAR.g.traverse(m=>{if(m.material&&m.material.reflectivity!==undefined){m.material.envMap=cubeRT.texture;m.material.needsUpdate=true}});
    if(wv)wv.car.forEach(k=>vis.car.remove(k.w));
    const nW=spec.type==='bike'?2:spec.type==='truck'?6:4,wheelWd=wheelWdOf(spec);
    wv={car:Array.from({length:nW},(_,i)=>makeWheel(V.r,wheelWd,i%2?-1:1,true,true))};
    wv.car.forEach(k=>vis.car.add(k.w));
    if(carShadow){carShadow.position.y=.05-(V.rest-.07)-.02;carShadow.scale.z=(spec.F-spec.B)/GARAGE_BASE_LEN}
    try{localStorage.setItem('sl_car',JSON.stringify({id:spec.id,paint:paintHex}))}catch(e){}
    if(mpCarNotify)mpCarNotify();
    if(!quiet)toastMsg(spec.label)}
  /* ---------- audio ----------
     It is an electric car, so there is no gearbox drone any more. A motor whine that rises
     smoothly with speed and gets louder under load (and on regen), tyre roar that follows
     the surface, wind that builds at speed, a proper tyre squeal, and a thud on impacts.
     Everything runs through one bus with a gentle compressor so nothing spikes. */
  let AC=null,SND=null;
  /* One engine voice per car. ICE cars run a gearbox model (revs climb, drop on each upshift);
     EVs get a single-speed whine. Numbers are firing frequencies in Hz, not rpm.
       w: oscillator waveforms [main, sub-octave, harmonic]   mix: their levels
       h: harmonic multiple   filt: [base, range, Q]   lfo: [rate Hz, depth Hz] roughness
       vol: overall level      turbo: whistle level (0 = none) */
  const ENGINES={
    aster:      {ev:1,lo:120,hi:820, w:['sine','triangle','sine'],    mix:[.6,.3,.05],h:3.02,filt:[650,2300,.7],lfo:[4.3,1.4],vol:.15},
    voltgt:     {ev:1,lo:170,hi:1250,w:['sine','sine','triangle'],    mix:[.55,.15,.12],h:4.1,filt:[900,3400,1.4],lfo:[6,1],vol:.13},
    phantom:    {ev:1,lo:85, hi:620, w:['triangle','sine','sine'],    mix:[.7,.45,.06],h:2.5,filt:[500,1800,.9],lfo:[3,2],vol:.17},
    kestrel:    {lo:28, hi:230, gears:5, w:['sawtooth','triangle','sine'],mix:[.55,.35,.08],h:2,  filt:[600,1700,1],  lfo:[6,1.5], vol:.11},
    ridgeback:  {lo:22, hi:150, gears:5, w:['square','sawtooth','sine'], mix:[.35,.55,.06],h:2,  filt:[380,850,.8],  lfo:[9,3],   vol:.12},
    mamba:      {lo:32, hi:310, gears:6, w:['sawtooth','sawtooth','sine'],mix:[.5,.2,.12],h:2,  filt:[850,2700,2],  lfo:[8,1.2], vol:.11},
    f1apex:     {lo:130,hi:1250,gears:8, w:['sawtooth','sawtooth','sine'],mix:[.55,.12,.2],h:2,  filt:[1400,5200,2.2],lfo:[24,4], vol:.09},
    titan4x4:   {lo:38, hi:250, gears:4, w:['sawtooth','square','sine'], mix:[.4,.65,.04],h:1.5,filt:[330,900,.9],  lfo:[5,6],   vol:.14},
    phantombike:{lo:48, hi:480, gears:6, w:['sawtooth','square','sine'], mix:[.5,.3,.15],h:2,  filt:[1100,3600,3],  lfo:[13,3],  vol:.12},
    valkyrie:   {lo:85, hi:920, gears:7, w:['sawtooth','triangle','sine'],mix:[.5,.3,.18],h:1.5,filt:[1200,4200,1.6],lfo:[10,2], vol:.1, turbo:.025},
    rx7spirit:  {lo:42, hi:460, gears:5, w:['square','sawtooth','sine'], mix:[.45,.2,.1], h:3,  filt:[950,3000,4],  lfo:[30,2],  vol:.1},
    skyline:    {lo:40, hi:350, gears:6, w:['sawtooth','triangle','sine'],mix:[.55,.25,.1],h:3,  filt:[750,2400,1.4],lfo:[7,1.5], vol:.11, turbo:.05},
    countach:   {lo:62, hi:610, gears:5, w:['sawtooth','sawtooth','triangle'],mix:[.5,.3,.15],h:1.5,filt:[900,3300,1.2],lfo:[4,1.5],vol:.11},
    truck:      {lo:17, hi:92,  gears:10,w:['square','sawtooth','sine'], mix:[.4,.6,.05], h:2,  filt:[240,520,.7],  lfo:[3.5,4], vol:.16, turbo:.06, turboHz:900},
    classicmini:{lo:36, hi:270, gears:4, w:['square','triangle','sine'], mix:[.45,.3,.08],h:2,  filt:[600,1500,3],  lfo:[14,3],  vol:.1},
    gt40:       {lo:46, hi:330, gears:5, w:['sawtooth','square','sine'], mix:[.45,.6,.06],h:1.5,filt:[550,2000,1.3],lfo:[7,4],   vol:.13},
  };
  function engineVoice(S,id,T){
    const e=ENGINES[id]||ENGINES.aster;if(S.prof===id)return e;S.prof=id;
    [S.m1,S.m2,S.m3].forEach((o,i)=>{try{o.type=e.w[i]}catch(_){}});
    [S.g1,S.g2,S.g3].forEach((g,i)=>g.gain.setTargetAtTime(e.mix[i],T,.05));
    S.lfo.frequency.setTargetAtTime(e.lfo[0],T,.05);S.lg.gain.setTargetAtTime(e.lfo[1],T,.05);
    S.mF.Q.setTargetAtTime(e.filt[2],T,.05);S.gear=0;S.rpm=0;
    return e}
  function audioInit(){if(AC){try{if(AC.state==='suspended')AC.resume()}catch(e){}return}try{AC=new (window.AudioContext||window.webkitAudioContext)();AC.resume();
    const T=AC.currentTime,sr=AC.sampleRate,G=v=>{const g=AC.createGain();g.gain.value=v;return g},
      F=(t,f,q)=>{const x=AC.createBiquadFilter();x.type=t;x.frequency.value=f;if(q!=null)x.Q.value=q;return x},
      O=(t,f)=>{const o=AC.createOscillator();o.type=t;o.frequency.value=f;o.start(T);return o},
      L=b=>{const s=AC.createBufferSource();s.buffer=b;s.loop=true;s.start(T,Math.random()*1.5);return s};
    const comp=AC.createDynamicsCompressor();comp.threshold.value=-18;comp.knee.value=14;comp.ratio.value=3.5;comp.attack.value=.005;comp.release.value=.25;
    const bus=G(.9),tone=F('lowpass',18000,.5);bus.connect(tone);tone.connect(comp);comp.connect(AC.destination);
    const n=sr*2,pk=AC.createBuffer(1,n,sr),wh=AC.createBuffer(1,n,sr),pd=pk.getChannelData(0),wd=wh.getChannelData(0);
    {let b0=0,b1=0,b2=0;for(let i=0;i<n;i++){const w=Math.random()*2-1;wd[i]=w;b0=.99765*b0+w*.099046;b1=.963*b1+w*.2965164;b2=.57*b2+w*1.0526913;pd[i]=(b0+b1+b2+w*.1848)*.16}}
    // motor: fundamental, a half-order body and a thin inverter partial, softened by a lowpass
    const mG=G(0),mF=F('lowpass',1000,.7);mF.connect(mG);mG.connect(bus);
    const m1=O('sine',130),m2=O('triangle',65),m3=O('sine',390),g1=G(.6),g2=G(.3),g3=G(.04);
    m1.connect(g1);m2.connect(g2);m3.connect(g3);g1.connect(mF);g2.connect(mF);g3.connect(mF);
    const lfo=O('sine',4.3),lg=G(1.4);lfo.connect(lg);lg.connect(m1.frequency);lg.connect(m3.frequency);
    // turbo / supercharger whistle, only some cars use it
    const tO=O('sine',2200),tG=G(0),tF=F('bandpass',2400,6);tO.connect(tF);tF.connect(tG);tG.connect(bus);
    // tyres: tarmac roar (pink noise, lowpassed) and gravel hiss (white, bandpassed)
    const rG=G(0),rF=F('lowpass',300,.6);L(pk).connect(rF);rF.connect(rG);rG.connect(bus);
    const gG=G(0),gF=F('bandpass',1900,.7);L(wh).connect(gF);gF.connect(gG);gG.connect(bus);
    // wind
    const wG=G(0),wF=F('bandpass',700,.45);L(pk).connect(wF);wF.connect(wG);wG.connect(bus);
    // squeal: two narrow resonances on noise, wobbled every frame so it sounds like rubber, not a tone
    const sG=G(0),s1=F('bandpass',1050,11),s2=F('bandpass',2200,13),s2g=G(.55),sn=L(wh);
    sn.connect(s1);sn.connect(s2);s1.connect(sG);s2.connect(s2g);s2g.connect(sG);sG.connect(bus);
    SND={bus,tone,pk,wh,mG,mF,m1,m2,m3,g1,g2,g3,lfo,lg,tO,tG,rG,rF,gG,wG,wF,sG,s1,s2,ld:0,prof:null};
    document.addEventListener('visibilitychange',()=>{try{document.hidden?AC.suspend():AC.resume()}catch(e){}})}catch(e){SND=null}}
  function blip(freq=880,dur=.12,vol=.08){if(!AC||muted)return;try{const T=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.value=freq;
    g.gain.setValueAtTime(0,T);g.gain.linearRampToValueAtTime(vol,T+.008);g.gain.exponentialRampToValueAtTime(.0001,T+dur);o.connect(g);g.connect(SND?SND.bus:AC.destination);o.start(T);o.stop(T+dur+.02)}catch(e){}}
  // impacts: a low body thud, plus a short panel clank on the hard ones
  function thud(k){if(!AC||muted||!SND)return;try{const T=AC.currentTime,S=SND;
    {const s=AC.createBufferSource();s.buffer=S.pk;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=240+k*520;const g=AC.createGain();
     g.gain.setValueAtTime(0,T);g.gain.linearRampToValueAtTime(.12+.5*k,T+.006);g.gain.exponentialRampToValueAtTime(.0001,T+.42);s.connect(f);f.connect(g);g.connect(S.bus);s.start(T,Math.random());s.stop(T+.46)}
    {const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(92,T);o.frequency.exponentialRampToValueAtTime(36,T+.3);const g=AC.createGain();
     g.gain.setValueAtTime(.08+.32*k,T);g.gain.exponentialRampToValueAtTime(.0001,T+.34);o.connect(g);g.connect(S.bus);o.start(T);o.stop(T+.38)}
    if(k>.45){const s=AC.createBufferSource();s.buffer=S.wh;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=1600+Math.random()*500;f.Q.value=3;const g=AC.createGain();
     g.gain.setValueAtTime(.16*k,T);g.gain.exponentialRampToValueAtTime(.0001,T+.15);s.connect(f);f.connect(g);g.connect(S.bus);s.start(T,Math.random());s.stop(T+.18)}}catch(e){}}
  let hornOn=false;
  function honk(on){if(!AC||muted)return;try{
    if(on&&!hornOn){hornOn=true;const T=AC.currentTime,g=AC.createGain(),lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2300;lp.Q.value=.9;
      g.gain.setValueAtTime(0,T);g.gain.linearRampToValueAtTime(.075,T+.025);lp.connect(g);g.connect(SND?SND.bus:AC.destination);
      const oscs=[405,508].map(f=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(lp);o.start(T);return o});
      hornNodes={g,oscs}}
    else if(!on&&hornOn){hornOn=false;if(hornNodes){const {g,oscs}=hornNodes;g.gain.setTargetAtTime(0,AC.currentTime,.03);setTimeout(()=>{try{oscs.forEach(o=>o.stop());g.disconnect()}catch(e){}},200);hornNodes=null}}
  }catch(e){}}
  let hornNodes=null;
  mute.onclick=()=>{muted=!muted;mute.textContent=muted?'Sound off':'Sound on'};
  {const nb=$('#dnight');if(nb)nb.onclick=()=>toggleNight()}
  /* ---------- weather picker ---------- */
  {const wb=$('#dweatherb'),wx=$('#dwx'),wl=$('#dwxl');
   if(wb&&wx&&wl){
     const chip=(id,label)=>{const b=document.createElement('button');b.className='dbtn';b.dataset.w=id;b.textContent=label;wl.appendChild(b);return b};
     chip('auto','Auto');WEATHERS.forEach(w=>chip(w.id,w.label));
     const setOpen=o=>{wx.classList.toggle('on',o);wb.setAttribute('aria-expanded',o?'true':'false')};
     wb.onclick=e=>{e.stopPropagation();setOpen(!wx.classList.contains('on'))};
     wl.addEventListener('click',e=>{const b=e.target.closest('button[data-w]');if(!b)return;setWeather(b.dataset.w);setOpen(false)});
     addEventListener('pointerdown',e=>{if(!wx.classList.contains('on'))return;if(!wx.contains(e.target)&&e.target!==wb)setOpen(false)});
     $$('#dwxl button').forEach(b=>b.classList.toggle('on',b.dataset.w==='auto'))
   }}
  /* ---------- garage ----------
     A carousel: one car at a time with its name on top, a 3D model you can drag round 360°
     in the middle and its stats below. Swipe or use the arrows to move between cars, then
     pick one. The preview has its own small WebGL renderer, so it only runs while the garage
     is open and costs nothing while driving. */
  {const gb=$('#dgarageb'),gp=$('#dgarage'),gx=$('#dgaragex'),gpaints=$('#dgpaints'),gname=$('#dgname'),gblurb=$('#dgblurb'),gcoins=$('#dgcoins'),
     gview=$('#dgview'),gcv=$('#dgcanvas'),gcname=$('#dgcname'),gcclass=$('#dgcclass'),gcount=$('#dgcount'),gdots=$('#dgdots'),gstats=$('#dgstats'),gpick=$('#dgpick');
   if(gb&&gp&&gview){
     let curPaint=GARAGE[0].paints[0],hadSave=false;
     try{const s=JSON.parse(localStorage.getItem('sl_car')||'null');
       if(s&&garageOf(s.id)){hadSave=true;curPaint=s.paint!=null?s.paint:garageOf(s.id).paints[0];setCar(s.id,curPaint,true)}}catch(e){}
     updCoinsUI=()=>{if(gcoins)gcoins.textContent=coins+' coins'};
     const CLASS={f1:'F1 racer',suv:'4x4 SUV',bike:'Superbike',hypercar:'Hypercar',ev:'Electric',truck:'Truck'};
     const classOf=spec=>CLASS[spec.type]||'Petrol';
     /* stats as 0..1 against the rest of the garage, so the bars compare the cars to each other */
     const raw=spec=>({top:spec.V.max,acc:spec.V.engine/spec.mass,hand:latG(spec.id),mass:spec.mass});
     const RNG={};GARAGE.forEach(sp=>{const r=raw(sp);for(const k in r){const q=RNG[k]||(RNG[k]=[1e9,-1e9]);q[0]=Math.min(q[0],r[k]);q[1]=Math.max(q[1],r[k])}});
     const norm=(k,v)=>{const q=RNG[k];return q[1]>q[0]?.14+.86*(v-q[0])/(q[1]-q[0]):.6};
     let idx=Math.max(0,GARAGE.findIndex(g=>g.id===curCarId)),viewPaint=curPaint;
     GARAGE.forEach(()=>gdots.appendChild(document.createElement('i')));
     /* ---- preview renderer ---- */
     let PR=null,PS=null,PC=null,PM=null,rig=null,yaw=-.6,vyaw=0,auto=true,autoT=0,raf=0,lastT=0;
     const ownMats=[],ownGeos=[];
     const initPreview=()=>{if(PR)return true;
       try{PR=new THREE.WebGLRenderer({canvas:gcv,alpha:true,antialias:true})}catch(e){PR=null;return false}
       PR.setPixelRatio(Math.min(devicePixelRatio||1,2));PR.setClearColor(0,0);
       if('outputEncoding' in PR)PR.outputEncoding=THREE.sRGBEncoding;PR.toneMapping=THREE.ACESFilmicToneMapping;PR.toneMappingExposure=.98;
       PR.shadowMap.enabled=true;PR.shadowMap.type=THREE.PCFSoftShadowMap;
       PS=new THREE.Scene();PC=new THREE.PerspectiveCamera(30,1,.1,100);
       PS.add(new THREE.HemisphereLight(0xdfe8ff,0x3a332a,.42));
       const key=new THREE.DirectionalLight(0xfff4e0,.85);key.position.set(4,8,5);key.castShadow=true;
       key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:1,far:25});key.shadow.bias=-.0005;key.shadow.radius=4;PS.add(key);
       const rim=new THREE.DirectionalLight(0xa8c4ff,.55);rim.position.set(-6,3,-5);PS.add(rim);
       const fl=new THREE.Mesh(new THREE.CircleGeometry(6,48).rotateX(-Math.PI/2),new THREE.ShadowMaterial({opacity:.38}));fl.receiveShadow=true;PS.add(fl);
       // the drive renderer's reflection cube lives in another WebGL context, so the preview gets a still studio one of its own
       const face=(top,bot)=>{const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,16);gr.addColorStop(0,top);gr.addColorStop(1,bot);x.fillStyle=gr;x.fillRect(0,0,16,16);return c};
       const side=face('#8d96a3','#2a2724');PM=new THREE.CubeTexture([side,side,face('#d8dde4','#d8dde4'),face('#1a1a1a','#1a1a1a'),side,side]);PM.needsUpdate=true;
       return true};
     const dropModel=()=>{if(!rig)return;PS.remove(rig);rig=null;
       ownMats.forEach(m=>m.dispose());ownGeos.forEach(g=>g.dispose());ownMats.length=0;ownGeos.length=0};
     const buildModel=()=>{if(!PR)return;dropModel();
       const spec=GARAGE[idx],v=spec.V,isBike=spec.type==='bike',isTruck=spec.type==='truck';
       rig=new THREE.Group();
       const cm0=CARMATS.length;
       const body=makeBody(spec,{paint:viewPaint,r:v.r,zf:v.zf,zb:v.zb,F:spec.F,B:spec.B,W:spec.W,xw:v.xw,head:headM,tail:tailM});
       rig.add(body.g);
       const n=isBike?2:isTruck?6:4,wd=wheelWdOf(spec);
       for(let i=0;i<n;i++){const k=makeWheel(v.r,wd,i%2?-1:1,true,true);
         const front=isBike?i===0:i<2,z=isBike?(i===0?v.zf:v.zb):i<4?(i<2?v.zf:v.zb):v.zb+v.r*2.3;
         k.w.position.set(isBike?0:(i%2?-1:1)*v.xw*.9,v.r,z);if(front)k.w.rotation.y=.28;rig.add(k.w)}
       const seen=new Map();
       rig.traverse(m=>{if(!m.isMesh)return;m.castShadow=true;if(m.geometry&&!ownGeos.includes(m.geometry))ownGeos.push(m.geometry);
         const swap=mt=>{if(!mt)return mt;if(seen.has(mt))return seen.get(mt);const c=mt.clone();
           if('envMap' in c)c.envMap=('reflectivity' in c)?PM:null;ownMats.push(c);seen.set(mt,c);return c};
         m.material=Array.isArray(m.material)?m.material.map(swap):swap(m.material)});
       CARMATS.length=Math.min(CARMATS.length,cm0);   // the preview works on clones; the originals must not join the drive car's reflection list
       // centre it on the turntable and frame the camera to its size
       const bb=new THREE.Box3().setFromObject(rig),c=bb.getCenter(new THREE.Vector3()),sz=bb.getSize(new THREE.Vector3());
       rig.children.forEach(ch=>{ch.position.x-=c.x;ch.position.z-=c.z});rig.position.y=-bb.min.y;
       const holder=new THREE.Group();holder.add(rig);PS.add(holder);rig=holder;
       const L=Math.max(sz.x,sz.z,sz.y*1.6);PC.userData.d=L*1.55+1.2;PC.userData.h=sz.y*.45;
       rig.rotation.y=yaw};
     const sizePreview=()=>{if(!PR)return;const w=gview.clientWidth||300,h=gview.clientHeight||200;PR.setSize(w,h,false);PC.aspect=w/h;PC.updateProjectionMatrix()};
     const frame=t=>{raf=0;if(!gp.classList.contains('on')){stopPreview();return}
       const dt=Math.min(.05,lastT?(t-lastT)/1000:.016);lastT=t;
       if(!dragging){if(auto&&t>autoT)vyaw+=(.5-vyaw)*Math.min(1,dt*2);else vyaw*=Math.pow(.04,dt);yaw+=vyaw*dt}
       if(rig)rig.rotation.y=yaw;
       const d=(PC.userData.d||6)/Math.min(1,PC.aspect*.9),hh=PC.userData.h||.6;
       PC.position.set(0,hh+d*.32,d);PC.lookAt(0,hh*.8,0);
       PR.render(PS,PC);raf=requestAnimationFrame(frame)};
     const startPreview=()=>{if(!initPreview())return;sizePreview();if(!rig)buildModel();if(!raf){lastT=0;raf=requestAnimationFrame(frame)}};
     function stopPreview(){if(raf)cancelAnimationFrame(raf);raf=0}
     addEventListener('resize',()=>{if(gp.classList.contains('on'))sizePreview()});
     /* ---- the page around it ---- */
     const paintPaints=()=>{const spec=GARAGE[idx];gpaints.innerHTML='';spec.paints.forEach(c=>{const b=document.createElement('button');
         b.style.background='#'+c.toString(16).padStart(6,'0');b.dataset.p=c;b.setAttribute('aria-label','Paint');
         b.classList.toggle('on',c===viewPaint);gpaints.appendChild(b)})};
     const refresh=()=>{const spec=GARAGE[idx],owned=unlocked.has(spec.id),r=raw(spec);
       gcname.textContent=spec.label;gcclass.textContent=classOf(spec);gcount.textContent=(idx+1)+' / '+GARAGE.length;
       [...gdots.children].forEach((d,i)=>{d.classList.toggle('on',i===idx);d.classList.toggle('own',GARAGE[i].id===curCarId)});
       const row=(lb,k,txt)=>'<div class="gg-st"><span>'+lb+'</span><b><i style="width:'+Math.round(norm(k,r[k])*100)+'%"></i></b><span>'+txt+'</span></div>';
       const ten=k=>(norm(k,r[k])*10).toFixed(1)+' / 10',wt=norm('mass',r.mass);
       gstats.innerHTML=row('Top speed','top',Math.round(spec.V.max*3.6)+' km/h')+row('Acceleration','acc',ten('acc'))+
         row('Cornering','hand',r.hand.toFixed(2)+' g')+row('Weight','mass',wt<.4?'Light':wt<.7?'Medium':'Heavy');
       gblurb.textContent=spec.blurb;
       paintPaints();
       gpick.classList.remove('sel','buy');
       if(!owned){gpick.textContent='Buy · '+spec.price+' coins';gpick.classList.add('buy')}
       else if(spec.id===curCarId&&viewPaint===curPaint){gpick.textContent='Selected · drive';gpick.classList.add('sel')}
       else gpick.textContent='Drive this car';
       updCoinsUI()};
     const go=(d,flick)=>{idx=(idx+d+GARAGE.length)%GARAGE.length;const spec=GARAGE[idx];
       viewPaint=spec.id===curCarId?curPaint:spec.paints[0];
       // a short spin in the swipe direction makes the change feel like the turntable moved
       vyaw=flick?-d*2.4:vyaw;auto=true;autoT=performance.now()+600;
       refresh();if(PR)buildModel()};
     const setOpen=o=>{gp.classList.toggle('on',o);
       if(o){try{gname.value=localStorage.getItem('sl_name')||''}catch(e){}
         idx=Math.max(0,GARAGE.findIndex(g=>g.id===curCarId));viewPaint=curPaint;refresh();if(rig)dropModel();
         requestAnimationFrame(startPreview)}
       else stopPreview()};
     refresh();
     gb.onclick=()=>setOpen(true);
     gx.onclick=()=>setOpen(false);
     gp.addEventListener('click',e=>{if(e.target===gp)setOpen(false)});
     $('#dgprev').onclick=()=>go(-1,true);$('#dgnext').onclick=()=>go(1,true);
     gpick.onclick=()=>{const spec=GARAGE[idx];
       if(!unlocked.has(spec.id)){
         if(coins>=spec.price){coins-=spec.price;saveCoins();unlocked.add(spec.id);saveUnlocked();
           toastMsg('Bought '+spec.label+' · -'+spec.price+' coins');curPaint=viewPaint;setCar(spec.id,curPaint);refresh()}
         else toastMsg('Need '+(spec.price-coins)+' more coins for '+spec.label);
         return}
       const same=spec.id===curCarId&&viewPaint===curPaint;
       if(!same){curPaint=viewPaint;setCar(spec.id,curPaint)}
       setOpen(false)};
     gpaints.addEventListener('click',e=>{const b=e.target.closest('button[data-p]');if(!b)return;
       viewPaint=+b.dataset.p;
       // repainting the car you already drive applies straight away
       if(GARAGE[idx].id===curCarId&&unlocked.has(curCarId)){curPaint=viewPaint;setCar(curCarId,curPaint,true)}
       refresh();if(PR)buildModel()});
     gname.addEventListener('change',()=>{const nm=(gname.value||'').trim().slice(0,14);try{if(nm)localStorage.setItem('sl_name',nm)}catch(e){}});
     /* drag turns the car; a quick flick sideways moves to the next one */
     let dragging=false,px=0,py=0,sx0=0,st0=0,pid=null,sideways=null,trail=[];
     gview.addEventListener('pointerdown',e=>{dragging=true;pid=e.pointerId;px=sx0=e.clientX;py=e.clientY;st0=performance.now();sideways=null;auto=false;vyaw=0;trail=[[st0,e.clientX]];
       gview.classList.add('drag');try{gview.setPointerCapture(pid)}catch(_){}});
     gview.addEventListener('pointermove',e=>{if(!dragging||e.pointerId!==pid)return;
       const dx=e.clientX-px,dy=e.clientY-py;
       if(sideways===null&&Math.hypot(e.clientX-sx0,dy)>6)sideways=Math.abs(e.clientX-sx0)>Math.abs(e.clientY-py);
       px=e.clientX;py=e.clientY;const now=performance.now();trail.push([now,e.clientX]);while(trail.length>2&&now-trail[0][0]>110)trail.shift();
       if(sideways===false)return;
       const k=6.5/Math.max(220,gview.clientWidth);yaw+=dx*k;vyaw=vyaw*.5+dx*k*30});
     const up=e=>{if(!dragging||e.pointerId!==pid)return;dragging=false;gview.classList.remove('drag');
       const now=performance.now(),ddx=e.clientX-sx0,dtm=now-st0,t0=trail[0]||[st0,sx0],vel=(e.clientX-t0[1])/Math.max(16,now-t0[0]);
       // a flick: a quick short swipe, or a fast release at the end of a longer drag
       if(sideways&&Math.abs(ddx)>55&&(dtm<350||Math.abs(vel)>1.1)&&Math.sign(vel||ddx)===Math.sign(ddx)){yaw-=ddx*6.5/Math.max(220,gview.clientWidth);vyaw=0;go(ddx<0?1:-1,true)}
       else autoT=performance.now()+2500,auto=true};
     gview.addEventListener('pointerup',up);gview.addEventListener('pointercancel',up);
     /* swipes on the title or stats change car too */
     let tx=null,ty=0;
     [gstats,$('.gg-head')].forEach(el=>{el.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY},{passive:true});
       el.addEventListener('touchend',e=>{if(tx==null)return;const t=e.changedTouches[0],dx=t.clientX-tx,dy=t.clientY-ty;tx=null;
         if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.4)go(dx<0?1:-1,true)},{passive:true})});
     addEventListener('keydown',e=>{if(!gp.classList.contains('on')||(e.target&&e.target.tagName==='INPUT'))return;
       if(e.code==='ArrowLeft'||e.code==='KeyA'){go(-1,true);e.preventDefault();e.stopImmediatePropagation()}
       else if(e.code==='ArrowRight'||e.code==='KeyD'){go(1,true);e.preventDefault();e.stopImmediatePropagation()}
       else if(e.code==='Enter'){gpick.click();e.preventDefault();e.stopImmediatePropagation()}},true);
     if(!hadSave)setTimeout(()=>setOpen(true),900)
   }}
  /* ---------- input ---------- */
  /* Stretches of the loop that feel different. Each band has a drag figure (0 = free,
     1 = crawling), a fog distance and a colour the light is pulled toward. It is one lookup
     and two lerps a frame, no extra geometry. Nothing here ever stops the car. */
  const ZONES=[
    {a:.980,b:1.04,drag:.34,fog:.62,tint:[.62,.63,.70]},
    {a:-.02,b:.052,drag:.34,fog:.62,tint:[.62,.63,.70]},
    {a:.262,b:.330,drag:.30,fog:.80,tint:[.80,.80,.86]},
    {a:.612,b:.700,drag:.26,fog:.46,tint:[.50,.52,.58]},
    {a:.724,b:.806,drag:0,  fog:1.34,tint:[1.16,1.12,1.02]},
  ];
  function zoneAt(u){u=((u%1)+1)%1;let d=0,f=1,t0=1,t1=1,t2=1;
    for(let i=0;i<ZONES.length;i++){const Z=ZONES[i];if(u<=Z.a||u>=Z.b)continue;
      // ease in and out of the band so nothing snaps on as you cross the line
      const w=SM(Math.min((u-Z.a),(Z.b-u))/((Z.b-Z.a)*.34));
      if(Z.drag*w>d)d=Z.drag*w;
      f=f+(Z.fog-1)*w;t0=t0+(Z.tint[0]-1)*w;t1=t1+(Z.tint[1]-1)*w;t2=t2+(Z.tint[2]-1)*w}
    return {drag:d,fog:f,tint:[t0,t1,t2]}}
  const key={};
  const KMAP={ArrowUp:'f',KeyW:'f',ArrowDown:'b',KeyS:'b',ArrowLeft:'l',KeyA:'l',ArrowRight:'r',KeyD:'r',Space:'h',ShiftLeft:'boost',ShiftRight:'boost',KeyH:'horn'};
  addEventListener('keydown',e=>{if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;if(!active)return;if(e.code==='Escape'){if(boardEl.classList.contains('on'))closeBoard();else if($('#dgarage').classList.contains('on'))$('#dgarage').classList.remove('on');else if($('#dcirc')&&$('#dcirc').classList.contains('on'))$('#dcirc').classList.remove('on');else if($('#dcustom-tracks')&&$('#dcustom-tracks').classList.contains('on'))$('#dcustom-tracks').classList.remove('on');else if($('#dmaps')&&$('#dmaps').classList.contains('on'))$('#dmaps').classList.remove('on');else if(bigmap.classList.contains('on'))toggleMap();return}if(e.code==='KeyM'&&bigmap.classList.contains('on')){toggleMap();return}if(!driving)return;if(e.code==='KeyE'){SPACE.interact();return}if(e.code==='KeyM'){toggleMap();return}if(e.code==='KeyN'){toggleNight();return}if(e.code==='KeyR'){resetCar();return}if(e.code==='KeyC'){cycleCam();return}if(e.code==='KeyG'){
      if(SPACE.state!=='earth'){   // planets: GPS is off until asked for, then it routes to the next UFO station
        SPACE.gpsOn=!SPACE.gpsOn;toastMsg(SPACE.gpsOn?'GPS on · route to the next UFO station':'GPS off');
        if(bigmap.classList.contains('on'))drawMap(bmc.getContext('2d'),bmc.width,true)
      }else if(MODE==='world'){
        if(!window.earthGPS){
          window.earthGPS=[
            {x:0,y:0,z:-38*2.1*1.75,label:'Start/Finish',type:'track'},
            {x:PEAK.x,y:PEAK_H,z:PEAK.z,label:'Summit',type:'poi'},
            {x:VZ.stunt.x,y:0.6,z:VZ.stunt.z,label:'Stunt Park',type:'poi'},
            {x:VZ.ufo.x,y:0.6,z:VZ.ufo.z,label:'UFO Field',type:'poi'},
            {x:VZ.volc.x,y:0.6,z:VZ.volc.z,label:'Volcano',type:'poi'},
            {x:RAMPYARD.x,y:BR_H,z:RAMPYARD.z,label:'Ramp Yard',type:'poi'},
            {x:RING.x,y:BR_H,z:RING.z,label:'Ring Road',type:'poi'},
            {x:POND.x,y:0.6,z:POND.z,label:'Pond',type:'poi'},
            {x:PG.x,y:0,z:PG.z,label:'Playground',type:'poi'}
          ]
        }
        {const pins=window.earthGPS,idx=window.earthGpsTarget?pins.indexOf(window.earthGpsTarget):-1;
         window.earthGpsTarget=idx+1<pins.length?pins[idx+1]:null;   // last press turns navigation off
         toastMsg(window.earthGpsTarget?'GPS → '+window.earthGpsTarget.label+' · G for the next destination':'GPS off');}
        if(bigmap.classList.contains('on'))drawMap(bmc.getContext('2d'),bmc.width,true);
      }else if(MODE==='circuit'||SPACE.state!=='earth')NAV.toggle();
      return
    }if(e.code==='KeyV'||e.code==='KeyQ'){lookBehind=true;return}if(e.code==='KeyZ'){rearMirrorOn=!rearMirrorOn;if(rearEl)rearEl.style.display=rearMirrorOn?'block':'none';setTimeout(layoutHud,0);toastMsg(rearMirrorOn?'Rearview mirror ON · Z to toggle':'Rearview mirror OFF');return}if(e.code==='KeyL'){startRace();return}if(e.code==='KeyB'){boardEl.classList.contains('on')?closeBoard():openBoard();return}const k=KMAP[e.code];if(!k)return;key[k]=1;e.preventDefault()});
  addEventListener('keyup',e=>{if(e.code==='KeyV'||e.code==='KeyQ'){lookBehind=false;return}const k=KMAP[e.code];if(k)key[k]=0});
  function hold(el,k){const on=e=>{e.preventDefault();key[k]=1;el.classList.add('dn');try{el.setPointerCapture(e.pointerId)}catch(_){}if(navigator.vibrate)navigator.vibrate(8)};const off=()=>{key[k]=0;el.classList.remove('dn')};el.addEventListener('pointerdown',on);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,off));el.addEventListener('contextmenu',e=>e.preventDefault())}
  hold($('#dL'),'l');hold($('#dR'),'r');hold($('#dgas'),'f');hold($('#dbrk'),'b');hold($('#dboost'),'boost');
  $('#dresetb').onclick=resetCar;

  /* ---------- tool menu: click menu shows all buttons, click again hides all but menu ---------- */
  {const mb=$('#dmenu'),row=$('#drow');
   const setMenu=o=>{row.classList.toggle('open',o);mb.setAttribute('aria-expanded',o?'true':'false')};
   window.__setMenu=setMenu;
   mb.onclick=e=>{e.stopPropagation();setMenu(!row.classList.contains('open'));if(row.classList.contains('open')&&window.__updModes)window.__updModes()};
   // anything that opens a panel or switches mode closes the menu; quick toggles leave it open
   const KEEP_OPEN=['dweatherb','dnight','dmute','dtiltb','dgps'];
   row.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!KEEP_OPEN.includes(b.id))setMenu(false)});
   // tapping the road (anywhere outside the menu, its button and the weather list) closes it
   addEventListener('pointerdown',e=>{
     if(!row.classList.contains('open'))return;
     const wx=$('#dwx');
     if(!row.contains(e.target)&&!mb.contains(e.target)&&!(wx&&wx.contains(e.target)))setMenu(false);
   },true);}
  // GPS button handler
  const gpsBtn=$('#dgps');
  if(gpsBtn)gpsBtn.onclick=()=>{
    if(SPACE.state!=='earth'){   // planets: GPS is off until asked for, then it routes to the next UFO station
        SPACE.gpsOn=!SPACE.gpsOn;toastMsg(SPACE.gpsOn?'GPS on · route to the next UFO station':'GPS off');
      if(bigmap.classList.contains('on'))drawMap(bmc.getContext('2d'),bmc.width,true)
    }else if(MODE==='world'){
      if(!window.earthGPS){
        window.earthGPS=[
          {x:0,y:0,z:-38*2.1*1.75,label:'Start/Finish',type:'track'},
          {x:PEAK.x,y:PEAK_H,z:PEAK.z,label:'Summit',type:'poi'},
          {x:VZ.stunt.x,y:0.6,z:VZ.stunt.z,label:'Stunt Park',type:'poi'},
          {x:VZ.ufo.x,y:0.6,z:VZ.ufo.z,label:'UFO Field',type:'poi'},
          {x:VZ.volc.x,y:0.6,z:VZ.volc.z,label:'Volcano',type:'poi'},
          {x:RAMPYARD.x,y:BR_H,z:RAMPYARD.z,label:'Ramp Yard',type:'poi'},
          {x:RING.x,y:BR_H,z:RING.z,label:'Ring Road',type:'poi'},
          {x:POND.x,y:0.6,z:POND.z,label:'Pond',type:'poi'},
          {x:PG.x,y:0,z:PG.z,label:'Playground',type:'poi'}
        ]
      }
      {const pins=window.earthGPS,idx=window.earthGpsTarget?pins.indexOf(window.earthGpsTarget):-1;
       window.earthGpsTarget=idx+1<pins.length?pins[idx+1]:null;   // last press turns navigation off
       toastMsg(window.earthGpsTarget?'GPS → '+window.earthGpsTarget.label+' · G for the next destination':'GPS off');}
      if(bigmap.classList.contains('on'))drawMap(bmc.getContext('2d'),bmc.width,true)
    }else if(MODE==='circuit'||SPACE.state!=='earth'){NAV.toggle()}else{toastMsg('GPS only available while driving')}
  };

  /* ---------- tilt steering (phones only) ----------
     Reads gamma (left/right roll) and maps it to an analog steering value, so
     it is smoother than the binary arrow buttons. The first reading becomes
     the neutral point, which means it works however you happen to be holding
     the phone — lying flat or propped up — instead of assuming 0°. iOS 13+
     requires a user gesture to grant permission, hence the button. */
  let tiltOn=false,tiltZero=null,tiltSteer=0,steerActual=0;
  const TILT_RANGE=26;    // degrees of roll for full lock
  const TILT_DEAD=1.6;    // ignore small hand tremor
  const tiltBtn=$('#dtiltb');
  function tiltLabel(){if(tiltBtn)tiltBtn.textContent='Tilt: '+(tiltOn?'on':'off')}
  function onTilt(e){
    if(!tiltOn||e.gamma==null)return;
    // in landscape the roll axis is beta, in portrait it is gamma
    const land=Math.abs(window.orientation||0)===90||innerWidth>innerHeight;
    let v=land?(e.beta||0)*(((window.orientation||0)<0)?-1:1):(e.gamma||0);
    if(tiltZero===null)tiltZero=v;
    let d=v-tiltZero;
    if(Math.abs(d)<TILT_DEAD)d=0;else d-=Math.sign(d)*TILT_DEAD;
    tiltSteer=Math.max(-1,Math.min(1,d/TILT_RANGE));
  }
  async function toggleTilt(){
    if(tiltOn){tiltOn=false;tiltZero=null;tiltSteer=0;tiltLabel();toastMsg('Tilt steering off');return}
    try{
      const D=window.DeviceOrientationEvent;
      if(!D){toastMsg('This phone has no tilt sensor');return}
      if(typeof D.requestPermission==='function'){
        const r=await D.requestPermission();
        if(r!=='granted'){toastMsg('Tilt permission denied');return}
      }
      addEventListener('deviceorientation',onTilt);
      tiltOn=true;tiltZero=null;tiltLabel();
      toastMsg('Tilt on · hold the phone how you like, that is centre');
    }catch(_){toastMsg('Tilt not available here')}
  }
  if(tiltBtn){tiltBtn.onclick=toggleTilt;tiltLabel()}
  // re-centre when the phone is rotated, otherwise neutral is wrong
  addEventListener('orientationchange',()=>{tiltZero=null});
  const rot=$('#drot');let rotDismissed=false;
  function checkRot(){rot.classList.toggle('on',active&&TOUCH&&innerHeight>innerWidth&&!rotDismissed&&!cineOn)}
  $('#drotx').onclick=()=>{rotDismissed=true;checkRot()};addEventListener('resize',checkRot);addEventListener('orientationchange',()=>setTimeout(()=>{resize();checkRot()},250));
  /* C cycles the camera, B or hold look-back glances behind */
  const CAMS=[{n:'Chase',d:9.5,h:4.8,k:1,lag:6.5,ahead:6,ly:1.05,fov:50},{n:'Far chase',d:15,h:7.5,k:1.2,lag:5,ahead:8,ly:1,fov:48},
    {n:'Low chase',d:6.2,h:2.1,k:.6,lag:9,ahead:10,ly:.9,fov:58},{n:'Rear View',d:-9.5,h:4.8,k:1,lag:8,ahead:-14,ly:1.05,fov:55},
    {n:'Bonnet',fp:1,y:.5,z:1.1,fov:66},{n:'Bumper',fp:1,y:.02,z:2.5,fov:70}];
  let camMode=0,lookBehind=false;try{camMode=Math.min(CAMS.length-1,+localStorage.getItem('sl_cam')||0)}catch(e){}
  function cycleCam(){camMode=(camMode+1)%CAMS.length;try{localStorage.setItem('sl_cam',camMode)}catch(e){}toastMsg('Camera: '+CAMS[camMode].n+' · C to switch')}
  {const nb=document.getElementById('dnight');if(nb){const cb=nb.cloneNode(true);cb.id='dcam';cb.textContent='Camera';cb.title='Camera (C)';nb.after(cb);cb.onclick=()=>cycleCam()}}
  function resetCar(){const {p,tg}=(MODE==='circuit'&&circuit)?circAt(circU0<0?0:circU0,circuit.curve):at(progU);PREV.ok=false;physAcc=0;leanVf=0;leanA=0;if(vis.body)vis.body.rotation.set(0,0,0);
    chassisB.position.set(p.x,p.y+1.4,p.z);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);
    chassisB.force.set(0,0,0);chassisB.torque.set(0,0,0);chassisB.linearDamping=.01;chassisB.angularDamping=.4;
    chassisB.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.atan2(tg.x,tg.z));
    veh.wheelInfos.forEach(w=>{w.suspensionLength=w.suspensionRestLength;w.deltaRotation=0});
    for(let i=0;i<4;i++){veh.applyEngineForce(0,i);veh.setBrake(0,i)}
    sub=0;inPond=false;steerActual=0;vehicleDamage=0;if(raceMode&&!lapArmed&&!lapVoid){lapVoid=true;lapEl.classList.add('void')}blip(330,.2)}
  function resetCarTo(target){
    const p=(target&&target.pos)?target.pos:((MODE==='circuit'&&circuit)?circAt(circU0<0?0:circU0,circuit.curve).p:at(progU).p);
    const tg=(target&&target.tangent)?target.tangent:((MODE==='circuit'&&circuit)?circAt(circU0<0?0:circU0,circuit.curve).tg:at(progU).tg);
    PREV.ok=false;physAcc=0;leanVf=0;leanA=0;if(vis.body)vis.body.rotation.set(0,0,0);
    chassisB.position.set(p.x,p.y+1.5,p.z);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);
    chassisB.force.set(0,0,0);chassisB.torque.set(0,0,0);chassisB.linearDamping=.01;chassisB.angularDamping=.4;
    chassisB.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.atan2(tg.x,tg.z));
    veh.wheelInfos.forEach(w=>{w.suspensionLength=w.suspensionRestLength;w.deltaRotation=0});
    for(let i=0;i<4;i++){veh.applyEngineForce(0,i);veh.setBrake(0,i)}
    sub=0;inPond=false;steerActual=0;try{blip(330,.2);}catch(_){}}
  window.resetCar=resetCar;window.resetCarTo=resetCarTo;window.soundBlip=(f,d,v)=>{try{blip(f,d,v);}catch(_){}};
  function toastMsg(s){toast.textContent=s;clearTimeout(toast._t);
    if(window.gsap){gsap.killTweensOf(toast);
      gsap.fromTo(toast,{opacity:0,y:-10,scale:.94},{opacity:1,y:0,scale:1,duration:.45,ease:'back.out(1.7)'});
      toast._t=setTimeout(()=>gsap.to(toast,{opacity:0,y:-8,duration:.35,ease:'power2.in'}),1700)}
    else{toast.classList.add('show');toast._t=setTimeout(()=>toast.classList.remove('show'),1700)}}
  window.toastMsg=toastMsg;
  /* ---------- the summit ---------- */
  let atSummit=false,summitMoodBack=null;
  const wrongEl=$('#dwrong');let wrongT=0,wrongMain=false;
  /* ---------- minimap ---------- */
  const MAPS=SAMP.filter((_,i)=>i%2===0);let mapRot=0;
  const MAPR=116*MK*LAND+26;let mapCache=null;
  function buildMapCache(){
    const CS=720,k=(CS/2)/MAPR,cv2=document.createElement('canvas');cv2.width=cv2.height=CS;
    const c=cv2.getContext('2d');c.translate(CS/2,CS/2);
    c.fillStyle='rgba(45,76,92,.9)';c.beginPath();c.arc(POND.x*k,POND.z*k,POND.r*k,0,6.283);c.fill();
    c.strokeStyle='rgba(143,42,42,.8)';c.lineWidth=1.6;c.strokeRect((PG.x-12)*k,(PG.z-12)*k,24*k,24*k);
    c.fillStyle='rgba(120,150,110,.4)';treePts.forEach(([x,z])=>{c.beginPath();c.arc(x*k,z*k,1.7,0,6.283);c.fill()});
    c.strokeStyle='#5a5750';c.lineWidth=3.2*k;c.beginPath();MAPS.forEach((p,i)=>{i?c.lineTo(p.x*k,p.z*k):c.moveTo(p.x*k,p.z*k)});c.closePath();c.stroke();
    c.strokeStyle='#8a7a5a';c.lineWidth=4.2*k;HILLS.forEach(HL=>{c.beginPath();for(let i=Math.floor(HL.a*N);i<=HL.d*N;i++){const p=SAMP[i];i===Math.floor(HL.a*N)?c.moveTo(p.x*k,p.z*k):c.lineTo(p.x*k,p.z*k)}c.stroke()});
    c.strokeStyle='rgba(150,120,80,.85)';c.lineWidth=2.4;SPURS.forEach(pts=>{c.beginPath();pts.forEach(([x,z],i)=>i?c.lineTo(x*k,z*k):c.moveTo(x*k,z*k));c.stroke()});
    {const V=VZ.volc;c.fillStyle='rgba(70,50,44,.8)';c.beginPath();c.arc(V.x*k,V.z*k,V.R*.8*k,0,6.283);c.fill();c.fillStyle='rgba(255,110,50,.95)';c.beginPath();c.arc(V.x*k,V.z*k,V.cr*k,0,6.283);c.fill()}
    c.lineWidth=1.8;c.strokeStyle='rgba(216,136,136,.85)';c.beginPath();c.arc(VZ.stunt.x*k,VZ.stunt.z*k,VZ.stunt.r*k,0,6.283);c.stroke();
    c.strokeStyle='rgba(120,240,230,.85)';c.beginPath();c.arc(VZ.ufo.x*k,VZ.ufo.z*k,VZ.ufo.r*k,0,6.283);c.stroke();
    mapCache=cv2;
  }
  function buildPlanetMapCache(cfg){
    const CS=720, MAPR_P=8000, k=(CS/2)/MAPR_P, cv2=document.createElement('canvas'); cv2.width=cv2.height=CS;
    const c=cv2.getContext('2d'); c.translate(CS/2,CS/2);
    // planet road centerline samples (cached in S.road)
    if(cfg && S.road && S.road.xs.length>2){
      c.strokeStyle='#5a5750'; c.lineWidth=2.8*k;
      c.beginPath();
      const len=Math.min(S.road.xs.length, Math.floor(4000/SPACE.DS)+2);
      for(let i=0;i<len;i++){const x=S.road.xs[i]*k, z=S.road.zs[i]*k; i?c.lineTo(x,z):c.moveTo(x,z)}
      c.stroke();
    }
    // crater field representation
    c.fillStyle='rgba(180,180,170,.15)';
    const grids=cfg.craters;
    for(let gi=0;gi<grids.length;gi++){
      const cell=grids[gi][0],minR=grids[gi][1],maxR=grids[gi][2],pr=grids[gi][4];
      const cx=Math.floor(0/cell),cz=Math.floor(0/cell);
      for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){
        const gx=cx+i,gz=cz+j,hsh=hash2(gx*1.7+gi*3.3+cfg.seed*0.001,gz*1.3-gi*2.1-cfg.seed*0.001);
        if(hsh<1-pr) continue;
        const ox=hash2(gx+3.1+gi+cfg.seed*0.001,gz+1.7-cfg.seed*0.001),oz=hash2(gx+5.3-cfg.seed*0.001,gz+9.1+gi);
        const ccx=(gx+ox)*cell*k, ccz=(gz+oz)*cell*k;
        const R=(minR+(maxR-minR)*hash2(gx+7.7-gi+cfg.seed*0.001,gz+2.9+gi))*k;
        c.beginPath(); c.arc(ccx,ccz,R,0,6.283); c.fill();
      }
    }
    return cv2;
  }
  let planetMapCache=null;
  function drawMap(c,size,big){
    if(SPACE.state!=='earth'){   // off Earth: this planet's map, or nothing in flight; never Earth's valley
      if(!(SPACE.drawBigMap&&SPACE.drawBigMap(c,size))){c.clearRect(0,0,size,size);c.fillStyle='rgba(242,238,230,.7)';c.font='600 '+Math.round(size/30)+'px ui-monospace,monospace';c.textAlign='center';c.fillText('No map in flight',size/2,size/2)}
      return}
    const q=chassisB.quaternion, yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
    // circuit mode: draw custom track
    if(MODE==='circuit'&&circuit){
      const pts=circuit.CSAMP;
      let a1=1e9,a2=-1e9,a3=1e9,a4=-1e9;for(const p of pts){if(p.x<a1)a1=p.x;if(p.x>a2)a2=p.x;if(p.z<a3)a3=p.z;if(p.z>a4)a4=p.z}
      const ccx=(a1+a2)/2,ccz=(a3+a4)/2,ext=Math.max(a2-a1,a4-a3)/2+18,csc=(size/2-8)/ext;
      c.clearRect(0,0,size,size);c.save();c.translate(size/2,size/2);
      c.beginPath();c.arc(0,0,size/2-1,0,6.283);c.fillStyle='rgba(18,17,15,.88)';c.fill();c.clip();
      if(!big){let d=(yaw+Math.PI-mapRot);d=Math.atan2(Math.sin(d),Math.cos(d));mapRot+=d*.1;c.rotate(mapRot);c.translate(-chassisB.position.x*csc,-chassisB.position.z*csc)}
      else c.translate(-ccx*csc,-ccz*csc);
      c.strokeStyle='rgba(242,238,230,.9)';c.lineWidth=big?5:3.5;c.lineJoin='round';c.beginPath();
      pts.forEach((p,i)=>{i?c.lineTo(p.x*csc,p.z*csc):c.moveTo(p.x*csc,p.z*csc)});c.closePath();c.stroke();
      if(circuit.startP){c.fillStyle='#f2b26b';c.beginPath();c.arc(circuit.startP.p.x*csc,circuit.startP.p.z*csc,big?5:3.4,0,6.283);c.fill()}
      NAV.drawOnMap(c,csc,big);
      c.translate(chassisB.position.x*csc,chassisB.position.z*csc);c.rotate(Math.PI-yaw);
      c.fillStyle='#f2eee6';c.beginPath();c.moveTo(0,-7);c.lineTo(5,5);c.lineTo(0,2.5);c.lineTo(-5,5);c.closePath();c.fill();c.restore();
      c.strokeStyle='rgba(242,238,230,.5)';c.lineWidth=1.5;c.beginPath();c.arc(size/2,size/2,size/2-1,0,6.283);c.stroke();return}
    // planet surface mode (Moon/Mars): only show planet features
    if(MODE==='surface' && S.planet && SPACE.PLANETS[S.planet]){
      const cfg=SPACE.PLANETS[S.planet];
      const sc=size/2/8000;
      c.clearRect(0,0,size,size);c.save();c.translate(size/2,size/2);
      c.beginPath();c.arc(0,0,size/2-1,0,6.283);c.fillStyle='rgba(10,10,15,.9)';c.fill();c.clip();
      if(!big){let d=(yaw+Math.PI-mapRot);d=Math.atan2(Math.sin(d),Math.cos(d));mapRot+=d*.1;c.rotate(mapRot);c.translate(-chassisB.position.x*sc,-chassisB.position.z*sc)}
      if(!planetMapCache)planetMapCache=buildPlanetMapCache(cfg);
      {const s=8000*sc;c.drawImage(planetMapCache,-s,-s,s*2,s*2)}
      // GPS waypoints
      if(S.gpsPins && S.gpsPins.length){
        c.fillStyle='#00ff88';c.font='600 10px ui-monospace,monospace';c.textAlign='center';
        S.gpsPins.forEach((pin,i)=>{
          const px=(pin.x-chassisB.position.x)*sc, pz=(pin.z-chassisB.position.z)*sc;
          c.beginPath();c.arc(px,pz,big?6:4,0,6.283);c.fill();
          if(big)c.fillText(pin.label,px,pz-10);
        });
      }
      // active GPS route line
      if(S.gpsTarget){
        const tx=(S.gpsTarget.x-chassisB.position.x)*sc, tz=(S.gpsTarget.z-chassisB.position.z)*sc;
        c.strokeStyle='rgba(0,255,136,.8)';c.lineWidth=big?3:2;c.setLineDash([10,6]);
        c.beginPath();c.moveTo(0,0);c.lineTo(tx,tz);c.stroke();c.setLineDash([]);
        // compass bearing
        const bearing=Math.atan2(S.gpsTarget.x-chassisB.position.x, S.gpsTarget.z-chassisB.position.z);
        c.fillStyle='#00ff88';c.font='600 11px ui-monospace,monospace';c.textAlign='right';
        c.fillText('→ '+Math.round(bearing*180/Math.PI)+'°',size/2-8,-size/2+18);
      }
      c.translate(chassisB.position.x*sc,chassisB.position.z*sc);c.rotate(Math.PI-yaw);
      c.fillStyle='#f2eee6';c.beginPath();c.moveTo(0,-7);c.lineTo(5,5);c.lineTo(0,2.5);c.lineTo(-5,5);c.closePath();c.fill();c.restore();
      c.strokeStyle='rgba(242,238,230,.5)';c.lineWidth=1.5;c.beginPath();c.arc(size/2,size/2,size/2-1,0,6.283);c.stroke();return}
    // Earth world mode
    const sc=size/2/(big?116*MK*LAND+14:60);
    c.clearRect(0,0,size,size);c.save();c.translate(size/2,size/2);
    c.beginPath();c.arc(0,0,size/2-1,0,6.283);c.fillStyle='rgba(18,17,15,.88)';c.fill();c.clip();
    if(!big){let d=(yaw+Math.PI-mapRot);d=Math.atan2(Math.sin(d),Math.cos(d));mapRot+=d*.1;c.rotate(mapRot);c.translate(-chassisB.position.x*sc,-chassisB.position.z*sc)}
    if(!mapCache)buildMapCache();
    {const s=MAPR*sc;c.drawImage(mapCache,-s,-s,s*2,s*2)}
    c.strokeStyle='#f2eee6';c.lineWidth=2;c.beginPath();const n=Math.floor(progU*MAPS.length);for(let i=0;i<=n&&i<MAPS.length;i++){const p=MAPS[i];i?c.lineTo(p.x*sc,p.z*sc):c.moveTo(p.x*sc,p.z*sc)}c.stroke();
    const t=performance.now()/500;
    {
     // traffic shows up on the map so you can see what you are racing into
     c.fillStyle='rgba(242,238,230,.75)';traffic.forEach(tc=>{const pt=at(tc.u).p;c.beginPath();c.arc(pt.x*sc,pt.z*sc,big?3.4:2.2,0,6.283);c.fill()})}
// AI racers on map
      {c.fillStyle='rgba(255,100,100,.9)';aiRacers.forEach(ai=>{const pt=at(ai.u).p;c.beginPath();c.arc(pt.x*sc,pt.z*sc,big?4:2.5,0,6.283);c.fill();if(big){c.fillStyle='#fff';c.font='600 8px ui-monospace,monospace';c.textAlign='center';c.fillText(ai.skill.charAt(0).toUpperCase(),pt.x*sc,pt.z*sc+2);c.fillStyle='rgba(255,100,100,.9)'}})}
    // the ring road
    {c.strokeStyle='rgba(242,238,230,.45)';c.lineWidth=big?3:2;
     c.beginPath();c.arc(RING.x*sc,RING.z*sc,RING.r*sc,0,6.283);c.stroke()}
    // the summit
    {c.fillStyle=atSummit?'#f2b26b':'#c98a4a';c.beginPath();c.arc(PEAK.x*sc,PEAK.z*sc,big?5:3.4,0,6.283);c.fill();
     if(atSummit){c.strokeStyle='rgba(242,178,107,.8)';c.lineWidth=1.5;c.beginPath();c.arc(PEAK.x*sc,PEAK.z*sc,(big?9:6)+Math.sin(t)*2,0,6.283);c.stroke()}
     if(big){c.fillStyle='#f2b26b';c.font='600 11px ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace';c.textAlign='left';c.fillText('SUMMIT',PEAK.x*sc+9,PEAK.z*sc+4)}}
    if(big){c.font='600 11px ui-monospace,"SF Mono",Menlo,Consolas,monospace';c.fillStyle='#e8c28a';[['STUNT PARK',VZ.stunt],['UFO',VZ.ufo],['VOLCANO',VZ.volc]].forEach(([t,q])=>c.fillText(t,q.x*sc-t.length*3.3,q.z*sc+4))}
    if(big){c.fillStyle='#9fc3d6';c.font='600 11px ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace';c.fillText('POND',POND.x*sc-14,POND.z*sc+4);c.fillStyle='#d88';c.fillText('PLAYGROUND',(PG.x-12)*sc,(PG.z-13)*sc);c.fillStyle='#cdb98f';const hp=SAMP[Math.floor(.44*N)];c.fillText('HILL',hp.x*sc+10,hp.z*sc-10)}
    NAV.drawOnMap(c,sc,big);
    c.translate(chassisB.position.x*sc,chassisB.position.z*sc);c.rotate(Math.PI-yaw);c.fillStyle='#f2eee6';c.beginPath();c.moveTo(0,-7);c.lineTo(5,5);c.lineTo(0,2.5);c.lineTo(-5,5);c.closePath();c.fill();c.restore();
    c.strokeStyle='rgba(242,238,230,.5)';c.lineWidth=1.5;c.beginPath();c.arc(size/2,size/2,size/2-1,0,6.283);c.stroke()}
  /* ---------- navigation ----------
     Routes follow real roads, never a straight line across the grass.
     Earth: a graph of the valley loop, the branch road, the ring road and the spur roads, joined wherever two of them
     meet; shortest path (Dijkstra) from the road point nearest the car to the one nearest the destination.
     A drawn / daily / custom circuit: forward along the lap to the next checkpoint gate (the start line when no race runs).
     The Moon: along the road to the next UFO station.
     The route is recomputed several times a second, so leaving the road or turning round just reroutes (with a
     "rejoin the road" leg first). A heading-up compass card shows which way to steer, the next turn and the distance,
     and the route is drawn on the minimap and the big map. G / the GPS button picks the Earth destination. */
  /* ---------- HUD layout ----------
     Things that live at the top of the screen are placed in order, and anything that would overlap one placed
     before it is moved down below it. Fixed: the rear-view mirror (its picture is rendered at a fixed spot) and the
     minimap / menu column. Movable, in order: GPS banner, lap panel, race position, room standings. The room
     standings sit in the right-hand column, under the minimap. Works at any screen size. */
  function layoutHud(){
    const base=sec.getBoundingClientRect(),placed=[],vis=e=>e&&e.offsetParent!==null&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
    const fixed=[document.getElementById('drear'),document.querySelector('.dright'),document.getElementById('dpmap')];
    fixed.forEach(e=>{if(vis(e))placed.push(e.getBoundingClientRect())});
    // the one-line key hint at the top left stops short of the mirror instead of running under it
    {const h=document.getElementById('dhint'),m=fixed[0];if(h){if(vis(m)&&vis(h)){const hr=h.getBoundingClientRect(),mr=m.getBoundingClientRect();
      h.style.maxWidth=Math.max(0,mr.left-hr.left-14)+'px';h.style.overflow='hidden';h.style.textOverflow='ellipsis';h.style.whiteSpace='nowrap'}else h.style.maxWidth=''}}
    ['dnav','dlap','dpos','dmpr'].forEach(id=>{const e=document.getElementById(id);if(!vis(e))return;
      if(id==='dmpr'){e.style.left='auto';e.style.right='var(--gut,16px)';e.style.transform='none';e.style.maxWidth='min(300px,calc(100vw - 32px))'}
      e.style.top='';let r=e.getBoundingClientRect(),dy=0;
      for(let k=0;k<6;k++){let moved=false;
        for(const p of placed){if(r.left<p.right&&r.right>p.left&&r.top+dy<p.bottom&&r.bottom+dy>p.top){dy=p.bottom+8-r.top;moved=true}}
        if(!moved)break}
      if(dy>0)e.style.top=(r.top-base.top+dy)+'px';
      placed.push({left:r.left,right:r.right,top:r.top+dy,bottom:r.bottom+dy})})}
  addEventListener('resize',()=>setTimeout(layoutHud,50));
  const NAV=(function(){
    let G=null,route=null,lastCalc=0,hidden=false,last=null;
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),brg=(ax,az,bx,bz)=>Math.atan2(bx-ax,bz-az);
    function buildEarth(){
      const xs=[],zs=[],adj=[],own=[];let road=0;
      const link=(a,b)=>{const l=Math.hypot(xs[a]-xs[b],zs[a]-zs[b]);adj[a].push([b,l]);adj[b].push([a,l])};
      const line=(pts,closed)=>{const b0=xs.length;pts.forEach(p=>{xs.push(p[0]);zs.push(p[1]);adj.push([]);own.push(road)});
        for(let i=0;i<pts.length-1;i++)link(b0+i,b0+i+1);if(closed&&pts.length>2)link(b0+pts.length-1,b0);road++};
      line(SAMP.slice(0,N).map(p=>[p.x,p.z]),true);
      line(BSAMP.map(p=>[p.x,p.z]),false);
      {const r=[];for(let i=0;i<48;i++){const a=i/48*6.283;r.push([RING.x+Math.cos(a)*RING.r,RING.z+Math.sin(a)*RING.r])}line(r,true)}
      SPURS.forEach(sp=>{if(sp.length>1)line(sp,false)});
      // junctions: each node joins the nearest node of another road within 12 m
      const cell=12,H=new Map();for(let i=0;i<xs.length;i++){const k=Math.floor(xs[i]/cell)+','+Math.floor(zs[i]/cell);let a=H.get(k);if(!a)H.set(k,a=[]);a.push(i)}
      for(let i=0;i<xs.length;i++){const gx=Math.floor(xs[i]/cell),gz=Math.floor(zs[i]/cell);let best=-1,bd=144;
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const L=H.get((gx+a)+','+(gz+b));if(L)for(const j of L){if(own[j]===own[i])continue;const d=(xs[i]-xs[j])**2+(zs[i]-zs[j])**2;if(d<bd){bd=d;best=j}}}
        if(best>=0)link(i,best)}
      G={xs,zs,adj}}
    function nearest(x,z){let b=-1,bd=1e18;for(let i=0;i<G.xs.length;i++){const d=(G.xs[i]-x)**2+(G.zs[i]-z)**2;if(d<bd){bd=d;b=i}}return [b,Math.sqrt(bd)]}
    function dijkstra(a,b){const n=G.xs.length,dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),heap=[[0,a]];dist[a]=0;
      const push=e=>{heap.push(e);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p}};
      const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m}}return top};
      while(heap.length){const [d,u]=pop();if(d>dist[u])continue;if(u===b)break;for(const [v,l] of G.adj[u]){const nd=d+l;if(nd<dist[v]){dist[v]=nd;prev[v]=u;push([nd,v])}}}
      if(!isFinite(dist[b]))return null;const out=[];for(let v=b;v>=0;v=prev[v])out.push([G.xs[v],G.zs[v]]);return out.reverse()}
    function carPose(){const q=chassisB.quaternion;return {x:chassisB.position.x,z:chassisB.position.z,h:Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z))}}
    function compute(){
      if(SPACE.state!=='earth'){const n=SPACE.navInfo&&SPACE.navInfo();return n?{pts:n.pts,label:n.label,pos:[n.x,n.z],h:n.h,off:false,auto:true}:null}
      const P=carPose();
      if(MODE==='circuit'&&circuit){
        const C=circuit,S=C.CSAMP,CN=C.CN,RE=window.RaceEngine;let bi=0,bd=1e18;
        for(let i=0;i<CN;i++){const d=(S[i].x-P.x)**2+(S[i].z-P.z)**2;if(d<bd){bd=d;bi=i}}
        let ti=0,label='Start line';
        if(RE&&RE.state==='racing'&&RE.checkpoints.length){const N2=RE.checkpoints.length,want=RE.currentCheckpoint%N2;ti=Math.round(RE.checkpoints[want].u*CN)%CN;
          label=want===0?(RE.currentCheckpoint>=N2?(RE.currentLap>=RE.totalLaps?'Finish line':'Lap line'):'Start line'):'Checkpoint '+want+' / '+(N2-1)}
        // already at the gate (just across it, waiting for the crossing to register): don't send the car round a whole lap
        if(Math.hypot(S[ti].x-P.x,S[ti].z-P.z)<CIRC_W){const n=(ti+6)%CN;return {pts:[[P.x,P.z],[S[ti].x,S[ti].z],[S[n].x,S[n].z]],label,pos:[P.x,P.z],h:P.h,off:false,auto:true}}
        const pts=[[P.x,P.z]];for(let k=0,i=bi;k<=CN;k++,i=(i+1)%CN){pts.push([S[i].x,S[i].z]);if(i===ti&&k>2)break}
        return {pts,label,pos:[P.x,P.z],h:P.h,off:Math.sqrt(bd)>CIRC_W/2+3,auto:true}}
      const T=window.earthGpsTarget;if(!T||MODE!=='world')return null;
      if(!G)buildEarth();
      const [a,da]=nearest(P.x,P.z),[b]=nearest(T.x,T.z),path=dijkstra(a,b);if(!path)return null;
      // the nearest road point can sit just behind the car: if the next one is closer to the car, start from that
      if(path.length>1&&Math.hypot(path[1][0]-P.x,path[1][1]-P.z)<Math.hypot(path[1][0]-path[0][0],path[1][1]-path[0][1]))path.shift();
      const pts=[[P.x,P.z]].concat(path);pts.push([T.x,T.z]);
      return {pts,label:T.label,pos:[P.x,P.z],h:P.h,off:da>RWX+16,target:T}}
    // walk the route by distance from the car's place on it
    function sampler(R){const pts=R.pts;let i0=0,bd=1e18;for(let i=0;i<pts.length;i++){const d=(pts[i][0]-R.pos[0])**2+(pts[i][1]-R.pos[1])**2;if(d<bd){bd=d;i0=i}}
      const cum=[0];for(let i=i0+1;i<pts.length;i++)cum.push(cum[cum.length-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
      const at=d=>{if(d<=0)return pts[i0];for(let k=1;k<cum.length;k++)if(cum[k]>=d){const t=(d-cum[k-1])/Math.max(1e-6,cum[k]-cum[k-1]),A=pts[i0+k-1],B=pts[i0+k];return [A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t]}return pts[pts.length-1]};
      return {at,total:cum[cum.length-1]+Math.sqrt(bd),i0}}
    function guidance(R){
      const Sm=sampler(R),remain=Sm.total,steer=Sm.at(R.off?0:Math.min(remain,30));
      const rel=wrap(brg(R.pos[0],R.pos[1],steer[0],steer[1])-R.h);
      let kind='straight',dir=0,manD=0,man='Straight on';
      if(R.off){kind='rejoin';man='Rejoin the road';dir=rel>0?1:-1}
      else if(remain<60){kind='arrive';man='Arriving';manD=remain}
      else{const p0=Sm.at(8),p1=Sm.at(33),b0=brg(p0[0],p0[1],p1[0],p1[1]);   // skip the first metres: the stub from the car to the road
        for(let d=40;d<Math.min(320,remain-10);d+=10){const q0=Sm.at(d),q1=Sm.at(d+25),df=wrap(brg(q0[0],q0[1],q1[0],q1[1])-b0);
          if(Math.abs(df)>.5){dir=df>0?1:-1;kind=Math.abs(df)>2.3?'uturn':Math.abs(df)>1.2?'sharp':'turn';
            man=(kind==='uturn'?'U-turn ':kind==='sharp'?'Sharp ':'Turn ')+(dir>0?'left':'right');manD=d;break}}
        // turn around only on Earth routes, judged against the road's own direction where the car is
        if(R.target){const t0=Sm.at(10),t1=Sm.at(30);if(Math.abs(wrap(brg(t0[0],t0[1],t1[0],t1[1])-R.h))>2.3&&Math.abs(rel)>2.0){kind='uturn';dir=1;man='Turn around';manD=0}}}
      return {rel,remain,man,manD,kind,dir,turnPt:manD&&kind!=='arrive'?Sm.at(manD):null}}
    /* the view: a slim banner at the top centre, built from small parts (turn icon, distance, text, compass) */
    const view=(function(){
      const css=document.createElement('style');css.textContent=
        '#dnav{position:absolute;left:50%;top:calc(12px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:3;display:none;pointer-events:none;'+
          'grid-template-columns:auto 1fr auto;align-items:center;gap:12px;min-width:min(380px,calc(100vw - 32px));max-width:calc(100vw - 32px);padding:8px 12px 8px 8px;border-radius:16px;'+
          'background:linear-gradient(180deg,rgba(18,20,22,.86),rgba(10,11,12,.8));backdrop-filter:blur(10px);box-shadow:0 8px 28px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);color:#f2eee6}'+
        '#dnav.on{display:grid}#dnav .ic{width:52px;height:52px;border-radius:12px;background:#1f7a4a;display:grid;place-items:center}#dnav.off .ic{background:#b5761a}'+
        '#dnav .md{font:700 22px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;letter-spacing:-.01em;white-space:nowrap}'+
        '#dnav .mt{font:600 12px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;opacity:.85;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
        '#dnav .sub{font:500 10px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.06em;opacity:.55;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}'+
        '@media (max-width:700px){#dnav{min-width:0;gap:8px;padding:6px 8px}#dnav .md{font-size:17px}#dnav .cp{display:none}}';
      document.head.appendChild(css);
      const d=document.createElement('div');d.id='dnav';
      d.innerHTML='<div class="ic"><canvas width="96" height="96" style="width:48px;height:48px"></canvas></div><div style="min-width:0"><div class="md"></div><div class="mt"></div><div class="sub"></div></div><canvas class="cp" width="96" height="96" style="width:48px;height:48px"></canvas>';
      sec.appendChild(d);
      const icon=d.querySelector('.ic canvas').getContext('2d'),comp=d.querySelector('.cp').getContext('2d'),
        md=d.querySelector('.md'),mt=d.querySelector('.mt'),sub=d.querySelector('.sub');
      const fmtD=m=>m>=1000?(m/1000).toFixed(1)+' km':Math.max(10,Math.round(m/10)*10)+' m';
      let lastIcon='',needle=0;
      // turn icon: a road arrow bent the way the next manoeuvre goes
      function drawIcon(kind,dir){const key=kind+dir;if(key===lastIcon)return;lastIcon=key;const c=icon;c.clearRect(0,0,96,96);
        c.strokeStyle='#fff';c.fillStyle='#fff';c.lineWidth=11;c.lineCap='round';c.lineJoin='round';
        const head=(x,y,a)=>{c.save();c.translate(x,y);c.rotate(a);c.beginPath();c.moveTo(0,-14);c.lineTo(15,8);c.lineTo(-15,8);c.closePath();c.fill();c.restore()};
        if(kind==='arrive'){c.beginPath();c.arc(48,40,16,0,6.283);c.stroke();c.beginPath();c.moveTo(48,58);c.lineTo(48,84);c.stroke();return}
        if(kind==='straight'||kind==='rejoin'&&!dir){c.beginPath();c.moveTo(48,86);c.lineTo(48,30);c.stroke();head(48,22,0);return}
        const s=dir>0?-1:1;   // dir>0 = left
        if(kind==='uturn'){c.beginPath();c.moveTo(48-s*14,86);c.lineTo(48-s*14,40);c.arc(48,40,14,s>0?Math.PI:0,s>0?0:Math.PI,s<0);c.lineTo(48+s*14,58);c.stroke();head(48+s*14,66,Math.PI);return}
        const ang=kind==='sharp'?2.2:kind==='rejoin'?.6:1.1,ex=48+s*Math.sin(ang)*30,ey=46-Math.cos(ang)*30;
        c.beginPath();c.moveTo(48,86);c.lineTo(48,48);c.lineTo(ex,ey);c.stroke();head(ex+s*Math.sin(ang)*6,ey-Math.cos(ang)*6,s*ang)}
      // compass: heading up, N marked, needle along the route (eased)
      function drawCompass(h,rel,dt){const c=comp;c.clearRect(0,0,96,96);
        c.fillStyle='rgba(255,255,255,.06)';c.beginPath();c.arc(48,48,44,0,6.283);c.fill();c.strokeStyle='rgba(255,255,255,.25)';c.lineWidth=2;c.stroke();
        const n=wrap(Math.PI-h);c.fillStyle='#ff5a4a';c.font='700 16px ui-monospace,monospace';c.textAlign='center';c.textBaseline='middle';c.fillText('N',48-Math.sin(n)*33,48-Math.cos(n)*33);
        needle+=wrap(rel-needle)*Math.min(1,dt*8);
        c.save();c.translate(48,48);c.rotate(-needle);c.strokeStyle='#3ee08a';c.fillStyle='#3ee08a';c.lineWidth=6;c.lineCap='round';c.beginPath();c.moveTo(0,22);c.lineTo(0,-12);c.stroke();c.beginPath();c.moveTo(0,-32);c.lineTo(12,-10);c.lineTo(-12,-10);c.closePath();c.fill();c.restore();c.fillStyle='#f2eee6';c.beginPath();c.arc(48,48,4,0,6.283);c.fill()}   // arrow with a shaft: unmistakable which end is the front
      function render(R,g,dt){
        d.classList.toggle('off',!!R.off);drawIcon(g.kind,g.dir);drawCompass(R.h,g.rel,dt);
        md.textContent=g.kind==='straight'?fmtD(g.remain):g.manD?fmtD(g.manD):g.man;
        mt.textContent=g.kind==='straight'?'Follow the road':g.manD?g.man:(g.kind==='rejoin'?'Head for the green line':'');
        sub.textContent=R.label+' · '+fmtD(g.remain)}
      function show(on){if(d.classList.contains('on')!==on){d.classList.toggle('on',on);setTimeout(layoutHud,0)}}
      return {render,show}})();
    function tick(dt,now){
      if(frameN%10===0)layoutHud();
      if(now-lastCalc>350){lastCalc=now;try{route=compute()}catch(e){route=null}
        if(route&&route.target){const g=guidance(route);if(g.remain<22){toastMsg('Arrived · '+route.target.label);window.earthGpsTarget=null;route=null}}}
      const show=!!route&&!hidden&&active&&(driving||SPACE.state!=='earth');
      view.show(show);
      if(show&&frameN%2===0){last=guidance(route);view.render(route,last,dt*2)}}
    // route, destination and next turn on a map already scaled so that world (x,z)*sc is the point
    function drawOnMap(c,sc,big){
      if(MODE==='world'&&window.earthGPS&&window.earthGPS.length){c.font='600 '+(big?11:9)+'px ui-monospace,monospace';c.textAlign='center';
        window.earthGPS.forEach(p=>{const on=p===window.earthGpsTarget;c.fillStyle=on?'#00ff88':'rgba(0,255,136,.45)';c.beginPath();c.arc(p.x*sc,p.z*sc,(big?6:3.5)*(on?1.3:1),0,6.283);c.fill();
          if(big){c.fillStyle=on?'#00ff88':'rgba(200,255,220,.75)';c.fillText(p.label,p.x*sc,p.z*sc-11)}})}
      if(!route||hidden)return;
      c.save();c.strokeStyle='rgba(0,255,136,.9)';c.lineWidth=big?5:3;c.lineJoin=c.lineCap='round';c.beginPath();
      route.pts.forEach((p,i)=>i?c.lineTo(p[0]*sc,p[1]*sc):c.moveTo(p[0]*sc,p[1]*sc));c.stroke();
      const e=route.pts[route.pts.length-1];c.fillStyle='#00ff88';c.beginPath();c.arc(e[0]*sc,e[1]*sc,big?8:5,0,6.283);c.fill();c.strokeStyle='#0a0a09';c.lineWidth=2;c.stroke();
      if(last&&last.turnPt){c.fillStyle='#f3a712';c.beginPath();c.arc(last.turnPt[0]*sc,last.turnPt[1]*sc,big?5:3,0,6.283);c.fill()}
      c.restore()}
    return {tick,drawOnMap,toggle(){hidden=!hidden;toastMsg(hidden?'Navigation hidden · G to show':'Navigation on');return !hidden},get route(){return route}}})();
  function toggleMap(){const on=!bigmap.classList.contains('on');bigmap.classList.toggle('on',on);driving=!on;for(const k in key)key[k]=0;if(on)drawMap(bmc.getContext('2d'),bmc.width,true)}
  mm.onclick=toggleMap;$('#dbigx').onclick=toggleMap;
  // GPS: click on big map to set/clear target, right-click to add custom pin
  bmc.oncontextmenu=e=>{e.preventDefault();
    if(!bigmap.classList.contains('on'))return;
    const rect=bmc.getBoundingClientRect(), cx=e.clientX-rect.left, cy=e.clientY-rect.top;
    const size=bmc.width;
    if(MODE==='surface' && SPACE.SURF){
      const sc=size/2/8000;
      const wx=(cx-size/2)/sc+SPACE.SURF.pos.x, wz=(cy-size/2)/sc+SPACE.SURF.pos.z;
      const gh=SPACE.groundH(SPACE.SURF.cfg,SPACE.SURF.road,wx,wz,0);
      SPACE.SURF.gpsPins.push({x:wx, z:wz, y:gh, label:'Pin', type:'custom'});
      drawMap(bmc.getContext('2d'),bmc.width,true)
    }else if(MODE==='world'){
      const sc=size/2/(116*MK*LAND+14);
      const wx=(cx-size/2)/sc+chassisB.position.x, wz=(cy-size/2)/sc+chassisB.position.z;
      if(!window.earthGPS)window.earthGPS=[];
      window.earthGPS.push({x:wx, z:wz, y:0, label:'Pin', type:'custom'});
      drawMap(bmc.getContext('2d'),bmc.width,true)
    }
  };
  bmc.onclick=e=>{
    if(!bigmap.classList.contains('on'))return;
    const rect=bmc.getBoundingClientRect(), cx=e.clientX-rect.left, cy=e.clientY-rect.top;
    const size=bmc.width;
    if(MODE==='surface' && SPACE.SURF){
      const sc=size/2/8000;
      const wx=(cx-size/2)/sc+SPACE.SURF.pos.x, wz=(cy-size/2)/sc+SPACE.SURF.pos.z;
      let best=1e9, bi=-1; SPACE.SURF.gpsPins.forEach((p,i)=>{const d=Math.hypot(p.x-wx,p.z-wz); if(d<best){best=d; bi=i}});
      if(bi>=0 && best<2000/sc){
        if(SPACE.SURF.gpsTarget===SPACE.SURF.gpsPins[bi]){ SPACE.SURF.gpsTarget=null; toastMsg('GPS cleared') }
        else { SPACE.SURF.gpsTarget=SPACE.SURF.gpsPins[bi]; toastMsg('GPS → '+SPACE.SURF.gpsTarget.label) }
        drawMap(bmc.getContext('2d'),bmc.width,true);
      }
    }else if(MODE==='world'){
      const sc=size/2/(116*MK*LAND+14);
      const wx=(cx-size/2)/sc+chassisB.position.x, wz=(cy-size/2)/sc+chassisB.position.z;
      let best=1e9, bi=-1; if(window.earthGPS)window.earthGPS.forEach((p,i)=>{const d=Math.hypot(p.x-wx,p.z-wz); if(d<best){best=d; bi=i}});
      if(bi>=0 && best<2000/sc){
        if(window.earthGpsTarget===window.earthGPS[bi]){ window.earthGpsTarget=null; toastMsg('GPS cleared') }
        else { window.earthGpsTarget=window.earthGPS[bi]; toastMsg('GPS → '+window.earthGpsTarget.label) }
        drawMap(bmc.getContext('2d'),bmc.width,true);
      }
    }
  };
  /* ---------- loop ---------- */
  const camT=new THREE.Vector3(),look=new THREE.Vector3(),fwd=new THREE.Vector3(),tmp=new THREE.Vector3(),lastV=new THREE.Vector3();
  let leanVf=0,leanA=0;const leanF=new CANNON.Vec3(),skUp=new THREE.Vector3(0,1,0),skN=new THREE.Vector3(),skQ=new THREE.Quaternion(),skQ2=new THREE.Quaternion(),skM=new THREE.Matrix4(),skP=new THREE.Vector3(),skS=new THREE.Vector3(1,1,1);
  let last=performance.now(),flipT=0,frameN=0,spdS=0,shake=0,idleT=0,cineOn=false,inPond=false,sub=0,pondToast=0,liftShown=false,missHint=false,airT=0;
  let act=-1,chapEase=0,camRoll=0;const lookT=new THREE.Vector3();
  /* ---------- the idle backdrop ----------
     Before you press Start, this section is a picture of a world, not a world you are
     in: the car does not move and nothing is being driven. It used to keep redrawing
     the whole scene a few times a second to show that, which is far too slow to read
     as motion and far too much work to be free — it just looked like the page was
     struggling. So it now renders a handful of frames to let the lighting settle, keeps
     one of them as a still, and then stops rendering altogether until you actually
     start the engine. If grabbing the still ever fails we fall back to the old
     throttled redraw rather than leaving an empty canvas. */
  let idleLast=0,idleLow=0,posterState=0,posterWarm=0,wasActive=false;
  const poster=document.createElement('img');
  poster.id='dposter';poster.alt='';poster.decoding='async';
  if(cv.insertAdjacentElement)cv.insertAdjacentElement('afterend',poster);
  /* ---------- per-step chassis forces (runs inside every physics step) ---------- */
  let gradeNow=0,physAcc=0;const PSTEP=1/60;
  const PREV={p:new CANNON.Vec3(),q:new CANNON.Quaternion(),ok:false},qA=new THREE.Quaternion(),qB=new THREE.Quaternion();
  const shD=new THREE.Vector3(),shR=new THREE.Vector3(),shU=new THREE.Vector3();
  /* damage/fuel/tyre-wear block below was never wired up (it referenced variables that do not
     exist here, and compounded V.engine/V.max down every physics step). Off until it is rebuilt. */
  const DAMAGE_SYSTEM=false;
  function physStep(h){
      // anti-cheat recording
      window.recordAntiCheatState();
      if(sub>0){
        // buoyancy scales with how submerged it is and is capped under its own weight, so it wallows instead of taking off
        const lift=chassisB.mass*24*sub*.88;
        fScratch.set(0,lift,0);chassisB.applyForce(fScratch,chassisB.position);
        // water grabs the hull: kill spin and sideways slide
        const av=chassisB.angularVelocity,k=Math.min(.55,sub*9*h);av.x-=av.x*k;av.z-=av.z*k;av.y-=av.y*k*.5;
        // quadratic drag, so wading has real weight to it
        const v=chassisB.velocity,vs=v.length();
        if(vs>.05){const dq=Math.min(chassisB.mass*13,vs*vs*7.5)*sub;fScratch.set(-v.x/vs*dq,-v.y/vs*dq*.4,-v.z/vs*dq);chassisB.applyForce(fScratch,chassisB.position)}}
      /* ---------- chassis dynamics ----------
         Three things a raycast vehicle does not give you for free, and all three are
         what made this car feel like a brick on ice. An anti-roll bar per axle, which
         trades load across the car in a corner instead of letting it lean over and ride
         on two wheels. Aero, so the top end tapers off on its own and the faster you go
         the harder the floor is pressed into the road. And tyre grip that scales with how
         hard each wheel is actually loaded — a wheel that has gone light in a corner now
         gives up grip the way a real one does, which is where the understeer comes from. */
      /* Everything below reuses scratch vectors and arrays held outside the loop. This
         block runs sixty times a second, and the version that allocated a dozen Vec3s
         and two arrays per frame handed the collector a steady drip of garbage for no
         reason — which is exactly the kind of thing that shows up as stutter. */
      {const wi=veh.wheelInfos;
    const isBike=V.label==='Phantom Bike';
    const wheelCount=isBike?2:4;
    const STATIC=chassisB.mass*Math.abs(world.gravity.y)/wheelCount;
       UPV.set(0,1,0);chassisB.quaternion.vmult(UPV,bodyUp);
       for(let i=0;i<wheelCount;i++){const w=wi[i],rest=w.suspensionRestLength||1;
         const sf=+w.suspensionForce;
         wLoad[i]=w.isInContact&&isFinite(sf)?Math.max(0,sf):0;
         wComp[i]=w.isInContact?Math.max(0,Math.min(1,w.suspensionLength/rest)):1}
// anti-roll bars — front axle is wheels 0/1, rear is 2/3. Unrolled, so no closure per frame.
        if(!inPond && !isBike)for(let ax=0;ax<2;ax++){
          const l=ax*2,r=l+1,k=ax?ARB_R:ARB_F;
          // both wheels on the axle have to be down, or landing off a ramp gets jumpy
          if(!wi[l].isInContact||!wi[r].isInContact||!wi[l].raycastResult||!wi[r].raycastResult)continue;
          const fN=(wComp[l]-wComp[r])*k;if(!isFinite(fN)||Math.abs(fN)<1)continue;
          bodyUp.scale(-fN,fScratch);chassisB.applyForce(fScratch,wi[l].raycastResult.hitPointWorld);
          bodyUp.scale(fN,fScratch);chassisB.applyForce(fScratch,wi[r].raycastResult.hitPointWorld)}
       /* Aero is drag only, applied at the centre of mass so it cannot pitch the car.
          Downforce was tried and thrown out: on springs this soft it squashed the
          suspension until the floor grounded out, which cost half the top speed and
          eventually put the car on its roof. Drag on its own does the useful half —
          it tapers the top end and, because it pulls at the centre of mass while the
          drive pushes at the rear contact patches, it settles the nose under power. */
       if(!inPond){const vv=chassisB.velocity,vs=Math.hypot(vv.x,vv.z);
         if(vs>.5&&isFinite(vs)){
           const dg=Math.min(chassisB.mass*8,vs*vs*AERO_DRAG);
           fScratch.set(-vv.x/vs*dg,0,-vv.z/vs*dg);chassisB.applyForce(fScratch,chassisB.position)}}
       lvScratch.copy(chassisB.velocity);chassisB.quaternion.conjugate(qScratch);qScratch.vmult(lvScratch,lvScratch);
let lateral=Math.min(1,Math.abs(lvScratch.x)/8),
      rearGrip=key.h?.42:1,
      // weather effects on grip
      weatherGripMult=wx.slip,
      grip=V.slip*weatherGripMult*(1-sub*.72)*(1+gradeNow*.55)*(1+lateral*.22);
        // additional weather-specific grip modifiers
        if(wxB.part==='rain' || wxB.part==='storm'){
          grip*=0.6; // wet roads
        }else if(wxB.part==='snow' || wxB.part==='blizzard'){
          grip*=0.3; // icy roads
        }else if(wxB.part==='fog'){
          grip*=0.8; // reduced visibility
        }else if(wxB.part==='sand'){
          grip*=0.7; // sandy roads
        }
       for(let i=0;i<wheelCount;i++){
         // load sensitivity: grip climbs with load, but slower than the load does
         const lr=STATIC>0?wLoad[i]/STATIC:1;
         const ls=wi[i].isInContact?Math.max(.4,Math.pow(Math.min(LOAD_CAP,lr),LOAD_EXP)):1;
         wi[i].frictionSlip=grip*(i>1?rearGrip:1)*(isFinite(ls)?ls:1)}
       // nothing above is allowed to hand the solver a NaN — that is what used to launch the car
const F=chassisB.force,T=chassisB.torque;
        if(!isFinite(F.x)||!isFinite(F.y)||!isFinite(F.z))F.set(0,0,0);
        if(!isFinite(T.x)||!isFinite(T.y)||!isFinite(T.z))T.set(0,0,0)
        /* ---------- damage system ---------- */
        // collision damage detection
        if(active&&driving){
          const impactForce=Math.hypot(F.x,F.z);
          if(DAMAGE_SYSTEM&&impactForce>5000){
            let f=key.f?1:0,b=key.b?1:0;const boost=key.boost?1:0,dt=h,speed=Math.hypot(chassisB.velocity.x,chassisB.velocity.z)*3.6;
            const damageAmount=Math.min(1,impactForce/50000);
            vehicleDamage=Math.min(1,vehicleDamage+damageAmount);
            // distribute damage to systems
            if(Math.random()<0.3) damageEffects.engine=Math.min(1,damageEffects.engine+damageAmount*0.5);
            if(Math.random()<0.2) damageEffects.transmission=Math.min(1,damageEffects.transmission+damageAmount*0.3);
            if(Math.random()<0.4) damageEffects.suspension=Math.min(1,damageEffects.suspension+damageAmount*0.4);
            if(Math.random()<0.2) damageEffects.aero=Math.min(1,damageEffects.aero+damageAmount*0.2);
            if(Math.random()<0.3) damageEffects.tires=Math.min(1,damageEffects.tires+damageAmount*0.3);
            // visual feedback
            shake=Math.max(shake,damageAmount*2);
            if(vehicleDamage>0.7){
              toastMsg('Critical damage! Performance severely reduced');
            }else if(vehicleDamage>0.4){
              toastMsg('Vehicle damaged · performance reduced');
}
        /* ---------- fuel/tire wear system ---------- */
        if(active&&driving){
          // fuel consumption based on throttle and speed
          if(fuelLevel>0){
            const fuelConsumption=dt*(0.0001+f*0.0005+boost*0.001)*speed/100;
            fuelLevel=Math.max(0,fuelLevel-fuelConsumption);
            if(fuelLevel<5 && Math.random()<0.001){
              toastMsg('Fuel critical! Find a pit stop');
            }
            if(fuelLevel<=0){
              // engine dies
              f=0; b=1;
              toastMsg('Out of fuel! Coasting to stop');
            }
          }
          // tire wear based on slip and speed
          for(let i=0;i<wheelCount;i++){
            const w=wi[i];
            if(w.isInContact){
              const slipFactor=Math.max(0,1-w.skidInfo||0);
              const wearRate=dt*speed/1000*slipFactor*0.0001;
              tireWear[i]=Math.min(1,tireWear[i]+wearRate);
            }
          }
          // tire wear affects grip
          const avgTireWear=tireWear.reduce((a,b)=>a+b,0)/wheelCount;
          if(avgTireWear>0.3){
            const wearMult=1-avgTireWear*0.5;
            V.slip*=1+avgTireWear*0.5;
          }
          // pit stop logic (press P to pit)
          if(key.p && speed<10 && fuelLevel<95){
            fuelLevel=100;
            tireWear=[0,0,0,0];
            vehicleDamage=Math.max(0,vehicleDamage-0.2);
            Object.keys(damageEffects).forEach(k=>{damageEffects[k]=Math.max(0,damageEffects[k]-0.1)});
            toastMsg('Pit stop complete · Fuel & tires refreshed');
          }
        }
          // apply damage effects to vehicle performance
          if(vehicleDamage>0){
            const damageMult=1-vehicleDamage*0.8;
            V.engine*=damageMult;
            V.slip*=1+vehicleDamage*0.5;
            V.steer*=1-vehicleDamage*0.3;
            V.max*=1-vehicleDamage*0.4;
          }
          // gradual repair over time (very slow)
          if(vehicleDamage>0 && speed<5){
            vehicleDamage=Math.max(0,vehicleDamage-dt*0.001);
            Object.keys(damageEffects).forEach(k=>{damageEffects[k]=Math.max(0,damageEffects[k]-dt*0.0005)});
          }
        }
}
  /* (bike lean used to be forced here by rewriting the chassis rotation with Quaternion.slerp, which
     cannon 0.6.2 does not have, so it threw every physics step; it also overrode the steering.
     The bike now leans visually instead, in the body-roll code in the render loop.) */
  }
  // anti-cheat validation
  validateAntiCheat();
  }
  world.addEventListener('preStep',()=>{PREV.p.copy(chassisB.position);PREV.q.copy(chassisB.quaternion);PREV.ok=true;
    if(active&&driving)physStep(PSTEP)});

  /* =====================================================================
     SPACE EXTENSION ?? PHASE 1 ??? THE BLACK HOLE ANOMALY (Earth world)
     ---------------------------------------------------------------------
     An isolated, additive system. It does NOT touch the Earth terrain,
     car, physics, roads, missions, weather or day/night ??? it only adds
     objects to the existing scene (S) and animates them from the loop via
     ANOMALY.update(dt,now). Dormant and subtle by day; a dramatic, lensing
     gravitational anomaly at night, placed off-road so the player can
     physically drive toward it. Later phases (entry transition, space
     journey, Moon world, return) hook into the state exposed here.
     ===================================================================== */
  const ANOMALY=(function(){
    const grp=new THREE.Group(); S.add(grp);
    /* --- dramatic location: off the road, out in open terrain --- */
    const a=at(0.62), nx=-a.n.x||0, nz=-a.n.z||0; // push to the far side of the loop
    const gx=a.p.x+ a.n.x*110, gz=a.p.z+ a.n.z*110;
    let gy=0; try{gy=terrainH(gx,gz);}catch(e){gy=0;}
    const CEN=new THREE.Vector3(gx, gy+44, gz);
    grp.position.copy(CEN);
    const HOR=12;                                  // event-horizon radius

    /* --- event horizon: genuinely black, drawn after the disk --- */
    const horizon=new THREE.Mesh(new THREE.SphereGeometry(HOR,40,40),
      new THREE.MeshBasicMaterial({color:0x000000,fog:false}));
    horizon.renderOrder=2; grp.add(horizon);

    /* --- photon ring: thin, intensely bright, additive --- */
    const photon=new THREE.Mesh(new THREE.TorusGeometry(HOR*1.12,0.5,16,110),
      new THREE.MeshBasicMaterial({color:0xffe9bf,blending:THREE.AdditiveBlending,transparent:true,opacity:0,depthWrite:false,fog:false}));
    photon.renderOrder=3; grp.add(photon);

    /* --- accretion disk: swirling plasma + doppler brightening (shader) --- */
    const diskMat=new THREE.ShaderMaterial({
      transparent:true, side:THREE.DoubleSide, depthWrite:false,
      blending:THREE.AdditiveBlending, fog:false,
      uniforms:{uTime:{value:0}, uRev:{value:0}},
      vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:[
        'varying vec2 vUv; uniform float uTime; uniform float uRev;',
        'void main(){',
        '  vec2 p=vUv-0.5; float r=length(p); float ang=atan(p.y,p.x);',
        '  float band=smoothstep(0.5,0.47,r)*smoothstep(0.17,0.22,r);',
        '  float swirl=0.5+0.5*sin(ang*3.0 - uTime*2.2 + r*42.0);',
        '  float dopp=0.5+0.5*cos(ang);',                 // one side approaching ??? brighter
        '  vec3 hot=mix(vec3(1.0,0.5,0.14), vec3(1.0,0.95,0.82), swirl*dopp);',
        '  float alpha=band*(0.3+0.7*swirl)*(0.35+0.65*dopp)*uRev;',
        '  gl_FragColor=vec4(hot*(1.1+dopp), alpha);',
        '}'].join('\n')
    });
    const disk=new THREE.Mesh(new THREE.RingGeometry(HOR*1.15,HOR*2.9,110,1),diskMat);
    disk.rotation.x=Math.PI*0.5-0.32; disk.renderOrder=1; grp.add(disk);

    /* --- lensing illusion: fresnel rim that bends light around the edge --- */
    const lensMat=new THREE.ShaderMaterial({
      transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.FrontSide, fog:false,
      uniforms:{uRev:{value:0}},
      vertexShader:'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader:'varying vec3 vN; varying vec3 vV; uniform float uRev; void main(){ float f=pow(1.0-abs(dot(vN,vV)),3.0); gl_FragColor=vec4(vec3(0.55,0.68,1.0)*f, f*0.55*uRev); }'
    });
    const lens=new THREE.Mesh(new THREE.SphereGeometry(HOR*1.3,32,32),lensMat); grp.add(lens);

    /* --- soft volumetric-ish glow sprite --- */
    const glowC=document.createElement('canvas'); glowC.width=glowC.height=128;
    {const g=glowC.getContext('2d'),rg=g.createRadialGradient(64,64,0,64,64,64);
     rg.addColorStop(0,'rgba(255,190,110,0.9)');rg.addColorStop(0.35,'rgba(255,150,70,0.4)');rg.addColorStop(1,'rgba(255,120,40,0)');
     g.fillStyle=rg; g.fillRect(0,0,128,128);}
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowC),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:0,fog:false}));
    glow.scale.setScalar(HOR*7); grp.add(glow);

    /* --- infalling star particles spiralling toward the horizon --- */
    const PN=320, pp=new Float32Array(PN*3), pAng=new Float32Array(PN), pRad=new Float32Array(PN), pY=new Float32Array(PN), pSpd=new Float32Array(PN);
    for(let i=0;i<PN;i++){ pAng[i]=Math.random()*Math.PI*2; pRad[i]=HOR*1.4+Math.random()*HOR*4; pY[i]=(Math.random()-0.5)*HOR*2; pSpd[i]=0.4+Math.random()*0.8; }
    const pGeoA=new THREE.BufferGeometry(); pGeoA.setAttribute('position',new THREE.BufferAttribute(pp,3));
    const particles=new THREE.Points(pGeoA,new THREE.PointsMaterial({color:0xffd9a0,size:0.5,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
    grp.add(particles);

    let rev=0.12, hintShown=false;
    const GROUND=new THREE.Vector3(gx,gy,gz);
    const api={grp, center:CEN, ground:GROUND, radius:HOR, get reveal(){return rev;}, near:false};

    api.update=function(dt,now){
      // reveal eases toward full at night, stays faint by day
      const target = nightOn ? 1 : 0.12;
      rev += (target-rev)*Math.min(1,dt*1.3);
      diskMat.uniforms.uTime.value += dt*(1+rev*1.4);
      diskMat.uniforms.uRev.value = rev;
      lensMat.uniforms.uRev.value = rev;
      photon.material.opacity = rev*0.95;
      glow.material.opacity = rev*0.5;
      particles.material.opacity = rev*0.9;
      photon.rotation.z -= dt*0.15*(1+rev);
      disk.rotation.z += dt*0.05;
      // spiral particles inward
      const arr=pGeoA.attributes.position.array;
      for(let i=0;i<PN;i++){
        pAng[i]+= dt*pSpd[i]*(1+ (HOR*5/pRad[i]));
        pRad[i]-= dt*pSpd[i]*2.2*rev;
        if(pRad[i] < HOR*1.1){ pRad[i]=HOR*2.6+Math.random()*HOR*3; pY[i]=(Math.random()-0.5)*HOR*2; }
        pY[i]*=0.999;
        arr[i*3]=Math.cos(pAng[i])*pRad[i];
        arr[i*3+1]=pY[i]*0.5;
        arr[i*3+2]=Math.sin(pAng[i])*pRad[i];
      }
      pGeoA.attributes.position.needsUpdate=true;
      // proximity (horizontal distance from the car to the ground point below the anomaly)
      const dx=chassisB.position.x-gx, dz=chassisB.position.z-gz;
      const d=Math.hypot(dx,dz);
      api.near = d<70;
      if(nightOn && api.near && !hintShown){ hintShown=true; try{toastMsg('A gravitational anomaly tears at the dark ahead. The UFO is the way in.');}catch(e){} }
      if(!api.near) hintShown=false;
      api.armed = nightOn && d<HOR*1.6;   // inside the event-horizon footprint ??? entry trigger (Phase 2)
    };
    return api;
  })();

  /* =====================================================================
     SPACE EXTENSION ?? PHASES 2-7 ??? ENTRY ?? SPACE JOURNEY ?? MOON ?? RETURN
     ---------------------------------------------------------------------
     A self-contained state machine. Earth's scene (S), car, physics world
     and day/night are NEVER modified ??? when state!=='earth' the main loop
     hands this module the frame and returns early, so Earth simply pauses
     in place and resumes untouched on return. The Moon is a separate scene
     with its own celestial sky and a robust kinematic lunar-gravity driving
     model (no shared colliders, so it cannot corrupt Earth physics).
     States: earth ??? entering ??? space ??? moon ??? returning ??? earth
     ===================================================================== */
  /* =====================================================================
     SPACE EXTENSION - PHASES 2+ - ENTRY / SPACE JOURNEY / PLANET SURFACES
     ---------------------------------------------------------------------
     A self-contained state machine. Earth's scene (S), car, physics world
     and day/night are NEVER modified: when state!=='earth' the main loop
     hands this module the frame and returns early, so Earth pauses in place
     and resumes untouched on return.

     Surfaces (Moon, Mars, ...) are driven by ONE generalized engine fed by a
     per-planet config (PLANETS). Each surface has an effectively infinite,
     chunk-streamed road over procedural terrain; a UFO station lands on the
     road every cfg.ufoEvery metres (deterministic from distance, not frames);
     and the player rover is kinematic with its local up-vector aligned to the
     surface normal via quaternion slerp, so it can never arrive inverted.
     States: earth -> flight -> warp -> approach -> arrive -> surface
             surface -> select -> depart -> arrive (next planet) | returning -> earth
     ===================================================================== */
  const SPACE=(function(){
    const api={state:'earth',warpX:0,warpY:0,planet:'moon',target:null,nearStation:false};
    let t=0;                       // seconds inside the current phase
    const savedFar=C.far, savedNear=C.near;
    /* ---- planet / UFO / space audio (reuses the shared SND bus) ----
       Airless Moon: no wind at all. Thin-atmosphere Mars: a faint wind only.
       The rover motor is the SND motor voice, lower and cleaner than the car;
       road rumble follows speed and drops when airborne. UFO power-up / landing
       are one-shot sweeps; a low spacecraft bed hums through the space phases. */
    let bed=null;
    function silenceSnd(){ if(!AC||!SND)return; const T=AC.currentTime; [SND.mG,SND.rG,SND.gG,SND.wG,SND.sG].forEach(g=>{try{g.gain.setTargetAtTime(0,T,.05)}catch(e){}}); }
    function audioSurface(dt){ if(!AC||!SND)return; const S=SURF; if(!S)return; const cfg=S.cfg,A=SND,T=AC.currentTime,mars=cfg===PLANETS.mars;
      const speed=Math.hypot(S.vel.x,S.vel.z), spN=Math.min(1,speed/cfg.vmax), thr=(key.f?1:0)-(key.b?1:0);
      S.ld=(S.ld==null?0:S.ld)+((thr>0?1:0)-(S.ld==null?0:S.ld))*Math.min(1,dt*3);
      const baseHz=mars?120:150, hz=baseHz+spN*(mars?260:300);
      try{A.m1.frequency.setTargetAtTime(hz,T,.08);A.m2.frequency.setTargetAtTime(hz*.5,T,.08);A.m3.frequency.setTargetAtTime(hz*3.0,T,.08);
      A.mF.frequency.setTargetAtTime(480+spN*1300,T,.1);
      A.mG.gain.setTargetAtTime(muted?0:(0.01+spN*0.05)*(0.4+0.6*(thr>0?1:0.35)),T,.08);
      A.g3.gain.setTargetAtTime(0.02+(key.boost?0.06:0),T,.1);
      A.rF.frequency.setTargetAtTime(150+spN*500,T,.1);
      A.rG.gain.setTargetAtTime(muted?0:spN*(mars?0.06:0.045)*(S.grounded?1:0.15),T,.1);
      A.gG.gain.setTargetAtTime(muted?0:(S.grounded?spN*0.03:0),T,.1);
      const windG=mars?Math.min(0.03,spN*spN*0.05):0;
      A.wG.gain.setTargetAtTime(muted?0:windG,T,.15); if(mars)A.wF.frequency.setTargetAtTime(420+speed*18,T,.2);
      A.sG.gain.setTargetAtTime(0,T,.05);}catch(e){} }
    function ufoPower(){ if(!AC||muted)return; try{const T=AC.currentTime,o=AC.createOscillator(),g=AC.createGain(),f=AC.createBiquadFilter();
      o.type='sawtooth';o.frequency.setValueAtTime(70,T);o.frequency.exponentialRampToValueAtTime(520,T+1.4);
      f.type='lowpass';f.frequency.setValueAtTime(300,T);f.frequency.exponentialRampToValueAtTime(2600,T+1.4);
      g.gain.setValueAtTime(0,T);g.gain.linearRampToValueAtTime(.08,T+.3);g.gain.setValueAtTime(.08,T+1.0);g.gain.exponentialRampToValueAtTime(.0001,T+1.7);
      o.connect(f);f.connect(g);g.connect(SND?SND.bus:AC.destination);o.start(T);o.stop(T+1.8);}catch(e){} }
    function ufoLand(){ if(!AC||muted)return; try{const T=AC.currentTime,o=AC.createOscillator(),g=AC.createGain(),f=AC.createBiquadFilter();
      o.type='sawtooth';o.frequency.setValueAtTime(420,T);o.frequency.exponentialRampToValueAtTime(70,T+1.4);
      f.type='lowpass';f.frequency.setValueAtTime(2200,T);f.frequency.exponentialRampToValueAtTime(260,T+1.4);
      g.gain.setValueAtTime(0,T);g.gain.linearRampToValueAtTime(.07,T+.2);g.gain.exponentialRampToValueAtTime(.0001,T+1.5);
      o.connect(f);f.connect(g);g.connect(SND?SND.bus:AC.destination);o.start(T);o.stop(T+1.6);}catch(e){} }
    function bedOn(){ if(!AC||bed)return; try{const T=AC.currentTime,o=AC.createOscillator(),o2=AC.createOscillator(),g=AC.createGain(),f=AC.createBiquadFilter();
      o.type='sine';o.frequency.value=56;o2.type='sine';o2.frequency.value=84;f.type='lowpass';f.frequency.value=320;
      g.gain.setValueAtTime(0,T);g.gain.linearRampToValueAtTime(muted?0:.05,T+1.2);
      o.connect(f);o2.connect(f);f.connect(g);g.connect(SND?SND.bus:AC.destination);o.start(T);o2.start(T);bed={o,o2,g};}catch(e){} }
    function bedOff(){ if(!AC||!bed)return; try{const T=AC.currentTime,b=bed;bed=null;b.g.gain.setTargetAtTime(0,T,.4);setTimeout(()=>{try{b.o.stop();b.o2.stop();b.g.disconnect();}catch(e){}},1000);}catch(e){} }


    /* ---- shared helpers ---- */
    function mkGlow(col,scale){
      const c=document.createElement('canvas');c.width=c.height=128;
      const g=c.getContext('2d'),rg=g.createRadialGradient(64,64,0,64,64,64);
      rg.addColorStop(0,col);rg.addColorStop(0.4,col.replace(/[\d.]+\)$/,'0.4)'));rg.addColorStop(1,col.replace(/[\d.]+\)$/,'0)'));
      g.fillStyle=rg;g.fillRect(0,0,128,128);
      const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false}));
      s.scale.setScalar(scale);return s;
    }
    // one soft round dot shared by every star field (PointsMaterial without a map draws squares)
    const DOT_TEX=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),rg=g.createRadialGradient(32,32,0,32,32,32);
      rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.25,'rgba(255,255,255,.85)');rg.addColorStop(.6,'rgba(255,255,255,.18)');rg.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=rg;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
    function starPoints(n,rmin,rmax,px){
      const p=new Float32Array(n*3),col=new Float32Array(n*3);
      for(let i=0;i<n;i++){
        const r=rmin+Math.random()*(rmax-rmin),th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);
        p[i*3]=r*Math.sin(ph)*Math.cos(th);p[i*3+1]=r*Math.cos(ph);p[i*3+2]=r*Math.sin(ph)*Math.sin(th);
        // mostly white, some warm and some blue, a few bright ones
        const b=Math.pow(Math.random(),2.2)*.75+.25,tn=Math.random();
        col[i*3]=b*(tn<.15?1:tn>.85?.78:.95);col[i*3+1]=b*(tn<.15?.86:tn>.85?.86:.95);col[i*3+2]=b*(tn<.15?.7:1);
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(p,3));
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      return new THREE.Points(geo,new THREE.PointsMaterial({size:px||2.2,sizeAttenuation:false,map:DOT_TEX,alphaTest:.02,vertexColors:true,transparent:true,depthWrite:false,fog:false}));
    }
    /* equirectangular planet textures painted from 3D noise on the unit sphere, so there is no seam */
    function paintPlanet(kind,W,Hh){
      W=W||512;Hh=Hh||256;const c=document.createElement('canvas');c.width=W;c.height=Hh;const x=c.getContext('2d'),img=x.createImageData(W,Hh),d=img.data;
      const n3=(a,b,cc,f)=>fbm2(a*f+cc*f*.71+11.3,b*f-cc*f*.53-7.1);
      for(let j=0;j<Hh;j++){const lat=(j/(Hh-1)-.5)*Math.PI,cl=Math.cos(lat),sy=Math.sin(lat);
        for(let i=0;i<W;i++){const lon=i/W*Math.PI*2,sx=cl*Math.cos(lon),sz=cl*Math.sin(lon);let r,g,b;
          if(kind==='earth'){const h=n3(sx,sy,sz,1.6)*.75+n3(sx,sy,sz,4.2)*.25,ice=Math.abs(sy)>.86;
            if(ice){r=g=b=235}else if(h>.53){const t=Math.min(1,(h-.53)*6),dry=n3(sx,sy,sz,3)>.55;r=dry?150+t*40:52+t*60;g=dry?130+t*20:110+t*40;b=dry?80:52+t*10}
            else{const t=Math.max(0,(h-.38)/.15);r=14+t*30;g=58+t*70;b=128+t*50}}
          else if(kind==='moon'){const mar=n3(sx,sy,sz,1.4),fine=n3(sx,sy,sz,9);let v=168+(fine-.5)*40;if(mar<.45)v-=48*(.45-mar)/.45*2.2;v=Math.max(70,Math.min(215,v));r=v;g=v*.985;b=v*.96}
          else if(kind==='europa'){const cr=Math.abs(n3(sx,sy,sz,3.2)-.5),cr2=Math.abs(n3(sx,sy,sz,6.5)-.5),tint=n3(sx,sy,sz,1.3);let v=222+(tint-.5)*30;r=v;g=v*.97;b=v*.93;
            if(cr<.014||cr2<.008){r=150;g=96;b=70}}
          else if(kind==='mars'){const h=n3(sx,sy,sz,1.8),fine=n3(sx,sy,sz,7);let k=.85+(fine-.5)*.35;if(h<.44)k*=.62;
            if(Math.abs(sy)>.9){r=g=b=228}else{r=190*k;g=92*k;b=52*k}}
          else{const band=Math.sin(sy*14+n3(sx,sy,sz,2)*3)*.5+.5;const base=kind==='giant'?[214,180,130]:[150,200,215];r=base[0]*(.75+band*.3);g=base[1]*(.75+band*.3);b=base[2]*(.8+band*.25)}
          const k=(j*W+i)*4;d[k]=r;d[k+1]=g;d[k+2]=b;d[k+3]=255}}
      x.putImageData(img,0,0);
      if(kind==='moon'){ // crater rings: dark floor, bright rim on the sunward side
        for(let i=0;i<260;i++){const rr=1+Math.pow(Math.random(),3)*16,px=Math.random()*W,py=Hh*.08+Math.random()*Hh*.84;
          x.beginPath();x.arc(px,py,rr,0,7);x.fillStyle='rgba(30,30,32,'+(.12+Math.random()*.12)+')';x.fill();
          x.beginPath();x.arc(px-rr*.15,py-rr*.15,rr,Math.PI*.9,Math.PI*1.9);x.strokeStyle='rgba(255,255,250,.22)';x.lineWidth=Math.max(1,rr*.22);x.stroke()}}
      const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t;
    }
    /* fine surface detail that tiles across the terrain (also used as a bump map) */
    const detailCache={};
    function detailTex(kind){
      if(detailCache[kind])return detailCache[kind];
      const N=512,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d');
      const base=kind==='sand'?200:kind==='ice'?228:188;x.fillStyle='rgb('+base+','+base+','+base+')';x.fillRect(0,0,N,N);
      // soft light/dark blobs, each drawn at its wrap-around copies so the tile repeats seamlessly
      const wrapDraw=(px,py,r,fn)=>{for(const ox of [-N,0,N])for(const oy of [-N,0,N]){const X=px+ox,Y=py+oy;if(X+r<0||X-r>N||Y+r<0||Y-r>N)continue;fn(X,Y)}};
      const blobs=kind==='ice'?500:1400;
      for(let i=0;i<blobs;i++){const r=4+Math.pow(Math.random(),2)*46,px=Math.random()*N,py=Math.random()*N,lt=Math.random()<.5,a=(kind==='ice'?.05:.09)*Math.random();
        wrapDraw(px,py,r,(X,Y)=>{const g=x.createRadialGradient(X,Y,0,X,Y,r);g.addColorStop(0,lt?'rgba(255,255,255,'+a+')':'rgba(0,0,0,'+a+')');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(X-r,Y-r,r*2,r*2)})}
      if(kind!=='sand'){ // little craters and pebbles
        for(let i=0;i<(kind==='ice'?30:300);i++){const r=.8+Math.pow(Math.random(),3)*8,px=Math.random()*N,py=Math.random()*N;
          wrapDraw(px,py,r+2,(X,Y)=>{x.beginPath();x.arc(X,Y,r,0,7);x.fillStyle='rgba(0,0,0,'+(.1+Math.random()*.12)+')';x.fill();
            x.beginPath();x.arc(X-r*.25,Y-r*.25,r,Math.PI*.9,Math.PI*1.9);x.strokeStyle='rgba(255,255,255,.16)';x.lineWidth=Math.max(.6,r*.25);x.stroke()})}}
      else{ // faint wind ripples on Mars sand
        x.strokeStyle='rgba(0,0,0,.05)';x.lineWidth=2;for(let j=0;j<N;j+=7){x.beginPath();for(let i=0;i<=N;i+=8){const y=j+Math.sin(i/N*6.283*3+j*.3)*3;i?x.lineTo(i,y):x.moveTo(i,y)}x.stroke()}}
      // per-pixel grain
      const img=x.getImageData(0,0,N,N),d=img.data,gr=kind==='ice'?10:kind==='sand'?14:26;
      for(let k=0;k<d.length;k+=4){const n=(Math.random()-.5)*gr;d[k]=Math.max(0,Math.min(255,d[k]+n));d[k+1]=Math.max(0,Math.min(255,d[k+1]+n));d[k+2]=Math.max(0,Math.min(255,d[k+2]+n))}
      x.putImageData(img,0,0);
      const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return detailCache[kind]=t}
    // the road: packed dust with two worn tyre ruts; alpha fades it into the ground at both edges
    function roadTexes(){
      if(detailCache._road)return detailCache._road;
      const W=256,Hh=512,c=document.createElement('canvas');c.width=W;c.height=Hh;const x=c.getContext('2d'),img=x.createImageData(W,Hh),d=img.data;
      for(let j=0;j<Hh;j++)for(let i=0;i<W;i++){const u=i/W,rut=Math.exp(-Math.pow((u-.33)/.06,2))+Math.exp(-Math.pow((u-.67)/.06,2));
        const n=fbm2(i*.05+j*.002,j*.012)*.3+Math.random()*.18;let g=(.62+n-.12+rut*.1)*255;const k=(j*W+i)*4;d[k]=d[k+1]=d[k+2]=Math.max(0,Math.min(255,g));d[k+3]=255}
      x.putImageData(img,0,0);const map=new THREE.CanvasTexture(c);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;
      const a=document.createElement('canvas');a.width=256;a.height=4;const ax=a.getContext('2d'),gr=ax.createLinearGradient(0,0,256,0);
      gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.2,'#fff');gr.addColorStop(.8,'#fff');gr.addColorStop(1,'rgba(255,255,255,0)');
      // alphaMap reads the green channel: fade to black at the edges
      const ag=ax.createLinearGradient(0,0,256,0);ag.addColorStop(0,'#000');ag.addColorStop(.22,'#fff');ag.addColorStop(.78,'#fff');ag.addColorStop(1,'#000');ax.fillStyle=ag;ax.fillRect(0,0,256,4);
      const alpha=new THREE.CanvasTexture(a);return detailCache._road={map,alpha}}
    function cloudTex(){const W=512,Hh=256,c=document.createElement('canvas');c.width=W;c.height=Hh;const x=c.getContext('2d'),img=x.createImageData(W,Hh),d=img.data;
      for(let j=0;j<Hh;j++){const lat=(j/(Hh-1)-.5)*Math.PI,cl=Math.cos(lat),sy=Math.sin(lat);for(let i=0;i<W;i++){const lon=i/W*Math.PI*2,sx=cl*Math.cos(lon),sz=cl*Math.sin(lon);
        const v=fbm2(sx*3.1+sz*2.2+40,sy*3.4-sz*1.9+12);const a=Math.max(0,Math.min(1,(v-.55)*4));const k=(j*W+i)*4;d[k]=d[k+1]=d[k+2]=255;d[k+3]=a*215}}
      x.putImageData(img,0,0);return new THREE.CanvasTexture(c)}
    // a planet with optional cloud shell and a soft atmosphere halo
    function makePlanet(kind,radius,halo){
      const g=new THREE.Group();
      const body=new THREE.Mesh(new THREE.SphereGeometry(radius,64,48),new THREE.MeshStandardMaterial({map:paintPlanet(kind),roughness:kind==='earth'?.75:1,metalness:0}));g.add(body);
      if(kind==='earth'){const cl=new THREE.Mesh(new THREE.SphereGeometry(radius*1.012,64,48),new THREE.MeshStandardMaterial({map:cloudTex(),transparent:true,depthWrite:false,roughness:1}));g.add(cl);g.userData.clouds=cl}
      if(halo){const h=mkGlow(halo,radius*3.05);h.material.opacity=.55;g.add(h)}
      g.userData.body=body;return g}
    /* ---- caption + odometer overlays (DOM) ---- */
    const cap=document.createElement('div');
    cap.style.cssText='position:fixed;left:0;right:0;bottom:14%;text-align:center;color:#eef2ff;z-index:40;'+
      'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:clamp(15px,3vw,26px);letter-spacing:.04em;'+
      'pointer-events:none;opacity:0;transition:opacity .5s;text-shadow:0 2px 20px rgba(0,0,0,.85)';
    sec.appendChild(cap);
    let capText='';
    function say(s){ if(s===capText)return; capText=s; if(!s){cap.style.opacity='0';return;} cap.textContent=s; cap.style.opacity='1'; }

    const odo=document.createElement('div');
    odo.style.cssText='position:fixed;left:50%;transform:translateX(-50%);top:calc(16px + env(safe-area-inset-top,0px));'+
      'z-index:40;color:#dfe6ea;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.12em;'+
      'text-transform:uppercase;pointer-events:none;opacity:0;transition:opacity .3s;text-shadow:0 2px 12px rgba(0,0,0,.8)';
    sec.appendChild(odo);
    // planet minimap: the road around you, UFO stations, and an arrow to the next one
    const pmap=document.createElement('canvas');pmap.id='dpmap';pmap.width=pmap.height=180;
    pmap.style.cssText='position:fixed;right:max(12px,env(safe-area-inset-right,0px));top:calc(100px + env(safe-area-inset-top,0px));width:150px;height:150px;z-index:40;border-radius:50%;display:none;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.45)';
    sec.appendChild(pmap);const pmx=pmap.getContext('2d');pmap.style.cursor='pointer';pmap.style.pointerEvents='auto';pmap.title='Open map (M)';pmap.onclick=()=>toggleMap();
    /* the full-screen map (M) on a planet: this world's road, the UFO stations along it and where you are.
       North-up like Earth's big map; 6 km across. */
    // the route to the next UFO station along the road, for the navigation card
    api.gpsOn=false;
    api.navInfo=function(){const S=SURF;if(!S||api.state!=='surface'||!api.gpsOn)return null;const cfg=S.cfg,every=cfg.ufoEvery,goal=(Math.floor(S.s/every)+1)*every,pts=[[S.pos.x,S.pos.z]];
      for(let s=S.s;s<goal;s+=20){const r=roadAt(cfg,S.road,s);pts.push([r.x,r.z])}const e=roadAt(cfg,S.road,goal);pts.push([e.x,e.z]);
      return {pts,label:'UFO station',x:S.pos.x,z:S.pos.z,h:S.yaw}};
    api.drawBigMap=function(c,size){
      const S=SURF;if(!S)return false;
      const cfg=S.cfg,R0=size/2,span=3000,sc=(R0-6)/span,px=S.pos.x,pz=S.pos.z,P=(x,z)=>[R0+(x-px)*sc,R0+(z-pz)*sc];
      c.clearRect(0,0,size,size);c.save();c.beginPath();c.arc(R0,R0,R0-1,0,6.283);c.clip();
      c.fillStyle=cfg.atmo?'rgba(70,34,20,.92)':cfg.cracks?'rgba(40,46,58,.92)':'rgba(20,20,24,.92)';c.fillRect(0,0,size,size);
      c.strokeStyle='rgba(242,238,230,.08)';c.lineWidth=1;for(let r=500;r<span;r+=500){c.beginPath();c.arc(R0,R0,r*sc,0,6.283);c.stroke()}
      const road=(from,to,col,w)=>{c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.beginPath();
        for(let s=Math.max(0,from),f=1;s<=to;s+=20,f=0){const r=roadAt(cfg,S.road,s),q=P(r.x,r.z);f?c.moveTo(q[0],q[1]):c.lineTo(q[0],q[1])}c.stroke()};
      road(S.s-span*1.5,S.s+span*1.5,'rgba(242,238,230,.85)',Math.max(3,size/160));
      road(0,S.s,'rgba(212,168,58,.9)',Math.max(2,size/220));                        // the stretch you've already driven
      if(api.gpsOn)road(S.s,(Math.floor(S.s/cfg.ufoEvery)+1)*cfg.ufoEvery,'rgba(0,255,136,.9)',Math.max(3,size/150));   // route to the next UFO, with GPS on
      const every=cfg.ufoEvery;c.font='600 '+Math.round(size/48)+'px ui-monospace,monospace';c.textAlign='center';
      if(api.gpsOn)for(let k=Math.max(1,Math.floor((S.s-span*1.5)/every));k<=Math.floor((S.s+span*1.5)/every)+1;k++){
        const r=roadAt(cfg,S.road,k*every),q=P(r.x,r.z),ahead=k*every>S.s;
        c.fillStyle=ahead?'#5cf2ff':'rgba(92,242,255,.45)';c.beginPath();c.arc(q[0],q[1],size/90,0,6.283);c.fill();
        c.fillText('UFO '+(Math.abs(k*every-S.s)/1000).toFixed(1)+' km',q[0],q[1]-size/60)}
      c.translate(R0,R0);c.rotate(Math.atan2(Math.sin(S.yaw),-Math.cos(S.yaw)));const a=size/60;
      c.fillStyle='#f2eee6';c.beginPath();c.moveTo(0,-a*1.4);c.lineTo(a,a);c.lineTo(0,a*.45);c.lineTo(-a,a);c.closePath();c.fill();c.restore();
      c.strokeStyle='rgba(242,238,230,.5)';c.lineWidth=2;c.beginPath();c.arc(R0,R0,R0-1,0,6.283);c.stroke();
      c.fillStyle='rgba(242,238,230,.85)';c.font='600 '+Math.round(size/36)+'px ui-monospace,monospace';c.textAlign='center';
      c.fillText(cfg.name.toUpperCase()+' · '+(S.maxS/1000).toFixed(2)+' km driven',R0,size*.08);
      c.fillStyle='rgba(242,238,230,.6)';c.font='500 '+Math.round(size/52)+'px ui-monospace,monospace';c.fillText('rings every 500 m · N up',R0,size*.94);
      return true};
    function drawSurfMap(S){
      const cfg=S.cfg,c=pmx,N=180,R0=N/2,sc=R0/1100,yaw=S.yaw,cs=Math.cos(yaw),sn=Math.sin(yaw),px=S.pos.x,pz=S.pos.z;
      const P=(x,z)=>{const dx=x-px,dz=z-pz;return [R0+(-dx*cs+dz*sn)*sc,R0-(dx*sn+dz*cs)*sc]};   // heading up, right on the right
      c.clearRect(0,0,N,N);c.save();c.beginPath();c.arc(R0,R0,R0-1,0,6.283);c.clip();
      c.fillStyle=cfg.atmo?'rgba(70,34,20,.86)':cfg.cracks?'rgba(40,46,58,.86)':'rgba(22,22,26,.86)';c.fillRect(0,0,N,N);
      c.strokeStyle='rgba(242,238,230,.85)';c.lineWidth=4;c.lineCap='round';c.beginPath();
      for(let s=Math.max(0,S.s-1400),f=1;s<=S.s+1400;s+=25,f=0){const r=roadAt(cfg,S.road,s),q=P(r.x,r.z);f?c.moveTo(q[0],q[1]):c.lineTo(q[0],q[1])}c.stroke();
      // stations within range, and the next one ahead with its distance
      const every=cfg.ufoEvery,kNext=Math.floor(S.s/every)+1;
      if(api.gpsOn)for(let k=Math.max(1,kNext-1);k<=kNext+1;k++){const r=roadAt(cfg,S.road,k*every),q=P(r.x,r.z);
        c.fillStyle=k===kNext?'#5cf2ff':'rgba(92,242,255,.5)';c.beginPath();c.arc(q[0],q[1],k===kNext?6:4,0,6.283);c.fill()}
      c.restore();
      c.strokeStyle='rgba(242,238,230,.5)';c.lineWidth=2;c.beginPath();c.arc(R0,R0,R0-1,0,6.283);c.stroke();
      c.fillStyle='#f2eee6';c.beginPath();c.moveTo(R0,R0-9);c.lineTo(R0+6,R0+7);c.lineTo(R0,R0+3);c.lineTo(R0-6,R0+7);c.closePath();c.fill();
      const toNext=Math.max(0,kNext*every-S.s);c.font='600 13px ui-monospace,monospace';c.textAlign='center';c.fillStyle='#5cf2ff';if(api.gpsOn)c.fillText('UFO '+(toNext/1000).toFixed(2)+' km',R0,N-16);
      c.fillStyle='rgba(242,238,230,.75)';c.font='600 11px ui-monospace,monospace';c.fillText(cfg.name.toUpperCase(),R0,22);
    }
    // gravity toggle: default Earth gravity on every surface; this button enables the real planet g
    const gravBtn=document.createElement('button');
    gravBtn.className='dbtn mono';
    gravBtn.style.cssText='position:fixed;right:max(8px,env(safe-area-inset-right,0px));top:calc(54px + env(safe-area-inset-top,0px));z-index:41;display:none';
    gravBtn.textContent='Low gravity: on';
    gravBtn.onclick=()=>{ moonGravityOn=!moonGravityOn; gravBtn.textContent='Low gravity: '+(moonGravityOn?'on':'off'); };
    sec.appendChild(gravBtn);

    const travelEl=$('#dtravel');

    /* ---- planet-select overlay (DOM) ---- */
    const DEST=[
      {key:'earth',name:'Earth',g:'9.8 m/s2',env:'Home - lush valley'},
      {key:'moon', name:'Moon', g:'1.6 m/s2',env:'Grey regolith swells, Earth overhead'},
      {key:'mars', name:'Mars', g:'3.7 m/s2',env:'Red desert dunes, butterscotch sky'},
      {key:'europa',name:'Europa',g:'1.3 m/s2',env:'Cracked ice plains under Jupiter'},
    ];
    const selEl=document.createElement('div');
    selEl.style.cssText='position:fixed;inset:0;z-index:46;display:none;place-items:center;background:rgba(4,5,10,.82);'+
      'backdrop-filter:blur(6px);padding:24px;font-family:ui-monospace,Menlo,Consolas,monospace';
    const selIn=document.createElement('div');selIn.style.cssText='width:min(460px,100%);color:#eef2ff';
    selIn.innerHTML='<div style="color:#9fc3d6;font-size:11px;letter-spacing:.2em">UFO NAVIGATION TERMINAL</div>'+
      '<h3 style="font:600 clamp(30px,5vw,48px)/1 var(--serif,sans-serif);margin:8px 0 14px;letter-spacing:-.02em">Choose a destination</h3>';
    const selList=document.createElement('div');selList.style.cssText='display:grid;gap:8px';selIn.appendChild(selList);
    const selClose=document.createElement('button');selClose.textContent='Stay here';
    selClose.className='dbtn mono';selClose.style.marginTop='16px';selIn.appendChild(selClose);
    selEl.appendChild(selIn);sec.appendChild(selEl);
    function buildSelButtons(){
      selList.innerHTML='';
      DEST.forEach(d=>{
        const b=document.createElement('button');
        b.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;'+
          'background:rgba(242,238,230,.06);border:1px solid rgba(242,238,230,.18);border-radius:12px;padding:12px 15px;'+
          'color:#eef2ff;cursor:pointer;width:100%';
        const here=d.key===api.planet&&api.state==='select';
        b.innerHTML='<span><b style="font:600 19px var(--serif,sans-serif)">'+d.name+(here?' (here)':'')+
          '</b><br><span style="color:#9aa3ab;font-size:11px">'+d.env+'</span></span>'+
          '<span style="color:#9fc3d6;font-size:12px;white-space:nowrap">'+d.g+'</span>';
        b.onmouseenter=()=>{b.style.background='rgba(242,238,230,.14)'};
        b.onmouseleave=()=>{b.style.background='rgba(242,238,230,.06)'};
        b.onclick=()=>chooseDest(d.key);
        selList.appendChild(b);
      });
    }
    selClose.onclick=()=>{ if(api.state!=='select')return; selEl.style.display='none'; api.state='surface'; t=0; };

    /* =====================================================================
       PLANET CONFIG FRAMEWORK
       One row per world. Adding a planet is adding a row here, not a system.
       Units: 1 world unit ~= 1 metre. gravity in m/s^2 (scaled for feel).
       ===================================================================== */
    let moonGravityOn=true;       // a planet's own gravity is the default; the button can switch back to 1 g
const PLANETS={
  moon:{ name:'Moon', seed:271828, g:4.0,
    bg:0x000000, fog:null, sun:0xfff6ea, sunI:1.55, sunDir:[0.62,0.3,0.42], amb:0x8a96aa, ambI:0.05, hemi:[0x3a4256,0x2a2826,0.16],
    ground:[0.4,0.396,0.39], groundNoise:0.16, rock:0x5f5c57, roadCol:0x3a3936, dust:0xb8b4ab, detail:'regolith',
    accel:24, vmax:44, boost:1.5, steer:1.7, grip:3.0, camBack:15, camUp:6.5, ufoEvery:2000, earthInSky:true, dunes:0, atmo:0,
    // long smooth swells (the slow-roads look) with only a light sprinkling of craters
    base1:[0.0016,46], base2:[0.006,9],
    craters:[[60,4,12,.16,.32],[260,18,46,.12,.3]],
    caption:'Moon · 1/6 g · Sea of Tranquillity' },
  mars:{ name:'Mars', seed:141421, g:7.0,
    bg:0xb07a52, fog:[300,2400], sun:0xffe6cc, sunI:1.45, sunDir:[0.45,0.5,0.3], amb:0xd9a37a, ambI:0.12, hemi:[0xc98a5e,0x4a2416,0.42],
    sky:[0x6e4129,0xc4875a], ground:[0.56,0.29,0.16], groundNoise:0.16, rock:0x5a2a19, roadCol:0x4a2a1b, dust:0xc98a5a, detail:'sand',
    accel:18, vmax:38, boost:1.35, steer:1.5, grip:3.8, ufoEvery:2000, earthInSky:false, dunes:1, atmo:1,
    base1:[0.0018,40], base2:[0.008,8],
    craters:[[90,6,16,.15,.25],[300,20,50,.12,.3]],
    caption:'Mars · 0.38 g · Jezero crater route' },
  europa:{ name:'Europa', seed:173205, g:3.2,
    bg:0x000000, fog:null, sun:0xeef4ff, sunI:1.3, sunDir:[-0.55,0.32,0.5], amb:0x9fb4cc, ambI:0.06, hemi:[0x40506a,0x30343c,0.22],
    ground:[0.78,0.79,0.82], groundNoise:0.1, rock:0x9a8f86, roadCol:0x5b5651, dust:0xdfe6ee, detail:'ice', cracks:1,
    accel:20, vmax:40, boost:1.4, steer:1.6, grip:1.6, ufoEvery:2000, earthInSky:false, jupiter:true, dunes:0, atmo:0,
    base1:[0.0014,28], base2:[0.007,4],
    craters:[[400,20,60,.06,.15]],
    caption:'Europa · 0.13 g · ice shell over a hidden ocean' },
};
    /* procedural surface height: rolling base + craters (bowl + rim, a few metres deep) + optional dunes.
       The old version applied the rim term across the whole crater interior, used depths up to ~140 m and
       a per-vertex noise wobble, which produced the jagged spikes. */
    function surfaceH(cfg,x,z){
      const so=cfg.seed*0.001;
      let h=(fbm2(x*cfg.base1[0]+40+so,z*cfg.base1[0]-20-so)-0.5)*cfg.base1[1]
           +(fbm2(x*cfg.base2[0]-13-so,z*cfg.base2[0]+9+so)-0.5)*cfg.base2[1];
      if(cfg.dunes){ const ridge=Math.sin(x*0.018+z*0.006+fbm2(x*0.006,z*0.006)*5); h+=ridge*1.8*(0.4+0.6*fbm2(z*0.003+4,x*0.003-2)); }
      const grids=cfg.craters;
      for(let gi=0;gi<grids.length;gi++){
        const cell=grids[gi][0],minR=grids[gi][1],maxR=grids[gi][2],dpr=grids[gi][3],pr=grids[gi][4];
        const cx=Math.floor(x/cell),cz=Math.floor(z/cell);
        for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
          const gx=cx+i,gz=cz+j;if(hash2(gx*1.7+gi*3.3+so,gz*1.3-gi*2.1-so)<1-pr)continue;
          const ccx=(gx+hash2(gx+3.1+gi+so,gz+1.7-so))*cell,ccz=(gz+hash2(gx+5.3-so,gz+9.1+gi))*cell;
          const R=minR+(maxR-minR)*hash2(gx+7.7-gi+so,gz+2.9+gi),dx=x-ccx,dz=z-ccz,dd=(dx*dx+dz*dz)/(R*R);
          if(dd>4)continue;const d=Math.sqrt(dd),depth=R*dpr*(0.6+0.4*hash2(gx*2.3+so,gz*2.7-so));
          // bowl inside, a smooth raised rim around d=1, fading out by d=2
          const bowl=d<1?-(1-dd)*(1-dd*.25):0,rim=Math.exp(-((d-1)*(d-1))/.06)*.42,apron=d>1?Math.exp(-(d-1)*2.4)*.12:0;
          h+=(bowl+rim+apron)*depth;
        }
      }
      return isFinite(h)?h:0;
    }

    /* =====================================================================
       INFINITE ROAD (deterministic centerline by arc length)
       Positions are integrated once from s=0 and cached. Heights are the terrain under the centreline,
       smoothed along the road (about +-70 m), so the road rolls gently with the land instead of
       following every crater wall.
       ===================================================================== */
    const DS=12;                 // metres between cached centerline samples
    const ROADHALF=6.5;          // half road width
    const FEATHER=16;            // terrain blend-out beyond the tarmac
    const RSM=6;                 // height smoothing half-window, in samples
    function roadHeading(cfg,s){
      const k=cfg.seed*0.0007;
      return Math.sin(s*0.00012+k)*0.08+Math.sin(s*0.0009+k*3)*0.12;
    }
    function ensureRoad(cfg,road,sMax){
      while((road.len-1)*DS < sMax+DS*(RSM+2)){
        const i=road.len;
        if(i===0){ road.xs[0]=0; road.zs[0]=0; road.hy=[surfaceH(cfg,0,0)]; road.sy=[]; road.grid=new Map(); road.len=1; roadIndex(road,0); continue; }
        const h=roadHeading(cfg,(i-1)*DS);
        road.xs[i]=road.xs[i-1]+Math.sin(h)*DS;
        road.zs[i]=road.zs[i-1]+Math.cos(h)*DS;
        road.hy[i]=surfaceH(cfg,road.xs[i],road.zs[i]);
        road.len=i+1;
        roadIndex(road,i);
      }
    }
    const RCELL=40;
    function roadIndex(road,i){const k=Math.floor(road.xs[i]/RCELL)+','+Math.floor(road.zs[i]/RCELL);let a=road.grid.get(k);if(!a)road.grid.set(k,a=[]);a.push(i)}
    function roadYi(road,i){ // smoothed centreline height at sample i
      if(road.sy[i]!=null)return road.sy[i];
      let sum=0,w=0;for(let k=-RSM;k<=RSM;k++){const j=Math.max(0,i+k);if(j>=road.len)break;const wk=RSM+1-Math.abs(k);sum+=road.hy[j]*wk;w+=wk}
      return road.sy[i]=sum/w}
    function roadY(cfg,road,s){ if(s<0)s=0; ensureRoad(cfg,road,s+DS); const f=s/DS,i=Math.floor(f),fr=f-i; return roadYi(road,i)+(roadYi(road,i+1)-roadYi(road,i))*fr }
    function roadAt(cfg,road,s){
      if(s<0)s=0; ensureRoad(cfg,road,s+DS);
      const f=s/DS,i=Math.floor(f),fr=f-i;
      const x=road.xs[i]+(road.xs[i+1]-road.xs[i])*fr, z=road.zs[i]+(road.zs[i+1]-road.zs[i])*fr;
      const h=roadHeading(cfg,s);
      return {x,z,tx:Math.sin(h),tz:Math.cos(h),nx:Math.cos(h),nz:-Math.sin(h)};
    }
    // nearest centerline point to (x,z), searched in a window of arc length around sHint
    function nearestRoad(cfg,road,x,z,sHint){
      ensureRoad(cfg,road,Math.max(0,sHint)+1400);
      /* exact answer from the spatial index (the old version only searched a window around sHint, so
         two terrain tiles built at different times disagreed about the road: the flat "slabs") */
      let bd=1e18,bi=-1;const gx=Math.floor(x/RCELL),gz=Math.floor(z/RCELL);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const L=road.grid.get((gx+a)+','+(gz+b));if(!L)continue;
        for(let t=0;t<L.length;t++){const i=L[t],dx=road.xs[i]-x,dz=road.zs[i]-z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i}}}
      if(bi<0){ // far from the road: fall back to a window scan (only odometer/rocks ever ask from out here)
        const l0=Math.max(0,Math.floor((sHint-300)/DS)),h0=Math.min(road.len-2,Math.floor((sHint+1300)/DS));bi=l0;
        for(let i=l0;i<=h0;i++){const dx=road.xs[i]-x,dz=road.zs[i]-z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i}}}
      // refine between neighbours so the corridor edge is smooth, not stepped every 12 m
      let best=null;
      for(const j of [bi-1,bi+1]){if(j<0||j>=road.len)continue;const ax=road.xs[bi],az=road.zs[bi],vx=road.xs[j]-ax,vz=road.zs[j]-az,L2=vx*vx+vz*vz||1;
        const tt=Math.max(0,Math.min(1,((x-ax)*vx+(z-az)*vz)/L2)),px=ax+vx*tt,pz=az+vz*tt,d=Math.hypot(x-px,z-pz);
        if(!best||d<best.d)best={d,s:(bi+(j-bi)*tt)*DS,cx:px,cz:pz}}
      return best||{d:Math.sqrt(bd),s:bi*DS,cx:road.xs[bi],cz:road.zs[bi]};
    }
    // terrain height with a flat, drivable road corridor carved into it
    function groundH(cfg,road,x,z,sHint){
      let base=surfaceH(cfg,x,z);
      const nr=nearestRoad(cfg,road,x,z,sHint);
      if(nr.d<ROADHALF+FEATHER){
        const corridor=roadY(cfg,road,nr.s);
        const t=nr.d<ROADHALF+1?0:(nr.d-ROADHALF-1)/(FEATHER-1);
        const k=t*t*(3-2*t);
        return corridor+(base-corridor)*k;
      }
      return base;
    }

    /* =================== SPACE-JOURNEY SCENE (lazy) =================== */
    let spaceScene=null, spaceObj=null;
    function buildSpace(){
      if(spaceScene)return;
      const sc=new THREE.Scene(); sc.background=new THREE.Color(0x000002);
      // stars: a dense faint field plus a sparse bright one, round and pixel-sized at any distance
      const starsA=starPoints(5000,3000,9000,1.6),starsB=starPoints(500,3000,9000,3.2);sc.add(starsA,starsB);
      const neb=[];
      [['rgba(70,60,150,1)',-2600,900,-5200],['rgba(30,90,140,1)',2800,-600,-6000],['rgba(130,50,100,1)',600,1700,-6500],['rgba(40,70,130,1)',-1200,-1500,-5600]].forEach(a=>{
        const n=mkGlow(a[0],4200);n.position.set(a[1],a[2],a[3]);n.material.opacity=.16;sc.add(n);neb.push(n)});
      // the sun is off to the left, so planets show a lit half instead of their night side
      const SUN_DIR=new THREE.Vector3(-0.86,0.28,0.42).normalize();
      const sun2=mkGlow('rgba(255,236,200,1)',900);sun2.position.copy(SUN_DIR).multiplyScalar(8000);sc.add(sun2);
      const dl=new THREE.DirectionalLight(0xfff4e6,1.75); dl.position.copy(SUN_DIR).multiplyScalar(1000); sc.add(dl); sc.add(dl.target);
      sc.add(new THREE.AmbientLight(0x22304a,0.22));
      // black hole: horizon, accretion disk and photon ring, kept small enough that the camera never sits inside it
      const bh=new THREE.Group(),horizon=new THREE.Mesh(new THREE.SphereGeometry(58,40,32),new THREE.MeshBasicMaterial({color:0x000000}));
      const dc=document.createElement('canvas');dc.width=256;dc.height=32;
      {const x=dc.getContext('2d'),g=x.createLinearGradient(0,0,256,0);g.addColorStop(0,'rgba(255,95,24,0)');g.addColorStop(.18,'rgba(196,54,20,.45)');g.addColorStop(.38,'rgba(255,149,58,.95)');g.addColorStop(.55,'rgba(255,241,207,.98)');g.addColorStop(.72,'rgba(230,91,29,.75)');g.addColorStop(1,'rgba(120,30,10,0)');x.fillStyle=g;x.fillRect(0,0,256,32)}
      const diskMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(dc),transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
      const disk=new THREE.Mesh(new THREE.RingGeometry(72,168,128),diskMat);disk.rotation.x=Math.PI*.5-.26;
      const photon=new THREE.Mesh(new THREE.TorusGeometry(64,1.2,12,128),new THREE.MeshBasicMaterial({color:0xffe9c6,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}));
      const lens=mkGlow('rgba(255,170,90,1)',520);lens.material.opacity=.35;
      bh.add(lens,disk,horizon,photon);bh.position.set(0,0,-900);sc.add(bh);
      const earth=makePlanet('earth',120,'rgba(110,170,255,1)');
      const moonP=makePlanet('moon',95,null);
      const marsP=makePlanet('mars',85,'rgba(255,150,100,1)');
      const europaP=makePlanet('europa',70,null);sc.add(europaP);
      const pl=[];[['giant',70,[3600,900,-6500]],['ice',30,[-3400,-700,-5200]]].forEach(a=>{const m=makePlanet(a[0],a[1],null);m.position.set(a[2][0],a[2][1],a[2][2]);sc.add(m);pl.push(m)});
      /* warp speed lines: segments that rush past the camera and stretch with speed */
      const LN=900,lpos=new Float32Array(LN*6),lseed=new Float32Array(LN*3);
      for(let i=0;i<LN;i++){const a=Math.random()*6.283,r=14+Math.pow(Math.random(),.6)*160;lseed[i*3]=Math.cos(a)*r;lseed[i*3+1]=Math.sin(a)*r*.75;lseed[i*3+2]=-Math.random()*1600}
      const lgeo=new THREE.BufferGeometry();lgeo.setAttribute('position',new THREE.BufferAttribute(lpos,3));
      const lines=new THREE.LineSegments(lgeo,new THREE.LineBasicMaterial({color:0xbfd8ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));lines.frustumCulled=false;sc.add(lines);
      const craft=UFO.g.clone(true),passenger=car.clone(true);craft.scale.setScalar(.72);
      passenger.position.set(0,-2.4,0);passenger.quaternion.identity();passenger.scale.setScalar(.45);craft.add(passenger);sc.add(craft);
      const craftLight=new THREE.PointLight(0x9ff6ff,1.4,60);craftLight.position.set(0,-4,0);craft.add(craftLight);
      const warpRings=[];
      for(let i=0;i<6;i++){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(46+(i%3)*6,.35,6,64),new THREE.MeshBasicMaterial({color:i%3===0?0xffd39a:0x8fb6ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
        ring.position.set(0,0,-300-i*300);sc.add(ring);warpRings.push(ring);
      }
      sc.add(earth); sc.add(moonP); sc.add(marsP);
      // streak kept as the faint star layer so older code paths that touch it stay harmless
      spaceScene=sc; spaceObj={earth,moonP,marsP,europaP,sun2,streak:starsB,stars:starsA,neb,pl,bh,disk,photon,craft,warpRings,lines,lseed,LN,SUN_DIR};
    }
    // speed lines: move the seeds toward +z (past the camera at camZ) and stretch each by speed
    function updateLines(o,camX,camY,camZ,speed,dt,alpha){
      const P=o.lines.geometry.attributes.position.array,sd=o.lseed,len=Math.min(220,8+speed*.12);
      for(let i=0;i<o.LN;i++){sd[i*3+2]+=speed*dt;if(sd[i*3+2]>40)sd[i*3+2]-=1640;
        const x=camX+sd[i*3],y=camY+sd[i*3+1],z=camZ+sd[i*3+2];P[i*6]=x;P[i*6+1]=y;P[i*6+2]=z;P[i*6+3]=x;P[i*6+4]=y;P[i*6+5]=z-len}
      o.lines.geometry.attributes.position.needsUpdate=true;o.lines.material.opacity=alpha;
    }

    /* =================== GENERALIZED SURFACE (lazy, per planet) =================== */
    const surfaces={};          // key -> built surface object
    let SURF=null;              // current surface

    function buildRover(cfg){
      const rover=new THREE.Group();
      const bodyMat=new THREE.MeshStandardMaterial({color:cfg.rover_body,roughness:.55,metalness:.35});
      const cabMat=new THREE.MeshStandardMaterial({color:cfg.rover_cab,roughness:.3,metalness:.5});
      const darkMat=new THREE.MeshStandardMaterial({color:0x20232a,roughness:.7,metalness:.4});
      const deck=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.35,3.8),bodyMat); deck.position.y=1.05; deck.castShadow=true; rover.add(deck);
      const box=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.6,1.8),cabMat); box.position.set(0,1.5,-0.2); box.castShadow=true; rover.add(box);
      const panel=new THREE.Mesh(new THREE.BoxGeometry(2.3,0.08,2.6),darkMat); panel.position.set(0,1.78,0.1); rover.add(panel);
      const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,1.1,8),darkMat); mast.position.set(0.55,2.3,-0.95); rover.add(mast);
      const head=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.3,0.35),cabMat); head.position.set(0.55,2.95,-0.95); head.castShadow=true; rover.add(head);
      const eye=new THREE.Mesh(new THREE.CircleGeometry(0.09,12),new THREE.MeshBasicMaterial({color:0x6fe3ff})); eye.position.set(0.55,2.95,-0.77); rover.add(eye);
      const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,1.0,6),darkMat); ant.position.set(-0.85,2.2,0.85); rover.add(ant);
      const wheelGeo=new THREE.CylinderGeometry(0.62,0.62,0.45,16); wheelGeo.rotateZ(Math.PI/2);
      const wheelMat=new THREE.MeshStandardMaterial({color:0x121319,roughness:.95});
      const wheels=[];
      [-1.5,0,1.5].forEach(wz=>{[-1.5,1.5].forEach(wx=>{
        const arm=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.8),darkMat); arm.position.set(wx*0.82,0.82,wz); rover.add(arm);
        const w=new THREE.Mesh(wheelGeo,wheelMat); w.position.set(wx,0.62,wz); w.castShadow=true; rover.add(w); wheels.push(w);
      });});
      return {rover,wheels};
    }
    function buildAlien(){
      const g=new THREE.Group();
      const skin=new THREE.MeshStandardMaterial({color:0x9fd6a0,roughness:.7});
      const body=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.24,0.9,8),skin); body.position.y=0.62; body.castShadow=true; g.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.3,14,12),skin); head.position.y=1.22; head.scale.set(1,1.25,0.9); head.castShadow=true; g.add(head);
      const eyeMat=new THREE.MeshBasicMaterial({color:0x0a0a0f});
      [-0.12,0.12].forEach(ex=>{const e=new THREE.Mesh(new THREE.SphereGeometry(0.09,10,10),eyeMat); e.position.set(ex,1.24,0.2); e.scale.set(1,1.6,0.7); g.add(e);});
      [-0.17,0.17].forEach(lx=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.5,6),skin); leg.position.set(lx,0.22,0); g.add(leg);});
      [-0.26,0.26].forEach(lx=>{const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.5,6),skin); arm.position.set(lx,0.75,0); arm.rotation.z=lx<0?0.5:-0.5; g.add(arm);});
      return g;
    }

    function buildSurface(key){
      if(surfaces[key]){ SURF=surfaces[key]; return; }
      const cfg=PLANETS[key];
      const sc=new THREE.Scene(); sc.background=new THREE.Color(cfg.bg);
      if(cfg.fog) sc.fog=new THREE.Fog(cfg.bg,cfg.fog[0],cfg.fog[1]);

      // lights: a hard sun (low on the Moon for long shadows), soft sky/ground fill
      sc.add(new THREE.AmbientLight(cfg.amb,cfg.ambI));
      if(cfg.hemi) sc.add(new THREE.HemisphereLight(cfg.hemi[0],cfg.hemi[1],cfg.hemi[2]));
      const sunDir=new THREE.Vector3(cfg.sunDir[0],cfg.sunDir[1],cfg.sunDir[2]).normalize();
      const sunL=new THREE.DirectionalLight(cfg.sun,cfg.sunI); sunL.position.copy(sunDir).multiplyScalar(400);
      sunL.castShadow=!LOW; if(!LOW){sunL.shadow.mapSize.set(2048,2048);sunL.shadow.bias=-.0006;sunL.shadow.normalBias=.05;Object.assign(sunL.shadow.camera,{left:-120,right:120,top:120,bottom:-120,near:1,far:1000});}
      sc.add(sunL); sc.add(sunL.target);
      // everything in the sky rides along with the rover, so it never drifts on a long drive
      const skyG=new THREE.Group();sc.add(skyG);
      const sunGlow=mkGlow(cfg.atmo?'rgba(255,240,220,1)':'rgba(255,252,240,1)',cfg.atmo?500:700);sunGlow.position.copy(sunDir).multiplyScalar(6000);skyG.add(sunGlow);
      let skyDome=null;
      if(cfg.sky){ // Mars: butterscotch dome, darker overhead, hazy at the horizon (matches the fog colour)
        const dg=new THREE.SphereGeometry(8000,32,16),cols=[],top=new THREE.Color(cfg.sky[0]),hor=new THREE.Color(cfg.sky[1]),pa=dg.attributes.position;
        for(let i=0;i<pa.count;i++){const y=pa.getY(i)/8000,k=Math.max(0,Math.min(1,y*1.6));const c=hor.clone().lerp(top,k);cols.push(c.r,c.g,c.b)}
        dg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
        skyDome=new THREE.Mesh(dg,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false}));skyDome.renderOrder=-1;skyG.add(skyDome);
      }else{
        skyG.add(starPoints(4500,3000,9000,1.6)); skyG.add(starPoints(400,3000,9000,3));
      }
      if(cfg.jupiter){ const jd=new THREE.Vector3(0.3,0.17,0.94).normalize(),jup=makePlanet('giant',1300,'rgba(240,200,150,1)');jup.position.copy(jd).multiplyScalar(7600);jup.rotation.z=.12;skyG.add(jup); }
      if(cfg.earthInSky){ // Earth hanging in the black lunar sky, lit from the same sun
        const earthDir=new THREE.Vector3(-0.12,0.2,0.97).normalize();   // ahead and low enough to sit in the chase view
        const earth=makePlanet('earth',260,'rgba(110,170,255,1)');earth.position.copy(earthDir).multiplyScalar(6200);earth.rotation.y=1.2;skyG.add(earth);
      }

      // terrain tile pool (streamed)
      const TILE=160, GRID=LOW?5:7, SEG=LOW?20:32;   // 7 x 7 tiles: ground reaches ~560 m out, so the edge stays well past where you look
      const tiles=[];
      const dTex=detailTex(cfg.detail||'regolith');dTex.repeat.set(12,12);
      const terrMat=new THREE.MeshStandardMaterial({vertexColors:true,map:dTex,bumpMap:dTex,bumpScale:cfg.detail==='sand'?.18:.32,roughness:1,metalness:0});
      for(let n=0;n<GRID*GRID;n++){
        const g=new THREE.PlaneGeometry(TILE,TILE,SEG,SEG); g.rotateX(-Math.PI/2);
        const colors=new Float32Array((SEG+1)*(SEG+1)*3); g.setAttribute('color',new THREE.BufferAttribute(colors,3));
        const mesh=new THREE.Mesh(g,terrMat); mesh.receiveShadow=true; mesh.userData={ci:9999,cj:9999}; sc.add(mesh); tiles.push(mesh);
      }

      // road ribbon + edge reflectors
      const roadGeo=new THREE.BufferGeometry();
      const RT=roadTexes();
      const roadMesh=new THREE.Mesh(roadGeo,new THREE.MeshStandardMaterial({color:cfg.roadCol,map:RT.map,alphaMap:RT.alpha,transparent:true,depthWrite:false,roughness:0.95,metalness:0.0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
      roadMesh.receiveShadow=true; sc.add(roadMesh);
      const stripeGeo=new THREE.BufferGeometry();
      const stripeMesh=new THREE.Mesh(stripeGeo,new THREE.MeshBasicMaterial({color:0xe9e3d2,side:THREE.DoubleSide,transparent:true,opacity:0.9,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,fog:true})); stripeMesh.frustumCulled=false; sc.add(stripeMesh);   // lane markings: a clearly marked route
      const reflGeo=new THREE.SphereGeometry(0.45,6,5);
      const reflMat=new THREE.MeshStandardMaterial({color:0x6fe3ff,emissive:0x2f8aa0,emissiveIntensity:0.8,roughness:0.4});
      const REFLN=40, refl=new THREE.InstancedMesh(reflGeo,reflMat,REFLN); refl.frustumCulled=false; refl.visible=false; sc.add(refl);
      // scattered boulders (instanced), restreamed around the rover as it moves
      const rockGeo=new THREE.DodecahedronGeometry(1,0);
      const rockMat=new THREE.MeshStandardMaterial({color:cfg.rock,roughness:1});
      const ROCKN=LOW?150:441, rocks=new THREE.InstancedMesh(rockGeo,rockMat,ROCKN); rocks.frustumCulled=false; rocks.castShadow=!LOW; sc.add(rocks);

      // rover
      const rr=buildRover({rover_body:(cfg.rover||{}).body||0xd7dae2,rover_cab:(cfg.rover||{}).cab||0x9fb6d8});
      sc.add(rr.rover);
      // the craft that lowers the rover onto the road on arrival, then lifts away
      const lander=UFO.g.clone(true);lander.visible=false;sc.add(lander);
      const lanterns=new THREE.PointLight(0x9ff6ff,1.6,70);lanterns.position.set(0,-3,0);lander.add(lanterns);

      // dust pool
      const DN=180, dpos=new Float32Array(DN*3), dlife=new Float32Array(DN), dvel=[];
      for(let i=0;i<DN;i++){dlife[i]=0;dvel.push(new THREE.Vector3());dpos[i*3+1]=-9999;}
      const dgeo=new THREE.BufferGeometry(); dgeo.setAttribute('position',new THREE.BufferAttribute(dpos,3));
      const dust=new THREE.Points(dgeo,new THREE.PointsMaterial({color:cfg.dust,size:0.5,transparent:true,opacity:0.8,depthWrite:false}));
      sc.add(dust);
      let dcur=0;
      function emitDust(x,y,z,n,spread,up){
        for(let k=0;k<n;k++){const i=dcur=(dcur+1)%DN; dlife[i]=0.6+Math.random()*0.5;
          dpos[i*3]=x;dpos[i*3+1]=y;dpos[i*3+2]=z;
          const a=Math.random()*Math.PI*2, sp=spread*(0.4+Math.random());
          dvel[i].set(Math.cos(a)*sp, up*(0.4+Math.random()), Math.sin(a)*sp);}
      }

      // UFO stations (pool) - placed at k*ufoEvery along the road
      const stations=[]; // {idx, grp}
      const stationGeoReady=UFO.g;

      SURF=surfaces[key]={
        key,cfg,scene:sc,sunL,tiles,TILE,GRID,SEG,terrMat,
        roadMesh,roadGeo,refl,reflMat,rocks,ROCKN,stripeGeo,stripeMesh,
        rover:rr.rover,wheels:rr.wheels,lander,skyDome,sunGlow,skyG,
        dust,dgeo,dpos,dlife,dvel,emitDust,
        road:{xs:[],zs:[],len:0},
        stations,stationGeoReady,
        // GPS navigation
        gpsPins:[], gpsTarget:null,
        // kinematic driving state
        pos:new THREE.Vector3(0,0,0), vel:new THREE.Vector3(), vy:0, yaw:0, grounded:true, s:0, maxS:0,
        roadStamp:-1, tileStamp:'', land:0, q:new THREE.Quaternion(),
      };
      // start rover at the origin of this planet's road
      const r0=roadAt(cfg,SURF.road,0);
      SURF.pos.set(r0.x,surfaceH(cfg,r0.x,r0.z),r0.z);
      rebuildTerrain(SURF,true); rebuildRoad(SURF); syncStations(SURF);
    }

    // --- terrain streaming: rebuild tiles whose cell no longer matches the rover's grid window ---
    function rebuildTerrain(S,force){
      const cfg=S.cfg, TILE=S.TILE, GRID=S.GRID, SEG=S.SEG;
      const pcx=Math.floor(S.pos.x/TILE), pcz=Math.floor(S.pos.z/TILE);
      const stamp=pcx+'|'+pcz;
      S.tq=S.tq||[];let moved=false;
      if(force || stamp!==S.tileStamp){
        S.tileStamp=stamp;moved=true;
        const half=Math.floor(GRID/2),want=new Set(),free=[];
        for(let gi=-half;gi<=half;gi++)for(let gj=-half;gj<=half;gj++)want.add((pcx+gi)+','+(pcz+gj));
        const have=new Set();S.tiles.forEach(m=>{const k=m.userData.ci+','+m.userData.cj;if(want.has(k)&&!have.has(k))have.add(k);else free.push(m)});
        // cells that still need a tile, nearest first; each takes a tile that fell out of range
        const need=[...want].filter(k=>!have.has(k)).map(k=>k.split(',').map(Number)).sort((a,b)=>Math.hypot(a[0]-pcx-.5,a[1]-pcz-.5)-Math.hypot(b[0]-pcx-.5,b[1]-pcz-.5));
        S.tq=need.map((c,i)=>({mesh:free[i],ci:c[0],cj:c[1]})).filter(q=>q.mesh);
        S.tq.forEach(q=>{q.mesh.userData.ci=q.ci;q.mesh.userData.cj=q.cj;q.mesh.visible=false});
      }
      // build one tile per frame while driving (all at once on arrival), so crossing a tile never stalls a frame
      let budget=force?99:1;
      while(S.tq.length&&budget-->0){const q=S.tq.shift();buildTile(S,q.mesh,q.ci,q.cj)}
      if(moved&&S.rocks){const K=Math.floor(S.ROCKN/S.tiles.length),dm=new THREE.Matrix4();dm.makeTranslation(0,-9999,0);
        S.tq.forEach(q=>{const b0=S.tiles.indexOf(q.mesh)*K;for(let i=0;i<K;i++)S.rocks.setMatrixAt(b0+i,dm)});S.rocks.instanceMatrix.needsUpdate=true}
    }

    function buildTile(S,mesh,ci,cj){
      const cfg=S.cfg,TILE=S.TILE,SEG=S.SEG,e=TILE/SEG,P=SEG+3,ox=ci*TILE+TILE/2,oz=cj*TILE+TILE/2,x0=ox-TILE/2-e,z0=oz-TILE/2-e;
      // heights on a grid with a one-vertex border: the border gives normals that match the neighbouring tile exactly
      const H=new Float32Array(P*P);
      // under the tarmac the ground sits a little lower, so road and terrain never fight over the same depth (the far-off flicker)
      for(let j=0;j<P;j++)for(let i=0;i<P;i++){const x=x0+i*e,z=z0+j*e;let y=groundH(cfg,S.road,x,z,S.s);
        const nr=nearestRoad(cfg,S.road,x,z,S.s);if(nr.d<ROADHALF+1.5)y-=.3*Math.min(1,(ROADHALF+1.5-nr.d)/1.5);H[j*P+i]=isFinite(y)?y:0}
      mesh.position.set(ox,0,oz);
      const pos=mesh.geometry.attributes.position, col=mesh.geometry.attributes.color, nrm=mesh.geometry.attributes.normal, gr=cfg.ground;
      for(let v=0;v<pos.count;v++){
        const ix=Math.round((pos.getX(v)+TILE/2)/e)+1, iz=Math.round((pos.getZ(v)+TILE/2)/e)+1, wx=ox+pos.getX(v), wz=oz+pos.getZ(v);
        pos.setY(v,H[iz*P+ix]);
        const hx=H[iz*P+ix+1]-H[iz*P+ix-1], hz=H[(iz+1)*P+ix]-H[(iz-1)*P+ix], nl=Math.hypot(hx,2*e,hz)||1, ny=2*e/nl;
        nrm.setXYZ(v,-hx/nl,ny,-hz/nl);
        // colour: broad patches + fine grain, steep crater walls darker, flat tops a touch lighter
        const patch=(fbm2(wx*0.004+7,wz*0.004-3)-0.5)*cfg.groundNoise*2.2, grain=(noise2(wx*0.35,wz*0.35)-0.5)*0.07;
        const shade=Math.max(0.35,(0.72+0.28*Math.pow(Math.max(0,ny),3))*(1+patch+grain));
        const warm=cfg.atmo?(fbm2(wx*0.01-9,wz*0.01+5)-0.5)*0.12:0;
        if(cfg.cracks){const c1=Math.abs(fbm2(wx*0.012+3,wz*0.012-8)-.5),c2=Math.abs(fbm2(wx*0.03-5,wz*0.03+2)-.5);
          if(c1<.012||c2<.006){col.setXYZ(v,.55*shade,.36*shade,.27*shade);continue}}
        col.setXYZ(v, gr[0]*shade*(1+warm), gr[1]*shade, gr[2]*shade*(1-warm));
      }
      pos.needsUpdate=true; nrm.needsUpdate=true; col.needsUpdate=true; mesh.geometry.computeBoundingSphere(); mesh.visible=true;
      // this tile's own rocks, from a seed fixed to the tile: they are there before you arrive and stay put
      if(S.rocks){const K=Math.floor(S.ROCKN/S.tiles.length),b0=S.tiles.indexOf(mesh)*K;let seed=(Math.abs((ci*73856093)^(cj*19349663))%2147483646)+1;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
        const rdm=new THREE.Matrix4(),rpv=new THREE.Vector3(),rqv=new THREE.Quaternion(),rsv=new THREE.Vector3(),ry0=new THREE.Vector3(0,1,0);
        for(let i=0;i<K;i++){const rx=ox+(rnd()-.5)*TILE,rz=oz+(rnd()-.5)*TILE,sz=.4+Math.pow(rnd(),3)*3.2,a=rnd()*6.283,sy=.55+rnd()*.7,sw=.7+rnd()*.5;
          const nr=nearestRoad(cfg,S.road,rx,rz,S.s);let ry=nr.d<ROADHALF+4?-9999:groundH(cfg,S.road,rx,rz,S.s)+sz*.3;if(!isFinite(ry))ry=-9999;
          rpv.set(rx,ry,rz);rqv.setFromAxisAngle(ry0,a);rsv.set(sz,sz*sy,sz*sw);rdm.compose(rpv,rqv,rsv);S.rocks.setMatrixAt(b0+i,rdm)}
        S.rocks.instanceMatrix.needsUpdate=true}
    }

    // --- road ribbon: rebuild the strip in a window ahead of the rover when the rover advances ---
    function rebuildRoad(S){
      const cfg=S.cfg;
      const sNow=Math.floor(S.s/60);
      if(sNow===S.roadStamp) return;
      S.roadStamp=sNow;
      const s0=Math.max(0,S.s-200), s1=S.s+1100, step=6;
      // four columns per row: dusty shoulder, track, track, shoulder (the alpha map fades the shoulders out)
      const verts=[], uvs=[], idx=[]; let row=0; const OUT=ROADHALF+3.2;
      for(let s=s0;s<=s1;s+=step){
        const r=roadAt(cfg,S.road,s), yC=roadY(cfg,S.road,s)+0.05, v=s/9;
        const oL=[r.x+r.nx*OUT,r.z+r.nz*OUT], oR=[r.x-r.nx*OUT,r.z-r.nz*OUT];
        verts.push(oL[0],groundH(cfg,S.road,oL[0],oL[1],s)+0.05,oL[1], r.x+r.nx*(ROADHALF-.6),yC,r.z+r.nz*(ROADHALF-.6),
                   r.x-r.nx*(ROADHALF-.6),yC,r.z-r.nz*(ROADHALF-.6), oR[0],groundH(cfg,S.road,oR[0],oR[1],s)+0.05,oR[1]);
        uvs.push(0,v, .22,v, .78,v, 1,v);
        if(row>0){const b=(row-1)*4;for(let c=0;c<3;c++){const a0=b+c,a1=b+c+1,b0=b+4+c,b1=b+4+c+1;idx.push(a0,a1,b0, a1,b1,b0)}}
        row++;
      }
      S.roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
      S.roadGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      S.roadGeo.setIndex(idx); S.roadGeo.computeVertexNormals();
      // paint: dashed centre line + two solid edge lines
      if(S.stripeGeo){ const sv=[], sidx=[]; let q=0;
        const quad=(a,b,off,hw,ya,yb)=>{sv.push(a.x+a.nx*(off+hw),ya,a.z+a.nz*(off+hw), a.x+a.nx*(off-hw),ya,a.z+a.nz*(off-hw), b.x+b.nx*(off+hw),yb,b.z+b.nz*(off+hw), b.x+b.nx*(off-hw),yb,b.z+b.nz*(off-hw));const k=q*4;sidx.push(k,k+1,k+2, k+1,k+3,k+2);q++};
        for(let s=Math.ceil(s0/10)*10; s<=s1; s+=10){
          const a=roadAt(cfg,S.road,s), b=roadAt(cfg,S.road,s+10), ya=roadY(cfg,S.road,s)+0.09, yb=roadY(cfg,S.road,s+10)+0.09;
          quad(a,b,ROADHALF-0.55,0.16,ya,yb); quad(a,b,-(ROADHALF-0.55),0.16,ya,yb);
          const bm=roadAt(cfg,S.road,s+5); quad(a,bm,0,0.18,ya,roadY(cfg,S.road,s+5)+0.09); }
        S.stripeGeo.setAttribute('position',new THREE.Float32BufferAttribute(sv,3)); S.stripeGeo.setIndex(sidx); S.stripeGeo.computeVertexNormals(); }
      // edge reflectors alternating sides every ~80m
      const dm=new THREE.Matrix4(), rp=new THREE.Vector3(), rq=new THREE.Quaternion(), rs=new THREE.Vector3(1,1,1);
      let n=0; const start=Math.ceil(s0/80)*80;
      for(let s=start;s<=s1 && n<40;s+=80){
        const r=roadAt(cfg,S.road,s), side=((s/80)|0)%2?1:-1;
        const x=r.x+r.nx*(ROADHALF+1)*side, z=r.z+r.nz*(ROADHALF+1)*side;
        let y=groundH(cfg,S.road,x,z,S.s)+0.5; if(!isFinite(y)) y=0;
        rp.set(x,y,z); dm.compose(rp,rq,rs); S.refl.setMatrixAt(n++,dm);
      }
      for(;n<40;n++){rp.set(0,-9999,0);dm.compose(rp,rq,rs);S.refl.setMatrixAt(n,dm);}
      S.refl.instanceMatrix.needsUpdate=true;
    }

    // --- UFO stations: keep a small pool matching milestones near the rover ---
    function syncStations(S){
      const cfg=S.cfg, every=cfg.ufoEvery;
      const kLo=Math.max(0,Math.floor((S.s-every*0.4)/every)), kHi=Math.floor((S.s+every*1.2)/every);
      // drop stations (and their aliens) outside window
      for(let i=S.stations.length-1;i>=0;i--){ const st=S.stations[i];
        if(st.idx<kLo||st.idx>kHi){ S.scene.remove(st.grp); if(st.aliens)st.aliens.forEach(a=>S.scene.remove(a)); S.stations.splice(i,1); } }
      // add missing
      for(let k=kLo;k<=kHi;k++){
        if(S.stations.some(st=>st.idx===k)) continue;
        const r=roadAt(cfg,S.road,k*every);
        const grp=UFO.g.clone(true); grp.scale.setScalar(1.15);
        const side=k%2?1:-1;
        const gx=r.x+r.nx*(ROADHALF+9)*side, gz=r.z+r.nz*(ROADHALF+9)*side;
        grp.position.set(gx, groundH(cfg,S.road,gx,gz,S.s)+13, gz);
        S.scene.add(grp);
        // a couple of aliens milling by the roadside under the craft
        const aliens=[];
        for(let ai=0;ai<2;ai++){ const al=buildAlien(); const off=(ai?1:-1)*2.4;
          const axp=gx+r.tx*off, azp=gz+r.tz*off;
          al.position.set(axp, groundH(cfg,S.road,axp,azp,S.s), azp);
          al.rotation.y=Math.atan2(r.x-axp, r.z-azp); S.scene.add(al); aliens.push(al); }
        S.stations.push({idx:k, grp, aliens, x:gx, z:gz, sAt:k*every});
      }
    }

    function surfaceNormal(cfg,road,x,z,sHint){
      const e=2.0;
      const hx=groundH(cfg,road,x+e,z,sHint)-groundH(cfg,road,x-e,z,sHint);
      const hz=groundH(cfg,road,x,z+e,sHint)-groundH(cfg,road,x,z-e,sHint);
      return new THREE.Vector3(-hx,2*e,-hz).normalize();
    }

    /* rover pose from its footprint (S.foot), eased toward the target so it rocks rather than snaps */
    const _fv=new THREE.Vector3(),_rv=new THREE.Vector3(),_uv=new THREE.Vector3(),_xv=new THREE.Vector3(),_mb=new THREE.Matrix4();
    function roverPose(S,fx,fz,dt,ease){
      const f=S.foot;if(!f)return;
      const fL=S.halfL||2,fW=S.halfW||1.5;_fv.set(fx*2*fL,f.hF-f.hB,fz*2*fL);_rv.set(f.rxv*2*fW,f.hR-f.hL,f.rzv*2*fW);
      _uv.crossVectors(_fv,_rv).normalize();if(_uv.y<0)_uv.negate();
      if(_uv.y<0.8){_uv.y=0.8;_uv.normalize()}                       // never more than ~37 degrees of tilt
      _fv.addScaledVector(_uv,-_fv.dot(_uv)).normalize();_xv.crossVectors(_uv,_fv).normalize();
      _mb.makeBasis(_xv,_uv,_fv);_qt.setFromRotationMatrix(_mb);
      S.rover.quaternion.slerp(_qt,1-Math.pow(ease,dt));
      // ride height eases over small bumps instead of snapping to every height change
      S.visY=S.visY==null||Math.abs(S.visY-S.pos.y)>3?S.pos.y:S.visY+(S.pos.y-S.visY)*Math.min(1,dt*12);
      // the easing used to trail half a metre behind on a climb, which drew the car sunk into the hill:
      // it may smooth a bump, but never sit more than a few centimetres off the ground it is on
      S.visY=Math.max(S.pos.y-.03,Math.min(S.pos.y+.08,S.visY));
      S.comp=Math.min(.1,(S.comp||0)*Math.exp(-dt*4.5));   // landing squat, kept small so the wheels stay on top of the ground
      S.rover.position.set(S.pos.x,S.visY-S.comp,S.pos.z).add(new THREE.Vector3(0,-1.1,0).applyQuaternion(S.rover.quaternion));
    }
    /* =================== GENERALIZED SURFACE DRIVING (kinematic) =================== */
    const _cv=new THREE.Vector3(), _up=new THREE.Vector3(0,1,0), _n=new THREE.Vector3(), _qa=new THREE.Quaternion(), _qy=new THREE.Quaternion(), _qt=new THREE.Quaternion();
    function driveSurface(dt){
      const S=SURF, cfg=S.cfg, p=S.pos;
      /* Surface driving (Moon, Mars, Europa). Velocity is split into a part along the heading and a part
         sideways. Tyres kill the sideways part at a rate set by the surface (cfg.grip), so the rover turns
         where it points, with a bit of float on loose regolith, and the handbrake lets it slide on purpose.
         Gravity does not scale engine force or grip here: it sets jump height, air time and landings. */
      const dtc=Math.min(dt,1/30);                     // a stalled frame (tab switch) must not throw the rover around
      const throttle=(key.f?1:0)-(key.b?1:0);
      const kv=v=>v===true?1:(+v>0?Math.min(1,+v):0),steerIn=kv(key.l)-kv(key.r);
      const gnd=S.grounded;
      S.steerS=(S.steerS||0)+(steerIn-(S.steerS||0))*(1-Math.exp(-dtc*(steerIn?9:12)));   // wheel eases, never snaps
      const hx=Math.sin(S.yaw), hz=Math.cos(S.yaw);
      const vf0=S.vel.x*hx+S.vel.z*hz;
      // yaw needs the rover to be rolling, tapers off with speed, and flips when backing up
      const turn=Math.min(1,Math.abs(vf0)/5)/(1+Math.abs(vf0)/cfg.vmax*1.1);
      const yawGoal=S.steerS*cfg.steer*turn*(vf0<-0.5?-1:1)*(gnd?1:0.35);
      S.yawRate=(S.yawRate||0)+(yawGoal-(S.yawRate||0))*(1-Math.exp(-dtc*7));
      S.yaw+=S.yawRate*dtc;
      const fx=Math.sin(S.yaw), fz=Math.cos(S.yaw), sx=fz, sz=-fx;
      let vf=S.vel.x*fx+S.vel.z*fz, vl=S.vel.x*sx+S.vel.z*sz;
      const boost=key.boost?cfg.boost:1, ACC=cfg.accel*boost, vmax=cfg.vmax*boost;
      if(gnd){
        let ax=0;
        if(throttle>0){ax=ACC*Math.max(0,1-Math.pow(Math.max(0,vf)/vmax,3)); if(vf<-0.5)ax+=cfg.accel*1.6}
        else if(throttle<0){
          if(vf>1)ax=-cfg.accel*1.6;                                   // brake first, reverse only once nearly stopped
          else ax=-cfg.accel*0.55*Math.max(0,1-Math.pow(Math.max(0,-vf)/(vmax*0.35),3));
        }
        // rolling resistance, plus drag that only matters where there is an atmosphere
        const drag=0.55+Math.abs(vf)*Math.abs(vf)*(cfg.atmo?0.0012:0.00008);
        const dv=Math.min(Math.abs(vf),drag*dtc)*Math.sign(vf);
        vf+=ax*dtc-(throttle?dv*0.35:dv);
        if(key.h){const hb=Math.min(Math.abs(vf),7*dtc)*Math.sign(vf);vf-=hb}
        vl*=Math.exp(-(cfg.grip||3.2)*(key.h?0.22:1)*dtc);          // tyre grip: sideways speed bleeds off
      } else {
        vf*=Math.exp(-0.01*dtc); vl*=Math.exp(-0.01*dtc);            // airborne: nothing grips, nothing drags much
      }
      if(!isFinite(vf)||!isFinite(vl)){vf=0;vl=0}
      { const m=Math.hypot(vf,vl),cap=vmax*1.25; if(m>cap){vf*=cap/m;vl*=cap/m} }
      S.vel.x=fx*vf+sx*vl; S.vel.z=fz*vf+sz*vl;
      const speed=Math.hypot(S.vel.x,S.vel.z);
      p.x+=S.vel.x*dt; p.z+=S.vel.z*dt;
      // ground under the four corners of the rover's footprint: its height and tilt come from these,
      // so a sharp bump under one point can no longer spin it onto its side
      const rxv=Math.cos(S.yaw), rzv=-Math.sin(S.yaw);
      const fL=S.halfL||2,fW=S.halfW||1.5;
      const hF=groundH(cfg,S.road,p.x+fx*fL,p.z+fz*fL,S.s), hB=groundH(cfg,S.road,p.x-fx*fL,p.z-fz*fL,S.s);
      const hR=groundH(cfg,S.road,p.x+rxv*fW,p.z+rzv*fW,S.s), hL=groundH(cfg,S.road,p.x-rxv*fW,p.z-rzv*fW,S.s);
      S.foot={hF,hB,hR,hL,rxv,rzv};
      /* ride height: the body plane comes from the four footprint samples, then it is lifted until it
         clears every point of a 5 x 3 grid under the vehicle, so a bump between samples can't poke through */
      const hC=groundH(cfg,S.road,p.x,p.z,S.s),pa=(hF-hB)/(2*fL),pb=(hR-hL)/(2*fW);
      let lift=0;for(const u of [-1,-.5,0,.5,1])for(const w of [-1,0,1]){const lu=u*fL,lw=w*fW;
        const h=groundH(cfg,S.road,p.x+fx*lu+rxv*lw,p.z+fz*lu+rzv*lw,S.s)-(hC+pa*lu+pb*lw);if(h>lift)lift=h}
      const gy=hC+Math.min(lift,1.5)+1.1;
      const terrV=(gy-(S.prevGY||gy))/Math.max(dt,0.001); S.prevGY=gy;
      const G=(moonGravityOn?cfg.g:24);
      // vertical: hug the ground. Only a real ramp at speed launches, and only in low gravity.
      if(S.grounded){
        p.y=gy;
        if(moonGravityOn && terrV>14 && speed>14){ S.vy=Math.min(terrV*0.35,9); S.grounded=false; }
      } else {
        S.vy -= G*dt; p.y += S.vy*dt;
        if(p.y<=gy){ const impact=-S.vy; p.y=gy; S.vy=0; S.grounded=true;
          if(impact>3){ S.emitDust(p.x,gy-1.1,p.z,22,Math.min(10,impact*0.8),0.8); S.land=Math.min(0.4,impact*0.03); S.comp=Math.min(0.5,impact*0.05); try{thud(Math.min(1,impact*0.05));}catch(e){} } }
      }
      // HARD FLOOR: the rover can never sit below the surface ("under the map")
      if(p.y<gy){ p.y=gy; if(S.vy<0)S.vy=0; S.grounded=true; }
      if(S.grounded && throttle && speed>4 && frameN%2===0){
        S.emitDust(p.x - fx*2, gy-0.9, p.z - fz*2, 2, 2.2, 0.25);
      }
      // odometer: project onto the road centreline (never let it jump backward wildly)
      const nr=nearestRoad(cfg,S.road,p.x,p.z,S.s);
      if(Math.abs(nr.s-S.s)<400) S.s=nr.s; else S.s=Math.max(0,S.s+ (S.vel.x*fx+S.vel.z*fz)*dt);
      if(S.s>S.maxS)S.maxS=S.s;

      // ORIENTATION from the footprint: forward and right vectors along the ground, up = their cross
      roverPose(S,fx,fz,dt,0.00005);
      const roll=speed*dt*1.6; S.wheels.forEach(w=>w.rotation.x+=roll);

      // dust integrate
      const arr=S.dgeo.attributes.position.array;
      for(let i=0;i<S.dlife.length;i++){
        if(S.dlife[i]>0){
          S.dlife[i]-=dt; S.dvel[i].y-=(moonGravityOn?cfg.g:24)*0.5*dt;
          arr[i*3]+=S.dvel[i].x*dt; arr[i*3+1]+=S.dvel[i].y*dt; arr[i*3+2]+=S.dvel[i].z*dt;
          const fgy=groundH(cfg,S.road,arr[i*3],arr[i*3+2],S.s); if(arr[i*3+1]<fgy){arr[i*3+1]=fgy;S.dvel[i].set(0,0,0);}
          if(S.dlife[i]<=0)arr[i*3+1]=-9999;
        }
      }
      S.dgeo.attributes.position.needsUpdate=true;

      // stream world + stations; the sky travels with the rover
      rebuildTerrain(S,false); rebuildRoad(S); syncStations(S);
      if(S.skyG)S.skyG.position.set(p.x,0,p.z);
      S.sunL.target.position.copy(p); S.sunL.position.copy(p).add(new THREE.Vector3(cfg.sunDir[0],cfg.sunDir[1],cfg.sunDir[2]).multiplyScalar(400));

      // camera: the same modes as on Earth (C / Camera button / phone CAM), sized for the rover
      { const CM=CAMS[camMode]||CAMS[0];
        if(S.glass&&S.glassOff!==!!CM.fp){S.glassOff=!!CM.fp;S.glass.forEach(m=>m.visible=!CM.fp)}
        if(CM.fp){
          // bonnet / bumper: ride with the rover, tilted with it
          // the rover is a copy of the car with its ground at the holder's origin, so the same measured spots apply
          const fp=CM.n==='Bumper'?FP.bumper:FP.bonnet,fy=fp.y+FP.off+(S.ccY||0);
          _cv.set(0,fy,fp.z).applyQuaternion(S.rover.quaternion).add(S.rover.position);C.position.copy(_cv);
          _cv.set(0,fy-.25,fp.z+30).applyQuaternion(S.rover.quaternion).add(S.rover.position);C.lookAt(_cv);
        } else {
          const k=(cfg.camBack||12)/9.5, sgn=CM.d<0?-1:1;                 // wider on the Moon so jumps read
          const back=CM.d*k+sgn*Math.min(6,speed*0.1), upH=CM.h*(cfg.camUp||5.5)/4.8;
          const goal=new THREE.Vector3(p.x-fx*back, p.y+upH, p.z-fz*back);
          C.position.lerp(goal, 1-Math.pow(0.0015,dt));
          if(S.land>0){ C.position.y+=Math.sin(t*60)*S.land; S.land*=0.85; }
          { const cf=groundH(cfg,S.road,C.position.x,C.position.z,S.s)+2.2; if(C.position.y<cf)C.position.y=cf; }
          C.lookAt(p.x+fx*CM.ahead, p.y+1.5*CM.ly, p.z+fz*CM.ahead);
        }
        {const nr=CM.fp?.12:.5;if(C.near!==nr){C.near=nr;C.updateProjectionMatrix()}}   // a 0.5 m near plane cut the bonnet away
        const fov=CM.fov+(CM.fp?0:Math.min(8,speed*.18));
        if(Math.abs(C.fov-fov)>.05){C.fov+=(fov-C.fov)*Math.min(1,dt*4);C.updateProjectionMatrix()} }

      // station proximity -> prompt
      api.nearStation=false; let nd=1e9, nst=null;
      for(const st of S.stations){ const d=Math.hypot(p.x-st.x,p.z-st.z); if(d<nd){nd=d;nst=st;} }
      if(nst && nd<16){ api.nearStation=true; }
      if(travelEl){ travelEl.hidden=!api.nearStation; travelEl.textContent='ENTER UFO - E'; }

      // HUD odometer
      const km=(S.maxS/1000), nextUFO=(Math.floor(S.s/cfg.ufoEvery)+1)*cfg.ufoEvery, toNext=(nextUFO-S.s)/1000;
      odo.style.opacity='1'; if(frameN%3===0)drawSurfMap(S);
      if(odo._mir!==rearMirrorOn){odo._mir=rearMirrorOn;odo.style.top=rearMirrorOn?'calc(116px + env(safe-area-inset-top,0px))':'calc(16px + env(safe-area-inset-top,0px))'}   // below the mirror when it is up
      try{NAV.tick(dt,performance.now())}catch(e){}
      if(frameN%6===0&&bigmap.classList.contains('on'))api.drawBigMap(bmc.getContext('2d'),bmc.width);
      odo.textContent=cfg.name+'  ·  '+Math.round(speed*3.6)+' km/h  ·  '+km.toFixed(2)+' km driven'+(api.gpsOn?'  ·  next UFO in '+toNext.toFixed(2)+' km':'');
      audioSurface(dt);
    }

    /* =================== ARRIVAL (descent + gravity ramp) =================== */
    // handled inside frame() 'arrive' state

    /* =================== STATE MACHINE =================== */
    const ufoHome=new THREE.Vector3();let carWasVisible=true;
    function spaceHud(on){ // Earth's HUD (speed, map, menu, key hints) has no meaning out here
      try{hud.classList.toggle('on',!on);if(hint)hint.style.visibility=on?'hidden':'';}catch(e){} }
    function go(s,arg){ api.state=s; t=0;
      if(s==='space'){ buildSpace(); }
      if(s==='surface'){ odo.style.opacity='1'; bedOff(); pmap.style.display='block'; }
      if(s!=='surface'&&s!=='select'){ odo.style.opacity='0'; pmap.style.display='none'; }
      if(s==='earth'){
        C.far=savedFar; C.near=savedNear; C.updateProjectionMatrix(); say(''); if(travelEl)travelEl.hidden=true; bedOff(); silenceSnd(); if(gravBtn)gravBtn.style.display='none';
        // put the Earth-side UFO and the car back exactly as they were before lift-off
        if(ufoHome.lengthSq()>0)UFO.g.position.copy(ufoHome);UFO.g.rotation.set(0,0,0);UFO.bm.opacity=.5;car.visible=carWasVisible;
        spaceHud(false);fadeTo(1,0);setTimeout(()=>fadeTo(0,.9),60);
      }else spaceHud(true);
    }

    // arrival onto planet `key`: the craft hovers over the road and lowers the rover on its beam
    function beginArrival(key){
      buildSurface(key); api.planet=key; const S=SURF, cfg=S.cfg;
      // drive your own car out here: copy whatever car is selected, wheels resting on y=0
      {const old=S.rover;S.scene.remove(old);const holder=new THREE.Group(),cc=car.clone(true);cc.visible=true;cc.position.set(0,0,0);cc.quaternion.identity();cc.rotation.set(0,0,0);cc.scale.set(1,1,1);
        cc.traverse(o=>{if(o.isMesh&&o.visible&&!o.material.transparent)o.castShadow=true});   // don't unhide helpers like headlight cones
        // Earth's fake contact-shadow square is not needed under a real sun shadow
        if(carShadow)cc.traverse(o=>{if(o.isMesh&&o.material===carShadow.material)o.visible=false});
        holder.add(cc);cc.updateMatrixWorld(true);
        // lowest point of what is actually drawn (wheels / contact shadow) sits on y=0
        {let lo=Infinity;const v=new THREE.Vector3();cc.traverse(o=>{if(!o.isMesh||!o.geometry)return;for(let q=o;q&&q!==holder;q=q.parent)if(!q.visible)return;
          if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const xx of [b.min.x,b.max.x])for(const yy of [b.min.y,b.max.y])for(const zz of [b.min.z,b.max.z]){v.set(xx,yy,zz).applyMatrix4(o.matrixWorld);if(v.y<lo)lo=v.y}});
         if(isFinite(lo))cc.position.y=-lo+.02;S.ccY=cc.position.y;}
        S.glass=[];cc.traverse(o=>{if(o.isMesh&&o.material&&o.material.transparent&&o.material.opacity<.8)S.glass.push(o)});
        S.scene.add(holder);S.rover=holder;S.wheels=[];
        // footprint the ground is sampled at: the vehicle's own length and width, so a long truck rests on its ends
        {const bb=new THREE.Box3().setFromObject(holder);S.halfL=Math.max(1.6,(bb.max.z-bb.min.z)*.42);S.halfW=Math.max(.6,(bb.max.x-bb.min.x)*.4)}}
      const r0=roadAt(cfg,S.road,0);
      S.vel.set(0,0,0); S.vy=0; S.yaw=Math.atan2(r0.tx,r0.tz); S.grounded=false; S.s=0; S.maxS=0; S.land=0;
      S.groundY=roadY(cfg,S.road,0)+1.1;
      S.pos.set(r0.x, S.groundY+16, r0.z);
      S.rover.quaternion.setFromAxisAngle(_up,S.yaw);S.rover.position.set(r0.x,S.groundY+15,r0.z);
      S.lander.visible=true;S.lander.position.set(r0.x,S.groundY+60,r0.z);S.lander.scale.setScalar(1.1);
      if(S.skyG)S.skyG.position.set(r0.x,0,r0.z);
      rebuildTerrain(S,true);rebuildRoad(S);syncStations(S);
      C.far=20000; C.near=0.5; C.updateProjectionMatrix();
      C.position.set(r0.x+r0.nx*26,S.groundY+12,r0.z+r0.nz*26-10);C.lookAt(r0.x,S.groundY+10,r0.z);
      go('arrive'); api._gRamp=0; silenceSnd(); ufoLand(); fadeTo(1,0);setTimeout(()=>fadeTo(0,.9),40);
      say(cfg.caption);
      // GPS pins: the next few UFO stations along the road, plus a far waypoint
      S.gpsPins = []; S.gpsTarget = null;
      for(let i=1;i<=5;i++){ const sDist=i*cfg.ufoEvery, rp=roadAt(cfg,S.road,sDist); S.gpsPins.push({x:rp.x, z:rp.z, y:roadY(cfg,S.road,sDist), label:'UFO '+i, type:'ufo'}); }
      {const far=roadAt(cfg,S.road,50000);S.gpsPins.push({x:far.x, z:far.z, y:roadY(cfg,S.road,50000), label:'50km', type:'waypoint'});}
    }

    api.updateEarth=function(){
      if(!travelEl)return;
      const near=active&&driving&&MODE==='world'&&api.state==='earth'&&Math.hypot(car.position.x-UFO.x,car.position.z-UFO.z)<24;
      travelEl.hidden=!near; if(near)travelEl.textContent='ENTER UFO - E';
    };
    api.interact=function(){
      if(api.state==='earth'){
        if(MODE!=='world'||Math.hypot(car.position.x-UFO.x,car.position.z-UFO.z)>=24)return;
        api.begin(); return;
      }
      if(api.state==='surface' && api.nearStation){
        buildSelButtons(); selEl.style.display='grid'; api.state='select'; t=0; say('');
        if(travelEl)travelEl.hidden=true;
        return;
      }
    };
    if(travelEl)travelEl.onclick=()=>api.interact();

    function chooseDest(key){
      selEl.style.display='none';
      if(key===api.planet){ api.state='surface'; t=0; return; }   // already here
      api.target=key; bedOn();ufoPower(); go('depart');
      try{blip(300,.5,.1);}catch(e){}
    }

    api.begin=function(){
      if(api.state!=='earth'||MODE!=='world')return;
      if(travelEl)travelEl.hidden=true;
      buildSpace();api.warpX=0;api.warpY=0;api.planet='earth';api.target='moon';
      ufoHome.copy(UFO.g.position);carWasVisible=car.visible;
      api._carFrom=car.position.clone();api._camAng=Math.atan2(C.position.x-UFO.x,C.position.z-UFO.z);
      go('liftoff');
      UFO.hit=true;missSet('ufo',1);silenceSnd();ufoPower();bedOn();blip(300,.5,.1);setTimeout(()=>blip(900,.4,.08),220);
    };

    const fadeEl=(function(){ const d=document.createElement('div');
      d.style.cssText='position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:45;transition:opacity .15s';
      sec.appendChild(d); return d; })();
    function fadeTo(op,secs,col){ fadeEl.style.transition='opacity '+(secs||0)+'s'; if(col)fadeEl.style.background=col; fadeEl.style.opacity=String(op); }
    const fade=fadeEl;   // older code reads fade.style.opacity
    const ease=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    const PLANET_OF=o=>({moon:o.moonP,mars:o.marsP,europa:o.europaP,earth:o.earth});
    function showOnly(o,keys){ o.earth.visible=keys.includes('earth');o.moonP.visible=keys.includes('moon');o.marsP.visible=keys.includes('mars');o.europaP.visible=keys.includes('europa');o.pl[0].visible=keys.includes('europa')||!keys.length; }
    function spinClouds(o,dt){ const c=o.earth.userData.clouds;if(c)c.rotation.y+=dt*.01;o.earth.rotation.y+=dt*.02;o.moonP.rotation.y+=dt*.01;o.marsP.rotation.y+=dt*.012 }

    api.frame=function(dt,now){
      t+=dt;
      if(api.state!=='liftoff'&&C.far<20000){C.far=20000;C.near=0.5;C.updateProjectionMatrix()}   // space needs a 20 km view
      if(AC&&SND){try{SND.bus.gain.setTargetAtTime(muted?0:.9,AC.currentTime,.05);}catch(e){}}
      if(gravBtn)gravBtn.style.display=(api.state==='surface'||api.state==='select')?'block':'none';

      /* ---- 1. lift-off, in the real Earth scene: beam on, car rises into the craft, craft shoots up ---- */
      if(api.state==='liftoff'){
        const dur=4.4,h=ufoHome,cf=api._carFrom;
        UFO.bm.opacity=Math.min(.95,.5+t*.6);
        // car floats up the beam with a slow spin, and disappears into the hull
        const kc=Math.max(0,Math.min(1,(t-.35)/1.7)),e=ease(kc);
        car.position.set(cf.x+(h.x-cf.x)*e,cf.y+(h.y-1.5-cf.y)*e,cf.z+(h.z-cf.z)*e);car.rotation.y+=dt*1.4*kc;car.visible=kc<.98;
        // craft hums in place, then accelerates straight up with a slight tilt
        const up=t>2.3?Math.pow(t-2.3,2.6)*48:Math.sin(t*3)*.25;UFO.g.position.set(h.x,h.y+up,h.z);UFO.g.rotation.z=t>2.3?Math.min(.18,(t-2.3)*.12):0;UFO.g.rotation.y+=dt*(1+t*.8);
        const ang=api._camAng+t*.32,rad=28+t*5,camY=h.y-6+Math.min(t,2.3)*3+(t>2.3?up*.35:0);
        C.position.set(h.x+Math.sin(ang)*rad,camY,h.z+Math.cos(ang)*rad);C.lookAt(h.x,(t<2.3?h.y-4+e*3:h.y+up),h.z);
        say(t<2.2?'The beam takes hold':'Leaving Earth');
        if(t>dur-.7)fadeTo(1,.6);
        if(t>dur){ car.visible=false; C.far=20000; C.near=0.5; C.updateProjectionMatrix(); go('flight'); fadeTo(1,0); setTimeout(()=>fadeTo(0,.8),30); }
        R.render(S,C);return;
      }
      /* ---- 2. flight: Earth falls away below, the black hole grows ahead ---- */
      if(api.state==='flight'){
        const o=spaceObj,dur=5,k=Math.min(1,t/dur),steer=((key.r?1:0)-(key.l?1:0))*16;
        showOnly(o,['earth']);spinClouds(o,dt);o.bh.visible=true;
        const cz=-k*520;
        o.earth.position.set(0,-330+k*-60,260+k*240);o.earth.scale.setScalar(2.2);
        o.bh.position.set(0,40,cz-1100);o.bh.scale.setScalar(.55+k*.75);o.disk.rotation.z+=dt*.15;o.photon.rotation.z-=dt*.1;
        o.craft.position.set(steer,6+Math.sin(t*1.6)*1.2,cz);o.craft.rotation.set(-.05,o.craft.rotation.y+dt*1.2,-steer*.006);
        C.position.set(o.craft.position.x*.6,o.craft.position.y+9,cz+34);C.lookAt(o.craft.position.x*.3,o.craft.position.y+4,cz-200);
        updateLines(o,C.position.x,C.position.y,C.position.z,40+k*500,dt,k*.35);
        say(k<.5?'Earth falls away below':'Black hole ahead · hold course');
        if(t>dur-.35)fadeTo(1,.3,'#fff');
        if(t>dur){ o.bh.visible=false; go('warp'); fadeTo(0,.6); }
        R.render(spaceScene,C);return;
      }
      /* ---- 3. warp: speed lines and rings rush past, A/D/W/S to weave ---- */
      if(api.state==='warp'){
        const o=spaceObj,dur=8.5,k=Math.min(1,t/dur),speed=1400*Math.sin(Math.min(1,k*1.25)*Math.PI*.5)+200,camZ=-k*7000;
        showOnly(o,[]);o.bh.visible=false;
        api.warpX=Math.max(-40,Math.min(40,api.warpX+((key.r?1:0)-(key.l?1:0))*dt*34));
        api.warpY=Math.max(-26,Math.min(26,api.warpY+((key.f?1:0)-(key.b?1:0))*dt*22));
        const pathX=Math.sin(t*.5)*14,pathY=Math.cos(t*.37)*8,x=pathX+api.warpX,y=pathY+api.warpY;
        o.craft.position.set(x,y,camZ-26);o.craft.rotation.set(-.04,o.craft.rotation.y+dt*2,Math.max(-.25,Math.min(.25,-api.warpX*.006)));
        C.position.set(x*.7,y*.7+8,camZ);C.lookAt(x*.4,y*.4+2,camZ-120);
        updateLines(o,C.position.x,C.position.y,camZ,speed,dt,.85*Math.min(1,t*1.5)*(1-Math.max(0,(k-.88)/.12)));
        o.warpRings.forEach((ring,i)=>{const rz=((camZ-300-i*280)%1680);ring.position.set(Math.sin((camZ-i*280)*.002)*20,Math.cos((camZ-i*280)*.0017)*12,camZ-260-((i*280-(camZ%280)+1680)%1680));
          ring.rotation.z+=dt*(i%2?.4:-.3);ring.material.opacity=.32*Math.min(1,t)*(1-Math.max(0,(k-.85)/.15))});
        const tn=PLANETS[api.target]?PLANETS[api.target].name:'Moon';
        say(k<.12?'Through the event horizon':k<.85?'Warp corridor · A/D steer · W/S climb and dive':tn+' signal ahead');
        if(t>dur-.4)fadeTo(1,.35);
        if(t>dur){ o.warpRings.forEach(r=>r.material.opacity=0); o.lines.material.opacity=0; go('approach'); fadeTo(0,.7); }
        R.render(spaceScene,C);return;
      }
      /* ---- 4. approach: the destination grows from a disc to filling the view, lit from the side ---- */
      if(api.state==='approach'){
        const o=spaceObj,dur=5.5,k=Math.min(1,t/dur),e=ease(k),tg=api.target||'moon',P=PLANET_OF(o)[tg]||o.moonP;
        showOnly(o,[tg].concat(tg==='moon'?['earth']:[]));spinClouds(o,dt);o.bh.visible=false;
        const D=3600-e*3150;P.position.set(-60+e*40,-40-e*70,-D);P.scale.setScalar(1+e*.8);
        if(tg==='moon'){o.earth.position.set(-1900,700,-5200);o.earth.scale.setScalar(.55)}
        o.craft.position.set(Math.sin(t*.8)*3,-4+Math.cos(t*.6)*1.5,0);o.craft.rotation.set(-.08,o.craft.rotation.y+dt*1.1,0);
        if(tg==='europa'){o.pl[0].visible=true;o.pl[0].position.set(900,420,-6200)}
        C.position.set(0,9,34);C.lookAt(P.position.x*.6,P.position.y*.7,P.position.z);
        updateLines(o,0,0,0,260*(1-k),dt,.25*(1-k));
        const nm=tg==='earth'?'Earth':(PLANETS[tg]?PLANETS[tg].name:'destination');
        say(k<.6?nm+' ahead':(tg==='earth'?'Coming home':'Descending to the surface'));
        if(t>dur-.6)fadeTo(1,.55);
        if(t>dur){
          o.lines.material.opacity=0;
          if(tg==='earth'){ try{resetCar();}catch(e){} go('earth'); try{toastMsg('Home. Back on Earth.');}catch(e){} }
          else beginArrival(tg);
        }
        R.render(spaceScene,C);return;
      }
      /* ---- leaving a planet: lift off past it into a short cruise, then approach the next one ---- */
      if(api.state==='depart'){
        if(!spaceScene)buildSpace(); const o=spaceObj,dur=4,k=Math.min(1,t/dur),from=api.planet,P=PLANET_OF(o)[from];
        if(t<dt*1.5){fadeTo(1,0);setTimeout(()=>fadeTo(0,.6),30)}
        showOnly(o,from?[from]:[]);spinClouds(o,dt);o.bh.visible=false;
        if(P){P.position.set(0,-260-k*200,140+k*600);P.scale.setScalar(2.3-k*1.2)}
        o.craft.position.set(Math.sin(t)*4,4+Math.cos(t*.8)*2,-k*300);o.craft.rotation.set(-.06,o.craft.rotation.y+dt*1.4,0);
        C.position.set(0,o.craft.position.y+9,o.craft.position.z+36);C.lookAt(0,o.craft.position.y+2,o.craft.position.z-200);
        updateLines(o,C.position.x,C.position.y,C.position.z,100+k*900,dt,.6*k);
        const tgt=api.target, tn=tgt==='earth'?'Earth':PLANETS[tgt]?PLANETS[tgt].name:'destination';
        say(k<.5?'Leaving '+(PLANETS[from]?PLANETS[from].name:'orbit'):'Course set for '+tn);
        if(t>dur-.4)fadeTo(1,.35);
        if(t>dur){ go('approach'); fadeTo(0,.6); }
        R.render(spaceScene,C);return;
      }
      /* ---- 5. landing: the craft hovers over the road and lowers the rover on its beam, then leaves ---- */
      if(api.state==='arrive'){
        const S=SURF,cfg=S.cfg,dur=4.2,L=S.lander,g0=S.groundY,r0=roadAt(cfg,S.road,0);
        const fx=Math.sin(S.yaw),fz=Math.cos(S.yaw);
        // craft: drop in fast, hover, then climb away
        const hov=g0+15,ly=t<1.2?hov+Math.pow(1-t/1.2,2)*45:t<3?hov+Math.sin(t*2.4)*.4:hov+Math.pow(t-3,2.2)*30;
        L.position.set(r0.x,ly,r0.z);L.rotation.y+=dt*1.6;UFO.bm.opacity=t>1&&t<3.1?.9:.35;
        // rover rides down the beam between 1.3 s and 2.9 s, touching down softly
        const kr=Math.max(0,Math.min(1,(t-1.3)/1.6)),er=1-Math.pow(1-kr,3);
        S.pos.set(r0.x,(hov-1.5)+(g0-(hov-1.5))*er,r0.z);
        const rxv=Math.cos(S.yaw),rzv=-Math.sin(S.yaw);
        const fL=S.halfL||2,fW=S.halfW||1.5;S.foot={hF:groundH(cfg,S.road,r0.x+fx*fL,r0.z+fz*fL,0),hB:groundH(cfg,S.road,r0.x-fx*fL,r0.z-fz*fL,0),hR:groundH(cfg,S.road,r0.x+rxv*fW,r0.z+rzv*fW,0),hL:groundH(cfg,S.road,r0.x-rxv*fW,r0.z-rzv*fW,0),rxv,rzv};
        if(kr<1){S.rover.quaternion.setFromAxisAngle(_up,S.yaw+(1-er)*2.5);S.rover.position.copy(S.pos).add(new THREE.Vector3(0,-1.1,0))}
        else roverPose(S,fx,fz,dt,0.002);
        if(kr>=1&&!S._touched){S._touched=true;S.emitDust(r0.x,g0-1.1,r0.z,40,7,1.1);try{thud(.5)}catch(e){}}
        if(t<.1)S._touched=false;
        // camera: wide side view of the drop, then swing in behind the rover
        const kc=ease(Math.max(0,Math.min(1,(t-2.4)/1.8))),side=new THREE.Vector3(r0.x+r0.nx*24-fx*6,g0+9,r0.z+r0.nz*24-fz*6),behind=new THREE.Vector3(r0.x-fx*12,g0+5.5,r0.z-fz*12);
        C.position.copy(side).lerp(behind,kc);C.lookAt(r0.x+fx*6*kc,g0+(1-kc)*7+1.5,r0.z+fz*6*kc);
        const arr=S.dgeo.attributes.position.array;
        for(let i=0;i<S.dlife.length;i++){ if(S.dlife[i]>0){ S.dlife[i]-=dt; S.dvel[i].y-=(moonGravityOn?cfg.g:24)*0.5*dt;
          arr[i*3]+=S.dvel[i].x*dt;arr[i*3+1]+=S.dvel[i].y*dt;arr[i*3+2]+=S.dvel[i].z*dt; if(S.dlife[i]<=0)arr[i*3+1]=-9999; } }
        S.dgeo.attributes.position.needsUpdate=true;
        say(cfg.caption);
        if(t>dur){ L.visible=false; UFO.bm.opacity=.5; S.pos.y=g0; S.vy=0; S.grounded=true; S.prevGY=g0; go('surface'); }
        R.render(S.scene,C); return;
      }
      if(api.state==='surface'){
        if(t>4)say('');
        driveSurface(dt);
        R.render(SURF.scene,C);
        if(rearMirrorOn)renderMirror(SURF.scene,SURF.rover.position,SURF.rover.quaternion,SURF.ccY||0);
        return;
      }
      if(api.state==='select'){
        if(SURF){ S_idle(SURF,dt); R.render(SURF.scene,C); }
        return;
      }
      if(api.state==='returning'){ api.target='earth'; go('approach'); return; }
    };
    // keep the surface gently alive while the menu is open (dust settles, reflectors spin)
    function S_idle(S,dt){
      if(AC&&SND){try{SND.mG.gain.setTargetAtTime(0,AC.currentTime,.1);SND.rG.gain.setTargetAtTime(0,AC.currentTime,.1);SND.wG.gain.setTargetAtTime(0,AC.currentTime,.1);SND.gG.gain.setTargetAtTime(0,AC.currentTime,.1);}catch(e){}}
      const arr=S.dgeo.attributes.position.array;
      for(let i=0;i<S.dlife.length;i++){ if(S.dlife[i]>0){ S.dlife[i]-=dt; S.dvel[i].y-=(moonGravityOn?S.cfg.g:24)*0.5*dt;
        arr[i*3]+=S.dvel[i].x*dt;arr[i*3+1]+=S.dvel[i].y*dt;arr[i*3+2]+=S.dvel[i].z*dt; if(S.dlife[i]<=0)arr[i*3+1]=-9999; } }
      S.dgeo.attributes.position.needsUpdate=true;
    }
    /* the map + GPS code outside this module reads these */
    api.PLANETS=PLANETS;api.DS=DS;api.groundH=groundH;
    api._arrive=k=>{beginArrival(k)};   // used by the ?dev=1 test hooks only
    Object.defineProperty(api,'SURF',{get:()=>SURF});
    return api;
  })();

  const phoneSt={on:false,cam:false,reset:false};let rcSince=0;
  const garageEl=$('#dgarage');
  function loop(now){requestAnimationFrame(loop);
    /* the garage covers the screen and runs its own preview, so solo play holds still underneath it
       (physics and all, so nothing happens to the car while you choose); a room keeps running */
    if(garageEl.classList.contains('on')){let inRoom=false;try{inRoom=!!MP.on}catch(_){}if(!inRoom){last=now;return}}
    if(active!==wasActive){
      wasActive=active;
      if(active){poster.style.display='none'}
      else{posterState=0;posterWarm=0}   // take a fresh still: the weather may have moved on
    }
    if(!active){
      {const r=sec.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight||document.hidden){last=now;return}}
      if(posterState===1){last=now;return}          // the still is up; there is nothing to draw
      // 1 = warming up for the still, rendered near full res so it is not a blurry one.
      // 2 = the still failed, so fall back to the old low-res throttled redraw.
      if(posterState===0&&posterWarm<4){
        if(idleLow!==1){idleLow=1;R.setPixelRatio(Math.min(devicePixelRatio||1,1));R.setSize(W,H,false)}}
      else{
        if(now-idleLast<(LOW?240:130)){last=now;return}
        idleLast=now;
        if(idleLow!==2){idleLow=2;R.setPixelRatio(Math.min(devicePixelRatio,.6));R.setSize(W,H,false)}}
    }else if(idleLow){idleLow=0;applyQ()}
    /* clamp both ends: the first animation frame can carry a timestamp from before `last` was taken, and a
       negative dt drove the physics accumulator below zero, freezing the car until it climbed back */
    const dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;frameN++;
    if(window.PhoneController){
      const PC=window.PhoneController,on=PC.applyToKeys(key),ci=PC.currentInput||{};
      if(on){
        if(!phoneSt.on){phoneSt.on=true;toastMsg('Phone controller connected')}
        if(ci.cam&&!phoneSt.cam)cycleCam();
        if(ci.reset&&!phoneSt.reset&&SPACE.state==='earth')resetCar();
        phoneSt.cam=!!ci.cam;phoneSt.reset=!!ci.reset;
      }else if(phoneSt.on){
        // phone went quiet: let go of everything it was holding so the car does not drive off on its own
        phoneSt.on=false;key.f=key.b=key.l=key.r=key.h=key.boost=key.horn=0;toastMsg('Phone controller disconnected')}
    }
    if(SPACE.state!=='earth'){ try{SPACE.frame(dt,now);}catch(e){console.error('[space]',e);try{var b=document.getElementById('dspaceerr');if(!b){b=document.createElement('div');b.id='dspaceerr';b.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;background:rgba(150,20,20,.96);color:#fff;font:600 12px/1.45 ui-monospace,Menlo,Consolas,monospace;padding:10px 12px;white-space:pre-wrap;max-height:46vh;overflow:auto';document.body.appendChild(b);}b.textContent='SURFACE/SPACE ERROR @ state='+SPACE.state+String.fromCharCode(10)+((e&&e.stack)||(e&&e.message)||e);}catch(_){}} return; }   // space/moon takes over the frame; Earth paused
    watchFps(dt);
    /* watchdog: a countdown with no start lights to end it (or lights that never ran) must not hold the car forever */
    try{NAV.tick(dt,now)}catch(e){}
    if(window.RaceEngine&&window.RaceEngine.state==='countdown'){if(!rcSince)rcSince=now;
      const lightsRunning=MODE==='circuit'&&circuit&&circuit.lightsStart&&!circuit.lightsDone;
      if(!lightsRunning&&now-rcSince>3500||now-rcSince>9000)window.RaceEngine.startRace(now)}else rcSince=0;
    const raceHolding = (window.RaceEngine && window.RaceEngine.isHolding) || (typeof MP!=='undefined' && MP.isHolding && MP.isHolding());
    const sp=chassisB.velocity.length();
    if(active&&driving){
      const kv=v=>v===true?1:(+v>0?Math.min(1,+v):0);
      let f=key.f?1:0,b=key.b?1:0,l=kv(key.l),rr=kv(key.r);
      if(raceHolding){ f=0; b=1; chassisB.velocity.set(0,0,0); chassisB.angularVelocity.set(0,0,0); }
      // water: how far the hull is under the waterline, 0 on dry land, 1 fully submerged
      {const pd=Math.hypot(chassisB.position.x-POND.x,chassisB.position.z-POND.z),pr=pondR(chassisB.position.x,chassisB.position.z);
       sub=pd<pr*1.05?Math.max(0,Math.min(1,(WATER_Y-(chassisB.position.y-.52))/1.5)):0}
      inPond=sub>.06;
      ZN=MODE==='circuit'?{drag:0,fog:1,tint:[1,1,1]}:zoneAt(progU);const zd=ZN.drag;
      padT=Math.max(0,padT-dt);const boost=(key.boost||padT>0)?1:0;
      const eMul=(1-sub*.66)*(1-zd*.52),vmax=V.max*(1+boost*.28)*(1-sub*.68)*(1-zd*.38);
      /* Tractive force used to be flat all the way to the cap, so the car pulled just as
         hard at 90 as it did from rest and then hit a wall. This is the shape a gearbox
         actually gives you: strong off the line, tapering as the revs run out. */
      // pitch: +1 nose-down (descending), -1 nose-up. Taken from the chassis forward axis.
      const fwd=fwdScratch;fwd.set(0,0,1);chassisB.quaternion.vmult(fwd,fwd);
      const grade=Math.max(0,-fwd.y);gradeNow=grade;
      /* Tractive force. The engine is deliberately modest now — it used to be strong enough
         to reach 60 km/h in under a second, which is why the smallest touch of throttle sent
         the car flying. What it no longer has in raw grunt it gets back on a slope: climbAid
         hands the driven wheels exactly the component of weight the hill is taking away, so
         the long hill still climbs at a steady pull the way a low gear would, while flat
         ground stays civilised. Without it this engine cannot get up its own mountain. */
      const climb=Math.max(0,fwd.y);
      const climbAid=climb*chassisB.mass*Math.abs(world.gravity.y)/2;
      const sr=Math.min(1,sp/Math.max(1,vmax)),tq=f?1-.35*sr*sr:1;
      /* S/down: brakes first while you are still rolling forward, then a proper reverse gear
         (with its own hill help) instead of the engine limply fighting the car's momentum */
      const vfw=chassisB.velocity.x*fwd.x+chassisB.velocity.y*fwd.y+chassisB.velocity.z*fwd.z;
      const braking=b&&!f&&vfw>1.2;
      const revF=(b&&!f&&!braking&&vfw>-12)?(V.engine*1.3+grade*chassisB.mass*Math.abs(world.gravity.y)/2)*(1-sub*.5):0;
      const force=f?(V.engine*tq+climbAid)*(1+boost*.4)*eMul*(sp>vmax?0:1):-revF;
      if(PCAR.rev)PCAR.rev.emissiveIntensity=(b&&!f&&vfw<.8)?1.5:0;
      veh.applyEngineForce(-force,2);veh.applyEngineForce(-force,3);
      /* Downhill used to run away: engine force cuts out at V.max, but nothing opposed gravity
         on a descent, so the car kept accelerating with only the 2.2 coast brake resisting it.
         Two things fix it. A governor bleeds speed whenever we are over the cap regardless of
         what the engine is doing, and a grade term adds real engine braking proportional to how
         steep the descent is, the way a low gear would. */
      const over=Math.max(0,sp-vmax)/Math.max(1,vmax);
      const gradeBrake=grade*10*(f?0:1);         // gentle passive braking; the downhill remains driveable
      const govBrake=Math.min(18,over*42);        // scales in only once past the cap
      const coast=(f===0&&b===0)?.8:0;
      /* Brakes are plumbed the way a real car's are: front biased under normal braking,
         because that is where the weight goes when you slow down, and the handbrake on
         the rear axle only, which is what lets it rotate the car instead of just stopping it. */
      /* service brakes: a deceleration, not a fixed clamp, so a light car no longer stops dead
         and a heavy one still stops. cannon's brake value is an impulse per wheel per step. */
      const brakeImp=chassisB.mass*BRAKE_DECEL*(V.brake||1)*PSTEP/4;
      const svc=Math.max(coast,gradeBrake,govBrake,braking?brakeImp:0);
      /* handbrake: the rear wheels drag at about 0.8 g and lose their side grip (rearGrip), so the
         tail swings round instead of the car stopping dead the way the old fixed clamp made it */
      const hbImp=chassisB.mass*8*PSTEP/2;
      for(let i=0;i<4;i++){const fr=i<2;veh.setBrake(Math.max(svc*(fr?1.25:.75),key.h&&!fr?hbImp:0),i)}
      // hard ceiling: if it is still climbing past the cap, damp the velocity directly
      if(sp>vmax*1.18&&!inPond){const s=vmax*1.18/sp;chassisB.velocity.x*=s;chassisB.velocity.z*=s}
      // steeper ground => more angular damping, which is what kills the hillside wobble
      chassisB.angularDamping=.4+grade*.34;
      /* Steering input: buttons are binary, tilt is analog. Whichever the
         rider is actually using wins, so you can tap an arrow mid-corner
         without turning tilt off. */
      let steerIn=l-rr;
      if(tiltOn&&steerIn===0)steerIn=tiltSteer;
      /* Speed-aware steering. Full lock used to stay at a third of its angle at any speed, so at
         110 km/h a tap asked the tyres for 5-7 g and they gave it: the car snapped sideways like it
         was on rails. Now the angle at speed is the one this car's tyres can actually hold (its
         cornering limit, LAT_G), with a little extra so you can lean on the front and feel it
         push wide. Low speed keeps the full lock for parking and hairpins. */
      const wb=Math.max(1.6,V.zf-V.zb),aLat=latG(curCarId)*9.81*(key.h?2.2:1),vs2=Math.max(9,sp*sp);
      const stMax=Math.min(V.steer,Math.atan(wb*aLat/vs2)+.008);
      const st=steerIn*stMax;steerActual+=(st-steerActual)*Math.min(1,dt*8);veh.setSteeringValue(steerActual,0);veh.setSteeringValue(steerActual,1);
      tailM.emissiveIntensity=(b||key.h)?1.6:boost?1.2:.5;
      // cannon integrates damping as pow(1-damping,dt), so anything at or above 1 turns the whole
      // body into NaN on the next step. That was the real cause of the car "flying" over the pond.
      chassisB.linearDamping=.01+sub*.82;
      if(sub>0&&now-pondToast>6000){pondToast=now;toastMsg(sub>.6?'Wading through, take it slow':'Careful, shallow water')}
      /* Fixed 60 Hz physics with a real accumulator. cannon's own step(dt,t,n) spreads steps
         unevenly on 90-240 Hz screens, which reads as judder, so the car is stepped here and
         drawn interpolated between the last two physics states. */
      physAcc+=dt;{let n=0;while(physAcc>=PSTEP&&n<4){world.step(PSTEP);physAcc-=PSTEP;n++}if(n>=4)physAcc=0}
      const dv=tmp.set(chassisB.velocity.x,chassisB.velocity.y,chassisB.velocity.z).sub(lastV).length();lastV.set(chassisB.velocity.x,chassisB.velocity.y,chassisB.velocity.z);if(dv>7){shake=Math.min(1,dv/25);thud(Math.min(1,(dv-5)/18))}
      if(chassisB.position.y<(MODE==='circuit'?((circuit&&circuit.minY!=null?circuit.minY:CIRC_Y)-25):-9)||!isFinite(chassisB.position.y)||!isFinite(chassisB.velocity.x)){resetCar();toastMsg('Pulled you back onto the road')}
      UPV.set(0,1,0);const up=bodyUp;chassisB.quaternion.vmult(UPV,up);if(up.y<.25){flipT+=dt;if(flipT>1.8){resetCar();flipT=0;toastMsg('Back on the road, lock in')}}else flipT=0;
      if(f||b||l||rr||Math.abs(tiltSteer)>.12)idleT=0;else{idleT+=dt;if(idleT>10){idleT=-999;toastMsg(TOUCH?'Hold GAS on the right':'W to drive.')}}
      if(MODE==='world'&&frameN%4===0){let best=1e9,bi=0;for(let i=0;i<=N;i+=2){const d=(SAMP[i].x-chassisB.position.x)**2+(SAMP[i].z-chassisB.position.z)**2;if(d<best){best=d;bi=i}}const u=bi/N;if(best<60&&(u>progU||u<progU-.5))progU=u;prog.geometry.setDrawRange(0,Math.floor(progU*N)*6);if(frameN%16===0)lamps.forEach(L=>{L.bulb.material.color.setHex(L.u<=progU?0xf2eee6:0x3a3733)});
        const summitD=Math.hypot(car.position.x-PEAK.x,car.position.z-PEAK.z);
        const wasSummit=atSummit;atSummit=summitD<12;recapCam=atSummit;
        if(atSummit&&!wasSummit){summitMoodBack=CHMOOD[act]||'day';if(!nightOn)mood('dusk',5);blip(600,.16,.08);toastMsg('The summit')}
        else if(!atSummit&&wasSummit){if(summitMoodBack){if(!nightOn)mood(summitMoodBack,4);summitMoodBack=null}}
        /* the sky settles into each stretch of the road as you drive into it */
        {let a=0;for(let k=0;k<ACTS.length;k++)if(progU>=ACTS[k][0]-.028)a=k;
         if(a!==act){act=a;if(!nightOn)mood(CHMOOD[a],6);chapEase=1}}}
      /* ---- missions (world only - circuit has no missions in this pass) ---- */
      if(MODE==='world'){const mc=curMission();
       if(sub>.45)missSet('swim',1);
       if(frameN%12===0&&mc&&mc.id==='cones'){let k=0;coneBodies.forEach(c=>{if(Math.hypot(c.b.position.x-c.x,c.b.position.z-c.z)>1.5||c.b.position.y<.34)k++});if(k>0)missSet('cones',k)}
       // airtime
       let airborne=true;for(let i=0;i<veh.wheelInfos.length;i++)if(veh.wheelInfos[i].isInContact){airborne=false;break}
       if(airborne&&sp>4&&sub<.1){airT+=dt;if(airT>1)missSet('air',1)}else airT=0;
       if(sp>6)for(const r of RAMPS)if(!rampHit.has(r.id)&&Math.hypot(r.x-car.position.x,r.z-car.position.z)<4){rampHit.add(r.id);missSet('ramps',rampHit.size)}}
      /* ---- circuit lap tracking ---- */
      if(MODE==='circuit'&&circuit){
        // start-light sequence: five reds build up one every ~0.5s, hold, then all go out = GO
        /* start sequence: 3 -> 2 -> 1 -> GO, one second each, on one clock. The big numbers and the gantry lights
           both follow it, the car is held until GO, and the race timer starts at GO (RaceEngine.startRace). */
        if(circuit.lights&&!circuit.lightsDone&&circuit.lightsStart){const L=circuit.lights,e=Math.max(0,(now-circuit.lightsStart)/1000),RE=window.RaceEngine,counting=RE&&RE.state==='countdown';   // frame time can trail the moment the grid was set
          let on;
          if(e<3){on=Math.min(5,Math.floor(e/.6)+1);const n=3-Math.floor(e);if(counting&&n!==circuit.cdN){circuit.cdN=n;bigCount(String(n));blip(520,.14,.1)}}
          else{on=-1;circuit.lightsDone=true;
            if(counting){RE.startRace(now);bigCount('GO');blip(1040,.35,.14)}}
          if(L.setColorAt){for(let i=0;i<5;i++)L.setColorAt(i,new THREE.Color(on<0?0x12a52a:(i<on?0xff1e0a:0x3a0e0e)));if(L.instanceColor)L.instanceColor.needsUpdate=true}}
        let best=1e9,bi=0;const {CSAMP,CN}=circuit;
        for(let i=0;i<CN;i++){const dx=CSAMP[i].x-chassisB.position.x,dz=CSAMP[i].z-chassisB.position.z,d=dx*dx+dz*dz;if(d<best){best=d;bi=i}}
        const u=bi/CN;
        {const racing=window.RaceEngine&&window.RaceEngine.active;      // a race has its own respawn (RaceEngine.checkTrackBoundaries)
         if(!racing&&Math.sqrt(best)>CIRC_W/2+BARRIER_OFF+8){circOffT+=dt;if(circOffT>1.2){circOffT=0;const q=circAt(u,circuit.curve);resetCarTo({pos:q.p,tangent:q.tg});toastMsg('Back on track')}}else circOffT=0}
        if(circU0<0){circU0=u;circLapT0=now}
        else{if(circU0>.82&&u<.18&&!(window.RaceEngine&&window.RaceEngine.active)&&!(typeof MP!=='undefined'&&MP.on)){circLap++;const t=now-circLapT0;circLapT0=now;
            if(!circBest||t<circBest)circBest=t;
            earnCoins(10);
            toastMsg('Lap '+circLap+' · '+fmtT(t)+' · +10 coins')}
          circU0=u}
        if(frameN%45===0&&circuit.hazeTo)circuit.hazeTo(S.fog.color);   // follow weather/time-of-day fog changes
        if(frameN%20===0)hint.textContent='Circuit · lap '+(circLap+1)+(circBest?' · best '+fmtT(circBest):'')+' · Track button to leave'}
      CAI.update(dt,now);
      if(window.RaceEngine && window.RaceEngine.active){
        window.RaceEngine.update(now, dt, {
          pos: chassisB.position,
          vel: chassisB.velocity,
          MODE,
          circuit,
          car,
          chassisB,
          peers: (typeof MP!=='undefined' && MP.getPeers)?MP.getPeers():null
        });
      }
      /* ---- lap timing ---- */
      if(raceMode&&MODE==='world'){
        // the ramp yard is off the timed circuit, so treat it exactly like being off-road
        const rn0=roadNear(car.position.x,car.position.z);
        const rn=rn0.branch?{d:99,u:lapU}:rn0;
        if(!lapInit){lapU=rn.u;lapInit=true}
        let du=rn.u-lapU;const wrapFwd=du<-.5,wrapBack=du>.5;
        if(wrapFwd)du+=1;else if(wrapBack)du-=1;
        if(Math.abs(du)<.06&&rn.d<16+RWX*1.5)lapProg+=du;
        lapU=rn.u;
        if(rn.d>18+RWX*1.5){offT+=dt;if(offT>2&&!lapVoid&&!lapArmed){lapVoid=true;lapEl.classList.add('void');toastMsg('Lap scrubbed · stay on the road')}}
        else offT=Math.max(0,offT-dt*.6);
        if(wrapFwd){
          if(lapArmed){lapArmed=false;lapStart=now;lapNo=1;lapProg=0;lapVoid=false;offT=0;lapEl.classList.remove('void');blip(820,.2);toastMsg('Go')}
          else{const ms=now-lapStart;
            if(!lapVoid&&lapProg>.88&&ms>12000)lapDone(ms);
            else if(lapVoid)toastMsg('Lap scrubbed · going again');
            lapStart=now;lapNo++;lapProg=0;lapVoid=false;offT=0;lapEl.classList.remove('void')}}
        // checkpoint validation
        checkCheckpoints(wrapFwd);
        if(frameN%4===0&&!lapArmed){lapT.textContent=fmtT(now-lapStart);lapN.textContent='Lap '+lapNo;
          for(let i=0;i<lapSecs.length;i++)lapSecs[i].classList.toggle('on',lapProg>(i+1)*.25-.25)}}
      if(AC&&SND){
        const S=SND,T=AC.currentTime,vv=chassisB.velocity,spq=isFinite(sp)?sp:0,
          vf=vv.x*fwdScratch.x+vv.y*fwdScratch.y+vv.z*fwdScratch.z,r=Math.min(1.35,Math.abs(vf)/V.max),rev=vf<-.5,
          regen=b&&vf>1.5,load=f?1:regen?.55:(rev&&b)?.8:.1;let air=true;for(let i=0;i<4;i++)if(veh.wheelInfos[i].isInContact)air=false;
        S.bus.gain.setTargetAtTime(muted?0:.9,T,.03);
        S.tone.frequency.setTargetAtTime(sub>.05?420:18000,T,.12);
        {
          /* engine: every car has its own voice (ENGINES) */
          const E=engineVoice(S,curCarId,T);
          S.ld+=(load-S.ld)*Math.min(1,dt*6);
          let rpm;
          if(E.ev){rpm=Math.min(1.25,r+(air&&f?.15:0)+(boost?.08:0))}
          else{
            /* gearbox: speed picks the gear, revs climb through it and fall back on the upshift */
            const G=E.gears,x=Math.min(1,r)*G;let gi=Math.min(G-1,Math.floor(x));
            if(gi<S.gear-1||gi>S.gear)S.gear=gi;else if(gi>S.gear&&x-gi>.08)S.gear=gi;   // a little hysteresis
            const frac=Math.min(1,x-S.gear);
            rpm=S.gear===0?frac:.42+.58*frac;
            if(f&&(air||r<.04))rpm=Math.max(rpm,.32+.2*Math.sin(now*.004));        // revving with no grip / standing start
            if(rev)rpm=Math.min(.8,r*G*.9);
            rpm=Math.min(1.08,rpm+(boost?.05:0))}
          S.rpm=(S.rpm||0)+(rpm-(S.rpm||0))*Math.min(1,dt*(rpm<S.rpm?14:9));
          const hz=E.lo+S.rpm*(E.hi-E.lo);
          S.m1.frequency.setTargetAtTime(hz,T,.03);S.m2.frequency.setTargetAtTime(hz*.5,T,.03);S.m3.frequency.setTargetAtTime(hz*E.h,T,.03);
          S.mF.frequency.setTargetAtTime(E.filt[0]+E.filt[1]*(S.rpm*.6+S.ld*.4),T,.05);
          const idle=E.ev?.015:.32;   // combustion engines tick over, EVs go almost quiet
          S.mG.gain.setTargetAtTime(muted?0:E.vol*(idle+(1-idle)*Math.min(1,S.ld*.75+S.rpm*.45)),T,.04);
          if(E.turbo){S.tO.frequency.setTargetAtTime((E.turboHz||1800)+S.rpm*2600,T,.08);S.tG.gain.setTargetAtTime(muted?0:E.turbo*S.ld*S.rpm*S.rpm,T,.12)}
          else S.tG.gain.setTargetAtTime(0,T,.1);
          const ground=air?0:Math.min(1,spq/V.max),off=offD>7+RWX?1:0;
          S.rF.frequency.setTargetAtTime(200+ground*1000,T,.1);
          S.rG.gain.setTargetAtTime(ground*(off?.05:.09),T,.1);
          S.gG.gain.setTargetAtTime(ground*off*.075,T,.1);
          const wv=Math.max(0,spq/V.max-.2);S.wG.gain.setTargetAtTime(Math.min(.075,wv*wv*.13),T,.15);S.wF.frequency.setTargetAtTime(480+spq*20,T,.2);
          let sk=0;for(let i=0;i<4;i++){const w=veh.wheelInfos[i];if(w.isInContact)sk=Math.max(sk,1-(w.skidInfo==null?1:w.skidInfo))}if(key.h&&spq>5)sk=Math.max(sk,.75);
          sk=(spq<4||sub>.05||off)?0:Math.max(0,sk-.15)/.85;
          S.sG.gain.setTargetAtTime(Math.min(.18,sk*.22),T,.03);
          S.s1.frequency.setTargetAtTime(960+Math.random()*150+spq*4,T,.03);S.s2.frequency.setTargetAtTime(2100+Math.random()*240,T,.03)
        }
        honk(!!key.horn);
      }else{if(AC&&SND){const T=AC.currentTime;[SND.mG,SND.rG,SND.gG,SND.wG,SND.sG,SND.tG].forEach(g=>g&&g.gain.setTargetAtTime(0,T,.06))}honk(false)}
    }
    {const cp=chassisB.position,pp=PREV.p,dx=cp.x-pp.x,dy=cp.y-pp.y,dz=cp.z-pp.z;
     if(active&&driving&&PREV.ok&&dx*dx+dy*dy+dz*dz<36){const a=Math.min(1,physAcc/PSTEP);
       car.position.set(pp.x+dx*a,pp.y+dy*a,pp.z+dz*a);
       qA.set(PREV.q.x,PREV.q.y,PREV.q.z,PREV.q.w);qB.set(chassisB.quaternion.x,chassisB.quaternion.y,chassisB.quaternion.z,chassisB.quaternion.w);
       car.quaternion.copy(qA).slerp(qB,a)}
     else{car.position.copy(cp);car.quaternion.copy(chassisB.quaternion)}}
    /* body lean: the shell rolls out of a corner and squats or dives with the throttle,
       a couple of degrees at most. Purely visual, the physics body never moves. */
    if(active&&driving){
      leanF.set(0,0,1);chassisB.quaternion.vmult(leanF,leanF);
      const v=chassisB.velocity,vf=v.x*leanF.x+v.y*leanF.y+v.z*leanF.z;
      const aL=(vf-leanVf)/Math.max(dt,.004);leanVf=vf;leanA+=(aL-leanA)*(1-Math.exp(-dt*6));
      let grounded=0;for(let i=0;i<4;i++)if(veh.wheelInfos[i].isInContact)grounded++;
      const k=grounded>=3?1:0,isBikeV=V.label==='Phantom Bike',
        // cars roll a touch outward; the bike leans into the turn, more with speed, up to ~30 degrees
        rollT=isBikeV?Math.max(-.52,Math.min(.52,-chassisB.angularVelocity.y*Math.min(1,Math.abs(vf)/25)*.55))*(grounded>=2?1:0)
                     :Math.max(-.075,Math.min(.075,chassisB.angularVelocity.y*vf*.0042))*k,pitchT=Math.max(-.05,Math.min(.05,-leanA*.006))*k;
      const e=1-Math.exp(-dt*7);vis.body.rotation.z+=(rollT-vis.body.rotation.z)*e;vis.body.rotation.x+=(pitchT-vis.body.rotation.x)*e;
      /* skid marks from the rear tyres when they let go, or on the handbrake */
      if(sp>3&&sub<.05)for(let i=2;i<4;i++){const w=veh.wheelInfos[i],rr=w.raycastResult;
        if(!w.isInContact||!rr||!rr.hitPointWorld)continue;
        if(!(w.skidInfo<.8||(key.h&&sp>5))){skLast[i]=null;continue}
        const hp=rr.hitPointWorld,nw=rr.hitNormalWorld;
        if(skLast[i]&&(hp.x-skLast[i].x)**2+(hp.z-skLast[i].z)**2<.16)continue;
        skLast[i]={x:hp.x,z:hp.z};
        skN.set(nw.x,nw.y,nw.z);if(skN.y<.5)skN.set(0,1,0);
        const q=chassisB.quaternion,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
        skQ.setFromUnitVectors(skUp,skN);skQ2.setFromAxisAngle(skUp,yaw);skQ.multiply(skQ2);
        skP.set(hp.x+skN.x*.035,hp.y+skN.y*.035,hp.z+skN.z*.035);skM.compose(skP,skQ,skS);
        skid.setMatrixAt(skI,skM);skI=(skI+1)%SKN;skid.count=Math.min(SKN,skid.count+1);skid.instanceMatrix.needsUpdate=true}}
    if(active&&driving){const cp=car.position;
      padCool=Math.max(0,padCool-dt);
      if(padList.mat)padList.mat.opacity=.6+.3*Math.sin(now/170);
      if(padCool<=0)for(let i=0;i<padList.length;i++){const Q=padList[i],dx=Q.x-cp.x,dz=Q.z-cp.z;
        if(dx*dx+dz*dz<2.7*2.7&&Math.abs(Q.y-cp.y)<2.5){padT=1.6;padCool=1.2;
          leanF.set(0,0,1);chassisB.quaternion.vmult(leanF,leanF);chassisB.velocity.x+=leanF.x*5;chassisB.velocity.z+=leanF.z*5;
          shake=Math.max(shake,.3);blip(980,.16,.1);setTimeout(()=>blip(1320,.2,.08),90);break}}}
    if(sub>0&&active){car.position.y-=sub*.3;ripple.position.set(car.position.x,WATER_Y+.05,car.position.z);ripple.material.opacity=Math.min(.55,sp/9)*sub;ripple.scale.setScalar(1.7+(now/300)%1.3)}else ripple.material.opacity=0;
    waterNorm.offset.set(now/26000,now/17000);
    // wheels
    const wi=veh.wheelInfos,wl=wv.car;
    const isBike=V.label==='Phantom Bike';
    const isTruck=V.label==='Titan Hauler';
    const visualWheelCount=isBike?2:isTruck?6:4;
    wl.forEach((k,i)=>{if(i>=visualWheelCount)return;
      /* physics has 4 wheels; extra visual wheels (truck's second rear axle) follow the rear pair, one wheel-width further forward */
      const j=isBike?i*2:i<wi.length?i:2+(i%2),w=wi[j];if(!w)return;const c=w.chassisConnectionPointLocal,dz=isBike||i<wi.length?0:V.r*2.3;
      /* the wheel picture may rise only ~6 cm above its resting place: physics can compress the spring by up to the
         full rest length on bumps and landings, and drawn that far up the tyre comes out through the wing */
      k.w.position.set(isBike?0:c.x*.9,.05-Math.max(w.suspensionLength,V.rest-.13),c.z+dz);k.w.rotation.set(0,j<2?w.steering:0,0);k.spin.rotation.x=w.rotation});
    if(active&&MP.on)MP.tick(now,dt);
    if(frameN%10===0){
      const isNight=nightOn || (wxLock==='night') || (wxB.id==='night');
      const ni=isNight ? 1.8 : Math.max(0,Math.min(1.8,(.85-sun.intensity)*3.2));
      if(carHL)carHL.intensity=ni;
      headM.emissiveIntensity=1+ni*.5;
      npcHeadM.emissiveIntensity=.9+ni*.6;
      if(beams){const o=Math.min(.5,ni*.3);beams.m.opacity=o;beams.list.forEach(b=>b.visible=o>.02)};
      CLOUDM.opacity=.2+.6*Math.min(1,sun.intensity);
      // night gameplay effects
      if(isNight && !nightOn){
        nightOn=true;
        if(wxLock!=='night')toastMsg('Night driving · headlights required');
      }else if(!isNight && nightOn){
        nightOn=false;
      }
    }
    if(active)for(let i=0;i<dyn.length;i++){const d=dyn[i];if(d.body.sleepState===2&&frameN%30)continue;d.mesh.position.copy(d.body.position);d.mesh.quaternion.copy(d.body.quaternion);if(d.body.position.y<-5){d.body.position.copy(d.home);d.body.quaternion.copy(d.q);d.body.velocity.set(0,0,0);d.body.angularVelocity.set(0,0,0)}}
    if(active&&dynI.length){dynITouched.clear();
      for(let i=0;i<dynI.length;i++){const d=dynI[i];if(d.body.sleepState===2&&frameN%30)continue;
        if(d.body.position.y<-5){d.body.position.copy(d.home);d.body.quaternion.copy(d.q);d.body.velocity.set(0,0,0);d.body.angularVelocity.set(0,0,0)}
        dynIP.set(d.body.position.x,d.body.position.y,d.body.position.z);
        dynIQ.set(d.body.quaternion.x,d.body.quaternion.y,d.body.quaternion.z,d.body.quaternion.w);
        dynIM.compose(dynIP,dynIQ,dynIS);
        d.parts.forEach(p=>{p.im.setMatrixAt(p.idx,p.offset?dynIM2.multiplyMatrices(dynIM,p.offset):dynIM);dynITouched.add(p.im)})}
      dynITouched.forEach(im=>im.instanceMatrix.needsUpdate=true)}
    const tt=now/1000;
    if(active&&driving&&MODE==='world'){
      updTraffic(dt,now);
      updateAIRacers(dt,now);
    }
    if(active&&MODE==='world'){WORLDFX(dt,now);WORLD2(dt,now)}
    // the lamps only need repainting a few times a second to read as changing
    if(active&&frameN%5===0)updLights(now/1000);
    if(active)birds.forEach(b=>{b.a+=dt*b.sp;const x=POND.x+Math.cos(b.a)*b.r,z=POND.z+Math.sin(b.a)*b.r;b.g.position.set(x,b.y+Math.sin(tt*.6+b.a)*.6,z);b.g.rotation.y=-b.a+Math.PI/2;const fl=Math.sin(tt*9+b.a)*.9;b.wL.rotation.z=fl;b.wR.rotation.z=-fl});
    if(active)for(let ci=0;ci<critters.length;ci++){const c=critters[ci];
      const near2=active?Math.hypot(car.position.x-c.g.position.x,car.position.z-c.g.position.z):999;
      if(near2<16&&c.state!=='flee'&&sp>3){c.state='flee';c.t=2.5+Math.random()*2;
        const ax=c.g.position.x-car.position.x,az=c.g.position.z-car.position.z,al=Math.hypot(ax,az)||1;
        c.tgt.x=c.g.position.x+ax/al*26;c.tgt.z=c.g.position.z+az/al*26}
      c.t-=dt;
      if(c.t<=0){
        if(c.state==='graze'){c.state='walk';const a=Math.random()*6.283,d=4+Math.random()*9;
          c.tgt.x=c.herd.x+Math.cos(a)*d;c.tgt.z=c.herd.z+Math.sin(a)*d;c.t=4+Math.random()*4}
        else{c.state='graze';c.t=4+Math.random()*7}}
      const want=c.state==='flee'?5.6:c.state==='walk'?1.3:0;
      c.spd+=(want-c.spd)*Math.min(1,dt*3);
      if(c.spd>.05){const dx=c.tgt.x-c.g.position.x,dz=c.tgt.z-c.g.position.z,dd2=Math.hypot(dx,dz);
        if(dd2>.6){const tRy=Math.atan2(dx,dz);let rel=tRy-c.ry;rel=Math.atan2(Math.sin(rel),Math.cos(rel));
          c.ry+=rel*Math.min(1,dt*(c.state==='flee'?4.5:2.4));c.g.rotation.y=c.ry;
          let nx2=c.g.position.x+Math.sin(c.ry)*c.spd*dt,nz2=c.g.position.z+Math.cos(c.ry)*c.spd*dt;
          nx2=Math.max(-128*MK,Math.min(128*MK,nx2));nz2=Math.max(-128*MK,Math.min(128*MK,nz2));
          c.g.position.set(nx2,HF.h(nx2,nz2),nz2)}
        else if(c.state!=='graze'){c.state='graze';c.t=3+Math.random()*5}
        c.legs.forEach((lg,li)=>{lg.rotation.x=Math.sin(tt*(c.state==='flee'?12:5.5)+li*Math.PI/2)*(c.state==='flee'?.75:.42)})}
      else c.legs.forEach(lg=>{lg.rotation.x*=.9});
      // head down in the grass when settled, up and watching when something is moving
      const nk=c.state==='graze'?1.02+Math.sin(tt*1.4+ci)*.07:c.state==='flee'?-.12:.3;
      c.neck.rotation.z+=(nk-c.neck.rotation.z)*Math.min(1,dt*3.5);
      c.tail.rotation.x=Math.sin(tt*2+ci)*.2}
    if(active)ducks.forEach(d=>{d.a+=dt*d.sp;const x=POND.x+Math.cos(d.a)*d.r,z=POND.z+Math.sin(d.a)*d.r;
      d.g.position.set(x,WATER_Y+.1+Math.sin(tt*1.7+d.bob)*.03,z);d.g.rotation.y=-d.a+(d.sp>0?Math.PI/2:-Math.PI/2);
      d.g.rotation.z=Math.sin(tt*2.2+d.bob)*.05});
    if(frameN%8===0){const cx=car.position.x,cz=car.position.z;
      for(let i=0;i<CULL.length;i++){const G=CULL[i];const dx=G.position.x-cx,dz=G.position.z-cz;G.visible=dx*dx+dz*dz<10200}}
    if(active&&parts.visible&&frameN%2===0){const pa=pGeo.attributes.position.array,ps=PSTYLE[wxB.id]||PSTYLE[wx.part==='leaves'?'autumn':wx.part]||PSTYLE.snow,fall=ps.fall,wind=ps.wind;const PN=pGeo.drawRange.count||PCOUNT;for(let i=0;i<PN;i++){const j=i*3;pa[j+1]-=fall*dt*2;if(wx.part!=='rain'||wind){pa[j]+=Math.sin(tt+i)*dt*1.6;pa[j+2]+=Math.cos(tt*.7+i)*dt*1}if(wind){pa[j]+=wind*dt*2*(.7+(i%5)*.15);if(pa[j]>45)pa[j]-=90}if(pa[j+1]<0)pa[j+1]+=40}pGeo.attributes.position.needsUpdate=true;parts.position.set(Math.round(car.position.x/10)*10,car.position.y-4,Math.round(car.position.z/10)*10)}
    /* Earth "wrong way": only when there is a right way, i.e. a timed lap or a room race on the valley loop, and only
       while the car is actually on the main loop (not the branch, the ring road or a drawn track, whose direction this
       loop says nothing about). Must hold for a second, so a moment of sliding or a three-point turn doesn't trip it. */
    if(active){
      const lapRace=MODE==='world'&&(raceMode||(typeof MP!=='undefined'&&MP.on&&MP.state.race.st===2));
      let against=false;
      if(lapRace&&sp>5&&!inPond){if(frameN%6===0){const rn=roadNear(car.position.x,car.position.z);wrongMain=!rn.branch&&!rn.ring&&rn.d<9+RWX}
        if(wrongMain){const tg=at(progU).tg;fwd.set(0,0,1).applyQuaternion(car.quaternion);against=(fwd.x*tg.x+fwd.z*tg.z)<-.55}}
      wrongT=against?wrongT+dt:Math.max(0,wrongT-dt*2);
      wrongEl.classList.toggle('on',wrongT>1)}
    stepWx(Math.min(.05,dt));
    fwd.set(0,0,1).applyQuaternion(car.quaternion);fwd.y=0;fwd.normalize();
    /* Camera. Every smoothing constant here is an exponential on dt rather than a fixed
       fraction per frame, so the follow feels identical at 30 fps and at 144 instead of
       snapping on fast machines and swimming on slow ones. The aim point is smoothed
       separately from the position, which is what takes the last of the jitter out of the
       horizon; the body rolls a degree or so into a turn; and driving into a new stretch
       eases the camera back a little and opens the lens for a second, without ever taking
       the car away from you. */
    if(!cineOn&&!recapCam){
      if(chapEase>0)chapEase=Math.max(0,chapEase-dt*.7);
      const ce=chapEase*chapEase*(3-2*chapEase);
      const effCamMode = lookBehind ? 3 : camMode;
      const CM=CAMS[effCamMode],pf=W<H?1.5:1;
      const camDir = lookBehind ? tmp.copy(fwd).negate() : fwd;
      if(PCAR&&PCAR.glass&&PCAR.glassOff!==!!CM.fp){PCAR.glassOff=!!CM.fp;PCAR.glass.forEach(m=>m.visible=!CM.fp)}   // no tinted screen in front of a cockpit view
      if(CM.fp){/* bonnet and bumper cams ride on the car itself */
        const fp=CM.n==='Bumper'?FP.bumper:FP.bonnet,fy=fp.y+FP.off;
        camT.set(0,fy,fp.z).applyQuaternion(car.quaternion).add(car.position);C.position.copy(camT);
        lookT.set(0,fy-.25,fp.z+18).applyQuaternion(car.quaternion).add(car.position)}
      else{const dist=(CM.d+Math.min(5,sp*.2)*CM.k+ce*1.9)*pf,hgt=(CM.h+Math.min(2,sp*.07)*CM.k+ce*.7)*pf;
        camT.copy(car.position).addScaledVector(fwd,-dist).add(tmp.set(0,hgt,0));
        C.position.lerp(camT,1-Math.exp(-dt*(active?CM.lag:3.2)));
        lookT.copy(car.position).addScaledVector(fwd,CM.ahead).add(tmp.set(0,CM.ly,0))}
      if(shake>.01){lookT.x+=(Math.random()-.5)*shake*.3;lookT.y+=(Math.random()-.5)*shake*.3;shake*=Math.pow(.08,dt)}
      if(CAMS[effCamMode].fp)look.copy(lookT);else look.lerp(lookT,1-Math.exp(-dt*9));
      C.lookAt(look);
      const st0=veh.wheelInfos[0]?veh.wheelInfos[0].steering:0;
      camRoll+=(-st0*Math.min(1,sp/16)*.085-camRoll)*(1-Math.exp(-dt*5));
      if(Math.abs(camRoll)>.0005)C.rotateZ(camRoll);
      const tf=CAMS[camMode].fov+Math.min(10,sp*.35)-ce*2.6;
      if(Math.abs(C.fov-tf)>.02){C.fov+=(tf-C.fov)*(1-Math.exp(-dt*3.2));C.updateProjectionMatrix()}}
    else if(recapCam){
      // parked at the summit: swing the camera round behind the car so the low sun stays in frame
      camT.copy(car.position).addScaledVector(SUN_DIR_LOW,-15).add(tmp.set(0,6.5,0));
      C.position.lerp(camT,1-Math.exp(-dt*1.1));
      lookT.copy(car.position).addScaledVector(SUN_DIR_LOW,45).add(tmp.set(0,2.5,0));
      look.lerp(lookT,1-Math.exp(-dt*1.4));
      C.lookAt(look);
      if(Math.abs(camRoll)>.0005){camRoll*=Math.exp(-dt*4)}
      if(Math.abs(C.fov-42)>.02){C.fov+=(42-C.fov)*(1-Math.exp(-dt*2));C.updateProjectionMatrix()}}
    const sunOff=recapCam?SUN_OFF_LOW:SUN_OFF_DEFAULT;
    {const d=shD.copy(sunOff).normalize(),r=shR.set(0,1,0).cross(d).normalize(),u=shU.copy(d).cross(r),tx=60/(sun.shadow.mapSize.x||1024),p=car.position;
     const a=Math.round((p.x*r.x+p.y*r.y+p.z*r.z)/tx)*tx,b=Math.round((p.x*u.x+p.y*u.y+p.z*u.z)/tx)*tx,c=p.x*d.x+p.y*d.y+p.z*d.z;
     sun.target.position.set(r.x*a+u.x*b+d.x*c,r.y*a+u.y*b+d.y*c,r.z*a+u.z*b+d.z*c);
     sun.position.copy(sun.target.position).add(sunOff)}
    sky.position.copy(C.position);stars.position.copy(C.position);stars.rotation.y+=dt*.0015;
    /* ---------- night sky: twinkle, moon, the odd shooting star ---------- */
    starMat.uniforms.uTime.value+=dt;
    moon.position.copy(C.position).addScaledVector(MOON_DIR,250);
    {const lit=wx.star>.12;
     if(!lit){shoot.next=3+Math.random()*8;if(shootL.visible){shootL.visible=false;shootMat.opacity=0}}
     else if(shoot.dur>0){
       shoot.t+=dt;const k=shoot.t/shoot.dur;
       if(k>=1){shoot.dur=0;shootL.visible=false;shootMat.opacity=0;shoot.next=5+Math.random()*11}
       else{
         const a=shootGeo.attributes.position.array;
         // head runs along the path, tail trails behind it
         const hx=shoot.from.x+shoot.dir.x*k*170,hy=shoot.from.y+shoot.dir.y*k*170,hz=shoot.from.z+shoot.dir.z*k*170;
         a[0]=C.position.x+hx;a[1]=hy;a[2]=C.position.z+hz;
         a[3]=C.position.x+hx-shoot.dir.x*26;a[4]=hy-shoot.dir.y*26;a[5]=C.position.z+hz-shoot.dir.z*26;
         shootGeo.attributes.position.needsUpdate=true;
         shootMat.opacity=Math.sin(k*Math.PI)*.85*wx.star}}
     else{
       shoot.next-=dt;
       if(shoot.next<=0){
         const th=Math.random()*6.283,ph=.35+Math.random()*.5,r=250;
         shoot.from.set(Math.sin(ph)*Math.cos(th)*r,Math.cos(ph)*r*.8+70,Math.sin(ph)*Math.sin(th)*r);
         shoot.dir.set(-Math.cos(th)*.7+(Math.random()-.5)*.5,-.35-Math.random()*.3,-Math.sin(th)*.7+(Math.random()-.5)*.5).normalize();
         shoot.t=0;shoot.dur=.55+Math.random()*.45;shootL.visible=true}}}
    sunSprite.position.copy(car.position).addScaledVector(recapCam?SUN_DIR_LOW:SUN_DIR,260);
    dust.position.set(car.position.x,0,car.position.z);dust.rotation.y+=dt*.02;
    if(active&&frameN%3===0){spdS+=(sp*3.6-spdS)*.4;spd.textContent=String(Math.round(spdS)).padStart(3,'0')}
    // the shadow map is only redrawn as often as the current tier asks for
    /* the light of the current stretch. Captured once the weather has set its own values, then pulled
       toward whatever band of the loop the car is in. */
    {const z=ZN,e=.08;
     // a custom venue is open ground out to the mountains, so clear weather there gets a much longer view than the tight valley map
     const fk=MODE==='circuit'&&fogFar0>=200?3.6:1,fn=fk>1?2.4:1;
     S.fog.far+=(fogFar0*z.fog*fk-S.fog.far)*e;S.fog.near+=(fogNear0*Math.min(1,z.fog)*fn-S.fog.near)*e;
     const lt=(z.tint[0]+z.tint[1]+z.tint[2])/3;
     if(wxB.id==='storm'){ltT-=dt;if(ltT<=0){ltT=2.5+Math.random()*7;flashV=1;thunderAt=now+300+Math.random()*1800}}
     if(flashV>0){flashV=Math.max(0,flashV-dt*(flashV>.6?3:2.2));if(flashV<.35&&Math.random()<.35)flashV=Math.min(1,flashV+.5*Math.random())}
     if(thunderAt&&now>=thunderAt){thunderAt=0;thud(.9)}
     hemi.intensity+=((hemi0*lt+flashV*1.5)-hemi.intensity)*(flashV>.02?.7:e);sun.intensity+=(sunI0*Math.min(1.25,lt)-sun.intensity)*e}
    /* the car's own shadow has to be redrawn every frame while it moves, or it trails behind the car and jumps when
       the map is next refreshed; a parked car only needs the slower refresh. The lowest quality tier halves it. */
    if(R.shadowMap.enabled){const se=ULTRA.shEvery,moving=chassisB.velocity.length()>.4||Math.abs(chassisB.angularVelocity.y)>.05,every=moving?(qTier>=2?2:1):se;
      if(every&&frameN%every===0)sun.shadow.needsUpdate=true}
    /* reflections are captured whole, only when the light changes or you have driven somewhere new:
       no per-frame cost, and no half-updated cube that flickers as you move */
    if(cubeCam&&active&&(!cubeInit||(frameN%90===0&&(Math.abs(sun.intensity-cubeSun)>.12||Math.hypot(car.position.x-cubeX,car.position.z-cubeZ)>140)))){
      cubeCam.position.set(car.position.x,car.position.y+1.6,car.position.z);cubeCam.updateMatrixWorld();hideCars(false);cubeCam.update(R,S);hideCars(true);
      cubeInit=true;cubeSun=sun.intensity;cubeX=car.position.x;cubeZ=car.position.z}
    if(active){ANOMALY.update(dt,now);SPACE.updateEarth()}
    R.render(S,C);if(active&&frameN%6===0)drawMap(mx2,mm.width,false);
    /* ---------- rearview mirror PIP ---------- */
    if(rearMirrorOn&&active&&driving&&!cineOn)renderMirror(S,car.position,car.quaternion,FP.off);
    /* Grab the still immediately after the draw, in this same frame: the drawing buffer
       is not preserved past the end of it, so this is the only moment it can be read. */
    if(!active&&posterState===0&&++posterWarm>=4){
      try{const url=cv.toDataURL('image/jpeg',.86);
        if(url&&url.length>2048){poster.src=url;poster.style.display='block';posterState=1}
        else posterState=2}
      catch(e){posterState=2}}
  }
  {const an=Math.min(8,R.capabilities&&R.capabilities.getMaxAnisotropy?R.capabilities.getMaxAnisotropy():1);
   if(an>1)S.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
     ms.forEach(m=>{if(m.map&&m.map.anisotropy<an){m.map.anisotropy=an;m.map.needsUpdate=true}})})}
  /* ---------- circuit mode: draw a closed loop, race on it ----------
     First slice only (see ROADMAP.md): freehand draw -> validate (closed, no self-intersection,
     no too-sharp corners, big enough) -> smoothed closed curve -> asphalt ribbon + one flat
     static ground plate under the whole thing, built far outside the main map so nothing
     overlaps it. Sky/stars/moon/sun all already re-anchor to the camera every frame (see
     loop() above), so placing the arena anywhere in X/Z needs no other change - deliberately
     NOT using the y=900 elevated-platform idea from the original notes, since XZ offset alone
     is already proven safe by that same camera-relative code and needed zero new setup.
     Off-road here is a logical distance-to-centerline check, same as the main map - there is
     no separate curb collision, just the one ground plate, so the car can never fall through.
     AI, checkpoints/anti-cheat, saved circuits, Short/Medium/Long length choice and multiplayer
     circuits are NOT in this pass. */
  const CIRC_X=0,CIRC_Y=40,CIRC_LEN=2400;
  let CIRC_Z=-(WS+500),circOffT=0;             // moved per build so even a 3.6 km venue stays clear of the main world
  let CIRC_W=16;
  const BARRIER_OFF=4.6;           // track-limit barrier, metres beyond the road edge (curbs and runoff sit inside it)
  /* drawn-track options. Sizes are lap lengths: the old fixed 420 m made every drawing a go-kart loop. */
  const CIRC_SIZES={medium:1600,large:2400,huge:3600};
  const CIRC_ELEV={flat:0,rolling:5,hilly:12,mountain:22};   // peak height change around the lap, metres
  let circuit=null,worldSave=null,circU0=-1,circLap=0,circLapT0=0,circBest=null,worldFogSave=null,worldGSave=null,worldWeatherSave=null;
  function circAt(u,curve){u=((u%1)+1)%1;const p=curve.getPointAt(u).clone();const tg=curve.getTangentAt(u);const hl=Math.hypot(tg.x,tg.z)||1;return {p,tg,n:new THREE.Vector3(-tg.z/hl,0,tg.x/hl)}}
  function circStrip(curve,Nseg,w,yo,mat,rep,hFn){const pos=[],idx=[],uv=[];
    for(let i=0;i<=Nseg;i++){const {p,n}=circAt(i/Nseg,curve),nx=n.x*w/2,nz=n.z*w/2;
      if(!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.z)||!isFinite(n.x)||!isFinite(n.z)) continue;
      // with terrain, each edge vertex sits on the ground under it so the strip never floats or sinks
      const ya=hFn?hFn(p.x-nx,p.z-nz):p.y,yb=hFn?hFn(p.x+nx,p.z+nz):p.y;
      pos.push(p.x-nx,ya+yo,p.z-nz,p.x+nx,yb+yo,p.z+nz);uv.push(0,i/Nseg*rep,1,i/Nseg*rep);
      if(i<Nseg){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    return new THREE.Mesh(g,mat)}
  function clearCircuit(){if(!circuit)return;try{CAI.clear()}catch(e){}S.remove(circuit.root);
    // roadStrip/edgeStrip use the world's SHARED roadM/edgeM - only dispose materials this
    // circuit actually created its own copies of (tracked in ownedMats), never blanket-dispose
    // whatever a traverse happens to find, or the next redraw would break the main map's road
    circuit.root.traverse(o=>{if(o.geometry)o.geometry.dispose()});
    // venue dressing creates a few CanvasTextures (advertising, screens) hung on owned
    // materials; dispose those alongside the material so a leave/redraw leaks nothing
    (circuit.ownedMats||[]).forEach(m=>{if(m.map&&m.map.dispose)m.map.dispose();m.dispose()});
    // remove the ground plate AND every perimeter-wall body, so a redraw never leaves stray colliders
    (circuit.bodies||(circuit.groundBody?[circuit.groundBody]:[])).forEach(b=>{try{world.removeBody(b)}catch(e){}});
    circuit=null}
  // default theme: the original green look for freehand-drawn tracks. Preset maps (see THEMES
  // below) override this per call; nothing about the freehand-draw flow changes.
  const THEME_DEFAULT={id:'meadow',name:'Meadow',ground:0x37662a,field:0x4f8a2e,trunk:0x5a4128,leaf:0x2f6a26,
    tree:'pine',stand:0x3a3934,standTrim:0xb8322f,fog:0xb7cde0,sky:0x8fbfe6};   // daylight greens and a pale blue haze (it used to be near-black)
  // scale+center a closed loop (array of {x,y}, NOT repeating the first point at the end) so its
  // perimeter matches the standard circuit length - shared by the freehand drawer and the presets
  // below, so both produce the same size of track regardless of how big/small the input was drawn
  function normalizeLoop(pts,targetLen){
    const n=pts.length;
    let perim=0;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];perim+=Math.hypot(b.x-a.x,b.y-a.y)}
    const scale=(targetLen||CIRC_LEN)/perim;
    let cx=0,cy=0;pts.forEach(p=>{cx+=p.x;cy+=p.y});cx/=n;cy/=n;
    return pts.map(p=>({x:(p.x-cx)*scale,y:(p.y-cy)*scale}))}
  // a polar radius function r(a) is always a simple (non-self-intersecting) closed curve by
  // construction, since it has exactly one radius per angle - a cheap way to get 7-8 genuinely
  // different-looking preset track outlines without hand-authoring point lists that risk crossing
  const THEMES=[
    THEME_DEFAULT,
    {id:'desert',name:'Desert',ground:0xc9a769,field:0xd8bd82,trunk:0x6b4a2a,leaf:0x4a7a3a,tree:'palm',
      stand:0x8a6f4a,standTrim:0xd4a83a,fog:0xd8b878,sky:0xcaa060},
    {id:'snow',name:'Snow',ground:0xe8ecf0,field:0xf2f5f8,trunk:0x3a3530,leaf:0xeef2f5,tree:'pine',
      stand:0x5a6570,standTrim:0x2f4f9e,fog:0xc8d4dc,sky:0xb8c8d2},
    {id:'forest',name:'Forest',ground:0x1c2a18,field:0x203a1c,trunk:0x2e2318,leaf:0x1f3018,tree:'pine',
      stand:0x2a2e22,standTrim:0x3f8a56,fog:0x141f12,sky:0x101a0e},
    {id:'volcanic',name:'Volcanic',ground:0x1a1614,field:0x231d1a,trunk:0x2a2422,leaf:0x2a2422,tree:'rock',
      stand:0x2a1e1a,standTrim:0xff5a1f,fog:0x3a1f14,sky:0x2a140c},
    {id:'coastal',name:'Coastal',ground:0xd6c9a0,field:0xe3d8b0,trunk:0x6b5a3a,leaf:0x3f7a4a,tree:'palm',
      stand:0x7a8a94,standTrim:0x2f6f9e,fog:0xb8ccd8,sky:0x9fc0d4},
    {id:'night',name:'Night',ground:0x141416,field:0x18181c,trunk:0x1e1e22,leaf:0x1e1e22,tree:'rock',
      stand:0x1c1c20,standTrim:0x5cf2ff,fog:0x0a0a0e,sky:0x08080c},
    {id:'canyon',name:'Canyon',ground:0x8a4a30,field:0x9a5838,trunk:0x6a3f2a,leaf:0x6a3f2a,tree:'rock',
      stand:0x6a4530,standTrim:0xd4a83a,fog:0xc87850,sky:0xb85f3a},
    {id:'mountain',name:'Mountain',ground:0x777b76,field:0x707873,trunk:0x403c34,leaf:0x56604f,tree:'pine',
      stand:0x45494a,standTrim:0xc3c5bd,fog:0x7b8588,sky:0x667d90},
    {id:'alpine',name:'Alpine',ground:0xc7c8c4,field:0xd6d7d3,trunk:0x514c42,leaf:0x64705d,tree:'pine',
      stand:0x525457,standTrim:0xe0dfd5,fog:0xaeb8bf,sky:0x9cacb9},
    {id:'tropical',name:'Tropical',ground:0x448c70,field:0x55a084,trunk:0x62452b,leaf:0x236b47,tree:'palm',
      stand:0x426c63,standTrim:0xe0bd58,fog:0x76a99d,sky:0x65a6ba},
    {id:'rocky',name:'Rocky',ground:0x68645f,field:0x77716a,trunk:0x494641,leaf:0x5d5851,tree:'rock',
      stand:0x484745,standTrim:0xc69c65,fog:0x77726b,sky:0x85847f},
    {id:'autumn',name:'Autumn',ground:0x805838,field:0x987149,trunk:0x4e3826,leaf:0xb45a2c,tree:'pine',
      stand:0x514138,standTrim:0xd89a43,fog:0x94734f,sky:0xb68c5c},
    {id:'sunset',name:'Sunset',ground:0x72553c,field:0x90704d,trunk:0x463529,leaf:0x6e5c35,tree:'pine',
      stand:0x463c37,standTrim:0xf0a36e,fog:0x956c58,sky:0xb98669},
  ];
  function buildCircuit(pts2D,theme,seed,venue){ // pts2D: closed, already-scaled/centered world-unit points; .y stands in for world Z
    clearCircuit();
    venue=Object.assign({weather:'day',time:'day'},venue||{});
    /* width/elevation/obstacles travel WITH the venue (so every driver in a room builds the identical
       track); only fall back to the local editor setting when a venue predates these options */
    CIRC_W=Math.max(8,Math.min(30,+venue.width||(window.TrackEditor&&window.TrackEditor.roadWidth)||16));venue.width=CIRC_W;
    const ELEV=CIRC_ELEV[venue.elev]||0;venue.elev=CIRC_ELEV[venue.elev]!=null?venue.elev:'flat';
    theme=theme||THEME_DEFAULT;
    let startLightsIM=null,circuit_hazeFn=null;const wallBodies=[];
    const ownedMats=[];
    seed=Math.max(1,Math.floor(+seed)||271828);let rngState=seed>>>0;
    const seeded=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296};
    // keep the whole arena (track + stands + field) well clear of the main world, however big the lap
    {let ex=0;pts2D.forEach(q=>{ex=Math.max(ex,Math.abs(q.x),Math.abs(q.y))});CIRC_Z=-(WS+420+ex)}
    /* elevation: a smooth closed profile around the lap from two seeded sine waves (whole numbers of
       cycles, so the loop closes on itself), eased to flat over the start/finish straight for the grid */
    let erng=(seed^0x5bd1e995)>>>0;const er=()=>{erng=(Math.imul(erng,1664525)+1013904223)>>>0;return erng/4294967296};
    const ek1=2+Math.floor(er()*2),ek2=3+Math.floor(er()*3),ep1=er()*6.283,ep2=er()*6.283;
    const elevAt=u=>{if(!ELEV)return 0;const d=Math.min(u,1-u),flat=Math.min(1,Math.max(0,(d-.03)/.07)),k=flat*flat*(3-2*flat);
      return ELEV*k*(.62*Math.sin(6.283*ek1*u+ep1)+.38*Math.sin(6.283*ek2*u+ep2)-(.62*Math.sin(ep1)+.38*Math.sin(ep2)))};
    const pts3=pts2D.map((q,i)=>new THREE.Vector3(CIRC_X+q.x,CIRC_Y+elevAt(i/pts2D.length),CIRC_Z+q.y));
    const curve=new THREE.CatmullRomCurve3(pts3,true,'catmullrom',.5);
    const CN=Math.max(60,Math.min(480,Math.round(curve.getLength()/6)));
    const CSAMP=[];for(let i=0;i<CN;i++)CSAMP.push(curve.getPointAt(i/CN));
    /* dense track index: ~2.5 m samples in a 20 m spatial hash. Answers "how far is the nearest road"
       and "how high is the ground here" for the terrain, the clearance pass and prop placement. */
    const TL=curve.getLength(),DN=Math.max(240,Math.min(2400,Math.round(TL/2.5))),DX=new Float32Array(DN),DY=new Float32Array(DN),DZ=new Float32Array(DN),CELL=20,DH=new Map();
    for(let i=0;i<DN;i++){const q=curve.getPointAt(i/DN);DX[i]=q.x;DY[i]=q.y;DZ[i]=q.z;const k=Math.floor(q.x/CELL)+','+Math.floor(q.z/CELL);let a=DH.get(k);if(!a)DH.set(k,a=[]);a.push(i)}
    const nearIdx=(x,z,R,fn)=>{const r=Math.ceil(R/CELL),gx=Math.floor(x/CELL),gz=Math.floor(z/CELL);
      for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){const L=DH.get((gx+a)+','+(gz+b));if(L)for(let t=0;t<L.length;t++)fn(L[t])}};
    const trackDist=(x,z,R)=>{let best=1e9;nearIdx(x,z,R,i=>{const dx=DX[i]-x,dz=DZ[i]-z,d=dx*dx+dz*dz;if(d<best)best=d});return Math.sqrt(best)};
    // ground height: inverse-distance blend of nearby track heights, easing back to the base level
    // away from the road. On the road the nearest samples dominate, so asphalt and terrain agree.
    const H0W=1/((60*60+1)*(60*60+1));
    const groundAt=(x,z)=>{if(!ELEV)return CIRC_Y;let ws=H0W,hs=H0W*CIRC_Y;
      nearIdx(x,z,60,i=>{const dx=DX[i]-x,dz=DZ[i]-z,q=dx*dx+dz*dz+1,w=1/(q*q);ws+=w;hs+=w*DY[i]});return hs/ws};
    const hFn=ELEV?groundAt:null;
    let minY=CIRC_Y;for(let i=0;i<DN;i++)minY=Math.min(minY,DY[i]);
    const root=new THREE.Group();S.add(root);
    let stadiumBodies=[];
    const rep=curve.getLength()/12;
    const edgeStrip=circStrip(curve,CN,CIRC_W+1.8,.06,edgeM,rep,hFn);edgeStrip.receiveShadow=true;root.add(edgeStrip);
    const roadStrip=circStrip(curve,CN,CIRC_W,.12,roadM,rep,hFn);roadStrip.receiveShadow=true;root.add(roadStrip);
    edgeStrip.userData.fixedY=roadStrip.userData.fixedY=true;
    let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;pts3.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z)});
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    // arena radius: the stadium wall ring sits at r0, past every part of the track
    const r0=Math.hypot((maxX-minX)/2,(maxZ-minZ)/2)+40;
    const hx=r0+14,hz=r0+14;
    const groundMat=M(theme.ground,{roughness:.95});
    const fieldMat=M(theme.field,{roughness:.98});ownedMats.push(groundMat,fieldMat);
    let groundBody,groundMesh,field;
    if(!ELEV){
      groundMesh=new THREE.Mesh(new THREE.BoxGeometry(hx*2,1,hz*2),groundMat);groundMesh.position.set(cx,CIRC_Y-.5,cz);groundMesh.receiveShadow=true;root.add(groundMesh);
      groundBody=new CANNON.Body({mass:0,material:gM});groundBody.addShape(new CANNON.Box(new CANNON.Vec3(hx,.5,hz)));groundBody.position.set(cx,CIRC_Y-.5,cz);world.addBody(groundBody);
      field=new THREE.Mesh(new THREE.PlaneGeometry((hx+2600)*2,(hz+2600)*2).rotateX(-Math.PI/2),fieldMat);
      field.position.set(cx,CIRC_Y-.49,cz);field.receiveShadow=true;root.add(field);
    }else{
      /* hills: one physics heightfield + matching render mesh over the whole arena (same build as the
         main map's terrain: rotated -90deg about X, pillars offset so minValue can sit at 0) */
      const half=Math.max(hx,hz)+60,ES=Math.max(2.5,half*2/360),nx=Math.ceil(half*2/ES)+1,nz=nx,x0=cx-half,z1=cz+half;
      const data=[];let lo=1e9;for(let i=0;i<nx;i++){const col=new Array(nz);for(let j=0;j<nz;j++){const h=groundAt(x0+i*ES,z1-j*ES);col[j]=h;if(h<lo)lo=h}data.push(col)}
      const OFF=2-lo;for(let i=0;i<nx;i++)for(let j=0;j<nz;j++)data[i][j]+=OFF;
      groundBody=new CANNON.Body({mass:0,material:gM});groundBody.addShape(new CANNON.Heightfield(data,{elementSize:ES,minValue:0}));
      groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);groundBody.position.set(x0,-OFF,z1);world.addBody(groundBody);
      const st=nx>200?2:1,mx=Math.floor((nx-1)/st)+1,pos=new Float32Array(mx*mx*3),idx=[];
      for(let a=0;a<mx;a++)for(let b=0;b<mx;b++){const i=Math.min(nx-1,a*st),j=Math.min(nz-1,b*st),k=(a*mx+b)*3;pos[k]=x0+i*ES;pos[k+1]=data[i][j]-OFF-.03;pos[k+2]=z1-j*ES}
      for(let a=0;a<mx-1;a++)for(let b=0;b<mx-1;b++){const k=a*mx+b;idx.push(k,k+1,k+mx,k+1,k+mx+1,k+mx)}
      const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(pos,3));tg.setIndex(idx);tg.computeVertexNormals();
      groundMesh=new THREE.Mesh(tg,groundMat);groundMesh.receiveShadow=true;root.add(groundMesh);
      field=new THREE.Mesh(new THREE.PlaneGeometry((half+2600)*2,(half+2600)*2).rotateX(-Math.PI/2),fieldMat);
      field.position.set(cx,lo-.6,cz);field.receiveShadow=true;root.add(field);
    }
    groundMesh.userData.fixedY=field.userData.fixedY=true;groundMesh.userData.onTrack=field.userData.onTrack=true;
    /* ---------- natural terrain look ----------
       Physics keeps its flat slab (or the road-following heightfield on hilly venues). What you SEE is a smooth,
       vertex-coloured surface: grass/dirt/rock variation, a grain texture, and rolling hills that begin well clear of
       the road and rise into a bowl at the edge of the arena, so the horizon is land instead of a flat plate.
       Everything is seeded by the venue seed, so every driver in a room sees the same landscape. */
    const nOff=(seed%997)*.37,ctr=new THREE.Color(theme.ground),cfl=new THREE.Color(theme.field),cdirt=new THREE.Color(theme.trunk).lerp(new THREE.Color(0x8a7656),.55),crock=new THREE.Color(0x77736c);
    const paleTheme=theme.id==='snow'||theme.id==='alpine';
    const visH=(x,z)=>{
      const d=Math.min(trackDist(x,z,110),110),ramp=SM((d-70)/60),rr=Math.hypot(x-cx,z-cz);
      const bowl=SM((rr-r0)/60)*(1-SM((rr-r0-80)/60))*16;       // hills around the arena that settle back to the plain
      return ramp*((fbm2(x*.011+nOff,z*.011-nOff)-.86)*13+(fbm2(x*.04-nOff,z*.04+nOff)-.86)*3)+bowl*(.55+.9*noise2(x*.02+nOff,z*.02))};
    const terrainMat=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,map:grainTex(128,.08,1,.56)});ownedMats.push(terrainMat);
    function decorate(geo){
      geo.computeVertexNormals();
      const P=geo.attributes.position,N=geo.attributes.normal,n=P.count,col=new Float32Array(n*3),uv=new Float32Array(n*2);
      for(let k=0;k<n;k++){
        const x=P.getX(k),z=P.getZ(k),sl=1-N.getY(k),d=Math.min(trackDist(x,z,60),60);
        const patch=SM((noise2(x*.02+nOff,z*.02-nOff)-.5)/.35),fine=noise2(x*.31,z*.31)-.5,mid=noise2(x*.09-nOff,z*.09)-.5;
        let r=LRP(ctr.r,cfl.r,patch),g=LRP(ctr.g,cfl.g,patch),b=LRP(ctr.b,cfl.b,patch);
        const m=(1+fine*.2+mid*.42)*.86;r*=m;g*=m*(1+mid*.12);b*=m*(1-mid*.1);   // lighter and darker grass, a touch yellower where dry
        const dirt=paleTheme?0:SM((sl-.05)/.14)*.65;r=LRP(r,cdirt.r,dirt);g=LRP(g,cdirt.g,dirt);b=LRP(b,cdirt.b,dirt);
        const rock=SM((sl-.16)/.14)*.8;r=LRP(r,crock.r,rock);g=LRP(g,crock.g,rock);b=LRP(b,crock.b,rock);
        const edge=SM((CIRC_W/2+16-d)/12)*.4;r=LRP(r,crock.r*.85,edge);g=LRP(g,crock.g*.85,edge);b=LRP(b,crock.b*.85,edge);   // gravel/worn ground beside the pavement
        col[k*3]=r;col[k*3+1]=g;col[k*3+2]=b;uv[k*2]=x/36;uv[k*2+1]=z/36}
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2))}
    /* One visual terrain for flat and hilly venues alike: the road-following heights (hilly) or the flat base, plus
       the outer hills. (The old hilly-venue ground mesh was wound upside-down and culled, so what you actually saw
       was the flat plane below it.) The physics slab / heightfield stays the collision body. */
    {
      const half2=r0+190,ES2=Math.max(LOW?9:5,half2*2/(LOW?110:210)),n2=Math.ceil(half2*2/ES2)+1,pos=new Float32Array(n2*n2*3),idx=[];
      for(let i=0;i<n2;i++)for(let j=0;j<n2;j++){const x=cx-half2+i*ES2,z=cz-half2+j*ES2,k=(i*n2+j)*3;pos[k]=x;pos[k+1]=(ELEV?groundAt(x,z):CIRC_Y)-.03+visH(x,z);pos[k+2]=z}
      for(let i=0;i<n2-1;i++)for(let j=0;j<n2-1;j++){const a=i*n2+j,b=(i+1)*n2+j;idx.push(a,a+1,b,b,a+1,b+1)}
      const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(pos,3));tg.setIndex(idx);decorate(tg);
      const terrainMesh=new THREE.Mesh(tg,terrainMat);terrainMesh.receiveShadow=true;terrainMesh.userData.fixedY=terrainMesh.userData.onTrack=true;root.add(terrainMesh);
      groundMesh.visible=false}
    const gy=(x,z)=>CIRC_Y+visH(x,z);                 // where props sit: the visual ground (ELEV venues are lifted by the settle pass later)
    roadStrip.userData.onTrack=edgeStrip.userData.onTrack=true;
    const runoff=circStrip(curve,CN,CIRC_W+4,.035,groundMat,rep,hFn);runoff.receiveShadow=true;root.add(runoff);runoff.userData.fixedY=runoff.userData.onTrack=true;
    const curbRed=M(theme.standTrim,{roughness:.75}),curbWhite=M(0xdad8d0,{roughness:.8});ownedMats.push(curbRed,curbWhite);
    const curbGeo=new THREE.BoxGeometry(1.7,.18,Math.max(1.8,Math.min(4,curve.getLength()/CN)));
    const curbRedIM=new THREE.InstancedMesh(curbGeo,curbRed,CN*2),curbWhiteIM=new THREE.InstancedMesh(curbGeo,curbWhite,CN*2);
    curbRedIM.receiveShadow=true;curbWhiteIM.receiveShadow=true;root.add(curbRedIM,curbWhiteIM);curbRedIM.userData.onTrack=curbWhiteIM.userData.onTrack=true;
    {let redN=0,whiteN=0;const up=new THREE.Vector3(0,1,0),p0=new THREE.Vector3(),q0=new THREE.Quaternion(),s0=new THREE.Vector3(1,1,1),mx0=new THREE.Matrix4();
      for(let i=0;i<CN;i++){const {p,tg,n}=circAt(i/CN,curve),yaw=Math.atan2(tg.x,tg.z);
        for(const side of [-1,1]){p0.set(p.x+n.x*side*(CIRC_W/2+.75),CIRC_Y+.16,p.z+n.z*side*(CIRC_W/2+.75));q0.setFromAxisAngle(up,yaw);mx0.compose(p0,q0,s0);
          if((i+side+CN)%2===0)curbRedIM.setMatrixAt(redN++,mx0);else curbWhiteIM.setMatrixAt(whiteN++,mx0)}}
      curbRedIM.count=redN;curbWhiteIM.count=whiteN;curbRedIM.instanceMatrix.needsUpdate=true;curbWhiteIM.instanceMatrix.needsUpdate=true}
// perimeter barrier wall: one continuous strip just outside the paved plate, all the way round
    {const wallMat=M(0xd9d4c6,{roughness:.7});ownedMats.push(wallMat);
      const wallCurve=new THREE.CatmullRomCurve3(pts3.map(p=>{
          const dx=p.x-cx,dz=p.z-cz,len=Math.hypot(dx,dz)||1;
          return new THREE.Vector3(cx+dx/len*(r0-4),CIRC_Y,cz+dz/len*(r0-4))}),true,'catmullrom',.5);
      // Ensure wall curve points are valid
      const wallPts=[];for(let i=0;i<=CN;i++){const pt=wallCurve.getPointAt(i/CN);wallPts.push(pt)};
      const validWallPts=wallPts.filter(p=>isFinite(p.x)&&isFinite(p.y)&&isFinite(p.z));
      if(validWallPts.length<4){console.warn('Invalid wall curve, skipping wall');return;}
     const wall=circStrip(wallCurve,CN,1.1,1.1,wallMat,1,hFn);wall.castShadow=true;wall.receiveShadow=true;root.add(wall);wall.userData.fixedY=wall.userData.onTrack=true;
     // make that same ring SOLID: a chain of static box bodies so the car is contained inside the
     // stadium and bounces off the wall instead of leaving the venue. Tracked for removal on clear.
     const WN=72,wh=3.5,wup=new CANNON.Vec3(0,1,0);
     for(let i=0;i<WN;i++){const a=wallCurve.getPointAt(i/WN),b=wallCurve.getPointAt(((i+1)%WN)/WN);
       const len=Math.hypot(b.x-a.x,b.z-a.z);
       const body=new CANNON.Body({mass:0,material:gM});body.addShape(new CANNON.Box(new CANNON.Vec3(1,wh,len/2+.4)));
       body.position.set((a.x+b.x)/2,CIRC_Y+wh,(a.z+b.z)/2);body.quaternion.setFromAxisAngle(wup,Math.atan2(b.x-a.x,b.z-a.z));
       world.addBody(body);wallBodies.push(body)}}
    /* ---------- track limits ----------
       The corridor, from the centre out: road (CIRC_W/2) -> curb (+1.6) -> runoff -> barrier (+BARRIER_OFF) -> props (+6 and beyond).
       Each side gets a chain of invisible static boxes that the car glances off (low friction, a little bounce),
       with a low Armco rail on the same line so the limit reads. Where two parts of the lap run close together, a
       segment that would stand on the other road is left out. Same code for Daily, Custom and Draw tracks. */
    {const railMat=M(0xc7cbd1,{roughness:.4}),postMat=M(0x5d5a55,{roughness:.8});ownedMats.push(railMat,postMat);
      const segL=7,NB=Math.max(60,Math.round(TL/segL)),off=CIRC_W/2+BARRIER_OFF;
      const railIM=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,.34,segL+.15),railMat,NB*2),postIM=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.8,.16),postMat,NB*2);
      railIM.castShadow=!LOW;railIM.receiveShadow=true;postIM.castShadow=!LOW;root.add(railIM,postIM);railIM.userData.onTrack=postIM.userData.onTrack=true;
      const up=new THREE.Vector3(0,1,0),q=new THREE.Quaternion(),pp=new THREE.Vector3(),sc=new THREE.Vector3(1,1,1),mx=new THREE.Matrix4(),cup=new CANNON.Vec3(0,1,0);let nr=0;
      for(let i=0;i<NB;i++){const {p,tg,n}=circAt((i+.5)/NB,curve),yaw=Math.atan2(tg.x,tg.z);q.setFromAxisAngle(up,yaw);
        for(const side of [-1,1]){const x=p.x+n.x*side*off,z=p.z+n.z*side*off;
          if(trackDist(x,z,off+2)<off-1.5)continue;          // another part of the track is closer than ours: no wall across it
          const b=new CANNON.Body({mass:0,material:barM});b.addShape(new CANNON.Box(new CANNON.Vec3(.35,1,segL/2+.4)));
          b.position.set(x,CIRC_Y+.9,z);b.quaternion.setFromAxisAngle(cup,yaw);world.addBody(b);wallBodies.push(b);
          pp.set(x,CIRC_Y+.66,z);mx.compose(pp,q,sc);railIM.setMatrixAt(nr,mx);pp.set(x,CIRC_Y+.4,z);mx.compose(pp,q,sc);postIM.setMatrixAt(nr,mx);nr++}}
      railIM.count=postIM.count=nr;railIM.instanceMatrix.needsUpdate=postIM.instanceMatrix.needsUpdate=true}
    // Keep the grandstands close enough to read from the track, placed from its actual tangent.
    {const standN=Math.max(8,Math.min(16,Math.round(curve.getLength()/38)));
     const standMat=M(theme.stand,{roughness:.85}),trimMat=M(theme.standTrim,{roughness:.6});ownedMats.push(standMat,trimMat);
    const standIM=new THREE.InstancedMesh(new THREE.BoxGeometry(25,.8,8),standMat,standN);standIM.castShadow=true;standIM.receiveShadow=true;root.add(standIM);standIM.userData.solidInst={hx:12.5,hy:4.2,hz:4.6,yo:3.8};
    const trimIM=new THREE.InstancedMesh(new THREE.BoxGeometry(25,.45,8.4),trimMat,standN);trimIM.castShadow=true;root.add(trimIM);
    const seatIM=new THREE.InstancedMesh(new THREE.BoxGeometry(23,.82,1.75),trimMat,standN*5);seatIM.castShadow=true;seatIM.receiveShadow=true;root.add(seatIM);
    const roofIM=new THREE.InstancedMesh(new THREE.BoxGeometry(28,.48,10),standMat,standN);roofIM.castShadow=true;root.add(roofIM);
    const frameIM=new THREE.InstancedMesh(new THREE.BoxGeometry(.42,6.5,.42),standMat,standN*4);frameIM.castShadow=true;root.add(frameIM);
    // crowd: one little box per spectator, InstancedMesh with per-instance colour so the stands
    // read as a packed, multicoloured crowd rather than a flat painted slab. ~one person per seat.
    const COLS=LOW?6:9,ROWS=5,crowdMat=M(0xffffff,{roughness:1});ownedMats.push(crowdMat);
    const crowdIM=new THREE.InstancedMesh(new THREE.BoxGeometry(.62,.9,.55),crowdMat,standN*ROWS*COLS);crowdIM.castShadow=!LOW;root.add(crowdIM);
    const CROWD=[0xe4572e,0xf3a712,0xd9d4c6,0x2f6f9e,0x3f8a56,0xb8322f,0x5c4b8a,0xe0bd58,0x4a4e57,0xcc5f8f];
    const sM=new THREE.Matrix4(),sP=new THREE.Vector3(),sQ=new THREE.Quaternion(),sS=new THREE.Vector3(1,1,1),cS=new THREE.Vector3(1,1,1),upAxis0=new THREE.Vector3(0,1,0),cCol=new THREE.Color(),seatCol=new THREE.Color();let crowdN=0;
    for(let i=0;i<standN;i++){const {p,tg,n}=circAt((i+.5)/standN,curve),side=i%2?1:-1,offset=CIRC_W/2+13+seeded()*5;
       const x=p.x+n.x*side*offset,z=p.z+n.z*side*offset;
       sQ.setFromAxisAngle(upAxis0,Math.atan2(cx-x,cz-z));
       sP.set(x,CIRC_Y-.5+.4,z);sM.compose(sP,sQ,sS);standIM.setMatrixAt(i,sM);
       sP.set(x,CIRC_Y-.5+4.4,z);sM.compose(sP,sQ,sS);trimIM.setMatrixAt(i,sM);
       sP.set(x,CIRC_Y-.5+7.7,z-1.5);sM.compose(sP,sQ,sS);roofIM.setMatrixAt(i,sM);
       for(let row=0;row<ROWS;row++){const seatOffset=new THREE.Vector3(0,1.15+row*1.08,3.8-row*1.65).applyQuaternion(sQ);sP.set(x+seatOffset.x,CIRC_Y-.5+seatOffset.y,z+seatOffset.z);sM.compose(sP,sQ,sS);seatIM.setMatrixAt(i*5+row,sM);
         if(seatIM.setColorAt){const sh=.82+seeded()*.3;seatIM.setColorAt(i*5+row,seatCol.setRGB(sh,sh,sh))}
         for(let col=0;col<COLS;col++){const lx=(col/(COLS-1)-.5)*21,po=new THREE.Vector3(lx,1.15+row*1.08+.86,3.8-row*1.65).applyQuaternion(sQ);
           sP.set(x+po.x,CIRC_Y-.5+po.y,z+po.z);cS.set(1,.85+seeded()*.4,1);sM.compose(sP,sQ,cS);crowdIM.setMatrixAt(crowdN,sM);
           if(crowdIM.setColorAt)crowdIM.setColorAt(crowdN,cCol.setHex(CROWD[(seeded()*CROWD.length)|0]));crowdN++}}
       for(let post=0;post<4;post++){const localX=post%2?11:-11,localZ=post<2?3.4:-4.4,frameOffset=new THREE.Vector3(localX,3.2,localZ).applyQuaternion(sQ);sP.set(x+frameOffset.x,CIRC_Y-.5+frameOffset.y,z+frameOffset.z);sM.compose(sP,sQ,sS);frameIM.setMatrixAt(i*4+post,sM)}}
     crowdIM.count=crowdN;
     // one stand = one base + trim + roof + 5 seat rows + 4 posts + its crowd; cleared or kept as a unit
     standIM.userData.links=[{im:trimIM,per:1},{im:roofIM,per:1},{im:seatIM,per:5},{im:frameIM,per:4},{im:crowdIM,per:ROWS*COLS}];
     [trimIM,roofIM,seatIM,frameIM,crowdIM].forEach(m=>m.userData.linkedChild=true);
     standIM.instanceMatrix.needsUpdate=true;trimIM.instanceMatrix.needsUpdate=true;seatIM.instanceMatrix.needsUpdate=true;roofIM.instanceMatrix.needsUpdate=true;frameIM.instanceMatrix.needsUpdate=true;crowdIM.instanceMatrix.needsUpdate=true;
     if(crowdIM.instanceColor)crowdIM.instanceColor.needsUpdate=true;if(seatIM.instanceColor)seatIM.instanceColor.needsUpdate=true}
    // floodlight pylons, fewer than grandstands, interspersed around the same ring
    {const lampMat=M(0x2a2a2a,{roughness:.6}),lensMat=new THREE.MeshBasicMaterial({color:0xfff3d6});ownedMats.push(lampMat,lensMat);
    const lampN=Math.max(6,Math.round(curve.getLength()/70));
    const poleIM=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.28,9,8),lampMat,lampN);poleIM.castShadow=true;root.add(poleIM);
     const lensIM=new THREE.InstancedMesh(new THREE.BoxGeometry(2.4,1.4,.4),lensMat,lampN);root.add(lensIM);
     const lM=new THREE.Matrix4(),lP=new THREE.Vector3(),lQ=new THREE.Quaternion(),lS=new THREE.Vector3(1,1,1),upAxis1=new THREE.Vector3(0,1,0);
     for(let i=0;i<lampN;i++){const {p,tg,n}=circAt((i+.25)/lampN+.18,curve),side=i%2?1:-1,rr=CIRC_W/2+58+seeded()*8;
       const x=p.x+n.x*side*rr,z=p.z+n.z*side*rr;
       lQ.setFromAxisAngle(upAxis1,Math.atan2(cx-x,cz-z));
       lP.set(x,CIRC_Y-.5+4.5,z);lM.compose(lP,lQ,lS);poleIM.setMatrixAt(i,lM);
       lP.set(x,CIRC_Y-.5+9.2,z);lM.compose(lP,lQ,lS);lensIM.setMatrixAt(i,lM)}
     poleIM.instanceMatrix.needsUpdate=true;lensIM.instanceMatrix.needsUpdate=true}
    /* ---------- trees, bushes and rocks ----------
       Placed in groves (noise-driven density) in the fields beside the track and in a belt outside the wall, never
       on the pavement. Sizes, tilt, colour and species mix vary per instance; everything is instanced, so the whole
       lot is a handful of draw calls. Seeded, so every client grows the same trees. */
    if(theme.tree!=='none'){
      const kind=theme.tree,isRock=kind==='rock',isPalm=kind==='palm';
      const trunkMat=M(theme.trunk,{roughness:.9}),leafMat=M(0xffffff,{roughness:.95});ownedMats.push(trunkMat,leafMat);
      const maxN=LOW?110:300,spots=[];
      for(let tries=0;spots.length<maxN&&tries<maxN*60;tries++){
        let x,z;
        if(seeded()<.7){                       // groves in the fields beside the track, 30+ m off the pavement and inside the wall
          const i=Math.floor(seeded()*DN),a=seeded()*Math.PI*2,dd=CIRC_W/2+30+seeded()*seeded()*85;x=DX[i]+Math.cos(a)*dd;z=DZ[i]+Math.sin(a)*dd;
          if(trackDist(x,z,110)<CIRC_W/2+30||Math.hypot(x-cx,z-cz)>r0-8)continue}
        else{                                  // a belt of woodland outside the wall
          const a=seeded()*Math.PI*2,rad=r0+8+seeded()*160;x=cx+Math.cos(a)*rad;z=cz+Math.sin(a)*rad}
        const dens=SM((noise2(x*.018+nOff,z*.018-nOff)-.3)/.3);
        if(seeded()>dens*.95+.05)continue;
        spots.push([x,z,seeded(),seeded(),seeded()])}
      const n=spots.length,up=new THREE.Vector3(0,1,0),qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),eu=new THREE.Euler(),pv=new THREE.Vector3(),sv=new THREE.Vector3(),mx=new THREE.Matrix4(),col=new THREE.Color(),base=new THREE.Color(theme.leaf);
      const mk=(geo,mat,count,shadow)=>{const im=new THREE.InstancedMesh(geo,mat,Math.max(1,count));im.castShadow=!!shadow&&!LOW;im.userData.i=0;root.add(im);return im};   // count is set once at the end (setColorAt sizes its buffer from it)
      const put=(im,x,y,z,sx,sy,sz,yaw,tilt,c)=>{const i=im.userData.i;if(i>=im.instanceMatrix.count)return;
        eu.set(tilt*Math.cos(yaw),yaw,tilt*Math.sin(yaw));qa.setFromEuler(eu);pv.set(x,y,z);sv.set(sx,sy,sz);mx.compose(pv,qa,sv);
        im.setMatrixAt(i,mx);if(c)im.setColorAt(i,c);im.userData.i=i+1};
      const fin=im=>{if(!im)return;im.count=im.userData.i;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true};
      const leafCol=(r1,r2,r3)=>col.copy(base).offsetHSL((r1-.5)*.05,(r2-.5)*.14,(r3-.5)*.2);
      if(isRock){
        const rIM=mk(new THREE.IcosahedronGeometry(1,1),M(0xffffff,{roughness:.98}),n,true);
        spots.forEach(([x,z,r1,r2,r3])=>{const sc=.8+r1*r1*3.2;const t=.5+r2*.2;col.set(theme.leaf).multiplyScalar(.8+r3*.45);
          put(rIM,x,gy(x,z)+sc*.25,z,sc*(1+r3*.5),sc*(.55+r2*.35),sc*(.9+r1*.4),r1*6.28,.18,col)});
        fin(rIM)}
      else{
        const trunkIM=mk(new THREE.CylinderGeometry(.14,.26,1,6),trunkMat,n,true);
        const tiers=isPalm?[]:[mk(new THREE.ConeGeometry(1.45,2.3,9),leafMat,n,true),mk(new THREE.ConeGeometry(1.1,2.1,9),leafMat,n,true),mk(new THREE.ConeGeometry(.72,1.8,9),leafMat,n,true)];
        const crown=isPalm?mk(new THREE.IcosahedronGeometry(1,1),leafMat,n*2,true):null;
        const bushIM=mk(new THREE.IcosahedronGeometry(1,1),leafMat,Math.round(n*1.1),false);
        spots.forEach(([x,z,r1,r2,r3],i)=>{const y0=gy(x,z)-.15,sc=.7+r1*r1*1.5+(r3>.93?.7:0),h=isPalm?5.5*sc:3.1*sc,yaw=r2*6.28,tilt=(r3-.5)*.1;
          put(trunkIM,x,y0+h/2,z,sc,h,sc,yaw,tilt,null);
          if(isPalm){put(crown,x,y0+h+.2,z,2.3*sc,.55*sc,2.3*sc,yaw,tilt,leafCol(r1,r2,r3));put(crown,x+Math.cos(yaw)*.5,y0+h+.6,z+Math.sin(yaw)*.5,1.5*sc,.4*sc,1.5*sc,yaw+1,tilt,leafCol(r2,r3,r1))}
          else{const c=leafCol(r1,r2,r3),w=1+(r2-.5)*.25;
            put(tiers[0],x,y0+h*.52,z,sc*w,sc,sc*w,yaw,tilt,c);put(tiers[1],x,y0+h*.78,z,sc*w,sc,sc*w,yaw+.6,tilt,c);put(tiers[2],x,y0+h*1.02,z,sc*w,sc,sc*w,yaw+1.2,tilt,c)}
          // a bush or two at the foot of some trees
          if(r2>.45){const bs=.6+r3*.9;put(bushIM,x+Math.cos(yaw)*(1.6+r1),y0+bs*.3,z+Math.sin(yaw)*(1.6+r1),bs*1.3,bs*.8,bs*1.1,yaw,0,leafCol(r3,r1,r2).multiplyScalar(.9))}});
        [trunkIM,bushIM,crown].concat(tiers).forEach(fin)}
      // scattered boulders in every venue so the ground is not just trees
      {const rN=LOW?18:46,rIM=mk(new THREE.IcosahedronGeometry(1,1),M(0xffffff,{roughness:.98}),rN,true);
        for(let i=0,tries=0;i<rN&&tries<rN*30;tries++){const x=cx+(seeded()-.5)*2*(r0+120),z=cz+(seeded()-.5)*2*(r0+120),d=trackDist(x,z,110);
          const rr=seeded(),r2=seeded();if(Math.hypot(x-cx,z-cz)<r0+8&&(d<CIRC_W/2+18||d>105)){continue}
          const sc=.5+rr*rr*2.6;col.setHex(0x77736c).multiplyScalar(.75+r2*.45);put(rIM,x,gy(x,z)+sc*.2,z,sc*1.2,sc*.65,sc,seeded()*6.28,.15,col);i++}
        fin(rIM)}}
    /* ---------- distant mountain ranges ----------
       Two layered rings of ridged peaks well beyond the arena, shaded rock to snow and hazed toward the fog colour
       with distance; the nearer one is darker and sharper. Unlit and fog-free (pre-hazed), because they sit past the
       fog distance; hazeTo() re-tints them whenever the weather changes the fog colour. */
    {const layers=[{R:r0+380,H:LOW?60:78,haze:.5,rows:3},{R:r0+700,H:LOW?110:150,haze:.74,rows:3}],SEG=LOW?72:132,mtn=[];
      layers.forEach((L,li)=>{const rows=L.rows,pos=[],cl=[],idx=[],bc=[],snowLine=theme.id==='desert'||theme.id==='tropical'||theme.id==='coastal'?9:.62;
        for(let i=0;i<=SEG;i++){const a=i/SEG*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
          const ridge=1-Math.abs(fbm2(ca*5+li*9+nOff,sa*5-nOff)/1.72*2-1),h=L.H*(.35+ridge*.9)*(.8+.4*noise2(ca*13+li*3,sa*13)),r=L.R+noise2(ca*3+li,sa*3)*40;
          for(let k=0;k<rows;k++){const t=k/(rows-1),y=CIRC_Y-14+t*(h+14);pos.push(cx+ca*r,y,cz+sa*r);
            const shade=.78+noise2(i*.7+k*3.1+li*5,k*1.9)*.4,snow=t>.7&&t/(1)*ridge>snowLine*.62?1:0;
            const rc=new THREE.Color(theme.ground).lerp(crock,.55).multiplyScalar(shade*(.62+t*.5)).lerp(new THREE.Color(0xf4f6f8),snow*.85*(paleTheme?1:.9));
            bc.push(rc.r,rc.g,rc.b,L.haze*(1-t*.3));cl.push(rc.r,rc.g,rc.b)}
          if(i<SEG)for(let k=0;k<rows-1;k++){const q=i*rows+k;idx.push(q,q+1,q+rows,q+1,q+rows+1,q+rows)}}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));g.setIndex(idx);
        const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,fog:false,side:THREE.DoubleSide}));m.frustumCulled=false;m.renderOrder=-1;m.userData.fixedY=m.userData.onTrack=true;root.add(m);ownedMats.push(m.material);mtn.push({g,bc})});
      circuit_hazeFn=(fc)=>{mtn.forEach(({g,bc})=>{const a=g.attributes.color.array;for(let v=0;v<a.length/3;v++){const k=v*4,h=bc[k+3];a[v*3]=bc[k]+(fc.r-bc[k])*h;a[v*3+1]=bc[k+1]+(fc.g-bc[k+1])*h;a[v*3+2]=bc[k+2]+(fc.b-bc[k+2])*h}g.attributes.color.needsUpdate=true})};
      circuit_hazeFn(new THREE.Color(theme.fog))}
    const startP=circAt(0,curve);
    const flagMat=new THREE.MeshBasicMaterial({color:0xf2eee6,transparent:true,opacity:.85,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});ownedMats.push(flagMat);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(CIRC_W,1.6).rotateX(-Math.PI/2),flagMat);
    flag.position.set(startP.p.x,CIRC_Y+.14,startP.p.z);flag.rotation.y=Math.atan2(startP.tg.x,startP.tg.z);root.add(flag);flag.userData.onTrack=true;
    {
      const yaw=Math.atan2(startP.tg.x,startP.tg.z),pitRoot=new THREE.Group(),pitMat=M(theme.stand,{roughness:.82}),roofMat=M(theme.standTrim,{roughness:.68}),glassMat=M(0x9db9c1,{roughness:.32,metalness:.22}),lampMat=new THREE.MeshBasicMaterial({color:0xfff1c8});
      ownedMats.push(pitMat,roofMat,glassMat,lampMat);pitRoot.position.set(startP.p.x,startP.p.y,startP.p.z);pitRoot.rotation.y=yaw;
      const pitSide=CIRC_W/2+13,pit=new THREE.Mesh(new THREE.BoxGeometry(14,4.8,25),pitMat);pit.position.set(pitSide,2.4,-12);pit.castShadow=true;pit.receiveShadow=true;pitRoot.add(pit);pit.userData.solid=true;
      const roof=new THREE.Mesh(new THREE.BoxGeometry(15,.55,26),roofMat);roof.position.set(pitSide,5.05,-12);roof.castShadow=true;pitRoot.add(roof);
      const doors=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,2.4,3.2),glassMat,5),doorMatrix=new THREE.Matrix4();
      for(let i=0;i<5;i++){doorMatrix.makeTranslation(pitSide-7.1,1.65,-22+i*5);doors.setMatrixAt(i,doorMatrix)}doors.instanceMatrix.needsUpdate=true;pitRoot.add(doors);
      const tower=new THREE.Mesh(new THREE.BoxGeometry(5.5,10,7),pitMat);tower.position.set(pitSide+9.5,5,-8);tower.castShadow=true;pitRoot.add(tower);tower.userData.solid=true;
      const towerGlass=new THREE.Mesh(new THREE.BoxGeometry(5.7,1.8,7.2),glassMat);towerGlass.position.set(pitSide+9.5,8.5,-8);pitRoot.add(towerGlass);
      const gantry=new THREE.Group();gantry.position.z=18;gantry.userData.onTrack=true;[-1,1].forEach(side=>{const post=new THREE.Mesh(new THREE.BoxGeometry(.28,6,.28),pitMat);post.position.set(side*(CIRC_W/2+BARRIER_OFF+1),3,0);gantry.add(post)});
      const bar=new THREE.Mesh(new THREE.BoxGeometry(CIRC_W+2*BARRIER_OFF+3,.42,.5),pitMat);bar.position.y=6;gantry.add(bar);
      // F1-style start gantry: five lights, bigger now, driven by instanceColor so they can run a
      // real red-build-up -> lights-out sequence each time you enter (see the circuit loop block).
      lampMat.color.setHex(0xffffff);
      const startLights=new THREE.InstancedMesh(new THREE.SphereGeometry(.42,10,8),lampMat,5),lightMatrix=new THREE.Matrix4();
      for(let i=0;i<5;i++){lightMatrix.makeTranslation((i-2)*1.9,6.7,0);startLights.setMatrixAt(i,lightMatrix);if(startLights.setColorAt)startLights.setColorAt(i,new THREE.Color(0x3a0e0e))}
      startLights.instanceMatrix.needsUpdate=true;if(startLights.instanceColor)startLights.instanceColor.needsUpdate=true;gantry.add(startLights);startLightsIM=startLights;
      pitRoot.add(gantry);root.add(pitRoot);
    }
    /* ---------- professional venue dressing ----------
       Everything below turns the bare loop into a motorsport venue: starting grid, a main
       grandstand on the start straight, tyre walls + Armco through the corners, perimeter
       fencing, marshal posts, camera + race-control towers, advertising, a sponsor bridge and
       an outer car park. It is all decoration (off-road here is a logical grip penalty, same as
       the main map, so none of it needs a physics body), all instanced where it repeats, all
       seeded off the same RNG so a seed reproduces the venue exactly, all added to `root` and
       all tracked in `ownedMats`. Each feature is wrapped in safe() so a single failing prop can
       never stop the race from starting - the worst case is a slightly barer, still-drivable
       circuit (acceptance criteria 39/43). */
    {
      const addMat=m=>{ownedMats.push(m);return m};
      const safe=fn=>{try{fn()}catch(e){if(typeof console!=='undefined')console.warn('venue prop skipped:',e&&e.message)}};
      const GY=CIRC_Y;                 // ground surface top sits at ~CIRC_Y
      const up=new THREE.Vector3(0,1,0),MX=new THREE.Matrix4(),P=new THREE.Vector3(),Q=new THREE.Quaternion(),SC=new THREE.Vector3(1,1,1),COL=new THREE.Color();
      const L=curve.getLength(),HALF=CIRC_W/2;
      // one dense pass of the track: point, tangent, left-normal and how hard it is turning here
      const SN=Math.max(48,Math.min(300,CN)),SA=[];
      for(let i=0;i<SN;i++)SA.push(circAt(i/SN,curve));
      const turn=new Array(SN),curl=new Array(SN);
      for(let i=0;i<SN;i++){const t0=SA[(i-1+SN)%SN].tg,t1=SA[(i+1)%SN].tg;
        turn[i]=Math.acos(Math.max(-1,Math.min(1,t0.x*t1.x+t0.z*t1.z)));
        curl[i]=t0.x*t1.z-t0.z*t1.x}                 // >0 turning left, so the OUTSIDE is to the right
      const outSide=i=>curl[i]>0?-1:1;               // sign on the left-normal n that points off-track outward
      // corner apices: non-max-suppressed local maxima of the turn rate
      const corners=[],CTHR=.05,CGAP=Math.max(4,Math.round(SN/16));
      for(let i=0;i<SN;i++){if(turn[i]<CTHR)continue;let mx=true;
        for(let k=-2;k<=2;k++)if(turn[(i+k+SN)%SN]>turn[i]+1e-6){mx=false;break}
        if(mx&&!corners.some(c=>Math.min(Math.abs(c-i),SN-Math.abs(c-i))<CGAP))corners.push(i)}
      // longest low-curvature run = the straight that gets the sponsor bridge
      let bStart=0,bLen=0,cStart=0,cLen=0;
      for(let i=0;i<SN*2;i++){const j=i%SN;if(turn[j]<.02){if(cLen===0)cStart=j;cLen++;if(cLen>bLen){bLen=cLen;bStart=cStart}}else cLen=0}
      const straightMid=(bStart+Math.floor(Math.min(bLen,SN)/2))%SN;
      // a bright sign/banner texture drawn procedurally (no external assets, no real brands)
      const signTex=(word,bg,fg)=>{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
        g.fillStyle=bg;g.fillRect(0,0,256,64);g.fillStyle=fg;g.font='bold 42px Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';
        g.fillText(word,128,36);g.strokeStyle=fg;g.lineWidth=4;g.strokeRect(6,6,244,52);
        const t=new THREE.CanvasTexture(c);if(R&&R.capabilities&&R.capabilities.getMaxAnisotropy)t.anisotropy=Math.min(4,R.capabilities.getMaxAnisotropy());return t};
      const WORDS=['SPEED','TURBO','RACING','DRIVE','MOTORSPORT','GRAND PRIX','CIRCUIT','APEX','V12','NITRO','PODIUM','CHAMPIONSHIP'];
      const ADCOL=[[0xb8322f,0xffffff],[0x2f6f9e,0xffffff],[0xd4a83a,0x15140f],[0x3f8a56,0xffffff],[0x1a1a1e,0xf3a712],[0x5c4b8a,0xffffff]];

      // --- starting grid + finish line: painted on the start straight, just above the road ---
      safe(()=>{
        const yaw=Math.atan2(startP.tg.x,startP.tg.z),gridMat=addMat(new THREE.MeshBasicMaterial({color:0xf2eee6,transparent:true,opacity:.9,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
        const slots=8,slotGeo=new THREE.PlaneGeometry(1.1,3.4).rotateX(-Math.PI/2),gridIM=new THREE.InstancedMesh(slotGeo,gridMat,slots*2);root.add(gridIM);gridIM.userData.onTrack=true;
        Q.setFromAxisAngle(up,yaw);let gi=0;
        for(let r=0;r<slots;r++)for(const s of [-1,1]){
          const back=-6-r*8,lane=s*(HALF*.5);
          const off=new THREE.Vector3(lane,0,back).applyQuaternion(Q);
          P.set(startP.p.x+off.x,GY+.12,startP.p.z+off.z);MX.compose(P,Q,SC);gridIM.setMatrixAt(gi++,MX)}
        gridIM.instanceMatrix.needsUpdate=true;
        // chequered finish band across the road
        const chk=16,chkGeo=new THREE.PlaneGeometry(CIRC_W/chk,1.4).rotateX(-Math.PI/2),chkW=addMat(new THREE.MeshBasicMaterial({color:0xf2eee6})),chkK=addMat(new THREE.MeshBasicMaterial({color:0x15140f}));
        const cW=new THREE.InstancedMesh(chkGeo,chkW,chk*2),cK=new THREE.InstancedMesh(chkGeo,chkK,chk*2);root.add(cW,cK);cW.userData.onTrack=cK.userData.onTrack=true;let wN=0,kN=0;
        for(let row=0;row<2;row++)for(let c=0;c<chk;c++){const lane=(c/(chk-1)-.5)*CIRC_W,fwd=row*1.5;
          const off=new THREE.Vector3(lane,0,fwd).applyQuaternion(Q);P.set(startP.p.x+off.x,GY+.13,startP.p.z+off.z);MX.compose(P,Q,SC);
          if((c+row)%2)cW.setMatrixAt(wN++,MX);else cK.setMatrixAt(kN++,MX)}
        cW.count=wN;cK.count=kN;cW.instanceMatrix.needsUpdate=true;cK.instanceMatrix.needsUpdate=true});

      // --- main grandstand: larger, multi-tier, opposite the pits on the start straight, + a big screen ---
      safe(()=>{
        const n=startP.n,sgn=1,base=HALF+20;                 // pit box sits on the other side (-n), so put the main stand on +n
        const mx0=startP.p.x+n.x*sgn*base,mz0=startP.p.z+n.z*sgn*base,yaw=Math.atan2(startP.p.x-mx0,startP.p.z-mz0);
        const g=new THREE.Group();g.position.set(mx0,GY,mz0);g.rotation.y=yaw;root.add(g);
        const bodyMat=addMat(M(theme.stand)),trimMat=addMat(M(theme.standTrim)),glassMat=addMat(M(0x9db9c1)),roofMat=addMat(M(theme.stand));
        // three stacked seating decks
        for(let d=0;d<3;d++){const deck=new THREE.Mesh(new THREE.BoxGeometry(46,2.4,9-d*1.2),bodyMat);deck.position.set(0,2+d*3.4,-d*3.4);deck.castShadow=true;deck.receiveShadow=true;g.add(deck);deck.userData.solid=true;
          const band=new THREE.Mesh(new THREE.BoxGeometry(46,.6,9.3-d*1.2),trimMat);band.position.set(0,3.3+d*3.4,-d*3.4);g.add(band)}
        // crowd on the main stand
        const COLS=LOW?18:26,ROWS=6,cm=addMat(M(0xffffff)),cim=new THREE.InstancedMesh(new THREE.BoxGeometry(.6,.9,.55),cm,COLS*ROWS);cim.castShadow=!LOW;g.add(cim);
        const PAL=[0xe4572e,0xf3a712,0xd9d4c6,0x2f6f9e,0x3f8a56,0xb8322f,0x5c4b8a,0xe0bd58];let ci=0;
        for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){P.set((c/(COLS-1)-.5)*43,3.4+r*1.5,2.2-r*1.3);MX.compose(P,new THREE.Quaternion(),SC);cim.setMatrixAt(ci,MX);
          if(cim.setColorAt)cim.setColorAt(ci,COL.setHex(PAL[(seeded()*PAL.length)|0]));ci++}
        cim.instanceMatrix.needsUpdate=true;if(cim.instanceColor)cim.instanceColor.needsUpdate=true;
        // cantilever roof on columns
        const roof=new THREE.Mesh(new THREE.BoxGeometry(50,.7,16),roofMat);roof.position.set(0,15.5,-4);roof.castShadow=true;g.add(roof);
        [-22,-7,7,22].forEach(cx0=>{const col=new THREE.Mesh(new THREE.BoxGeometry(.8,15,.8),bodyMat);col.position.set(cx0,7.5,-8.5);g.add(col)});
        // VIP glass box under the roof
        const vip=new THREE.Mesh(new THREE.BoxGeometry(20,3,4),glassMat);vip.position.set(0,13,-7.5);g.add(vip);
        // big screen facing the track, bright so it reads day or night
        safe(()=>{const scr=addMat(new THREE.MeshBasicMaterial({map:signTex('LIVE','#0a0a0a','#5cf2ff'),side:THREE.DoubleSide}));
          const panel=new THREE.Mesh(new THREE.PlaneGeometry(13,7),scr);panel.position.set(-30,12,2.2);panel.rotation.y=-0.5;g.add(panel);
          const frame=new THREE.Mesh(new THREE.BoxGeometry(14,8,.5),addMat(M(0x15140f)));frame.position.set(-30,12,1.9);frame.rotation.y=-0.5;g.add(frame)});
        // sponsor band along the stand front
        safe(()=>{const w=ADCOL[(seeded()*ADCOL.length)|0];const band=addMat(new THREE.MeshBasicMaterial({map:signTex(WORDS[(seeded()*WORDS.length)|0],'#'+w[0].toString(16).padStart(6,'0'),'#'+w[1].toString(16).padStart(6,'0')),side:THREE.DoubleSide}));
          const b=new THREE.Mesh(new THREE.PlaneGeometry(44,2.2),band);b.position.set(0,1.4,4.6);g.add(b)});
      });

      // --- race-control / timing tower near the start, set back on the pit side ---
      safe(()=>{
        const n=startP.n,base=HALF+26,tx=startP.p.x-n.x*base,tz=startP.p.z-n.z*base;
        const g=new THREE.Group();g.position.set(tx,GY,tz);g.rotation.y=Math.atan2(startP.p.x-tx,startP.p.z-tz);root.add(g);
        const bodyMat=addMat(M(theme.stand)),glassMat=addMat(M(0x9db9c1)),winMat=addMat(new THREE.MeshBasicMaterial({color:0x2a3138}));
        const shaft=new THREE.Mesh(new THREE.BoxGeometry(7,22,7),bodyMat);shaft.position.y=11;shaft.castShadow=true;g.add(shaft);shaft.userData.solid=true;
        for(let f=0;f<5;f++){const band=new THREE.Mesh(new THREE.BoxGeometry(7.3,1.6,7.3),f===4?glassMat:winMat);band.position.y=4+f*4;g.add(band)}
        const top=new THREE.Mesh(new THREE.BoxGeometry(9,3.5,9),glassMat);top.position.y=23.5;top.castShadow=true;g.add(top);
        const ant=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,6,6),bodyMat);ant.position.y=28.5;g.add(ant);
        // timing board facing the straight
        safe(()=>{const scr=addMat(new THREE.MeshBasicMaterial({map:signTex('P1  1:23.4','#0a0a0a','#f3a712'),side:THREE.DoubleSide}));
          const b=new THREE.Mesh(new THREE.PlaneGeometry(6,1.6),scr);b.position.set(0,24,4.6);g.add(b)});
      });

      // --- tyre barriers: stacked tyres on the OUTSIDE of every corner ---
      safe(()=>{
        const rubber=addMat(M(0x1b1a18)),cap=corners.length*22;if(!cap)return;
        const tyreGeo=new THREE.CylinderGeometry(.75,.75,.55,10).rotateX(Math.PI/2);  // lay the tyre flat-faced toward the track
        const im=new THREE.InstancedMesh(tyreGeo,rubber,cap);im.castShadow=!LOW;root.add(im);let k=0;
        corners.forEach(ci=>{for(let d=-4;d<=4;d+=2){const i=(ci+d+SN)%SN,a=SA[i],s=outSide(i),off=HALF+BARRIER_OFF+1.6;
          const bx=a.p.x+a.n.x*s*off,bz=a.p.z+a.n.z*s*off,yaw=Math.atan2(a.tg.x,a.tg.z);Q.setFromAxisAngle(up,yaw);
          for(let row=0;row<2&&k<cap;row++){P.set(bx,GY+.4+row*.58,bz);MX.compose(P,Q,SC);im.setMatrixAt(k++,MX)}}});
        im.count=k;im.instanceMatrix.needsUpdate=true});

      // --- debris fencing: posts + a faint mesh panel on the spectator side, all the way round ---
      safe(()=>{
        const postMat=addMat(M(0x3a3a3a)),meshMat=addMat(new THREE.MeshBasicMaterial({color:0xb9bcc2,transparent:true,opacity:.14,side:THREE.DoubleSide}));
        const fenceN=Math.max(24,Math.round(L/16)),postIM=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,4,.16),postMat,fenceN);postIM.castShadow=!LOW;root.add(postIM);
        const panelGeo=new THREE.PlaneGeometry(1,3.4),panelIM=new THREE.InstancedMesh(panelGeo,meshMat,fenceN);root.add(panelIM);let fn=0;
        for(let i=0;i<fenceN;i++){const a=circAt(i/fenceN,curve),s=i%2?1:-1,off=HALF+13;
          const bx=a.p.x+a.n.x*s*off,bz=a.p.z+a.n.z*s*off,yaw=Math.atan2(a.tg.x,a.tg.z);Q.setFromAxisAngle(up,yaw);
          P.set(bx,GY+2,bz);MX.compose(P,Q,SC);postIM.setMatrixAt(fn,MX);
          // panel plane: default normal is +Z; rotate an extra 90deg so its WIDTH runs along the
          // tangent (fence parallel to the track) and its normal faces the track, not across it
          const seg=L/fenceN,Qp=new THREE.Quaternion().setFromAxisAngle(up,yaw+Math.PI/2);
          P.set(bx,GY+2.2,bz);SC.set(seg,1,1);MX.compose(P,Qp,SC);panelIM.setMatrixAt(fn,MX);SC.set(1,1,1);fn++}
        postIM.count=fn;panelIM.count=fn;postIM.instanceMatrix.needsUpdate=true;panelIM.instanceMatrix.needsUpdate=true});

      // --- marshal posts at corners: a little booth with a bright flag ---
      safe(()=>{
        const booth=addMat(M(0xd9d4c6)),roofMat=addMat(M(0xb8322f)),flagMat=addMat(new THREE.MeshBasicMaterial({color:0xf3a712,side:THREE.DoubleSide}));
        const picks=corners.slice(0,LOW?5:10);
        picks.forEach(ci=>{const a=SA[ci],s=outSide(ci),off=HALF+10;const bx=a.p.x+a.n.x*s*off,bz=a.p.z+a.n.z*s*off,yaw=Math.atan2(a.p.x-bx+a.tg.x,a.p.z-bz+a.tg.z);
          const g=new THREE.Group();g.position.set(bx,GY,bz);g.rotation.y=Math.atan2(a.tg.x,a.tg.z);root.add(g);
          const b=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.2,1.6),booth);b.position.y=1.1;b.castShadow=!LOW;g.add(b);
          const rf=new THREE.Mesh(new THREE.BoxGeometry(2.7,.3,1.9),roofMat);rf.position.y=2.35;g.add(rf);
          const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,3,6),booth);pole.position.set(1.4,1.5,0);g.add(pole);
          const fl=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.7),flagMat);fl.position.set(1.95,2.6,0);g.add(fl)})});

      // --- camera towers at the hardest corners and the main straight ---
      safe(()=>{
        const poleMat=addMat(M(0x2a2a2a)),camMat=addMat(M(0x15140f)),lens=addMat(new THREE.MeshBasicMaterial({color:0x5cf2ff}));
        const picks=corners.slice(0,LOW?3:6).concat([straightMid]);
        picks.forEach(ci=>{const a=SA[ci],s=outSide(ci),off=HALF+11;const bx=a.p.x+a.n.x*s*off,bz=a.p.z+a.n.z*s*off;
          const g=new THREE.Group();g.position.set(bx,GY,bz);g.rotation.y=Math.atan2(a.p.x-bx,a.p.z-bz);root.add(g);
          const pole=new THREE.Mesh(new THREE.CylinderGeometry(.14,.2,9,8),poleMat);pole.position.y=4.5;pole.castShadow=!LOW;g.add(pole);
          const cam=new THREE.Mesh(new THREE.BoxGeometry(.9,.7,1.4),camMat);cam.position.set(0,9.2,.4);g.add(cam);
          const l=new THREE.Mesh(new THREE.CircleGeometry(.22,10),lens);l.position.set(0,9.2,1.12);g.add(l)})});

      // --- advertising hoardings around the barrier ring + on the main straight edge ---
      safe(()=>{
        const adN=LOW?8:14;
        for(let i=0;i<adN;i++){safe(()=>{const w=ADCOL[(seeded()*ADCOL.length)|0],word=WORDS[(seeded()*WORDS.length)|0];
          const mat=addMat(new THREE.MeshBasicMaterial({map:signTex(word,'#'+w[0].toString(16).padStart(6,'0'),'#'+w[1].toString(16).padStart(6,'0')),side:THREE.DoubleSide}));
          const ang=i/adN*Math.PI*2,rr=r0-2,bx=cx+Math.cos(ang)*rr,bz=cz+Math.sin(ang)*rr;
          const b=new THREE.Mesh(new THREE.PlaneGeometry(10,2.4),mat);b.position.set(bx,GY+1.4,bz);b.rotation.y=Math.atan2(cx-bx,cz-bz);root.add(b);
          const legMat=addMat(M(0x3a3a3a));const leg=new THREE.Mesh(new THREE.BoxGeometry(10,.3,.3),legMat);leg.position.set(bx,GY+.25,bz);leg.rotation.y=b.rotation.y;root.add(leg)})}});

      // --- sponsor bridge spanning the main straight ---
      safe(()=>{
        const a=SA[straightMid],s=HALF+BARRIER_OFF+2,legMat=addMat(M(theme.stand)),w=ADCOL[(seeded()*ADCOL.length)|0];
        const g=new THREE.Group();g.position.copy(a.p);g.position.y=GY;g.rotation.y=Math.atan2(a.tg.x,a.tg.z);root.add(g);g.userData.onTrack=true;
        [-1,1].forEach(sd=>{const leg=new THREE.Mesh(new THREE.BoxGeometry(1.4,9,1.4),legMat);leg.position.set(sd*s,4.5,0);leg.castShadow=!LOW;g.add(leg);leg.userData.solid=true});
        const beam=new THREE.Mesh(new THREE.BoxGeometry(2*s+3,2.2,2.6),legMat);beam.position.y=9.5;beam.castShadow=!LOW;g.add(beam);
        safe(()=>{const mat=addMat(new THREE.MeshBasicMaterial({map:signTex(WORDS[(seeded()*WORDS.length)|0],'#'+w[0].toString(16).padStart(6,'0'),'#'+w[1].toString(16).padStart(6,'0')),side:THREE.DoubleSide}));
          const b=new THREE.Mesh(new THREE.PlaneGeometry(2*s+2,1.8),mat);b.position.set(0,9.5,1.35);g.add(b)})});

      // --- outer car park: an asphalt apron dotted with parked cars, out past the stands ---
      safe(()=>{
        const n=startP.n,base=r0+34,px=cx+n.x*base,pz=cz+n.z*base;
        const lotMat=addMat(M(0x2b2a27)),lot=new THREE.Mesh(new THREE.PlaneGeometry(70,46).rotateX(-Math.PI/2),lotMat);lot.position.set(px,GY+.02,pz);lot.receiveShadow=true;root.add(lot);
        const CARS=LOW?28:54,carMat=addMat(M(0xffffff)),carIM=new THREE.InstancedMesh(new THREE.BoxGeometry(2,1.3,4.3),carMat,CARS);carIM.castShadow=!LOW;root.add(carIM);
        const CP=[0xb8322f,0x2f6f9e,0xd9d4c6,0x3a3a3a,0xd4a83a,0x3f8a56,0xe4572e,0x8a8f98];let k=0;
        const cols=9,rows=Math.ceil(CARS/cols);
        for(let r=0;r<rows&&k<CARS;r++)for(let c=0;c<cols&&k<CARS;c++){const lx=(c-cols/2)*6.4,lz=(r-rows/2)*10;
          P.set(px+lx,GY+.65,pz+lz);Q.setFromAxisAngle(up,(r%2)*Math.PI);MX.compose(P,Q,SC);carIM.setMatrixAt(k,MX);
          if(carIM.setColorAt)carIM.setColorAt(k,COL.setHex(CP[(seeded()*CP.length)|0]));k++}
        carIM.instanceMatrix.needsUpdate=true;if(carIM.instanceColor)carIM.instanceColor.needsUpdate=true;
        // a short service road linking the lot back toward the venue
        const srMat=addMat(M(0x44423c)),sr=new THREE.Mesh(new THREE.PlaneGeometry(7,40).rotateX(-Math.PI/2),srMat);
        sr.position.set(cx+n.x*(r0+6),GY+.03,cz+n.z*(r0+6));sr.lookAt(px,GY,pz);sr.rotateX(-Math.PI/2);root.add(sr)});
    }
    /* ---------- obstacles placed in the editor: speed breakers, roadblocks, ramps ----------
       Built along the real road (heading + slope), tagged as on-track so the clearance pass keeps
       them, and given solid boxes below. u is position round the lap, s is -1 left / 0 middle / 1 right. */
    const obsList=Array.isArray(venue.obstacles)?venue.obstacles.slice(0,60):[];
    {const HALF=CIRC_W/2,yel=M(0xd4a83a,{roughness:.6}),blk=M(0x1b1a18,{roughness:.8}),conc=M(0xd9d4c6,{roughness:.85}),stripe=M(0xb8322f,{roughness:.6}),rampM=M(0x6e6a62,{roughness:.7});
     ownedMats.push(yel,blk,conc,stripe,rampM);
     obsList.forEach(o=>{const t=o.t||o.type,u=((+o.u%1)+1)%1,sd=Math.max(-1,Math.min(1,Math.round(+(o.s!=null?o.s:o.side)||0)));
       if(!isFinite(u))return;const a=circAt(u,curve),yaw=Math.atan2(a.tg.x,a.tg.z),slope=Math.atan2(a.tg.y,Math.hypot(a.tg.x,a.tg.z));
       const g=new THREE.Group();g.rotation.order='YXZ';g.rotation.set(-slope,yaw,0);g.userData.onTrack=true;root.add(g);
       if(t==='speed_breaker'){
         g.position.set(a.p.x,CIRC_Y,a.p.z);
         // full-width hump, painted in alternating bands so it reads from a distance
         const bands=8;for(let b=0;b<bands;b++){const m=new THREE.Mesh(new THREE.BoxGeometry(CIRC_W*.94/bands,.16,1.5),b%2?blk:yel);m.position.set((b/(bands-1)-.5)*CIRC_W*.94*(bands-1)/bands,.08+.12,0);m.receiveShadow=true;g.add(m);if(b===0)m.userData.solidSpan={hx:CIRC_W*.47,hy:.08,hz:.75,ox:-m.position.x}}
       }else if(t==='blocker'){
         // concrete jersey barriers closing one third of the road: left, middle or right lane
         const lane=sd*HALF*.62;g.position.set(a.p.x+a.n.x*lane,CIRC_Y,a.p.z+a.n.z*lane);
         for(let b=-1;b<=1;b++){const m=new THREE.Mesh(new THREE.BoxGeometry(CIRC_W*.3/3-.15,1.1,.8),conc);m.position.set(b*CIRC_W*.3/3,.55+.12,0);m.castShadow=!LOW;g.add(m);m.userData.solid=true;
           const st=new THREE.Mesh(new THREE.BoxGeometry(CIRC_W*.3/3-.1,.18,.84),stripe);st.position.set(b*CIRC_W*.3/3,.85+.12,0);g.add(st)}
       }else if(t==='ramp'){
         // a real jump: a 9 m deck tilted 13deg up from the road, leading edge flush with the asphalt
         const lane=sd*HALF*.5;g.position.set(a.p.x+a.n.x*lane,CIRC_Y,a.p.z+a.n.z*lane);
         const ang=.23,len=9,th=.5,w=Math.min(5.5,CIRC_W*.42),deck=new THREE.Mesh(new THREE.BoxGeometry(w,th,len),rampM);
         deck.rotation.x=-ang;deck.position.set(0,.12+Math.sin(ang)*len/2-th/2*Math.cos(ang)+.02,0);deck.castShadow=!LOW;deck.receiveShadow=true;g.add(deck);deck.userData.solid=true;
         const lip=new THREE.Mesh(new THREE.BoxGeometry(w,.2,.6),yel);lip.position.set(0,.12+Math.sin(ang)*len+.02,len/2*Math.cos(ang));g.add(lip);
         for(const sx of [-1,1]){const side=new THREE.Mesh(new THREE.BoxGeometry(.25,Math.sin(ang)*len,len*.98),stripe);side.position.set(sx*(w/2+.12),.12+Math.sin(ang)*len/2,0);g.add(side)}
       }});
    }
    /* ---------- keep the racing surface clear ----------
       Every prop was placed relative to ONE point of the track, so on a twisty loop another part of
       the track could run straight through it. Sample each prop's real footprint against the whole
       lap and remove anything that touches the road (trackside items need .6 m, buildings 5 m). */
    root.updateMatrixWorld(true);
    const HALFW=CIRC_W/2,isTagged=(o,key)=>{for(let q=o;q&&q!==root;q=q.parent)if(q.userData&&q.userData[key])return true;return false};
    const fpPt=new THREE.Vector3(),fpA=new THREE.Vector3(),fpB=new THREE.Vector3(),fpM=new THREE.Matrix4(),fpI=new THREE.Matrix4(),ZERO=new THREE.Matrix4().makeScale(0,0,0);
    const footprintHits=(geo,mw)=>{
      if(!geo.boundingBox)geo.computeBoundingBox();const b=geo.boundingBox;if(!isFinite(b.min.x))return false;
      fpA.set(b.min.x,0,b.min.z).applyMatrix4(mw);fpB.set(b.max.x,0,b.max.z).applyMatrix4(mw);
      const sx=b.max.x-b.min.x,sz=b.max.z-b.min.z,size=Math.max(fpA.distanceTo(fpB),.1);
      const clear=HALFW+BARRIER_OFF+(size>7?1.4:.6),nx=Math.min(14,Math.max(2,Math.ceil(sx*Math.max(1,size/Math.max(sx,sz,.1))/3)+1)),nz=Math.min(14,Math.max(2,Math.ceil(sz*Math.max(1,size/Math.max(sx,sz,.1))/3)+1)),my=(b.min.y+b.max.y)/2;
      for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){fpPt.set(b.min.x+sx*i/(nx-1),my,b.min.z+sz*j/(nz-1)).applyMatrix4(mw);
        if(trackDist(fpPt.x,fpPt.z,clear+2)<clear)return true}
      return false};
    let removed=0;
    root.traverse(o=>{
      if(!(o.isMesh)||!o.visible||isTagged(o,'onTrack')||o.userData.linkedChild)return;
      if(o.isInstancedMesh){
        for(let i=0;i<o.count;i++){o.getMatrixAt(i,fpI);fpM.multiplyMatrices(o.matrixWorld,fpI);
          let hit=footprintHits(o.geometry,fpM);
          const links=o.userData.links||[];
          if(!hit)for(const L of links){for(let k=0;k<L.per&&!hit;k++){const ii=i*L.per+k;if(ii>=L.im.count)break;L.im.getMatrixAt(ii,fpI);fpM.multiplyMatrices(L.im.matrixWorld,fpI);hit=footprintHits(L.im.geometry,fpM)}if(hit)break}
          if(hit){o.setMatrixAt(i,ZERO);removed++;for(const L of links)for(let k=0;k<L.per;k++){const ii=i*L.per+k;if(ii<L.im.count)L.im.setMatrixAt(ii,ZERO)}}}
        o.instanceMatrix.needsUpdate=true;(o.userData.links||[]).forEach(L=>L.im.instanceMatrix.needsUpdate=true);
      }else if(footprintHits(o.geometry,o.matrixWorld)){o.visible=false;o.userData.cleared=true;removed++}});
    /* ---------- settle everything onto the hills ----------
       Props were laid out at the flat base height; lift or lower each one by the ground height under it. */
    if(ELEV){
      root.children.forEach(o=>{if(o.userData.fixedY)return;
        if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,fpI);const e=fpI.elements;if(e[0]===0&&e[5]===0&&e[10]===0)continue;e[13]+=groundAt(e[12],e[14])-CIRC_Y;o.setMatrixAt(i,fpI)}o.instanceMatrix.needsUpdate=true}
        else o.position.y+=groundAt(o.position.x,o.position.z)-CIRC_Y});
      wallBodies.forEach(b=>{b.position.y+=groundAt(b.position.x,b.position.z)-CIRC_Y});
      root.updateMatrixWorld(true);
    }
    /* ---------- collision for the big structures and the obstacles ----------
       Grandstands, pits, towers, bridge legs, barriers and ramps get a matching static box (same
       position, rotation and size as what you see), so nothing can be driven through. */
    const solidBodies=[],sbQ=new THREE.Quaternion(),sbP=new THREE.Vector3(),sbS=new THREE.Vector3(),sbC=new THREE.Vector3();
    const addSolid=(mw,hx0,hy0,hz0,center)=>{mw.decompose(sbP,sbQ,sbS);const c=center?center.clone().applyMatrix4(mw):sbP;
      const hxs=hx0*Math.abs(sbS.x),hys=hy0*Math.abs(sbS.y),hzs=hz0*Math.abs(sbS.z);if(!(hxs>0&&hys>0&&hzs>0))return;
      const b=new CANNON.Body({mass:0,material:gM});b.addShape(new CANNON.Box(new CANNON.Vec3(hxs,hys,hzs)));b.position.set(c.x,c.y,c.z);b.quaternion.set(sbQ.x,sbQ.y,sbQ.z,sbQ.w);world.addBody(b);solidBodies.push(b)};
    root.traverse(o=>{
      if(!o.isMesh||!o.visible)return;let hidden=false;for(let q=o;q&&q!==root;q=q.parent)if(!q.visible){hidden=true;break}if(hidden)return;
      if(o.userData.solid){if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const bb=o.geometry.boundingBox;bb.getCenter(sbC);addSolid(o.matrixWorld,(bb.max.x-bb.min.x)/2,(bb.max.y-bb.min.y)/2,(bb.max.z-bb.min.z)/2,sbC)}
      if(o.userData.solidSpan){const sp=o.userData.solidSpan,m=o.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(sp.ox,0,0));addSolid(m,sp.hx,sp.hy,sp.hz)}
      if(o.isInstancedMesh&&o.userData.solidInst){const si=o.userData.solidInst;for(let i=0;i<o.count;i++){o.getMatrixAt(i,fpI);const e=fpI.elements;if(e[0]===0&&e[5]===0&&e[10]===0)continue;
        fpM.multiplyMatrices(o.matrixWorld,fpI).multiply(new THREE.Matrix4().makeTranslation(0,si.yo,0));addSolid(fpM,si.hx,si.hy,si.hz)}}});
    stadiumBodies=stadiumBodies.concat(solidBodies);
    circuit={hazeTo:circuit_hazeFn,curve,CN,CSAMP,root,groundBody,bodies:[groundBody].concat(wallBodies).concat(stadiumBodies),lights:startLightsIM,startP,ownedMats,theme,seed,pts:pts2D,venue,minY,trackDist,groundAt,cleared:removed};
    if(window.RaceEngine){const laps=lapsCfg();window.RaceEngine.initTrack('circuit',curve,pts3,{laps,roadWidth:CIRC_W});window.RaceEngine.isDaily=!!venue.daily}
    return circuit}
  function enterCircuit(){if(!circuit)return;
    worldSave={p:chassisB.position.clone(),q:chassisB.quaternion.clone()};
    MODE='circuit';circU0=-1;circLap=0;circBest=null;circLapT0=performance.now();
    if(window.RaceEngine&&circuit){const laps=lapsCfg();window.RaceEngine.initTrack('circuit',circuit.curve,circuit.CSAMP,{laps,roadWidth:CIRC_W})}
    const {p,tg}=circuit.startP;
    PREV.ok=false;physAcc=0;leanVf=0;leanA=0;if(vis.body)vis.body.rotation.set(0,0,0);
    chassisB.position.set(p.x,p.y+1.4,p.z);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);
    chassisB.force.set(0,0,0);chassisB.torque.set(0,0,0);
    chassisB.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.atan2(tg.x,tg.z));
    veh.wheelInfos.forEach(w=>{w.suspensionLength=w.suspensionRestLength;w.deltaRotation=0});
    for(let i=0;i<4;i++){veh.applyEngineForce(0,i);veh.setBrake(0,i)}
    // each theme tints fog/sky to match (desert haze, snow glare, etc); saved once so leaving
    // always restores the exact value the main map had, regardless of weather/day-night state
    worldFogSave={fog:S.fog.color.getHex(),bg:S.background.getHex()};
    const th=circuit.theme||THEME_DEFAULT;S.fog.color.setHex(th.fog);S.background.setHex(th.sky);
    // gravity is gameplay, not decoration: themes that define one (currently just Moon) override
    // world.gravity.y here and it's restored byte-for-byte on leave. Everything that derives force
    // from gravity (suspension load, hill-climb aid, reverse assist) reads world.gravity.y live,
    // so lighter gravity here isn't just a falling-speed change - the whole car feels different.
    worldGSave=world.gravity.y;
    world.gravity.y=(th.gravity!=null)?th.gravity:worldGSave;
    if(!worldWeatherSave)worldWeatherSave={lock:wxLock,id:wx.id};
    const venue=circuit.venue||{},weather=WEATHERS.some(w=>w.id===venue.weather)?venue.weather:'day',time=WEATHERS.some(w=>w.id===venue.time)?venue.time:'day';
    setWeather(weather,true);
    if(time!==weather){mood(time,.8);const weatherTarget=wxOf(weather);wxB.part=weatherTarget.part;wxB.slip=weatherTarget.slip;wxB.dust=weatherTarget.dust}
    // kick off the start-light sequence, and hide the (Earth-only) mission card while racing here
    circuit.lightsStart=performance.now();circuit.lightsDone=false;circuit.cdN=0;
    if(missEl)missEl.classList.remove('on');
    C.far=1800;C.updateProjectionMatrix();                  // the venue's ground and mountains run out to the horizon
    if(circuit.hazeTo)circuit.hazeTo(S.fog.color);
    toastMsg('Venue · '+th.name+' · seed '+circuit.seed);updCircBtn()}
  function leaveCircuit(){if(MODE!=='circuit')return;
    C.far=320;C.updateProjectionMatrix();
    MODE='world';
    if(window.RaceEngine)window.RaceEngine.stopRace();try{CAI.clear()}catch(e){}
    if(missEl)missEl.classList.add('on');
    if(worldSave){PREV.ok=false;physAcc=0;chassisB.position.copy(worldSave.p);chassisB.quaternion.copy(worldSave.q);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0)}
    if(worldFogSave){S.fog.color.setHex(worldFogSave.fog);S.background.setHex(worldFogSave.bg);worldFogSave=null}
    if(worldGSave!=null){world.gravity.y=worldGSave;worldGSave=null}
    if(worldWeatherSave){const saved=worldWeatherSave;worldWeatherSave=null;setWeather(saved.lock||'auto',true);if(!saved.lock&&saved.id)mood(saved.id,.8)}
    hint.textContent=TOUCH?'':'WASD drive · C camera · L time a lap · M map · R reset';
    toastMsg('Back to the valley');updCircBtn()}
  /* ---------- drawing overlay ---------- */
  /* ---------- AI rivals for solo races on drawn / daily tracks ----------
     Three cars from the grid slots behind you. Each one reads the track ahead and brakes for the tightest
     bend it can see (v = sqrt(grip / curvature)), slows for speed breakers and moves to the free lane
     around roadblocks and ramps. They feed the live position and the results screen. */
  const CAI=(function(){
    const NAMES=['Vega','Okafor','Lindqvist','Tanaka','Moreau','Rossi'],SKILL=[.84,.9,.96],PAINT=[0x2f6f9e,0xd4a83a,0x3f8a56,0x5c4b8a];
    let cars=[],on=false,curv=null,boardSet=false,laps=3;
    const UP=new CANNON.Vec3(0,1,0);
    function curvature(){const Cc=circuit,N=Cc.CN,ds=Cc.curve.getLength()/N;curv=new Float32Array(N);
      for(let i=0;i<N;i++){const a=Cc.curve.getTangentAt(((i-1+N)%N)/N),b=Cc.curve.getTangentAt(((i+1)%N)/N),la=Math.hypot(a.x,a.z)||1,lb=Math.hypot(b.x,b.z)||1;
        curv[i]=Math.acos(Math.max(-1,Math.min(1,(a.x*b.x+a.z*b.z)/(la*lb))))/(2*ds)}}
    function clear(){cars.forEach(c=>{if(c.car.g.parent)c.car.g.parent.remove(c.car.g);try{world.removeBody(c.bd)}catch(e){}});cars=[];on=false;boardSet=false}
    function start(n){
      clear();if(!circuit||!window.RaceEngine)return;curvature();laps=window.RaceEngine.totalLaps||3;
      const Cc=circuit,L=Cc.curve.getLength(),W=CIRC_W;
      for(let i=0;i<n;i++){const j=i+1,back=6+j*7.5,lane=(j%2===0?1:-1)*W*.28;
        const car=buildCar({paint:PAINT[i%PAINT.length],r:.42,zf:1.3,zb:-1.3,F:2.05,B:-2.05,W:2,xw:.84,ww:.3,wagon:false,wheels:true});
        car.g.rotation.order='YXZ';Cc.root.add(car.g);
        const bd=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC,material:oM});bd.addShape(new CANNON.Box(new CANNON.Vec3(.95,.62,2.05)));world.addBody(bd);
        cars.push({car,bd,u:((1-back/L)%1+1)%1,prog:-back/L,lane,lane0:lane,laneT:lane,spd:0,vmax:V.max*SKILL[i%SKILL.length],name:NAMES[(i+Math.floor(Math.random()*3))%NAMES.length],fin:0,pv:0,dive:0,wa:0,py:null})}
      on=true;place(0)}
    function playerProg(){const RE=window.RaceEngine,T=RE.checkpoints.length||16;return (RE.currentLap-1)+Math.max(0,RE.currentCheckpoint-1)/T}
    function place(dt){
      const Cc=circuit;
      cars.forEach(a=>{
        a.lane+=(a.laneT-a.lane)*Math.min(1,dt*1.6);
        const P=circAt(a.u,Cc.curve),x=P.p.x+P.n.x*a.lane,z=P.p.z+P.n.z*a.lane,y=Cc.groundAt?Cc.groundAt(x,z):P.p.y;
        const yaw=Math.atan2(P.tg.x,P.tg.z),pitch=Math.atan2(P.tg.y,Math.hypot(P.tg.x,P.tg.z));
        const G=a.car.g;G.position.set(x,y+.02,z);G.rotation.set(-pitch,yaw,0);
        const acc=dt>0?(a.spd-a.pv)/dt:0;a.pv=a.spd;a.dive+=(Math.max(-.03,Math.min(.03,acc*.012))-a.dive)*Math.min(1,dt*5);a.car.body.rotation.x=a.dive;
        a.car.tail.emissiveIntensity=(acc<-.6||a.spd<.4)?1.9:.55;
        let dy=a.py==null?0:yaw-a.py;if(dy>Math.PI)dy-=Math.PI*2;if(dy<-Math.PI)dy+=Math.PI*2;a.py=yaw;
        const stA=Math.max(-.45,Math.min(.45,dy/Math.max(dt,.001)/Math.max(1,a.spd)*2.6));
        a.wa+=a.spd*dt/.42;const W4=a.car.wheels;for(let w=0;w<W4.length;w++){W4[w].spin.rotation.x=a.wa;if(w<2)W4[w].w.rotation.y+=(stA-W4[w].w.rotation.y)*Math.min(1,dt*6)}
        a.bd.position.set(x,y+.86,z);a.bd.quaternion.setFromAxisAngle(UP,yaw);a.bd.velocity.set(P.tg.x*a.spd,0,P.tg.z*a.spd);a.bd.aabbNeedsUpdate=true})}
    function update(dt,now){
      if(!on||!circuit||MODE!=='circuit')return;const RE=window.RaceEngine;if(!RE)return;
      const go=RE.state==='racing'||RE.state==='finished'||RE.state==='results';
      const Cc=circuit,L=Cc.curve.getLength(),N=Cc.CN,W=CIRC_W,obs=Cc.venue.obstacles||[];
      if(go)cars.forEach(a=>{
        if(a.fin){a.spd=Math.max(0,a.spd-8*dt);a.u=(a.u+a.spd*dt/L)%1;return}
        // brake for the tightest bend inside stopping distance
        const look=Math.max(30,a.spd*a.spd/(2*7)+20);let k=0;for(let d=0;d<look;d+=L/N)k=Math.max(k,curv[Math.floor(((a.u+d/L)%1)*N)%N]);
        let want=Math.min(a.vmax,Math.sqrt(9/Math.max(1e-4,k)));a.laneT=a.lane0;
        for(const o of obs){const dm=(((o.u-a.u)%1+1)%1)*L;if(dm>90)continue;
          if(o.t==='speed_breaker'&&dm<45)want=Math.min(want,13);
          if(o.t==='blocker'||o.t==='ramp')a.laneT=o.s===0?(a.lane0>=0?W*.36:-W*.36):-o.s*W*.32}
        a.spd=want>a.spd?Math.min(want,a.spd+7*dt):Math.max(want,a.spd-14*dt);
        a.u=(a.u+a.spd*dt/L)%1;a.prog+=a.spd*dt/L;
        if(a.prog>=laps)a.fin=now-RE.raceStartTime});
      place(dt);
      // live position, and the full standings once you cross the line
      const pp=playerProg();let pos=1;cars.forEach(a=>{if(RE.finished?(a.fin&&a.fin<RE.totalRaceTime):a.prog>pp)pos++});
      RE.finalPosition=pos;if(!RE.finished)RE.leaderboard=new Array(cars.length+1).fill(0);
      /* standings after you finish: rivals keep driving their laps, and each one's time appears only when it
         actually crosses the line (no projected times). Refreshed whenever another rival finishes. */
      if(RE.finished){const nFin=cars.filter(a=>a.fin).length;
        if(!boardSet||nFin!==boardSet.n){boardSet={n:nFin};
          const rows=[{name:'You',finishTime:RE.totalRaceTime,isMe:true}].concat(cars.map(a=>({name:a.name,finishTime:a.fin||null,racing:!a.fin,prog:a.prog})));
          rows.sort((p,q)=>p.finishTime&&q.finishTime?p.finishTime-q.finishTime:p.finishTime?-1:q.finishTime?1:q.prog-p.prog);
          rows.forEach((r,i)=>r.position=i+1);RE.leaderboard=rows;if(RE.refreshResults)RE.refreshResults()}}}
    return {start,clear,update,get on(){return on}};
  })();
  /* One lap count. In a room the host's choice (#dmplaps) is authoritative; on your own it is the draw-track
     panel's Laps setting. buildCircuit, enterCircuit and the race start all read it through here. */
  const raceCfg={laps:3},DAILY_LAPS=3;
  function lapsCfg(){const inRoom=typeof MP!=='undefined'&&MP&&MP.on;return Math.max(1,Math.min(50,inRoom&&MP.getLaps?MP.getLaps():raceCfg.laps))}
  function bigCount(t){const el=$('#dcount');if(!el)return;el.textContent=t;el.classList.remove('on');void el.offsetWidth;el.classList.add('on');
    if(t==='GO')setTimeout(()=>{if(el.textContent==='GO')el.classList.remove('on')},900)}
  function restartSoloRace(){
    if(MODE!=='circuit'||!circuit||!window.RaceEngine)return;
    const RE=window.RaceEngine;RE.initTrack('circuit',circuit.curve,circuit.CSAMP,{laps:circuit.daily?DAILY_LAPS:lapsCfg(),roadWidth:CIRC_W});RE.isDaily=!!circuit.daily;RE.dailyDate=circuit.dailyDate||null;
    RE.closeResultsModal();
    circuit.lightsDone=false;circuit.lightsStart=performance.now();circuit.cdN=0;
    RE.startCountdown(0,sp=>{if(window.resetCarTo)window.resetCarTo({pos:{x:sp.x,y:sp.y,z:sp.z},tangent:circuit.startP.tg})});CAI.start(3)}
  window.restartSoloRace=restartSoloRace;
  const circDrawEl=$('#dcirc'),circCv=$('#dcircdraw'),circErrEl=$('#dcircerr'),circGoEl=$('#dcircgo'),circSeedEl=$('#dcircseed');
  const circCx=circCv?circCv.getContext('2d'):null;
  let drawPts=[],drawingNow=false,pendingTrack=null,drawRS=[],drawObs=[],drawTool='draw';
  const OBS_LOOK={speed_breaker:{c:'#d4a83a',l:'S'},blocker:{c:'#d9d4c6',l:'B'},ramp:{c:'#5cf2ff',l:'R'}};
  const selVal=(id,d)=>{const e=$(id);return e&&e.value?e.value:d};
  function resizeDrawCv(){if(!circCv)return;circCv.width=innerWidth;circCv.height=innerHeight}
  addEventListener('resize',resizeDrawCv);
  function redrawPath(){if(!circCx)return;circCx.clearRect(0,0,circCv.width,circCv.height);
    const line=drawingNow||!drawRS.length?drawPts:drawRS.concat([drawRS[0]]);
    if(line.length<2)return;
    circCx.strokeStyle='#f2eee6';circCx.lineWidth=4;circCx.lineJoin='round';circCx.lineCap='round';
    circCx.beginPath();circCx.moveTo(line[0].x,line[0].y);
    for(let i=1;i<line.length;i++)circCx.lineTo(line[i].x,line[i].y);
    circCx.stroke();
    if(!drawRS.length)return;
    // start/finish + direction of travel
    {const a=drawRS[0],b=drawRS[1];circCx.fillStyle='#3f8a56';circCx.beginPath();circCx.arc(a.x,a.y,8,0,6.283);circCx.fill();
     const ang=Math.atan2(b.y-a.y,b.x-a.x);circCx.save();circCx.translate(a.x,a.y);circCx.rotate(ang);circCx.fillStyle='#f2eee6';circCx.beginPath();circCx.moveTo(22,0);circCx.lineTo(12,-6);circCx.lineTo(12,6);circCx.closePath();circCx.fill();circCx.restore()}
    // obstacle markers, offset to the side of the line they block
    drawObs.forEach(o=>{const q=obsCanvasPos(o),L=OBS_LOOK[o.t]||OBS_LOOK.speed_breaker;
      circCx.fillStyle=L.c;circCx.beginPath();circCx.arc(q.x,q.y,10,0,6.283);circCx.fill();
      circCx.fillStyle='#06070b';circCx.font='bold 11px monospace';circCx.textAlign='center';circCx.textBaseline='middle';circCx.fillText(L.l,q.x,q.y+.5)})}
  function rsNormal(i){const n=drawRS.length,a=drawRS[(i-1+n)%n],b=drawRS[(i+1)%n];let tx=b.x-a.x,ty=b.y-a.y;const l=Math.hypot(tx,ty)||1;return {x:-ty/l,y:tx/l}}
  function obsCanvasPos(o){const i=Math.round(o.u*drawRS.length)%drawRS.length,p=drawRS[i],n=rsNormal(i);return {x:p.x+n.x*o.s*9,y:p.y+n.y*o.s*9}}
  function placeObstacle(pt){
    if(!drawRS.length){if(circErrEl)circErrEl.textContent='Draw the track first, then place obstacles on it.';return}
    // tap an existing marker to remove it
    const hit=drawObs.findIndex(o=>{const q=obsCanvasPos(o);return Math.hypot(q.x-pt.x,q.y-pt.y)<14});
    if(hit>=0){drawObs.splice(hit,1);redrawPath();if(circErrEl)circErrEl.textContent=drawObs.length+' obstacle'+(drawObs.length===1?'':'s')+' on the track';return}
    let bi=0,bd=1e9;drawRS.forEach((p,i)=>{const d=Math.hypot(p.x-pt.x,p.y-pt.y);if(d<bd){bd=d;bi=i}});
    if(bd>34){if(circErrEl)circErrEl.textContent='Tap on the track line to place an obstacle.';return}
    if(drawObs.length>=40){if(circErrEl)circErrEl.textContent='That is plenty of obstacles (40 max).';return}
    const n=rsNormal(bi),off=(pt.x-drawRS[bi].x)*n.x+(pt.y-drawRS[bi].y)*n.y,side=Math.abs(off)<6?0:(off>0?1:-1);
    drawObs.push({t:selVal('#dcircobstype','speed_breaker'),u:bi/drawRS.length,s:side});
    redrawPath();if(circErrEl)circErrEl.textContent=drawObs.length+' obstacle'+(drawObs.length===1?'':'s')+' on the track · tap one again to remove it'}
  function openDrawer(){if(!circDrawEl)return;if(MODE==='circuit'){toastMsg('Return to Earth before generating a new venue');return}resizeDrawCv();drawPts=[];drawingNow=false;pendingTrack=null;if(circGoEl)circGoEl.disabled=true;if(circErrEl)circErrEl.textContent='';redrawPath();circDrawEl.classList.add('on')}
  function closeDrawer(){if(circDrawEl)circDrawEl.classList.remove('on')}
  if(circCv){
    const posOf=e=>{const r=circCv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
    circCv.addEventListener('pointerdown',e=>{if(drawTool==='obstacles'){placeObstacle(posOf(e));return}drawRS=[];drawObs=[];drawingNow=true;pendingTrack=null;if(circGoEl)circGoEl.disabled=true;drawPts=[posOf(e)];if(circErrEl)circErrEl.textContent='';try{circCv.setPointerCapture(e.pointerId)}catch(_){}});
    circCv.addEventListener('pointermove',e=>{if(!drawingNow)return;const p=posOf(e);const last=drawPts[drawPts.length-1];
      if(Math.hypot(p.x-last.x,p.y-last.y)>3){drawPts.push(p);redrawPath()}});
    ['pointerup','pointercancel'].forEach(ev=>circCv.addEventListener(ev,()=>{if(!drawingNow)return;drawingNow=false;finishDraw()}))}
  function segInt(a,b,c,d){
    const d1=(d.x-c.x)*(a.y-c.y)-(d.y-c.y)*(a.x-c.x),d2=(d.x-c.x)*(b.y-c.y)-(d.y-c.y)*(b.x-c.x),
      d3=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),d4=(b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x);
    return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0))}
  function resamplePath(pts,step){const out=[pts[0]];let acc=0;
    for(let i=1;i<pts.length;i++){let a=pts[i-1];const b=pts[i];let segLen=Math.hypot(b.x-a.x,b.y-a.y);
      while(acc+segLen>=step){const t=(step-acc)/segLen,nx=a.x+(b.x-a.x)*t,ny=a.y+(b.y-a.y)*t;out.push({x:nx,y:ny});a={x:nx,y:ny};segLen=Math.hypot(b.x-a.x,b.y-a.y);acc=0}
      acc+=segLen}
    return out}
  function drawFail(msg){pendingTrack=null;if(circGoEl)circGoEl.disabled=true;if(circErrEl)circErrEl.textContent=msg;drawPts=[];redrawPath()}
  function finishDraw(){
    if(drawPts.length<6){drawFail('Draw a larger loop.');return}
    const first=drawPts[0],last=drawPts[drawPts.length-1];
    let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;drawPts.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)});
    const diag=Math.hypot(maxX-minX,maxY-minY);
    if(diag<70){drawFail('Draw a larger circuit loop.');return}
    
    // Auto-close loop smoothly
    const closed=drawPts.slice();
    if(Math.hypot(last.x-first.x,last.y-first.y)>8){
      closed.push({x:first.x,y:first.y});
    }

    let rawLen=0;for(let i=1;i<closed.length;i++)rawLen+=Math.hypot(closed[i].x-closed[i-1].x,closed[i].y-closed[i-1].y);
    const step=Math.max(4,rawLen/110);
    const rs=resamplePath(closed,step);
    if(rs.length<8){drawFail('Draw a larger loop.');return}

    // Check self-intersections (allow endpoints)
    for(let i=0;i<rs.length-1;i++)for(let j=i+2;j<rs.length-1;j++){
      if(i===0&&j>=rs.length-2)continue;
      if(segInt(rs[i],rs[i+1],rs[j],rs[j+1])){drawFail('Track crosses itself. Try a simpler loop.');return}}

    drawRS=rs.slice(0,rs.length-1);
    pendingTrack=normalizeLoop(drawRS,CIRC_SIZES[selVal('#dcircsize','large')]);
    redrawPath();
    if(window.TrackEditor){
      window.TrackEditor.points = rs.slice(0,rs.length-1).map(p => ({ x: p.x, y: p.y }));
      window.TrackEditor.isClosed = true;
    }
    if(circGoEl)circGoEl.disabled=false;
    const testB=$('#dcirctest'),saveB=$('#dcircsave'),shareB=$('#dcircshare');
    if(testB)testB.disabled=false;
    if(saveB)saveB.disabled=false;
    if(shareB)shareB.disabled=false;
    if(circErrEl)circErrEl.textContent='Loop ready · '+(selVal('#dcircsize','large')==='huge'?'3.6':selVal('#dcircsize','large')==='medium'?'1.6':'2.4')+' km lap. Add obstacles, or press Test drive / GO.';
  }
  function generateVenue(){
    if(!pendingTrack)return;
    const seed=Math.max(1,Math.min(2147483647,Math.floor(Number(circSeedEl&&circSeedEl.value)||271828)));
    let state=seed>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
    const choose=(value,options)=>value==='random'?options[Math.floor(rand()*options.length)]:value;
    const sceneryEl=$('#dcircscenery'),weatherEl=$('#dcircweather'),timeEl=$('#dcirctime');
    const scenery=choose(sceneryEl?sceneryEl.value:'meadow',THEMES.map(t=>t.id));
    const weather=choose(weatherEl?weatherEl.value:'day',WEATHERS.map(w=>w.id));
    const time=choose(timeEl?timeEl.value:'day',['day','dusk','sunset','night']);
    const size=selVal('#dcircsize','large'),width=+selVal('#dcircwidth','16')||16,elev=selVal('#dcircelev','rolling');
    // the Laps choice becomes the race's lap count; in a room the host's pick is pushed to everyone
    raceCfg.laps=Math.max(1,Math.min(50,parseInt(selVal('#dcirclaps','3'),10)||3));
    try{if(typeof MP!=='undefined'&&MP.on&&MP.isHostNow&&MP.isHostNow()){const l=$('#dmplaps');if(l){l.value=String(raceCfg.laps);l.dispatchEvent(new Event('change'))}}}catch(e){}
    if(drawRS.length>=8)pendingTrack=normalizeLoop(drawRS,CIRC_SIZES[size]||CIRC_LEN);
    const obstacles=drawObs.map(o=>({t:o.t,u:+o.u.toFixed(4),s:o.s}));
    const theme=THEMES.find(t=>t.id===scenery)||THEME_DEFAULT,venue={weather,time,width,elev,obstacles};
    try{localStorage.setItem('sl_venue',JSON.stringify({seed,scenery,weather,time,size,width,elev}))}catch(e){}
    buildCircuit(pendingTrack,theme,seed,venue);closeDrawer();enterCircuit();updCircBtn();
    // alone, GO starts the race itself (grid, lights, N laps). In a room the host starts it from the room panel.
    if(!(typeof MP!=='undefined'&&MP.on))restartSoloRace();
    // record (and, if already in a room, broadcast) this venue so friends build + race the same one
    try{if(MP&&MP.shareVenue)MP.shareVenue({pts:pendingTrack,seed,scenery,weather,time,width,elev,obstacles})}catch(e){}
  }
  if(circGoEl)circGoEl.onclick=generateVenue;
  {const randomButton=$('#dcircrandom');if(randomButton)randomButton.onclick=()=>{if(circSeedEl)circSeedEl.value=String(1+Math.floor(Math.random()*2147483646))}}
  const circBtn=$('#dcircb');
  function updCircBtn(){if(!circBtn)return;
    circBtn.textContent=MODE==='circuit'?'Back to world':(circuit?'Go to track':'Draw track')}
  // once a circuit exists there is no redraw path yet - single button cycles enter/leave only.
  // A dblclick-to-redraw was tried and reverted: browsers fire click,click,dblclick on the same
  // element, so it would briefly enter-then-leave the circuit (with the save/restore/toast noise
  // that implies) before the drawer opened. A half-working shortcut is worse than not having one;
  // redrawing needs a page reload for now (see ROADMAP.md).
  if(circBtn)circBtn.onclick=()=>{if(MODE==='circuit'){leaveCircuit();return}
    if(circuit){enterCircuit();try{if(MP&&MP.shareVenue&&circuit.pts)MP.shareVenue({pts:circuit.pts,seed:circuit.seed,scenery:circuit.theme.id,weather:circuit.venue.weather,time:circuit.venue.time,width:circuit.venue.width,elev:circuit.venue.elev,obstacles:circuit.venue.obstacles})}catch(e){}return}
    openDrawer()};
  {const x=$('#dcircx'),cl=$('#dcircclear');
   if(x)x.onclick=closeDrawer;
  if(cl)cl.onclick=()=>{drawPts=[];drawRS=[];drawObs=[];pendingTrack=null;if(circGoEl)circGoEl.disabled=true;redrawPath();if(circErrEl)circErrEl.textContent=''}}
updCircBtn();
  // New venue button removed - now handled by Track button (dcircb)
  {const ob=$('#dcircoptsbtn'),op=$('#dcircopts');if(ob&&op)ob.onclick=()=>{const o=!op.classList.contains('open');op.classList.toggle('open',o);ob.setAttribute('aria-expanded',o?'true':'false');ob.textContent=o?'Done':'Options'}}
  {const tool=$('#dcircmode'),top=$('#dcirctop');
   if(tool)tool.onchange=()=>{drawTool=tool.value==='obstacles'?'obstacles':'draw';
     if(circCv)circCv.style.cursor=drawTool==='obstacles'?'pointer':'crosshair';
     if(top)top.textContent=drawTool==='obstacles'?'Tap the track to drop the selected obstacle · tap a marker to remove it':'Draw one closed loop. Switch the tool to Obstacles to tap them onto the track'};
   // changing size after drawing rescales the preview message straight away
   const sz=$('#dcircsize');if(sz)sz.onchange=()=>{if(drawRS.length>=8){pendingTrack=normalizeLoop(drawRS,CIRC_SIZES[sz.value]);if(circErrEl)circErrEl.textContent='Lap length set to '+(CIRC_SIZES[sz.value]/1000)+' km.'}}}
  const saved=(()=>{try{return JSON.parse(localStorage.getItem('sl_venue')||'null')}catch(e){return null}})();
  if(saved){if(circSeedEl)circSeedEl.value=String(saved.seed||271828);const scenery=$('#dcircscenery'),weather=$('#dcircweather'),time=$('#dcirctime');
    if(scenery&&scenery.querySelector('option[value="'+saved.scenery+'"]'))scenery.value=saved.scenery;
    if(weather&&weather.querySelector('option[value="'+saved.weather+'"]'))weather.value=saved.weather;
    if(time&&time.querySelector('option[value="'+saved.time+'"]'))time.value=saved.time;
    [['#dcircsize',saved.size],['#dcircwidth',saved.width],['#dcircelev',saved.elev]].forEach(([id,v])=>{const e=$(id);if(e&&v!=null&&e.querySelector('option[value="'+v+'"]'))e.value=String(v)});}
  {
    const smoothBtn=$('#dcircsmooth');
    if(smoothBtn)smoothBtn.onclick=()=>{
      if(window.TrackEditor){
        window.TrackEditor.smoothPoints();
        if(window.TrackEditor.points.length>=6){
          drawPts=window.TrackEditor.points.map(p=>({x:p.x,y:p.y}));
          redrawPath();
          finishDraw();
        }
      }
    };
    const testBtn=$('#dcirctest');
    if(testBtn)testBtn.onclick=()=>{
      if(!pendingTrack&&drawPts.length>=8)finishDraw();
      if(pendingTrack){
        generateVenue();
      }else toastMsg('Draw and close a circuit first');
    };
    const saveBtn=$('#dcircsave');
    if(saveBtn)saveBtn.onclick=()=>{
      if(window.TrackEditor){
        const name=prompt('Name your circuit:','Custom GP '+(window.TrackEditor.savedTracks.length+1));
        if(name){
          if(window.TrackEditor.saveCurrentTrack(name))toastMsg('Saved track: '+name);
        }
      }
    };
    const shareBtn=$('#dcircshare');
    if(shareBtn)shareBtn.onclick=()=>{
      if(window.TrackEditor){
        const code=window.TrackEditor.exportTrackCode?window.TrackEditor.exportTrackCode():null;
        if(code){
          const url=location.origin+location.pathname+'?track='+code;
          if(window.AppQR&&$('#dqr-modal')){
            window.AppQR.render($('#dqrcanvas'),url);
            $('#dqr-modal').dataset.mode='track';
            $('#dqrdesc').textContent='Scan or copy this custom track code:';
            $('#dqrcode-text').value=code;
            $('#dqr-modal').classList.add('on');
          }else prompt('Copy track share code:',code);
        }else toastMsg('Draw and close a track first');
      }
    };
    // Saved tracks manager button removed - use Track button to access
    const mgrClose=$('#dcustomx')||$('#dtrkclose');
    if(mgrClose)mgrClose.onclick=()=>{
      const modal=$('#dcustom-tracks');
      if(modal)modal.classList.remove('on');
    };
    const impBtn=$('#dtrkcodebtn')||$('#dtrkimport');
    if(impBtn)impBtn.onclick=()=>{
      const codeInput=$('#dtrkcodein')||$('#dtrkimportcode');
      const code=codeInput?codeInput.value.trim():'';
      if(code&&window.TrackEditor&&window.TrackEditor.importTrackCode){
        if(window.TrackEditor.importTrackCode(code)){
          toastMsg('Imported track successfully!');
          const modal=$('#dcustom-tracks');
          if(modal)modal.classList.remove('on');
          if(window.TrackEditor.points.length>=6){
            drawPts=window.TrackEditor.points.map(p=>({x:p.x,y:p.y}));
            finishDraw();
            generateVenue();
          }
        }else toastMsg('Invalid track code');
      } else if(code) {
        toastMsg('Track code format not supported');
      }
    };
    const modeDraw=$('#dcircmodedraw'),modeEdit=$('#dcircmodeedit'),modeObs=$('#dcircmodeobs');
    const updateModeBtns=(m)=>{
      [modeDraw,modeEdit,modeObs].forEach(b=>{if(b)b.classList.remove('active')});
      if(m==='draw'&&modeDraw)modeDraw.classList.add('active');
      if(m==='edit_points'&&modeEdit)modeEdit.classList.add('active');
      if(m==='obstacles'&&modeObs)modeObs.classList.add('active');
      if(window.TrackEditor)window.TrackEditor.editMode=m;
    };
    if(modeDraw)modeDraw.onclick=()=>updateModeBtns('draw');
    if(modeEdit)modeEdit.onclick=()=>updateModeBtns('edit_points');
    if(modeObs)modeObs.onclick=()=>updateModeBtns('obstacles');

    const widthSlider=$('#dcircwidth'),widthVal=$('#dcircwidthval');
    if(widthSlider)widthSlider.oninput=()=>{
      CIRC_W=+widthSlider.value||10;
      if(widthVal)widthVal.textContent=CIRC_W+'m';
      if(window.TrackEditor)window.TrackEditor.roadWidth=CIRC_W;
    };

    const obsButtons=$$('.dcirc-obs-btn');
    obsButtons.forEach(b=>{
      b.onclick=()=>{
        obsButtons.forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        if(window.TrackEditor)window.TrackEditor.selectedObstacleType=b.dataset.obs||'speed_breaker';
      };
    });
  }

  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function refreshCustomTracksUI(){
    const list=$('#dtrklist');
    if(!list||!window.TrackEditor)return;
    const tracks=window.TrackEditor.savedTracks||[];
    if(!tracks.length){
      list.innerHTML='<div style="color:rgba(242,238,230,.5);font-size:13px;padding:12px;">No saved tracks yet. Draw and save one!</div>';
      return;
    }
    list.innerHTML=tracks.map(t=>`
      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px 12px;margin-bottom:8px;">
        <div>
          <strong style="color:#f2eee6;font-size:14px;">${esc(t.name)}</strong>
          <div style="font-size:11px;color:rgba(242,238,230,.5);">${t.points.length} nodes · Width ${t.roadWidth}m · ${new Date(t.createdAt||Date.now()).toLocaleDateString()}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="dcirc-pill" style="font-size:11px;padding:4px 10px;" onclick="window.loadCustomTrack('${t.id||t.name}')">Load</button>
          <button type="button" class="dcirc-pill" style="font-size:11px;padding:4px 10px;background:#640c0e;" onclick="window.deleteCustomTrack('${t.id||t.name}')">Delete</button>
        </div>
      </div>
    `).join('');
  }
  window.loadCustomTrack=(id)=>{
    if(window.TrackEditor){
      const trk=(window.TrackEditor.savedTracks||[]).find(t=>(t.id===id||t.name===id));
      if(trk&&window.TrackEditor.importTrackData(trk)){
        toastMsg('Loaded track '+trk.name);
        const modal=$('#dcustom-tracks');
        if(modal)modal.classList.remove('on');
        drawPts=window.TrackEditor.points.map(p=>({x:p.x,y:p.y}));
        finishDraw();
        generateVenue();
      }
    }
  };
  window.deleteCustomTrack=(id)=>{
    if(confirm('Delete this track?')){
      if(window.TrackEditor){
        window.TrackEditor.savedTracks=(window.TrackEditor.savedTracks||[]).filter(t=>(t.id!==id&&t.name!==id));
        try{localStorage.setItem('sl_custom_tracks',JSON.stringify(window.TrackEditor.savedTracks));}catch(_){}
        refreshCustomTracksUI();
      }
    }
  };
  window.generateVenue=generateVenue;
  window.enterCircuit=enterCircuit;
  window.leaveCircuit=leaveCircuit;

  // Auto-load track if ?track=TRK... present in URL
  {
    const trkParam=new URLSearchParams(location.search).get('track');
    if(trkParam&&window.TrackEditor){
      setTimeout(()=>{
        if(window.TrackEditor.importTrackCode(trkParam)){
          toastMsg('Loaded shared track!');
          if(window.TrackEditor.points.length>=6){
            drawPts=window.TrackEditor.points.map(p=>({x:p.x,y:p.y}));
            finishDraw();
            generateVenue();
          }
        }
      },600);
    }
  }

  // --- Landing Portal & Daily Track Conqueror Setup ---
  {
    const landing = document.getElementById('dlanding');
    const minBtn = document.getElementById('dlnd-min');
    const boxEl = document.getElementById('dlnd-box');
    const playBtn = document.getElementById('dlnd-play');
    const mpBtn = document.getElementById('dlnd-mp');
    const dailyBtn = document.getElementById('dlnd-daily');
    const editorBtn = document.getElementById('dlnd-editor');

    if(minBtn && boxEl){
      minBtn.onclick = () => {
        const isHidden = boxEl.style.display === 'none';
        boxEl.style.display = isHidden ? 'flex' : 'none';
        minBtn.textContent = isHidden ? 'Hide' : 'Options';
      };
    }

    if(playBtn) playBtn.onclick=()=>{ try{audioInit();}catch(_){}
      if(landing) landing.style.display='none';
      if(!active) try{enterDrive();}catch(_){}
      toastMsg('Free Drive Mode · Press Menu for options');
    };

    if(mpBtn) mpBtn.onclick=()=>{ try{audioInit();}catch(_){}
      if(landing) landing.style.display='none';
      if(!active) try{enterDrive();}catch(_){}
      const roomPanel = document.getElementById('dmp');
      if(roomPanel) roomPanel.classList.add('on');
    };

    if(editorBtn) editorBtn.onclick=()=>{ try{audioInit();}catch(_){}
      if(landing) landing.style.display='none';
      if(!active) try{enterDrive();}catch(_){}
      openDrawer();
    };

    // Daily Track Generator (Deterministic seed from today's UTC date)
    // exactly one Daily Track per UTC day: the seed is the date, so every player builds the identical circuit,
    // and it only changes at 00:00 UTC (a track already open keeps its own date for its times)
    function getDailySeed(){
      const d = new Date();
      return (d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
    }
    function dailyName(seed){const A=['Granite','Sunrise','Cobalt','Meridian','Saffron','Falcon','Copper','Ember','Silver','Juniper','Harbor','Summit'],B=['Ring','Circuit','Raceway','Loop','Speedway','Park'];
      return A[seed%A.length]+' '+B[Math.floor(seed/7)%B.length]}
    function msToMidnightUTC(){const n=new Date();return Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1)-n.getTime()}

    function buildDailyPoints(seed){
      let s = seed % 2147483647;
      const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const pts = [];
      const count = 10;
      // ~2.2x the old size: a proper 2+ km lap instead of a kart loop
      const rx = (140 + rnd() * 60) * 2.2;
      const rz = (100 + rnd() * 50) * 2.2;
      for(let i=0; i<count; i++){
        const a = (i / count) * Math.PI * 2;
        const rad = (i % 2 === 0 ? 1 : 0.72) * (0.85 + rnd() * 0.3);
        pts.push({
          x: Math.cos(a) * rx * rad,
          y: Math.sin(a) * rz * rad
        });
      }
      return pts;
    }

    const dailyModal = document.getElementById('ddaily-modal');
    const dailyClose = document.getElementById('ddaily-close');
    const dailyStart = document.getElementById('ddaily-start');
    const dailyDateEl = document.getElementById('ddaily-date');
    const dailyListEl = document.getElementById('ddaily-list');

    if(dailyBtn) dailyBtn.onclick=()=>{ try{audioInit();}catch(_){}
      const dStr = dailyDay(),seed=getDailySeed(),ms=msToMidnightUTC();
      if(dailyDateEl) dailyDateEl.textContent = dStr+' (UTC) · next track in '+Math.floor(ms/3600000)+'h '+String(Math.floor(ms/60000)%60).padStart(2,'0')+'m';
      {const th=document.getElementById('ddaily-theme');if(th){const themes=['meadow','mountain','desert','alpine','volcanic'],t=THEMES.find(x=>x.id===themes[seed%themes.length]);th.textContent=dailyName(seed)+' · '+(t?t.name:'Meadow')+' · '+DAILY_LAPS+' laps'}}
      renderDailyBoard();
      if(dailyModal) dailyModal.style.display = 'grid';
    };
    // the board: one entry per driver (their best), rank / name / total / best lap, you highlighted
    function renderDailyBoard(){
      if(!dailyListEl)return;
      const dStr=dailyDay(),me=(localStorage.getItem('sl_name')||'').trim();
      const draw=(rows,src)=>{
        const best=new Map();rows.forEach(r=>{const k=String(r.name||'Driver').toLowerCase(),o=best.get(k);if(!o||r.time<o.time)best.set(k,r)});
        const list=[...best.values()].sort((a,b)=>a.time-b.time).slice(0,50);
        const head='<li style="display:grid;grid-template-columns:40px 1fr 92px 82px;gap:8px;padding:6px 4px;font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.5)"><span>RANK</span><span>DRIVER</span><span style="text-align:right">TIME</span><span style="text-align:right">BEST LAP</span></li>';
        dailyListEl.innerHTML=list.length?head+list.map((r,i)=>{const mine=me&&String(r.name).toLowerCase()===me.toLowerCase();
          return `<li style="display:grid;grid-template-columns:40px 1fr 92px 82px;gap:8px;align-items:center;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px;${mine?'background:rgba(212,168,58,.16);':''}">
            <span style="color:#d4a83a;font-weight:700">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}${mine?' (you)':''}</span>
            <strong style="color:#f2eee6;font-family:monospace;text-align:right">${fmtT(r.time)}</strong><span style="font-family:monospace;text-align:right;opacity:.75">${r.best?fmtT(r.best):'--'}</span></li>`}).join('')+
          `<li style="padding:8px 4px;font-size:11px;color:rgba(255,255,255,.5)">${src}</li>`
          :'<li style="padding:12px;color:rgba(255,255,255,.5);font-size:13px;">No times yet for today\'s track. Be the first!</li>'};
      let local=[];try{local=JSON.parse(localStorage.getItem('sl_daily_'+dStr)||'[]')}catch(_){}
      draw(local,'Times on this device');
      if(window.DailyBoard)window.DailyBoard.fetch(dStr).then(rows=>{if(rows)draw(rows.concat(local),'Global board · '+dStr+' (UTC)')}).catch(()=>{});
    }
    window.renderDailyBoard=renderDailyBoard;

    if(dailyClose) dailyClose.onclick=()=>{
      if(dailyModal) dailyModal.style.display = 'none';
    };

    /* menu modes: Free drive (the default Earth world), Multiplayer (room lobby), Daily track (today's track + board) */
    const modeFree=document.getElementById('dmfree'),modeDaily=document.getElementById('dmdaily'),modeMP=document.getElementById('droom');
    window.__updModes=()=>{
      let inRoom=false;try{inRoom=!!MP.on}catch(_){}   // MP may not exist yet while it is being built
      if(modeFree)modeFree.classList.toggle('on',MODE==='world'&&!inRoom);
      if(modeMP)modeMP.classList.toggle('on',inRoom);
      if(modeDaily)modeDaily.classList.toggle('on',MODE==='circuit'&&!!(circuit&&circuit.daily));
    };
    if(modeFree)modeFree.onclick=()=>{ try{audioInit();}catch(_){}
      if(dailyModal)dailyModal.style.display='none';
      {const mp=document.getElementById('dmp');if(mp)mp.classList.remove('on')}
      if(MODE==='circuit')leaveCircuit();
      toastMsg('Free drive');window.__updModes();
    };
    if(modeDaily)modeDaily.onclick=()=>{ if(dailyBtn)dailyBtn.onclick() };

    // build + enter today's daily track without starting a solo race (used when a room races on it)
    window.__buildDaily=()=>{window.__dailyHold=true;try{dailyStart.onclick()}finally{window.__dailyHold=false}};
    if(dailyStart) dailyStart.onclick=()=>{ try{audioInit();}catch(_){}
      if(dailyModal) dailyModal.style.display = 'none';
      if(landing) landing.style.display = 'none';
      if(!active) try{enterDrive();}catch(_){}
      const seed = getDailySeed();
      const pts = buildDailyPoints(seed);
      drawPts = pts;
      const themes = ['meadow', 'mountain', 'desert', 'alpine', 'volcanic'];
      const themeId = themes[seed % themes.length];
      const theme = THEMES.find(t=>t.id===themeId) || THEME_DEFAULT;
      buildCircuit(pts, theme, seed, {weather:'day', time:'day', width:16, elev:'rolling', daily:true});
      if(circuit){circuit.daily=true;circuit.dailyDate=dailyDay();}
      enterCircuit();
      if(window.__updModes)window.__updModes();
      if(window.__dailyHold)return;
      toastMsg('Daily Track · '+dailyName(seed)+' · '+DAILY_LAPS+' laps');
      restartSoloRace();
    };
  }

  // --- Daily Track: the UTC day the track belongs to; global board if the backend has the table, else this device ---
  function dailyDay(){return new Date().toISOString().slice(0,10)}
  window.DailyBoard=(function(){
    const URL_=SUPA.url+'/rest/v1/daily_times',KEY=SUPA.key;
    const H={'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+KEY};
    async function fetch_(day){try{const r=await fetch(URL_+'?select=name,ms,best_ms&day=eq.'+day+'&order=ms.asc&limit=200',{headers:H});if(!r.ok)return null;
      return (await r.json()).map(x=>({name:x.name,time:x.ms,best:x.best_ms}))}catch(e){return null}}
    async function submit(rec){try{const r=await fetch(URL_,{method:'POST',headers:Object.assign({Prefer:'return=minimal'},H),
      body:JSON.stringify({day:rec.day,name:String(rec.name).slice(0,24),ms:Math.round(rec.time),best_ms:rec.best?Math.round(rec.best):null,laps:rec.laps})});return r.ok}catch(e){return false}}
    return {fetch:fetch_,submit}})();
  // --- Save Daily Leaderboard Time ---
  function saveDailyTime(name, time) {
    const dStr = new Date().toISOString().slice(0, 10);
    const key = 'sl_daily_' + dStr;
    let times = [];
    try { times = JSON.parse(localStorage.getItem(key) || '[]'); } catch(_){}
    times.push({name: name || 'Anonymous', time: time});
    times.sort((a,b) => a.time - b.time);
    times = times.slice(0, 50);
    try { localStorage.setItem(key, JSON.stringify(times)); } catch(_){}
  }
  window.saveDailyTime = saveDailyTime;

  // --- Mirror Button ---
  { const mirrorBtn = document.getElementById('drearb');
    if(mirrorBtn) mirrorBtn.onclick = () => {
      rearMirrorOn = !rearMirrorOn;
      if(rearEl) rearEl.style.display = rearMirrorOn ? 'block' : 'none';setTimeout(layoutHud,0);
      toastMsg(rearMirrorOn ? 'Rearview mirror ON · Z to toggle' : 'Rearview mirror OFF');
    };
  }

  // --- Back to Menu Button ---

  requestAnimationFrame(loop);
  /* ---------- rooms: ghost cars over a shared channel ----------
     Everybody drives their own physics on their own machine. What travels is a small pose
     ten times a second, and the other drivers are see-through ghosts with no body in the
     world, so nothing ever collides. A room is just a code: the code names a broadcast
     channel, and anyone who opens the same channel is in the same room. There is no server
     code and nothing is stored; a channel exists only while somebody is on it. */
  const MP=(function(){
    const CFG={ws:'wss://oceaylrebzflgyxfjqfb.supabase.co/realtime/v1/websocket',
      key:SUPA.key};
    const MAXP=4,HZ=10,STALE=6500,PAL=[0x1f5fbf,0x2f9e5b,0xd9a12a,0x7a3fb0],HEX=c=>'#'+c.toString(16).padStart(6,'0');
    const LOCAL=/[?&]net=local\b/.test(location.search);
    const ALPH='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',rid=n=>{let s='';for(let i=0;i<n;i++)s+=ALPH[Math.random()*32|0];return s};
    const me={id:rid(8),n:'',j:0},LOG=[],lg=(...a)=>{LOG.push(Math.round(performance.now())+' '+a.join(' '));if(LOG.length>60)LOG.shift()};
    let room=null,net=null,status='off',peers=new Map(),lastSend=0,lastHi=0,lastUI=0,lastPing=0,pingSeq=0,pendingPings=new Map(),
      race={id:'',st:0,t0:0,d0:0,rp:0,lastU:0,slot:0,ms:0,lastP:0,hold:null,cdN:-1,fins:0,endAt:0},
        myFin=0,myReady=false,autoStartAt=0;
    // the shared custom venue: the host broadcasts the drawn track so everyone builds + races the
    // SAME circuit. Because the circuit always sits at the same world offset and is seeded, every
    // client's geometry lines up, so the existing world-space ghost poses already match on it.
    let lastVenue=null,mpVenueKey='';
    const $$1=s=>document.querySelector(s);
    const el={btn:$$1('#droom'),panel:$$1('#dmp'),out:$$1('#dmp-out'),inn:$$1('#dmp-in'),name:$$1('#dmpname'),code:$$1('#dmpcode'),
      join:$$1('#dmpjoin'),mk:$$1('#dmpnew'),copy:$$1('#dmpcopy'),race:$$1('#dmprace'),leave:$$1('#dmpleave'),x:$$1('#dmpx'),
      codeOut:$$1('#dmpcodeout'),list:$$1('#dmplist'),note:$$1('#dmpnote'),raceStatus:$$1('#dmpracestatus'),roster:$$1('#dmpr'),count:$$1('#dcount')};
    const clean=s=>String(s==null?'':s).replace(/[\u0000-\u001f<>&"'`\\]/g,'').trim().slice(0,14);
    const num=(v,lo,hi,d)=>{v=+v;return isFinite(v)?Math.max(lo,Math.min(hi,v)):d};
    const savedName=()=>{try{return clean(localStorage.getItem('sl_name'))}catch(e){return ''}};
    const myName=()=>me.n||(me.n=savedName()||('Driver '+(100+Math.random()*900|0)));
    /* ----- the pipe: a Supabase Realtime broadcast channel, spoken to directly over a
       websocket. ?net=local swaps it for a BroadcastChannel, which links tabs on one device. ----- */
    function openNet(code,onMsg,onSt){
      if(LOCAL||!window.WebSocket){
        const bc=new BroadcastChannel('drv-'+code);bc.onmessage=e=>onMsg(e.data);setTimeout(()=>onSt('up'),0);
        return {send:m=>{try{bc.postMessage(m)}catch(e){}},close:()=>bc.close()}}
      const topic='realtime:drv-'+code;let ws=null,ref=0,joined=false,closed=false,hb=0,tries=0,rt=0;
      const out=o=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
      function open(){
        onSt(tries?'retry':'connecting');
        try{ws=new WebSocket(CFG.ws+'?apikey='+encodeURIComponent(CFG.key)+'&vsn=1.0.0')}catch(e){onSt('down');return}
        ws.onopen=()=>{out({topic,event:'phx_join',ref:String(++ref),join_ref:'1',
          payload:{config:{broadcast:{ack:false,self:false},presence:{key:''},postgres_changes:[],private:false},access_token:CFG.key}});
          clearInterval(hb);hb=setInterval(()=>out({topic:'phoenix',event:'heartbeat',payload:{},ref:String(++ref)}),20000)};
        ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}
          if(!m||m.topic!==topic)return;
          if(m.event==='phx_reply'&&m.payload&&!joined){if(m.payload.status==='ok'){joined=true;tries=0;onSt('up')}else{onSt('down')}}
          else if(m.event==='broadcast'&&m.payload&&m.payload.event==='m'){onMsg(m.payload.payload)}
          else if(m.event==='phx_error'||m.event==='phx_close'){try{ws.close()}catch(_){}}};
        ws.onclose=()=>{clearInterval(hb);joined=false;if(closed)return;tries++;
          if(tries>8){onSt('down');return}
          onSt('retry');rt=setTimeout(open,Math.min(5000,400*Math.pow(1.8,tries)))};
        ws.onerror=()=>{}}
      open();
      return {send:m=>{if(joined)out({topic,event:'broadcast',ref:String(++ref),payload:{type:'broadcast',event:'m',payload:m}})},
        close:()=>{closed=true;clearInterval(hb);clearTimeout(rt);try{ws&&ws.close()}catch(e){}}}}
    /* ----- ghosts ----- */
    let blobTex=null;
    function blob(){if(blobTex)return blobTex;const c=document.createElement('canvas');c.width=64;c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(32,64,4,32,64,62);
      g.addColorStop(0,'rgba(0,0,0,.6)');g.addColorStop(.6,'rgba(0,0,0,.28)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,128);return blobTex=new THREE.CanvasTexture(c)}
    function tagTex(name,col){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');
      x.fillStyle='rgba(10,10,9,.78)';const r=26;x.beginPath();x.moveTo(r,6);x.lineTo(256-r,6);x.arc(256-r,32,26,-Math.PI/2,Math.PI/2);x.lineTo(r,58);x.arc(r,32,26,Math.PI/2,Math.PI*1.5);x.fill();
      x.fillStyle=HEX(col);x.beginPath();x.arc(30,32,9,0,6.283);x.fill();
      x.fillStyle='#f2eee6';x.font='700 27px -apple-system,Segoe UI,Inter,Helvetica,Arial,sans-serif';x.textBaseline='middle';
      let t=name;while(x.measureText(t).width>176&&t.length>2)t=t.slice(0,-1);x.fillText(t,50,34);
      const tx=new THREE.CanvasTexture(c);tx.minFilter=THREE.LinearFilter;return tx}
    function makeGhost(carId,col,name){
      const spec=garageOf(carId),sv=spec.V;
      const g=new THREE.Group(),vg=new THREE.Group(),bo=new THREE.Group(),bi=new THREE.Group();
      g.add(vg);bo.position.y=.55;vg.add(bo);bi.position.y=-.55;bo.add(bi);
      const o={paint:col,r:sv.r,zf:sv.zf,zb:sv.zb,F:spec.F,B:spec.B,W:spec.W,head:headM,tail:tailM};
      const P=spec.type==='ev'?buildEV(o):buildCar(Object.assign(o,{wagon:!!spec.wagon,wheels:false}));
      P.g.position.y=.05-(sv.rest-.07)-sv.r;bi.add(P.g);
      const wl=[0,1,2,3].map(i=>{const k=makeWheel(sv.r,.36,i%2?-1:1,true,true);
        k.w.position.set((i%2?-1:1)*sv.xw*.9,.05-sv.rest,i<2?sv.zf:sv.zb);vg.add(k.w);return k});
      const sh=new THREE.Mesh(new THREE.PlaneGeometry(2.9,5.4).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:blob(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,opacity:.7}));
      sh.position.y=.05-(sv.rest-.07)-.02;sh.renderOrder=1;vg.add(sh);
      // see-through: every material is a private copy so the traffic and the player keep theirs
      const seen=new Map();
      g.traverse(o=>{o.castShadow=false;if(!o.material||o===sh)return;
        const mm=Array.isArray(o.material)?o.material:[o.material];
        const nm=mm.map(m=>{let c=seen.get(m);if(!c){c=m.clone();c.transparent=true;c.opacity=Math.min(c.opacity==null?1:c.opacity,.58);c.envMap=null;c.needsUpdate=true;seen.set(m,c)}return c});
        o.material=Array.isArray(o.material)?nm:nm[0]});
      const tg=new THREE.Sprite(new THREE.SpriteMaterial({map:tagTex(name,col),transparent:true,depthTest:false,depthWrite:false,fog:false}));
      tg.renderOrder=999;tg.scale.set(6,1.5,1);
      S.add(g);S.add(tg);g.visible=false;tg.visible=false;
      return {g,tg,wl,col,name,carId:spec.id}}
    function killGhost(P){if(!P.gh)return;const G=P.gh;S.remove(G.g);S.remove(G.tg);
      G.g.traverse(o=>{if(o.material&&!CARMATS.includes(o.material)){const mm=Array.isArray(o.material)?o.material:[o.material];mm.forEach(m=>m.dispose&&m.dispose())}});
      if(G.tg.material.map)G.tg.material.map.dispose();G.tg.material.dispose();P.gh=null}
    /* ----- members ----- */
    const sorted=()=>{const a=[{id:me.id,j:me.j}];peers.forEach(p=>a.push({id:p.id,j:p.j}));return a.sort((x,y)=>x.j-y.j||(x.id<y.id?-1:1))};
    const idxOf=id=>sorted().findIndex(m=>m.id===id);
    // whoever's been in the room longest runs it - no server, so this is a convention everyone computes the same way, not an enforced role
    const isHost=()=>{const a=sorted();return a.length>0&&a[0].id===me.id};
    function colorOf(id){const a=sorted().filter(m=>m.id!==me.id),i=a.findIndex(m=>m.id===id);return PAL[(i<0?0:i)%PAL.length]}
    function addPeer(m){
      let P=peers.get(m.id);
      if(!P){
        const j=num(m.j,0,1e15,0);
        // more than MAXP in a room: the latest joiner is the one who is out
        const a=sorted().concat([{id:m.id,j}]).sort((x,y)=>x.j-y.j||(x.id<y.id?-1:1));
        if(a.findIndex(z=>z.id===m.id)>=MAXP)return null;
        P={id:String(m.id).slice(0,12),n:clean(m.n)||'Driver',j,last:0,gh:null,car:'aster',ping:null,tp:new THREE.Vector3(),tq:new THREE.Quaternion(),vx:0,vy:0,vz:0,pt:0,st:0,vf:0,wr:0,d:0,fin:0,got:false,sp:0};
        peers.set(P.id,P);lg('add',P.n,'j',j,'me',me.j);
        if(idxOf(me.id)>=MAXP){leave('Room is full · '+MAXP+' drivers max');return null}
        toast2(P.n+' joined');ui()}
      return P}
    function dropPeer(id,msg){const P=peers.get(id);if(!P)return;lg('drop',P.n,'idle',Math.round(performance.now()-P.last));killGhost(P);peers.delete(id);if(msg)toast2(P.n+' left');ui()}
    function toast2(s){try{toastMsg(s)}catch(e){}}
    /* ----- messages ----- */
    function send(m){if(net&&status==='up'){m.id=me.id;net.send(m)}}
    function sendHi(rep){send({k:'hi',n:myName(),j:me.j,r:rep?1:0,car:curCarId,rid:race.id,rs:race.st,startAt:race.startAt,fin:myFin,rdy:myReady?1:0,d:race.st>=2?race.d0+race.rp:0})}
    function syncRace(P,m){
      const remoteState=num(m.rs,0,4,0),rid=String(m.rid||'');
      if(!rid||remoteState<1||((race.st===1||race.st===2||race.st===4)&&race.id!==rid))return;
      if(race.id!==rid){
        race={id:rid,st:remoteState===3?3:4,startAt:num(m.startAt,0,1e15,0),t0:0,d0:0,rp:0,lastU:0,slot:0,ms:0,lastP:0,hold:null,cdN:-1,fins:0,endAt:0};
        myFin=0;
      }
      P.fin=num(m.fin,0,36e5,0);P.d=num(m.d,-5,50,0);
      ui();
    }
    function onMsg(m){
      // phone gamepad packets: only the laptop the QR code was made for obeys them
      // Each player has their own secret controller token. A packet is only obeyed if it names THIS player AND carries
      // this player's token, so a phone paired to one car (or one room) can never steer another.
      if(m&&m.k==='ctrl'){if(room&&m.to===me.id&&typeof m.token==='string'&&m.token===ctrlToken()&&window.PhoneController)window.PhoneController.onControllerInput(m.input||{});return}
      if(!m||typeof m!=='object'||m.id===me.id||typeof m.id!=='string'||!room)return;
      const now=performance.now();
      // only a hello or a pose can introduce someone, and only with a join time to place them in the room
      let P=peers.get(m.id);
      if(!P){if((m.k!=='hi'&&m.k!=='s')||!(+m.j>0))return;P=addPeer(m);if(!P)return}
      P.last=now;
      if(m.n){const nn=clean(m.n);if(nn&&nn!==P.n){P.n=nn;if(P.gh){P.gh.tg.material.map.dispose();P.gh.tg.material.map=tagTex(nn,P.gh.col);P.gh.name=nn}ui()}}
      if(m.car){const cid=garageOf(String(m.car)).id;if(cid!==P.car){P.car=cid;
        if(P.gh){const was=P.gh;killGhost(P);P.gh=makeGhost(P.car,was.col,P.n);
          P.gh.g.position.copy(P.tp);P.gh.g.quaternion.copy(P.tq);P.gh.g.visible=was.g.visible;P.gh.tg.visible=was.tg.visible}}}
      switch(m.k){
        case 'hi':if('rdy' in m)P.ready=!!m.rdy;if(!m.r){sendHi(true);if(lastVenue&&isHost())send(Object.assign({k:'trk'},lastVenue));if(isHost()&&syncCfg)syncCfg(true)}syncRace(P,m);break;
        case 'trk':adoptVenue(m);break;
        case 'cfg':if(!isHost()){
          if(m.laps){const el=$('#dmplaps');if(el)el.value=m.laps}
          if(m.map){const el=$('#dmpmap');if(el)el.value=m.map}
          if(m.mode){const el=$('#dmpmode');if(el)el.value=m.mode}
          if(m.gravity){const el=$('#dmpgravity');if(el)el.value=m.gravity}
        }break;
        case 'rdy':P.ready=!!m.val;paintReady();ui();break;
        case 'spec':P.watching=!!m.val;ui();break;
        case 'chat':{if(!m.t||!m.n)return;const log=document.getElementById('dmpchatlog');if(log){const msg=String(m.t).slice(0,120);const name=String(m.n).slice(0,14);const line=document.createElement('div');line.style.cssText='margin:4px 0;font-size:11px;line-height:1.4;';line.innerHTML='<span style="color:#d4a83a;font-weight:600;">'+esc(name)+':</span> <span style="color:var(--paper);">'+esc(msg)+'</span>';log.appendChild(line);log.scrollTop=log.scrollHeight}}break;
        case 's':{
          if(!Array.isArray(m.p)||!Array.isArray(m.q))return;
          const x=num(m.p[0],-1e4,1e4,0),y=num(m.p[1],-500,2000,0),z=num(m.p[2],-1e4,1e4,0);
          if(!P.got||Math.hypot(x-P.tp.x,z-P.tp.z)>60){P.got=true;P.pt=0;P.vx=P.vy=P.vz=0;P.tp.set(x,y,z);
            P.tq.set(num(m.q[0],-1,1,0),num(m.q[1],-1,1,0),num(m.q[2],-1,1,0),num(m.q[3],-1,1,1)).normalize();
            const G=P.gh||(P.gh=makeGhost(P.car,colorOf(P.id),P.n));G.g.position.copy(P.tp);G.g.quaternion.copy(P.tq);G.g.visible=true;G.tg.visible=true}
          else{const dt=Math.max(.04,Math.min(.5,(now-P.pt)/1000)),a=.6;
            P.vx+=((x-P.tp.x)/dt-P.vx)*a;P.vy+=((y-P.tp.y)/dt-P.vy)*a;P.vz+=((z-P.tp.z)/dt-P.vz)*a;
            P.tp.set(x,y,z);P.tq.set(num(m.q[0],-1,1,0),num(m.q[1],-1,1,0),num(m.q[2],-1,1,0),num(m.q[3],-1,1,1)).normalize()}
          P.pt=now;P.st=num(m.st,-1,1,0);P.vf=num(m.vf,-80,120,0);P.d=num(m.d,-5,50,0);break}
        case 'race':beginCountdown(P.n,num(m.startAt,0,1e15,Date.now()+CD_LEAD),String(m.rid||''),num(m.laps,1,20,3),m.v&&typeof m.v==='object'?m.v:null);break;
        case 'fin':
          if(!m.rid||m.rid!==race.id||(race.st<2&&race.st!==4)||P.fin)return;
          P.fin=num(m.ms,1,36e5,0);race.fins++;
          if(!myFin&&!race.endAt)race.endAt=now+45000;
          toast2(P.n+' finished · '+fmtT(P.fin));ui();break;
        case 'pg':if(String(m.target)===me.id)send({k:'pk',target:m.id,seq:num(m.seq,0,1e9,0)});break;
        case 'pk':{
          if(String(m.target)!==me.id)break;
          const pingKey=m.id+':'+num(m.seq,0,1e9,0),sentAt=pendingPings.get(pingKey);
          if(sentAt==null)break;
          pendingPings.delete(pingKey);P.ping=Math.max(0,Math.min(9999,Math.round(performance.now()-sentAt)));break}
        case 'kick':if(String(m.target)===me.id){leave('Removed from the room by the host');closePanel()}break;
        case 'bye':dropPeer(P.id,true);break}}
    /* ----- rooms ----- */
    function normCode(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)}
    function join(code){
      code=normCode(code);if(code.length<4){note('A room code is 4 to 6 letters or digits');return}
      if(room)leave();
      if(el.name&&el.name.value.trim()){me.n=clean(el.name.value)||myName()}else myName();
      try{localStorage.setItem('sl_name',me.n)}catch(e){}
      room=code;me.j=Date.now();status='connecting';race.st=0;myFin=0;
      net=openNet(code,onMsg,s=>{const was=status;status=s;
        if(s==='up'){sendHi(false);lastHi=performance.now()}
        if(s==='down')toast2('Cannot reach the room right now');
        if(s==='up'&&was==='retry')toast2('Back online');ui()});
      ui();
      try{const u=new URL(location.href);u.searchParams.set('room',code);history.replaceState(null,'',u)}catch(e){}}
    function leave(msg){lg('leave',msg||'');
      if(net){send({k:'bye'});net.close()}
      net=null;peers.forEach(killGhost);peers.clear();room=null;status='off';endRace(true);
      try{const u=new URL(location.href);u.searchParams.delete('room');u.searchParams.delete('net');history.replaceState(null,'',u)}catch(e){}
      if(msg)toast2(msg);ui()}
    function note(s){if(el.note)el.note.textContent=s}
    /* ----- race: a shared countdown, everyone on the grid, first round the loop wins ----- */
    function slotOf(){const a=sorted();const i=a.findIndex(m=>m.id===me.id);return i<0?0:i}
    function gridTo(slot,n){
      // on a custom venue, grid on the circuit's own start line instead of the Earth loop
      if(MODE==='circuit'&&circuit){const sp=circuit.startP,back=8+slot*7,lat=(slot%2?1:-1)*(CIRC_W*0.26);
        const x=sp.p.x-sp.tg.x*back+sp.n.x*lat,z=sp.p.z-sp.tg.z*back+sp.n.z*lat;
        PREV.ok=false;physAcc=0;leanVf=0;leanA=0;if(vis.body)vis.body.rotation.set(0,0,0);
        chassisB.position.set(x,sp.p.y+1.4,z);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);
        chassisB.force.set(0,0,0);chassisB.torque.set(0,0,0);chassisB.linearDamping=.01;chassisB.angularDamping=.4;
        chassisB.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.atan2(sp.tg.x,sp.tg.z));
        veh.wheelInfos.forEach(w=>{w.suspensionLength=w.suspensionRestLength;w.deltaRotation=0});
        for(let i=0;i<4;i++){veh.applyEngineForce(0,i);veh.setBrake(0,i)}
        sub=0;inPond=false;steerActual=0;race.hold={x,z,q:chassisB.quaternion.clone()};
        C.position.set(x-sp.tg.x*10,sp.p.y+5,z-sp.tg.z*10);look.set(x+sp.tg.x*6,sp.p.y+1,z+sp.tg.z*6);return}
      const lat=(slot-(n-1)/2)*3.1,u=.985;
      const q=at(u-(slot%2)*(6/LEN)),x=q.p.x+q.n.x*lat,z=q.p.z+q.n.z*lat;
      PREV.ok=false;physAcc=0;leanVf=0;leanA=0;if(vis.body)vis.body.rotation.set(0,0,0);
      chassisB.position.set(x,q.p.y+1.4,z);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);
      chassisB.force.set(0,0,0);chassisB.torque.set(0,0,0);chassisB.linearDamping=.01;chassisB.angularDamping=.4;
      chassisB.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),q.ry);
      veh.wheelInfos.forEach(w=>{w.suspensionLength=w.suspensionRestLength;w.deltaRotation=0});
      for(let i=0;i<4;i++){veh.applyEngineForce(0,i);veh.setBrake(0,i)}
      sub=0;inPond=false;steerActual=0;race.hold={x,z,q:chassisB.quaternion.clone()};
      // the camera should start behind the car, not fly in from wherever it was
      C.position.set(x-q.tg.x*10,q.p.y+5,z-q.tg.z*10);look.set(x+q.tg.x*6,q.p.y+1,z+q.tg.z*6)}
    const CD_LEAD=3000; // countdown length; also doubles as slack for the 'race' broadcast to reach everyone before GO
    function requestRace(){
      if(!room||status!=='up'){note('Not connected yet');return}
      if(!isHost()){note('The host starts the race. Press Ready so they know you are set.');return}
      if(race.st===1||race.st===2){note('A race is already running');return}
      const laps=getLaps(),pick=$('#dmpmap')?$('#dmpmap').value:'earth';
      // get the host onto the chosen track first, then send it with the race so nobody races somewhere else
      if(pick==='circuit'){
        if(!circuit||circuit.daily){note('Draw a track first: Menu → Draw track, then GO & Publish');return}
        if(MODE!=='circuit')enterCircuit();
      }else if(pick==='daily'){
        if(!(circuit&&circuit.daily)&&window.__buildDaily)window.__buildDaily();else if(MODE!=='circuit')enterCircuit();
      }else if(MODE==='circuit')leaveCircuit();
      let v={earth:1};
      if(MODE==='circuit'&&circuit){shareVenue({pts:circuit.pts,seed:circuit.seed,scenery:circuit.theme.id,weather:circuit.venue.weather,time:circuit.venue.time,width:circuit.venue.width,elev:circuit.venue.elev,obstacles:circuit.venue.obstacles});v=lastVenue}
      const startAt=Date.now()+CD_LEAD+1500,rid=me.id+'-'+startAt;send({k:'race',startAt,rid,laps,v});beginCountdown('You',startAt,rid,laps,null)}
    function beginCountdown(who,startAt,rid,laps,v){
      rid=String(rid||('legacy-'+startAt));
      if(race.id===rid&&race.st>=1)return;
      if(raceMode)stopRace();
      if(window.RaceEngine&&window.RaceEngine.state!=='idle')window.RaceEngine.stopRace();
      try{CAI.clear()}catch(e){}
      // a guest goes to whatever track the host is racing on
      if(v){try{if(v.earth){if(MODE==='circuit')leaveCircuit()}else{adoptVenue(v);if(MODE!=='circuit'&&circuit)enterCircuit()}}catch(e){lg('race venue',e&&e.message)}}
      closePanel();
      myReady=false;autoStartAt=0;peers.forEach(p=>{p.ready=false});paintReady();
      {const rm=document.getElementById('dresults');if(rm){rm.classList.remove('on');rm.style.display=''}}
      // startAt is a shared wall-clock instant (Date.now(), not performance.now(), since it has to mean
      // the same thing on every client's clock) so everyone's countdown hits GO at roughly the same moment,
      // regardless of when the 'race' broadcast actually arrived on each connection
      race={id:rid,st:1,startAt,t0:0,d0:0,rp:0,lastU:0,slot:slotOf(),ms:0,lastP:0,hold:null,cdN:-1,fins:0,endAt:0,laps:Math.max(1,Math.min(20,+laps||getLaps())),lapShown:1};myFin=0;
      peers.forEach(p=>{p.fin=0;p.d=0});
      gridTo(race.slot,peers.size+1);toast2(who+' started a race');ui()}
    function endRace(quiet){
      race.st=0;race.hold=null;if(el.count){el.count.classList.remove('on');el.count.textContent=''}
      if(!quiet)ui()}
    const cdShow=(t)=>{if(!el.count)return;el.count.textContent=t;el.count.classList.remove('on');void el.count.offsetWidth;el.count.classList.add('on')};
    function raceTick(now,dt){
      if(race.st===1){
        const remain=race.startAt-Date.now(),n=Math.max(1,Math.min(3,Math.ceil(remain/1000)));
        if(race.hold){chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);chassisB.position.x=race.hold.x;chassisB.position.z=race.hold.z;chassisB.quaternion.copy(race.hold.q)}
        if(remain>0&&n!==race.cdN){race.cdN=n;cdShow(String(n));blip(520,.14,.1)}
        if(remain<=0){race.st=2;race.t0=now;race.rp=0;race.lastP=0;race.hold=null;race.lastU=-1;cdShow('GO');blip(1040,.35,.14);
          setTimeout(()=>{if(race.st===2&&el.count)el.count.classList.remove('on')},900);ui()}
        return}
      if(race.st===4){
        let all=peers.size>0;peers.forEach(p=>{if(!p.fin&&(!p.last||now-p.last<STALE))all=false});
        if(all||race.endAt&&now>race.endAt){race.st=3;ui()}return}
      if(race.st!==2)return;
      if(now-race.lastP>=100){race.lastP=now;
        const onCirc=MODE==='circuit'&&circuit,rn=onCirc?circProg():roadNear(car.position.x,car.position.z);
        if(race.lastU<0){race.lastU=rn.u;race.d0=rn.u>.5?rn.u-1:rn.u;race.rp=0}
        else{let du=rn.u-race.lastU;if(du<-.5)du+=1;else if(du>.5)du-=1;
          if(!rn.branch&&Math.abs(du)<.06&&rn.d<(onCirc?24:16+RWX*1.5))race.rp+=du;race.lastU=rn.u}
        {const lapNow=Math.floor(race.d0+race.rp)+1;if(!myFin&&lapNow>race.lapShown&&lapNow<=race.laps){race.lapShown=lapNow;toast2('Lap '+lapNow+' / '+race.laps+(lapNow===race.laps?' · final lap':''));blip(880,.2,.1)}}
        if(!myFin&&race.d0+race.rp>=race.laps){myFin=now-race.t0;race.ms=myFin;race.fins++;send({k:'fin',rid:race.id,ms:Math.round(myFin)});
          blip(880,.4,.14);setTimeout(()=>blip(1175,.5,.12),140);
          let pl=1;peers.forEach(p=>{if(p.fin&&p.fin<myFin)pl++});
          toast2((pl===1?'You win · ':'Finished P'+pl+' · ')+fmtT(myFin));race.endAt=now+45000;ui()}}
      if(race.endAt&&now>race.endAt){race.st=3;ui()}
      if(myFin){let all=true;peers.forEach(p=>{if(!p.fin&&p.got&&now-p.last<STALE)all=false});if(all&&race.st===2){race.st=3;ui()}}}
    /* ----- per frame ----- */
    const tmpV=new THREE.Vector3(),fwdV=new THREE.Vector3(),qq=new THREE.Quaternion(),UPQ=new CANNON.Vec3(0,0,1),fw=new CANNON.Vec3();
    let spinMe=0;
    function tick(now,dt){
      if(!room)return;
      // people who stopped talking are gone
      peers.forEach(P=>{if(P.last&&now-P.last>STALE)dropPeer(P.id,true)});
      if(status==='up'){
        if(now-lastSend>=1000/HZ){lastSend=now;
          chassisB.quaternion.vmult(UPQ,fw);const v=chassisB.velocity,vf=v.x*fw.x+v.y*fw.y+v.z*fw.z;
          const q=car.quaternion,p=car.position,st=veh.wheelInfos[0]?veh.wheelInfos[0].steering:0;
          const d=race.st===2||race.st===3?race.d0+race.rp:0;
          send({k:'s',n:myName(),j:me.j,p:[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)],q:[+q.x.toFixed(3),+q.y.toFixed(3),+q.z.toFixed(3),+q.w.toFixed(3)],
            st:+st.toFixed(3),vf:+vf.toFixed(1),d:+d.toFixed(4)})}
        if(now-lastHi>3000){lastHi=now;sendHi(true)}
        if(now-lastPing>1500&&peers.size){lastPing=now;
          peers.forEach(P=>{const seq=++pingSeq,key=P.id+':'+seq;pendingPings.set(key,performance.now());send({k:'pg',target:P.id,seq})});
          pendingPings.forEach((sentAt,key)=>{if(performance.now()-sentAt>8000)pendingPings.delete(key)})}}
      // ghosts
      const k=1-Math.exp(-dt*11);
      peers.forEach(P=>{const G=P.gh;if(!G)return;
        const ex=Math.min(.22,(now-P.pt)/1000);
        tmpV.set(P.tp.x+P.vx*ex,P.tp.y+P.vy*ex,P.tp.z+P.vz*ex);
        G.g.position.lerp(tmpV,k);G.g.quaternion.slerp(P.tq,k);
        P.wr-=P.vf/V.r*dt;   // this build turns its wheel angle the other way round: negative is forward
        for(let i=0;i<4;i++){const w=G.wl[i];w.spin.rotation.x=P.wr;if(i<2)w.w.rotation.y+=(P.st-w.w.rotation.y)*Math.min(1,dt*12)}
        G.tg.position.set(G.g.position.x,G.g.position.y+2.5,G.g.position.z);
        const dd=C.position.distanceTo(G.tg.position),s=Math.max(1,Math.min(8,dd*.032));G.tg.scale.set(s*4,s,1);
        G.tg.visible=dd<520&&G.g.visible;
        P.sp=Math.hypot(car.position.x-G.g.position.x,car.position.z-G.g.position.z)});
      raceTick(now,dt);autoStart(now);
      if(now-lastUI>250){lastUI=now;if(el.panel&&el.panel.classList.contains('on')&&room)ui();else roster()}}
    /* ----- HUD ----- */
    function roster(){
      if(!el.roster)return;
      if(!room){el.roster.style.display='none';return}
      const rows=[{me:1,n:myName(),c:0x640c0e,d:race.st>=2?race.d0+race.rp:0,fin:myFin}];
      peers.forEach(P=>rows.push({n:P.n,c:colorOf(P.id),d:P.d,fin:P.fin,sp:P.sp,off:!P.got,ping:P.ping}));
      const racing=race.st>=2;
      if(racing)rows.sort((a,b)=>(a.fin&&b.fin?a.fin-b.fin:a.fin?-1:b.fin?1:b.d-a.d));
      const lead=racing?Math.max.apply(null,rows.filter(r=>!r.fin).map(r=>r.d).concat([-9])):0;
      let h='';
      rows.forEach((r,i)=>{
        let t='';
        if(r.fin)t=fmtT(r.fin);
        else if(racing)t=r.d>=lead-1e-4?'leading':'-'+Math.round((lead-r.d)*TLEN)+' m';
        else if(!r.me)t=r.off?'joining':(r.sp>=1000?Math.round(r.sp/100)/10+' km':Math.round(r.sp)+' m');
        if(!r.me&&!r.off&&r.ping!=null)t+=(t?' · ':'')+r.ping+'ms';
        h+='<div class="r'+(r.me?' me':'')+'"><i style="background:'+HEX(r.c)+'"></i>'+(racing?'<em>'+(i+1)+'</em>':'')+'<b>'+esc(r.n)+(r.me?' (you)':'')+'</b><span>'+t+'</span></div>'});
      if(status!=='up')h+='<div class="st">'+(status==='down'?'offline':'connecting')+'</div>';
      el.roster.innerHTML=h;el.roster.style.display='block'}
    const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    /* base room UI. (It used to share the name ui() with the results wrapper further down; both are
       hoisted function declarations, so the wrapper replaced this one and then called itself forever.) */
    function uiBase(){
      if(el.btn)el.btn.textContent=room?('Multiplayer · '+room):'Multiplayer';if(window.__updModes)window.__updModes();
      // Race settings belong to the host and are frozen once a race is counting down or running, so nobody can
      // change 3 laps to 10 halfway through; guests just see what the host chose.
      {const frozen=race.st===1||race.st===2||race.st===4,host=!room||isHost();
       ['#dmplaps','#dmpmap'].forEach(sel=>{const e=$(sel);if(e)e.disabled=frozen||!host})}
      if(el.out)el.out.style.display=room?'none':'block';
      if(el.inn)el.inn.style.display=room?'block':'none';
      if(el.codeOut)el.codeOut.textContent=room||'';
      if(el.race){const hst=isHost();el.race.disabled=!room||status!=='up'||!hst||race.st===1||race.st===2||race.st===4;
        el.race.textContent=!hst?'Host starts the race':race.st===3?'Rematch':'Start race'}
      if(el.raceStatus)el.raceStatus.textContent=!room?'Create or join a room to race.':status!=='up'?'Connecting to room…':race.st===1?'Race countdown in progress':race.st===2?'Race in progress · finish times appear here as drivers finish':race.st===4?'Race in progress · you joined as a spectator':race.st===3?'Race complete · final times are shown below':(isHost()?'Room ready · press Start race, or it starts by itself once everyone is Ready':'Room ready · press Ready, the host starts the race');
      if(el.list){const host=isHost(),racing=race.st>=2,rows=[{id:me.id,n:myName(),c:0x640c0e,me:1,watching:race.st===4,d:racing?race.d0+race.rp:0,fin:myFin,ping:null,off:false,rdy:myReady}];
        peers.forEach(P=>rows.push({id:P.id,n:P.n,c:colorOf(P.id),d:P.d,fin:P.fin,ping:P.ping,off:!P.got,rdy:!!P.ready}));
        if(racing)rows.sort((a,b)=>a.watching?1:b.watching?-1:a.fin&&b.fin?a.fin-b.fin:a.fin?-1:b.fin?1:b.d-a.d);
        const lead=Math.max.apply(null,rows.filter(P=>!P.fin).map(P=>P.d).concat([0]));
        let h='';rows.forEach((P,i)=>{let timing=P.watching?'Spectating':P.fin?fmtT(P.fin):racing?(P.off?'Connecting':P.d>=lead-1e-4?'Leading':'-'+Math.max(0,Math.round((lead-P.d)*(MODE==='circuit'&&circuit?circuit.curve.getLength():TLEN)))+' m'):(P.off?'Joining':P.rdy?'Ready ✓':'Not ready');
          const ping=P.me?(window.PhoneController&&window.PhoneController.isPhoneConnected()?'Phone':'Keyboard'):P.ping==null?'Ping…':P.ping+' ms';
          h+='<li class="'+(P.me?'me':'')+'"><i style="background:'+HEX(P.c)+'"></i><span class="mp-driver">'+(racing?'<em>'+(P.fin?i+1:'')+'</em>':'')+esc(P.n)+(P.me?' (you)':'')+(P.id===(sorted()[0]||{}).id?' · host':'')+'</span><span class="mp-timing">'+timing+(ping?' · '+ping:'')+
            (host&&!P.me?'<button class="kick" type="button" data-id="'+P.id+'" title="Remove from room" aria-label="Remove '+esc(P.n)+' from room">&times;</button>':'')+'</span></li>'});
        el.list.innerHTML=h}
      if(el.note&&room)el.note.textContent=status==='up'?(peers.size?'Everyone here is a ghost to everyone else. No crashes, just a name above the car.':'Waiting for friends. Send them the code or the link.'):status==='down'?'Cannot reach the room. Check your connection and rejoin.':'Connecting…';
      roster()}
    function openPanel(){if(!el.panel)return;if(el.name&&!el.name.value)el.name.value=me.n||savedName();ui();el.panel.classList.add('on');for(const k in key)key[k]=0;
      setTimeout(()=>{try{(room?el.race:(el.code.value?el.join:el.code)).focus()}catch(e){}},50)}
    function closePanel(){if(el.panel)el.panel.classList.remove('on')}
    function invite(){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('room',room);return u.toString()}
    if(el.btn)el.btn.onclick=openPanel;
    if(el.x)el.x.onclick=closePanel;
    if(el.panel)el.panel.addEventListener('click',e=>{if(e.target===el.panel)closePanel()});
    if(el.join)el.join.onclick=()=>join(el.code.value);
    if(el.code)el.code.addEventListener('keydown',e=>{if(e.key==='Enter')join(el.code.value)});
    if(el.mk)el.mk.onclick=()=>join(rid(5));
    if(el.leave)el.leave.onclick=()=>{leave('Left the room');closePanel()};
    if(el.race)el.race.onclick=requestRace;
    if(el.copy)el.copy.onclick=()=>{const u=invite();
      const ok=()=>{el.copy.textContent='Link copied';setTimeout(()=>{el.copy.textContent='Copy invite link'},1800)};
      try{navigator.clipboard.writeText(u).then(ok,()=>{note(u)})}catch(e){note(u)}};
    if(el.list)el.list.addEventListener('click',e=>{const b=e.target.closest('button.kick');if(!b||!isHost())return;
      const id=b.dataset.id,P=peers.get(id);send({k:'kick',target:id});dropPeer(id,false);toast2((P?P.n:'Player')+' removed')});
    addEventListener('keydown',e=>{if(e.key==='Escape'&&el.panel&&el.panel.classList.contains('on'))closePanel()});
    setInterval(()=>{if(room&&status==='up'&&document.hidden)sendHi(true)},1500);
    addEventListener('pagehide',()=>{if(net)send({k:'bye'})});
    // a friend's invite link opens straight into the room
    {const m=/[?&]room=([A-Za-z0-9]{4,6})/.exec(location.search);
     if(m)setTimeout(()=>{me.n=savedName();join(m[1])},300)}
    // config sync & ready
    function syncCfg(force){
      if(!isHost()||!room||status!=='up')return;
      const laps=$('#dmplaps')?$('#dmplaps').value:3;
      const map=$('#dmpmap')?$('#dmpmap').value:'earth';
      send({k:'cfg',laps,map,force:!!force});
    }
    ['#dmplaps','#dmpmap'].forEach(sel=>{
      const el=$(sel);if(el)el.onchange=()=>syncCfg(true);
    });
const rdyBtn=$('#dmpready');
  function paintReady(){
    const b=$('#dmpready');if(b){b.textContent=myReady?'Ready ✓':'I\'m Ready';b.style.background=myReady?'#227038':'#3f8a56'}
    const rm=document.getElementById('dresrematch');
    if(rm)rm.textContent=!room?'Restart':isHost()?'Rematch now':myReady?'Ready ✓ · waiting for host':'Ready for rematch';
    const st=document.getElementById('dresstatus');
    if(st){if(!room){st.textContent=''}else{const live=[...peers.values()].filter(p=>p.got||p.last),n=live.length+1,r=live.filter(p=>p.ready).length+(myReady?1:0);
      st.textContent=autoStartAt?'Everyone is ready · rematch starting…':'Ready for rematch: '+r+' / '+n+(isHost()?' · press Rematch now, or it starts when everyone is ready':' · the host starts it')}}}
  function setReady(v){myReady=!!v;if(!myReady)autoStartAt=0;send({k:'rdy',val:myReady});paintReady();ui()}
  if(rdyBtn)rdyBtn.onclick=()=>setReady(!myReady);
  // Spectator mode toggle
  const specBtn=$('#dmpspec');
  if(specBtn){
    specBtn.onclick=()=>{
      const isSpec=me.watching===true;
      me.watching=!isSpec;
      send({k:'spec',val:me.watching});
      specBtn.textContent=me.watching?'Leave Spectator':'Spectate';
      specBtn.style.background=me.watching?'#227038':'#3f8a56';
      ui();
    };
  }

function carChanged(){if(room)sendHi(true)}
  mpCarNotify=carChanged;
  // Chat send
  const chatInput=$('#dmpchatinput'),chatSend=$('#dmpchatsend');
  if(chatInput&&chatSend){
    chatSend.onclick=()=>{const t=chatInput.value.trim();if(t){send({k:'chat',t});chatInput.value=''}};
    chatInput.addEventListener('keydown',e=>{if(e.key==='Enter')chatSend.onclick()});
  }
  /* ----- matchmaking ----- */
  let mmPool=null,mmTimer=null;
  function startMatchmaking(){
    if(room||status!=='off')return;
    mmPool='quick';
    note('Finding match...');
    mmTimer=setInterval(()=>{
      if(room)return;
      // try to join a random room from the list
      const rooms=Object.keys(peers).length>0 ? Array.from(peers.keys()) : [];
      if(rooms.length>0){
        join(rooms[Math.floor(Math.random()*rooms.length)]);
      }else{
        // create a new room and wait
        join(rid(5));
      }
    },5000);
  }
  function cancelMatchmaking(){
    if(mmTimer){clearInterval(mmTimer);mmTimer=null}
    mmPool=null;
    note('Matchmaking cancelled');
  }
  function quickJoin(){
    if(room||status!=='off')return;
    // try to find an active room
    const rooms=Array.from(peers.keys());
    if(rooms.length>0){
      join(rooms[0]);
    }else{
      join(rid(5));
    }
  }
  // expose for UI
  window.MPMatchmaking={start:startMatchmaking,cancel:cancelMatchmaking,quickJoin:quickJoin};
  /* ----- shared custom venue ----- */
    const venueKey=(pts,seed,ex)=>seed+':'+pts.length+':'+Math.round(pts[0].x)+','+Math.round(pts[0].y)+':'+(ex||'');
    function inRoom(){return !!room}
    // called from the drawer's GO (and from re-entering a venue in a room): tell everyone the track
    function shareVenue(cfg){try{
      if(!cfg||!Array.isArray(cfg.pts)||cfg.pts.length<8)return;
      lastVenue={pts:cfg.pts.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2)]),seed:cfg.seed|0,scn:cfg.scenery,wx:cfg.weather,tm:cfg.time,
        w:+cfg.width||16,el:cfg.elev||'flat',ob:(cfg.obstacles||[]).slice(0,60).map(o=>[o.t,+(+o.u).toFixed(4),o.s|0])};
      mpVenueKey=venueKey(cfg.pts,cfg.seed|0,JSON.stringify([lastVenue.w,lastVenue.el,lastVenue.ob]));
      if(room&&status==='up')send(Object.assign({k:'trk'},lastVenue));
    }catch(e){lg('shareVenue',e&&e.message)}}
    // received someone else's venue: build the identical circuit and drop into it
    function adoptVenue(m){try{
      if(!Array.isArray(m.pts)||m.pts.length<8||m.pts.length>400)return;
      const pts=m.pts.map(a=>({x:num(a&&a[0],-1e4,1e4,0),y:num(a&&a[1],-1e4,1e4,0)}));
      const seed=num(m.seed,1,2147483647,271828),key=venueKey(pts,seed,JSON.stringify([+m.w||16,m.el||'flat',m.ob||[]]));
      if(key===mpVenueKey&&MODE==='circuit')return;         // already on this exact venue
      mpVenueKey=key;lastVenue={pts:m.pts,seed,scn:m.scn,wx:m.wx,tm:m.tm,w:m.w,el:m.el,ob:m.ob};
      const theme=THEMES.find(t=>t.id===m.scn)||THEME_DEFAULT;
      const weather=WEATHERS.some(w=>w.id===m.wx)?m.wx:'day';
      const time=['day','dusk','sunset','night'].indexOf(m.tm)>=0?m.tm:'day';
      // the host's road width, hills and obstacles come with the track, so everyone races the same circuit
      const OBT=['speed_breaker','blocker','ramp'];
      const obstacles=(Array.isArray(m.ob)?m.ob:[]).slice(0,60).filter(o=>Array.isArray(o)&&OBT.includes(o[0])).map(o=>({t:o[0],u:num(o[1],0,1,0),s:num(o[2],-1,1,0)}));
      const width=num(m.w,8,30,16),elev=Object.prototype.hasOwnProperty.call(CIRC_ELEV,m.el)?m.el:'flat';
      buildCircuit(pts,theme,seed,{weather,time,width,elev,obstacles});enterCircuit();
      toast2('Joined the room venue');
    }catch(e){lg('adoptVenue',e&&e.message)}}
    // single-lap progress (0..1) around the custom circuit, for the race finish line
    function circProg(){const S=circuit;if(!S)return{u:0,d:999,branch:false};
      const {CSAMP,CN}=S;let b=1e9,bi=0;for(let i=0;i<CN;i++){const dx=CSAMP[i].x-car.position.x,dz=CSAMP[i].z-car.position.z,d=dx*dx+dz*dz;if(d<b){b=d;bi=i}}
      return{u:bi/CN,d:Math.sqrt(b),branch:false}}
    function getLaps(){try{const el=$('#dmplaps');return el?Math.max(1,parseInt(el.value)||3):3}catch(e){return 3}}
    function getPeers(){return peers}
    function isHolding(){return race.st===1&&!!race.hold}
    // QR modal hooks
    {const qrBtn=$$1('#dmpqr');if(qrBtn)qrBtn.onclick=()=>{
      if(!room)return;
      const modal=document.getElementById('dqr-modal');
      if(modal&&window.AppQR){
        modal.dataset.mode='invite';window.AppQR.render(document.getElementById('dqrcanvas'),invite());
        const desc=document.getElementById('dqrdesc');if(desc)desc.textContent='Room code: '+room;
        const ct=document.getElementById('dqrcode-text');if(ct)ct.value=invite();
        modal.classList.add('on');
      }else prompt('Invite link:',invite());
    }}
    // Per-player controller session: the token is random, made once per tab and reused, so clicking the button
    // again shows the same QR instead of creating a second session.
    let _ctrlTok='';
    function ctrlToken(){if(_ctrlTok)return _ctrlTok;
      try{const a=new Uint8Array(12);crypto.getRandomValues(a);_ctrlTok=Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')}
      catch(e){_ctrlTok=(Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)+Date.now().toString(36)).slice(0,24)}
      return _ctrlTok}
    function controllerUrl(){return location.origin+location.pathname+'?controller=true&room='+encodeURIComponent(room)+'&to='+encodeURIComponent(me.id)+'&token='+ctrlToken()+'&pn='+encodeURIComponent(myName())}
    let phoneStTimer=0;
    function phoneStatusText(){const PC=window.PhoneController;
      return PC&&PC.isPhoneConnected()?'CONNECTED':(PC&&PC.everConnected?'CONTROLLER DISCONNECTED · scan again or press Reconnect on the phone':'WAITING FOR PHONE')}
    function paintPhoneStatus(){const desc=document.getElementById('dqrdesc'),modal=document.getElementById('dqr-modal');
      if(desc&&modal&&modal.dataset.mode==='phone')desc.textContent='Player: '+myName()+' · Room '+room+' · '+phoneStatusText();
      const b=document.getElementById('dmpphonest');if(b)b.textContent=room?('Controller: '+(window.PhoneController&&window.PhoneController.isPhoneConnected()?'phone':'keyboard')):''}
    {const phoneBtn=$$1('#dmpphone');if(phoneBtn)phoneBtn.onclick=()=>{
      if(!room){note('Join a room first');return}
      const url=controllerUrl();
      const modal=document.getElementById('dqr-modal');
      if(modal&&window.AppQR){
        modal.dataset.mode='phone';
        window.AppQR.render(document.getElementById('dqrcanvas'),url);
        const ct=document.getElementById('dqrcode-text');if(ct)ct.value=url;
        paintPhoneStatus();clearInterval(phoneStTimer);phoneStTimer=setInterval(paintPhoneStatus,500);
        modal.classList.add('on');
      }else prompt('Phone controller URL:',url);
    }}
    setInterval(()=>{if(room)paintPhoneStatus()},1000);
    {const qrCopy=document.getElementById('dqrcopy');if(qrCopy)qrCopy.onclick=()=>{const t=document.getElementById('dqrcode-text');if(!t)return;t.select();
      const done=()=>{qrCopy.textContent='Copied';setTimeout(()=>qrCopy.textContent='Copy',1500)};
      try{navigator.clipboard.writeText(t.value).then(done,()=>{document.execCommand('copy');done()})}catch(e){try{document.execCommand('copy');done()}catch(_){}}}}
    {const qrClose=document.getElementById('dqrclose');if(qrClose)qrClose.onclick=()=>{const m=document.getElementById('dqr-modal');clearInterval(phoneStTimer);if(m){m.classList.remove('on');m.dataset.mode=''}}}
    {const rematch=document.getElementById('dresrematch');if(rematch)rematch.onclick=()=>{
      if(!room){const m=document.getElementById('dresults');if(m)m.classList.remove('on');restartSoloRace();return}
      if(isHost()){if(!myReady)setReady(true);requestRace()}       // host: go now (everyone is put back on the grid)
      else setReady(!myReady)}}                                     // guest: vote; the card stays open until the host starts
    {const rc=document.getElementById('dresclose');if(rc)rc.onclick=()=>{const m=document.getElementById('dresults');if(m)m.classList.remove('on');if(window.RaceEngine)window.RaceEngine.closeResultsModal()}}
    {const resLobby=document.getElementById('dreslobby');if(resLobby)resLobby.onclick=()=>{const m=document.getElementById('dresults');if(m)m.classList.remove('on');openPanel()}}
    // results card: once per race for everyone in it (finished, DNF or spectating); kept live while open
    function ui(){
      uiBase();
      if(race.st===3&&!race._resShown){race._resShown=true;showResults()}
      else if(race.st===3){const m=document.getElementById('dresults');if(m&&m.classList.contains('on'))paintReady()}
    }
    function showResults(){
      const m=document.getElementById('dresults');if(!m)return;
      const rows=[{n:myName(),fin:myFin,me:1}];
      peers.forEach(P=>{if(P.fin||P.got)rows.push({n:P.n,fin:P.fin})});
      rows.sort((a,b)=>a.fin&&b.fin?a.fin-b.fin:a.fin?-1:b.fin?1:0);
      const best=rows.length&&rows[0].fin?rows[0].fin:0,list=document.getElementById('dreslist'),nl=race.laps||getLaps();
      if(list)list.innerHTML=rows.map((r,i)=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)"><span>${r.fin?i+1+'.':'–'} ${esc(r.n)}${r.me?' (you)':''}</span><span>${r.fin?fmtT(r.fin)+(best&&r.fin>best?' <span style="opacity:.6">+'+((r.fin-best)/1000).toFixed(2)+'s</span>':''):'DNF'}</span></div>`).join('')+
        `<div style="margin-top:8px;opacity:.7;font-size:12px">${nl} lap${nl>1?'s':''} · ${MODE==='circuit'&&circuit?'drawn track':'Earth valley loop'}</div>`;
      let st=document.getElementById('dresstatus');
      if(!st&&list){st=document.createElement('div');st.id='dresstatus';st.className='mono';st.style.cssText='margin-top:12px;font-size:12px;color:#d4a83a;min-height:1.4em';list.parentNode.insertBefore(st,list.nextSibling)}
      const lobby=document.getElementById('dreslobby');if(lobby)lobby.textContent=isHost()?'Change track / laps':'Room';
      m.style.display='';m.classList.add('on');paintReady();
    }
    // everyone (2+ players) ready in the lobby or on the results card: the host's game starts the race by itself
    function autoStart(now){
      if(!room||status!=='up'||!isHost()||!(race.st===0||race.st===3)){if(autoStartAt){autoStartAt=0}return}
      const live=[...peers.values()].filter(p=>p.got||p.last);
      const all=live.length>0&&myReady&&live.every(p=>p.ready);
      if(!all){if(autoStartAt){autoStartAt=0;paintReady()}return}
      if(!autoStartAt){autoStartAt=now+2500;note('Everyone is ready · starting…');toast2('Everyone is ready · starting');paintReady()}
      else if(now>=autoStartAt){autoStartAt=0;requestRace()}}
    return {tick,join,leave,LOG,shareVenue,inRoom,getLaps,getPeers,isHolding,isHostNow:()=>isHost(),get on(){return !!room},get state(){return {room,status,peers,race,me}},_dbg:{sorted}}
  })();
  /* ---------- go ---------- */
  function resize(){W=sec.clientWidth;H=sec.clientHeight;R.setPixelRatio(DPR());R.setSize(W,H,false);C.aspect=W/H;C.updateProjectionMatrix();if(sun.shadow)sun.shadow.needsUpdate=true}addEventListener('resize',resize);
  function enterDrive(){active=true;sec.classList.add('active');if(TOUCH)sec.classList.add('touch');resize();{const l=$('#dload');if(l)l.remove()}
    driving=true;hud.classList.add('on');if(TOUCH)mob.classList.add('on');checkRot();
    hint.textContent=TOUCH?'':'WASD drive · C camera · Z mirror · L time a lap · M map · R reset';
    {const {p,tg}=at(progU||0);C.position.set(p.x-tg.x*10,p.y+5,p.z-tg.z*10);look.set(p.x+tg.x*6,p.y+1,p.z+tg.z*6)}
        if(typeof spawnAIRacers==='function')spawnAIRacers();
    if(!PCAR)setCar(curCarId,GARAGE[0].paints[0],true);
    /* compile every material now instead of the first time it scrolls into view mid-drive */
    try{S.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine)o.frustumCulled&&(o.__fc=1,o.frustumCulled=false)});R.compile(S,C);S.traverse(o=>{if(o.__fc){o.frustumCulled=true;delete o.__fc}})}catch(e){}}
  /* ?dev=1 only: handles for the handling test script (scripts/handling-test.js). It adds a flat
     test pad far from the world and can put the car on it; nothing here exists in normal play. */
  if(/[?&]dev=1\b/.test(location.search))window.__dev={chassisB,veh,V,key,world,GARAGE,setCar,enterDrive,wx,R,SPACE,C,CAMS,get camMode(){return camMode},set camMode(v){camMode=v},
    pad(){if(!this._pad){const b=new CANNON.Body({mass:0});b.addShape(new CANNON.Box(new CANNON.Vec3(1500,1,1500)));b.position.set(0,999,-30000);world.addBody(b);this._pad=b}
      PREV.ok=false;physAcc=0;steerActual=0;progU=.5;chassisB.position.set(0,1001.2,-30000-1300);chassisB.quaternion.set(0,0,0,1);
      chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);chassisB.force.set(0,0,0);chassisB.torque.set(0,0,0)}};
  HF.paint(0,[1,1,1]);applyWx(true);applyQ();
  let _audioInited=false;
  function maybeInitAudio(){
    if(navigator.userActivation&&!navigator.userActivation.isActive)return;   // not a gesture Chrome accepts yet
    audioInit();try{const M=window.AudioManager;if(M&&M.AC&&M.AC.state==='suspended')M.AC.resume()}catch(e){}
    if(AC&&AC.state==='running'&&!_audioInited){_audioInited=true;AUDIO_EVS.forEach(ev=>removeEventListener(ev,maybeInitAudio))}}
  // Only init audio on real user gestures - remove passive flag
  const AUDIO_EVS=['pointerdown','pointerup','keydown','touchend','click'];
  AUDIO_EVS.forEach(ev=>addEventListener(ev,maybeInitAudio));
  enterDrive();
})();
