const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
(function(){
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
  ];
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
  R.shadowMap.enabled=!LOW;R.shadowMap.type=THREE.PCFSoftShadowMap;
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
  const Q_UP_MS=3000;let qGoodT=0,qBadT=0;
  const qDownMs=()=>qTier===0?450:900;
  function tierCfg(t){
    return t===2?{dpr:.75,shadow:false,shEvery:6}
         : t===1?{dpr:LOW?1.0:1.05,shadow:!LOW,shEvery:5}
         :        {dpr:ULTRA.dpr,shadow:true,shEvery:2};
  }
  function setTier(t){
    if(t===qTier)return;qTier=t;const c=tierCfg(t);
    R.setPixelRatio(Math.min(devicePixelRatio||1,c.dpr));R.setSize(W,H,false);
    R.shadowMap.enabled=c.shadow;if(sun){sun.castShadow=c.shadow;sun.shadow.needsUpdate=true}
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
    if(SCN.grass)SCN.grass.visible=true;
    if(SCN.dust)SCN.dust.visible=true;
    if(SCN.stars)SCN.stars.visible=true;
    if(typeof pGeo!=='undefined'&&pGeo)pGeo.setDrawRange(0,PCOUNT);
  }

  if('outputEncoding' in R)R.outputEncoding=THREE.sRGBEncoding;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=.98;
  const S=new THREE.Scene();S.background=new THREE.Color(0x0e0e0d);S.fog=new THREE.Fog(0x0e0e0d,55,170);
  const C=new THREE.PerspectiveCamera(50,W/H,.1,320);
  let ZN={drag:0,fog:1,tint:[1,1,1]},fogFar0=170,fogNear0=55,hemi0=.55,sunI0=1.05;
  let progU=0;
  const hemi=new THREE.HemisphereLight(0xdfeaff,0x3c3a30,.55);S.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff2dd,1.05);sun.position.set(18,34,12);sun.castShadow=!LOW;sun.shadow.mapSize.set(LOW?512:1024,LOW?512:1024);sun.shadow.autoUpdate=false;sun.shadow.bias=-.0006;Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:110});S.add(sun);S.add(sun.target);
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
  signPost(BR_START.x-BR_OUT.x*4,BR_START.z-BR_OUT.z*4,BR_H,'Ramp yard →','off the main road',false,Math.atan2(BR_OUT.x,BR_OUT.z));
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
   SPURS.forEach((pts,i)=>{if(pts.length<8)return;const [x,z]=pts[5],[x2,z2]=pts[6],dx=x2-x,dz=z2-z,l=Math.hypot(dx,dz)||1,sx=x-dz/l*5.5,sz=z+dx/l*5.5;
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
      const nx=curMission();if(nx)setTimeout(()=>toastMsg('Next up · '+nx.name),1900);else setTimeout(()=>toastMsg('Every mission cleared. Built different.'),1900)}
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
    setTimeout(()=>lapEl.classList.remove('best'),2600)}
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
  /* ---------- traffic: other cars actually driving the loop ---------- */
  const traffic=[];
  (function(){
    const n=LOW?3:7,COLS=[0x1f3b73,0xb9bcbf,0x1b1b1d,0xe8e6e0,0x2e4a3a,0x6e1a1c,0xc4bca6];
    for(let i=0;i<n;i++){
      const lane=(i%2?1:-1)*(2.05+RWX*.62);
      const bd=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC,material:oM});
      bd.addShape(new CANNON.Box(new CANNON.Vec3(.95,.62,2.05)));world.addBody(bd);
      const c=buildCar({paint:COLS[i%COLS.length],r:.42,zf:1.3,zb:-1.3,F:2.05,B:-2.05,W:2,xw:.84,ww:.3,wagon:i%3===2,wheels:true});
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
      t.bd.aabbNeedsUpdate=true}
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
  let PCAR=buildEV({paint:0x640c0e,r:VEHS.car.r,zf:VEHS.car.zf,zb:VEHS.car.zb,F:2.42,B:-2.36,W:2.3,head:headM,tail:tailM});
  PCAR.g.position.y=.05-(VEHS.car.rest-.07)-VEHS.car.r;vis.bodyIn.add(PCAR.g);
  let wv={car:[0,1,2,3].map(i=>makeWheel(VEHS.car.r,.36,i%2?-1:1,true,true))};wv.car.forEach(k=>vis.car.add(k.w));
  /* soft contact shadow so the car sits on the road instead of hovering over it */
  let carShadow=null;
  {const c=document.createElement('canvas');c.width=64;c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(32,64,4,32,64,62);g.addColorStop(0,'rgba(0,0,0,.75)');g.addColorStop(.6,'rgba(0,0,0,.35)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,128);
   const sh=new THREE.Mesh(new THREE.PlaneGeometry(2.9,5.4).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
   sh.position.y=.05-(VEHS.car.rest-.07)-.02;sh.renderOrder=1;vis.car.add(sh);carShadow=sh}
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
  const hideCars=v=>{car.visible=v;for(let i=0;i<traffic.length;i++)traffic[i].car.g.visible=v};
  if(!LOW){try{cubeRT=new THREE.WebGLCubeRenderTarget(128,{format:THREE.RGBFormat,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});cubeCam=new THREE.CubeCamera(1,420,cubeRT);S.add(cubeCam);
    CARMATS.forEach(m=>{m.envMap=cubeRT.texture;m.needsUpdate=true})}catch(e){cubeCam=null}}
  const V=VEHS.car;
  function applyVehicle(){veh.wheelInfos.forEach((w,i)=>{const sx=i%2?-1:1;w.chassisConnectionPointLocal.set(sx*V.xw,.05,i<2?V.zf:V.zb);w.radius=V.r;w.suspensionRestLength=V.rest;w.frictionSlip=V.slip*wx.slip;w.rollInfluence=V.roll});chassisB.angularDamping=.4}
  /* ---------- swap the whole car: physics rig, body mesh, wheels, mass, shadow ---------- */
  let curCarId='aster',mpCarNotify=null;
  const GARAGE_BASE_LEN=2.42-(-2.36);
  function garageOf(id){return GARAGE.find(g=>g.id===id)||GARAGE[0]}
  function setCar(id,paint,quiet){
    const spec=garageOf(id);curCarId=spec.id;
    const paintHex=paint!=null?paint:spec.paints[0];
    Object.assign(V,spec.V);V.label=spec.label;
    applyVehicle();
    chassisB.mass=spec.mass;chassisB.updateMassProperties();
    vis.bodyIn.remove(PCAR.g);
    const o={paint:paintHex,r:V.r,zf:V.zf,zb:V.zb,F:spec.F,B:spec.B,W:spec.W,head:headM,tail:tailM};
    PCAR=spec.type==='ev'?buildEV(o):buildCar(Object.assign(o,{wagon:!!spec.wagon,wheels:false}));
    PCAR.g.position.y=.05-(V.rest-.07)-V.r;vis.bodyIn.add(PCAR.g);
    if(cubeRT)PCAR.g.traverse(m=>{if(m.material&&m.material.reflectivity!==undefined){m.material.envMap=cubeRT.texture;m.material.needsUpdate=true}});
    wv.car.forEach(k=>vis.car.remove(k.w));
    wv={car:[0,1,2,3].map(i=>makeWheel(V.r,.36,i%2?-1:1,true,true))};wv.car.forEach(k=>vis.car.add(k.w));
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
  function audioInit(){if(AC){try{if(AC.state==='suspended')AC.resume()}catch(e){}return}try{AC=new (window.AudioContext||window.webkitAudioContext)();
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
    {const lfo=O('sine',4.3),lg=G(1.4);lfo.connect(lg);lg.connect(m1.frequency);lg.connect(m3.frequency)}
    // tyres: tarmac roar (pink noise, lowpassed) and gravel hiss (white, bandpassed)
    const rG=G(0),rF=F('lowpass',300,.6);L(pk).connect(rF);rF.connect(rG);rG.connect(bus);
    const gG=G(0),gF=F('bandpass',1900,.7);L(wh).connect(gF);gF.connect(gG);gG.connect(bus);
    // wind
    const wG=G(0),wF=F('bandpass',700,.45);L(pk).connect(wF);wF.connect(wG);wG.connect(bus);
    // squeal: two narrow resonances on noise, wobbled every frame so it sounds like rubber, not a tone
    const sG=G(0),s1=F('bandpass',1050,11),s2=F('bandpass',2200,13),s2g=G(.55),sn=L(wh);
    sn.connect(s1);sn.connect(s2);s1.connect(sG);s2.connect(s2g);s2g.connect(sG);sG.connect(bus);
    SND={bus,tone,pk,wh,mG,mF,m1,m2,m3,g3,rG,rF,gG,wG,wF,sG,s1,s2,ld:0};
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
  /* ---------- garage ---------- */
  {const gb=$('#dgarageb'),gp=$('#dgarage'),gx=$('#dgaragex'),gl=$('#dgcars'),gpaints=$('#dgpaints'),gname=$('#dgname'),gblurb=$('#dgblurb'),gcoins=$('#dgcoins');
   if(gb&&gp&&gl){
     let curPaint=GARAGE[0].paints[0],hadSave=false;
     try{const s=JSON.parse(localStorage.getItem('sl_car')||'null');
       if(s&&garageOf(s.id)){hadSave=true;curPaint=s.paint!=null?s.paint:garageOf(s.id).paints[0];setCar(s.id,curPaint,true)}}catch(e){}
     GARAGE.forEach(spec=>{const li=document.createElement('li');li.dataset.id=spec.id;gl.appendChild(li)});
     updCoinsUI=()=>{if(gcoins)gcoins.textContent=coins+' coins'};
     const refreshList=()=>{$$('#dgcars li').forEach(li=>{const spec=garageOf(li.dataset.id),owned=unlocked.has(spec.id);
       li.classList.toggle('locked',!owned);
       li.innerHTML='<span class="n">'+spec.label+'</span><span class="s">'+
         (owned?(spec.type==='ev'?'EV':'Petrol'):('Buy · '+spec.price))+'</span>'})};
     const refresh=()=>{const spec=garageOf(curCarId);
       refreshList();
       $$('#dgcars li').forEach(li=>li.classList.toggle('on',li.dataset.id===curCarId));
       gblurb.textContent=spec.label+' · '+spec.blurb;
       gpaints.innerHTML='';spec.paints.forEach(c=>{const b=document.createElement('button');
         b.style.background='#'+c.toString(16).padStart(6,'0');b.dataset.p=c;
         b.classList.toggle('on',c===curPaint);gpaints.appendChild(b)});
       updCoinsUI()};
     refresh();
     const setOpen=o=>{gp.classList.toggle('on',o);if(o){try{gname.value=localStorage.getItem('sl_name')||''}catch(e){}refresh()}};
     gb.onclick=()=>setOpen(true);
     gx.onclick=()=>setOpen(false);
     gp.addEventListener('click',e=>{if(e.target===gp)setOpen(false)});
     gl.addEventListener('click',e=>{const li=e.target.closest('li[data-id]');if(!li)return;
       const spec=garageOf(li.dataset.id);
       if(!unlocked.has(spec.id)){
         if(coins>=spec.price){coins-=spec.price;saveCoins();unlocked.add(spec.id);saveUnlocked();
           toastMsg('Bought '+spec.label+' · -'+spec.price+' coins');
           curPaint=spec.paints[0];setCar(spec.id,curPaint);refresh()}
         else toastMsg('Need '+(spec.price-coins)+' more coins for '+spec.label);
         return}
       curPaint=spec.paints[0];setCar(spec.id,curPaint);refresh()});
     gpaints.addEventListener('click',e=>{const b=e.target.closest('button[data-p]');if(!b)return;
       curPaint=+b.dataset.p;setCar(curCarId,curPaint);$$('#dgpaints button').forEach(x=>x.classList.toggle('on',x===b))});
     gname.addEventListener('change',()=>{const nm=(gname.value||'').trim().slice(0,14);try{if(nm)localStorage.setItem('sl_name',nm)}catch(e){}});
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
  addEventListener('keydown',e=>{if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;if(!active)return;if(e.code==='Escape'){if(boardEl.classList.contains('on'))closeBoard();else if($('#dgarage').classList.contains('on'))$('#dgarage').classList.remove('on');else if($('#dcirc')&&$('#dcirc').classList.contains('on'))$('#dcirc').classList.remove('on');else if($('#dmaps')&&$('#dmaps').classList.contains('on'))$('#dmaps').classList.remove('on');else if(bigmap.classList.contains('on'))toggleMap();return}if(!driving)return;if(e.code==='KeyE'){SPACE.interact();return}if(e.code==='KeyM'){toggleMap();return}if(e.code==='KeyN'){toggleNight();return}if(e.code==='KeyR'){resetCar();return}if(e.code==='KeyC'){cycleCam();return}if(e.code==='KeyL'){startRace();return}if(e.code==='KeyB'){boardEl.classList.contains('on')?closeBoard():openBoard();return}const k=KMAP[e.code];if(!k)return;key[k]=1;e.preventDefault()});
  addEventListener('keyup',e=>{const k=KMAP[e.code];if(k)key[k]=0});
  function hold(el,k){const on=e=>{e.preventDefault();key[k]=1;el.classList.add('dn');try{el.setPointerCapture(e.pointerId)}catch(_){}if(navigator.vibrate)navigator.vibrate(8)};const off=()=>{key[k]=0;el.classList.remove('dn')};el.addEventListener('pointerdown',on);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,off));el.addEventListener('contextmenu',e=>e.preventDefault())}
  hold($('#dL'),'l');hold($('#dR'),'r');hold($('#dgas'),'f');hold($('#dbrk'),'b');hold($('#dboost'),'boost');
  $('#dresetb').onclick=resetCar;

  /* ---------- tool menu: five buttons collapse behind one on touch ---------- */
  {const mb=$('#dmenu'),row=$('#drow');
   const setMenu=o=>{row.classList.toggle('open',o);mb.setAttribute('aria-expanded',o?'true':'false')};
   mb.onclick=e=>{e.stopPropagation();setMenu(!row.classList.contains('open'))};
   // any choice inside closes it, and so does a tap on the road
   row.addEventListener('click',e=>{if(e.target.closest('.dbtn'))setMenu(false)});
   addEventListener('pointerdown',e=>{
     if(!row.classList.contains('open'))return;
     if(!row.contains(e.target)&&e.target!==mb)setMenu(false);
   },true);}

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
  /* C cycles the camera, like any driving game: chase, far chase, low chase, bonnet, bumper */
  const CAMS=[{n:'Chase',d:9.5,h:4.8,k:1,lag:6.5,ahead:6,ly:1.05,fov:50},{n:'Far chase',d:15,h:7.5,k:1.2,lag:5,ahead:8,ly:1,fov:48},
    {n:'Low chase',d:6.2,h:2.1,k:.6,lag:9,ahead:10,ly:.9,fov:58},{n:'Bonnet',fp:1,y:.5,z:1.1,fov:66},{n:'Bumper',fp:1,y:.02,z:2.5,fov:70}];
  let camMode=0;try{camMode=Math.min(CAMS.length-1,+localStorage.getItem('sl_cam')||0)}catch(e){}
  function cycleCam(){camMode=(camMode+1)%CAMS.length;try{localStorage.setItem('sl_cam',camMode)}catch(e){}toastMsg('Camera: '+CAMS[camMode].n+' \u00b7 C to switch')}
  {const nb=document.getElementById('dnight');if(nb){const cb=nb.cloneNode(true);cb.id='dcam';cb.textContent='Camera';cb.title='Camera (C)';nb.after(cb);cb.onclick=()=>cycleCam()}}
  function resetCar(){const {p,tg}=(MODE==='circuit'&&circuit)?circAt(circU0<0?0:circU0,circuit.curve):at(progU);PREV.ok=false;physAcc=0;leanVf=0;leanA=0;if(vis.body)vis.body.rotation.set(0,0,0);
    chassisB.position.set(p.x,p.y+1.4,p.z);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0);
    chassisB.force.set(0,0,0);chassisB.torque.set(0,0,0);chassisB.linearDamping=.01;chassisB.angularDamping=.4;
    chassisB.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),Math.atan2(tg.x,tg.z));
    veh.wheelInfos.forEach(w=>{w.suspensionLength=w.suspensionRestLength;w.deltaRotation=0});
    for(let i=0;i<4;i++){veh.applyEngineForce(0,i);veh.setBrake(0,i)}
    sub=0;inPond=false;steerActual=0;if(raceMode&&!lapArmed&&!lapVoid){lapVoid=true;lapEl.classList.add('void')}blip(330,.2)}
  function toastMsg(s){toast.textContent=s;clearTimeout(toast._t);
    if(window.gsap){gsap.killTweensOf(toast);
      gsap.fromTo(toast,{opacity:0,y:-10,scale:.94},{opacity:1,y:0,scale:1,duration:.45,ease:'back.out(1.7)'});
      toast._t=setTimeout(()=>gsap.to(toast,{opacity:0,y:-8,duration:.35,ease:'power2.in'}),1700)}
    else{toast.classList.add('show');toast._t=setTimeout(()=>toast.classList.remove('show'),1700)}}
  /* ---------- the summit ---------- */
  let atSummit=false,summitMoodBack=null;
  const wrongEl=$('#dwrong');
  /* ---------- minimap ---------- */
  const MAPS=SAMP.filter((_,i)=>i%2===0);let mapRot=0;
  /* The static half of the map (water, woods, road, hill) never changes, so draw it once
     into an offscreen bitmap. Re-stroking 150 trees as canvas arcs several times a second
     was costing real frames for a 180px widget. */
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
  function drawMap(c,size,big){const sc=size/2/(big?116*MK*LAND+14:60);c.clearRect(0,0,size,size);c.save();c.translate(size/2,size/2);
    c.beginPath();c.arc(0,0,size/2-1,0,6.283);c.fillStyle='rgba(18,17,15,.88)';c.fill();c.clip();
    const q=chassisB.quaternion,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
    if(!big){let d=(yaw+Math.PI-mapRot);d=Math.atan2(Math.sin(d),Math.cos(d));mapRot+=d*.1;c.rotate(mapRot);c.translate(-chassisB.position.x*sc,-chassisB.position.z*sc)}
    if(!mapCache)buildMapCache();
    {const s=MAPR*sc;c.drawImage(mapCache,-s,-s,s*2,s*2)}
    c.strokeStyle='#f2eee6';c.lineWidth=2;c.beginPath();const n=Math.floor(progU*MAPS.length);for(let i=0;i<=n&&i<MAPS.length;i++){const p=MAPS[i];i?c.lineTo(p.x*sc,p.z*sc):c.moveTo(p.x*sc,p.z*sc)}c.stroke();
    const t=performance.now()/500;
    {
     // traffic shows up on the map so you can see what you are racing into
     c.fillStyle='rgba(242,238,230,.75)';traffic.forEach(tc=>{const pt=at(tc.u).p;c.beginPath();c.arc(pt.x*sc,pt.z*sc,big?3.4:2.2,0,6.283);c.fill()})}
    // the ring road, drawn as the circle it is
    {c.strokeStyle='rgba(242,238,230,.45)';c.lineWidth=big?3:2;
     c.beginPath();c.arc(RING.x*sc,RING.z*sc,RING.r*sc,0,6.283);c.stroke()}
    // the summit: a warm marker so the lookout reads as a real destination, pulsing once you're actually parked there
    {c.fillStyle=atSummit?'#f2b26b':'#c98a4a';c.beginPath();c.arc(PEAK.x*sc,PEAK.z*sc,big?5:3.4,0,6.283);c.fill();
     if(atSummit){c.strokeStyle='rgba(242,178,107,.8)';c.lineWidth=1.5;c.beginPath();c.arc(PEAK.x*sc,PEAK.z*sc,(big?9:6)+Math.sin(t)*2,0,6.283);c.stroke()}
     if(big){c.fillStyle='#f2b26b';c.font='600 11px ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace';c.textAlign='left';c.fillText('SUMMIT',PEAK.x*sc+9,PEAK.z*sc+4)}}
    if(big){c.font='600 11px ui-monospace,"SF Mono",Menlo,Consolas,monospace';c.fillStyle='#e8c28a';[['STUNT PARK',VZ.stunt],['UFO',VZ.ufo],['VOLCANO',VZ.volc]].forEach(([t,q])=>c.fillText(t,q.x*sc-t.length*3.3,q.z*sc+4))}
    if(big){c.fillStyle='#9fc3d6';c.font='600 11px ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace';c.fillText('POND',POND.x*sc-14,POND.z*sc+4);c.fillStyle='#d88';c.fillText('PLAYGROUND',(PG.x-12)*sc,(PG.z-13)*sc);c.fillStyle='#cdb98f';const hp=SAMP[Math.floor(.44*N)];c.fillText('HILL',hp.x*sc+10,hp.z*sc-10)}
    c.translate(chassisB.position.x*sc,chassisB.position.z*sc);c.rotate(Math.PI-yaw);c.fillStyle='#f2eee6';c.beginPath();c.moveTo(0,-7);c.lineTo(5,5);c.lineTo(0,2.5);c.lineTo(-5,5);c.closePath();c.fill();c.restore();
    c.strokeStyle='rgba(242,238,230,.5)';c.lineWidth=1.5;c.beginPath();c.arc(size/2,size/2,size/2-1,0,6.283);c.stroke()}
  function toggleMap(){const on=!bigmap.classList.contains('on');bigmap.classList.toggle('on',on);driving=!on;for(const k in key)key[k]=0;if(on)drawMap(bmc.getContext('2d'),bmc.width,true)}
  mm.onclick=toggleMap;$('#dbigx').onclick=toggleMap;
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
  function physStep(h){
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
      {const wi=veh.wheelInfos,STATIC=chassisB.mass*Math.abs(world.gravity.y)/4;
       UPV.set(0,1,0);chassisB.quaternion.vmult(UPV,bodyUp);
       for(let i=0;i<wi.length;i++){const w=wi[i],rest=w.suspensionRestLength||1;
         const sf=+w.suspensionForce;
         wLoad[i]=w.isInContact&&isFinite(sf)?Math.max(0,sf):0;
         wComp[i]=w.isInContact?Math.max(0,Math.min(1,w.suspensionLength/rest)):1}
       // anti-roll bars — front axle is wheels 0/1, rear is 2/3. Unrolled, so no closure per frame.
       if(!inPond)for(let ax=0;ax<2;ax++){
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
       const lateral=Math.min(1,Math.abs(lvScratch.x)/8),rearGrip=key.h?.58:1,
             grip=V.slip*wx.slip*(1-sub*.72)*(1+gradeNow*.55)*(1+lateral*.22);
       for(let i=0;i<wi.length;i++){
         // load sensitivity: grip climbs with load, but slower than the load does
         const lr=STATIC>0?wLoad[i]/STATIC:1;
         const ls=wi[i].isInContact?Math.max(.4,Math.pow(Math.min(LOAD_CAP,lr),LOAD_EXP)):1;
         wi[i].frictionSlip=grip*(i>1?rearGrip:1)*(isFinite(ls)?ls:1)}
       // nothing above is allowed to hand the solver a NaN — that is what used to launch the car
       const F=chassisB.force,T=chassisB.torque;
       if(!isFinite(F.x)||!isFinite(F.y)||!isFinite(F.z))F.set(0,0,0);
       if(!isFinite(T.x)||!isFinite(T.y)||!isFinite(T.z))T.set(0,0,0)}
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

    /* ---- shared helpers ---- */
    function mkGlow(col,scale){
      const c=document.createElement('canvas');c.width=c.height=128;
      const g=c.getContext('2d'),rg=g.createRadialGradient(64,64,0,64,64,64);
      rg.addColorStop(0,col);rg.addColorStop(0.4,col.replace(/[\d.]+\)$/,'0.4)'));rg.addColorStop(1,col.replace(/[\d.]+\)$/,'0)'));
      g.fillStyle=rg;g.fillRect(0,0,128,128);
      const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false}));
      s.scale.setScalar(scale);return s;
    }
    function starPoints(n,rmin,rmax,size){
      const p=new Float32Array(n*3),col=new Float32Array(n*3);
      for(let i=0;i<n;i++){
        const r=rmin+Math.random()*(rmax-rmin),th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);
        p[i*3]=r*Math.sin(ph)*Math.cos(th);p[i*3+1]=r*Math.cos(ph);p[i*3+2]=r*Math.sin(ph)*Math.sin(th);
        const w=0.55+Math.random()*0.45,tn=Math.random();
        col[i*3]=w;col[i*3+1]=w*(0.86+tn*0.14);col[i*3+2]=w*(0.9+(1-tn)*0.1);
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(p,3));
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      return new THREE.Points(geo,new THREE.PointsMaterial({size:size||2.2,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:0.95,depthWrite:false,fog:false}));
    }
    function planetTex(base,bands){
      const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');
      x.fillStyle=base;x.fillRect(0,0,256,128);
      (bands||[]).forEach(b=>{x.fillStyle=b.c;x.globalAlpha=b.a==null?1:b.a;x.fillRect(0,b.y*128,256,b.h*128)});
      x.globalAlpha=1;for(let i=0;i<60;i++){x.beginPath();x.arc(Math.random()*256,Math.random()*128,2+Math.random()*12,0,7);x.fillStyle='rgba(0,0,0,0.05)';x.fill();}
      return new THREE.CanvasTexture(c);
    }
    function craterTex(base){
      const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');
      x.fillStyle=base;x.fillRect(0,0,256,128);
      for(let i=0;i<180;i++){const r=1+Math.random()*10,px=Math.random()*256,py=Math.random()*128;
        x.beginPath();x.arc(px,py,r,0,7);x.fillStyle='rgba(0,0,0,'+(0.05+Math.random()*0.12)+')';x.fill();}
      return new THREE.CanvasTexture(c);
    }

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

    const travelEl=$('#dtravel');

    /* ---- planet-select overlay (DOM) ---- */
    const DEST=[
      {key:'earth',name:'Earth',g:'9.8 m/s2',env:'Home - lush valley'},
      {key:'moon', name:'Moon', g:'1.6 m/s2',env:'Regolith - 1/6 g'},
      {key:'mars', name:'Mars', g:'3.7 m/s2',env:'Rover terrain - red desert'},
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
    const PLANETS={
      moon:{ name:'Moon', seed:271828, g:4.0,
        bg:0x02030a, fog:null, sun:0xfff6e8, sunI:2.3, sunDir:[0.5,0.42,0.3], amb:0x0a0f1c, ambI:0.25,
        ground:[0.40,0.38,0.35], groundNoise:0.10, rock:0x8d8a84, roadCol:0x3b3a37, dust:0xb8b4ab,
        accel:24, vmax:40, boost:1.5, steer:1.7, ufoEvery:5000, earthInSky:true, dunes:0,
        base1:[0.004,26], base2:[0.02,7],
        craters:[[70,8,26,1.0,0.5],[180,34,78,1.9,0.42],[520,140,300,3.0,0.55]],
        caption:'Moon - 1/6 g - infinite regolith road' },
      mars:{ name:'Mars', seed:141421, g:7.0,
        bg:0x180a06, fog:[300,1600], sun:0xffd9b0, sunI:1.9, sunDir:[0.4,0.5,0.25], amb:0x3a1b12, ambI:0.55,
        ground:[0.62,0.32,0.18], groundNoise:0.08, rock:0x7a3b22, roadCol:0x5a3320, dust:0xc98a5a,
        accel:18, vmax:34, boost:1.35, steer:1.5, ufoEvery:5000, earthInSky:false, dunes:1,
        base1:[0.0035,30], base2:[0.018,9],
        craters:[[90,10,30,0.9,0.4],[240,40,90,1.6,0.35],[600,150,320,2.6,0.4]],
        caption:'Mars - 0.38 g - rover expedition route' },
    };

    /* procedural surface height for any planet (rolling base + multi-scale craters + optional dunes) */
    function surfaceH(cfg,x,z){
      const so=cfg.seed*0.001;
      let h=(fbm2(x*cfg.base1[0]+40+so,z*cfg.base1[0]-20-so)-0.5)*cfg.base1[1]
           +(fbm2(x*cfg.base2[0]-13-so,z*cfg.base2[0]+9+so)-0.5)*cfg.base2[1];
      if(cfg.dunes){ h+=Math.sin(x*0.02+fbm2(x*0.01,z*0.01)*6)*2.4*(0.5+0.5*fbm2(z*0.004,x*0.004)); }
      const grids=cfg.craters;
      for(let gi=0;gi<grids.length;gi++){
        const cell=grids[gi][0],minR=grids[gi][1],maxR=grids[gi][2],ds=grids[gi][3],pr=grids[gi][4];
        const cx=Math.floor(x/cell),cz=Math.floor(z/cell);
        for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
          const gx=cx+i,gz=cz+j,hsh=hash2(gx*1.7+gi*3.3+so,gz*1.3-gi*2.1-so);
          if(hsh<1-pr) continue;
          const ox=hash2(gx+3.1+gi+so,gz+1.7-so),oz=hash2(gx+5.3-so,gz+9.1+gi);
          const ccx=(gx+ox)*cell, ccz=(gz+oz)*cell;
          const R=minR+(maxR-minR)*hash2(gx+7.7-gi+so,gz+2.9+gi);
          const irr=0.82+0.36*noise2((x-ccx)*0.035,(z-ccz)*0.035);
          const d=Math.hypot(x-ccx,z-ccz)/(R*irr);
          if(d<1.35){
            const depth=R*0.16*ds;
            const bowl = d<1 ? -(1-d*d) : 0;
            const rim=Math.exp(-Math.pow((d-1)/0.17,2))*(0.52+0.2*noise2(x*0.08,z*0.08));
            const age=hash2(gx*2.3+so,gz*2.7-so),angle=Math.atan2(z-ccz,x-ccx);
            const rayAngle=hash2(gx+19.1+so,gz-8.7)*Math.PI*2,rays=Math.pow(Math.max(0,Math.cos(angle-rayAngle)),18);
            const ejecta=Math.exp(-Math.pow((d-1.2)/0.22,2))*(0.1+0.26*rays),peak=R>100&&d<0.17?(1-d/0.17)*0.2:0;
            h+=(bowl*depth+rim*depth*0.9+ejecta*depth+peak*depth)*(0.5+0.5*age);
          }
        }
      }
      return h;
    }

    /* =====================================================================
       INFINITE ROAD (deterministic centerline by arc length)
       Heading varies slowly with distance s; we integrate positions once,
       forward from s=0, and cache them. Position at any s is interpolated
       from the cache. Deterministic from the planet seed, so the same planet
       always regenerates the same route + the same UFO stations.
       ===================================================================== */
    const DS=12;                 // metres between cached centerline samples
    const ROADHALF=7;            // half road width
    const FEATHER=9;             // terrain blend-out beyond the tarmac
    function roadHeading(cfg,s){
      const k=cfg.seed*0.0007;
      return Math.sin(s*0.00090+k)*0.55 + Math.sin(s*0.00031+k*2.0)*0.90 + Math.sin(s*0.00017+1.3)*0.35;
    }
    function ensureRoad(cfg,road,sMax){
      while((road.len-1)*DS < sMax+DS){
        const i=road.len;
        if(i===0){ road.xs[0]=0; road.zs[0]=0; road.len=1; continue; }
        const h=roadHeading(cfg,(i-1)*DS);
        road.xs[i]=road.xs[i-1]+Math.sin(h)*DS;
        road.zs[i]=road.zs[i-1]+Math.cos(h)*DS;
        road.len=i+1;
      }
    }
    function roadAt(cfg,road,s){
      if(s<0)s=0; ensureRoad(cfg,road,s+DS);
      const f=s/DS,i=Math.floor(f),fr=f-i;
      const x=road.xs[i]+(road.xs[i+1]-road.xs[i])*fr, z=road.zs[i]+(road.zs[i+1]-road.zs[i])*fr;
      const h=roadHeading(cfg,s);
      return {x,z,tx:Math.sin(h),tz:Math.cos(h),nx:Math.cos(h),nz:-Math.sin(h)};
    }
    // nearest centerline point to (x,z), searched in a window of arc length around sHint
    function nearestRoad(cfg,road,x,z,sHint){
      const lo=Math.max(0,Math.floor((sHint-240)/DS)), hi=Math.floor((sHint+1100)/DS);
      ensureRoad(cfg,road,(hi+1)*DS);
      let bd=1e9,bi=lo;
      for(let i=lo;i<=hi;i++){const dx=road.xs[i]-x,dz=road.zs[i]-z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=i}}
      return {d:Math.sqrt(bd), s:bi*DS, cx:road.xs[bi], cz:road.zs[bi]};
    }
    // terrain height with a flattened, drivable road corridor carved into it
    function groundH(cfg,road,x,z,sHint){
      const base=surfaceH(cfg,x,z);
      const nr=nearestRoad(cfg,road,x,z,sHint);
      if(nr.d<ROADHALF+FEATHER){
        const corridor=surfaceH(cfg,nr.cx,nr.cz);
        const t=nr.d<ROADHALF?0:(nr.d-ROADHALF)/FEATHER;
        const k=t*t*(3-2*t);                 // smoothstep blend back to open terrain
        return corridor+(base-corridor)*k;
      }
      return base;
    }

    /* =================== SPACE-JOURNEY SCENE (lazy) =================== */
    let spaceScene=null, spaceObj=null;
    function buildSpace(){
      if(spaceScene)return;
      const sc=new THREE.Scene(); sc.background=new THREE.Color(0x01010a);
      sc.add(starPoints(3600,900,7000,4));
      const sun2=new THREE.Mesh(new THREE.SphereGeometry(60,24,24),new THREE.MeshBasicMaterial({color:0xfff1c8}));
      sun2.position.set(-1400,400,-2600); sc.add(sun2);
      sun2.add(mkGlow('rgba(255,225,150,1)',700));
      const dl=new THREE.DirectionalLight(0xffffff,1.4); dl.position.copy(sun2.position); sc.add(dl);
      sc.add(new THREE.AmbientLight(0x101826,0.5));
      const bh=new THREE.Group(),horizon=new THREE.Mesh(new THREE.SphereGeometry(58,40,32),new THREE.MeshBasicMaterial({color:0x000000}));
      const dc=document.createElement('canvas');dc.width=256;dc.height=32;
      {const x=dc.getContext('2d'),g=x.createLinearGradient(0,0,256,0);g.addColorStop(0,'rgba(255,95,24,0)');g.addColorStop(.18,'rgba(196,54,20,.45)');g.addColorStop(.38,'rgba(255,149,58,.95)');g.addColorStop(.55,'rgba(255,241,207,.98)');g.addColorStop(.72,'rgba(230,91,29,.75)');g.addColorStop(1,'rgba(255,96,24,0)');x.fillStyle=g;x.fillRect(0,0,256,32)}
      const diskMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(dc),transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
      const disk=new THREE.Mesh(new THREE.RingGeometry(72,168,128),diskMat);disk.rotation.x=Math.PI*.5-.26;
      const photon=new THREE.Mesh(new THREE.TorusGeometry(66,1.6,12,128),new THREE.MeshBasicMaterial({color:0xffe9c6,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
      bh.add(disk,horizon,photon);bh.position.set(0,0,-620);sc.add(bh);
      const earth=new THREE.Mesh(new THREE.SphereGeometry(120,36,36),
        new THREE.MeshStandardMaterial({map:planetTex('#1f5fa8',[{c:'#2f7d3a',y:.2,h:.16},{c:'#2a6d33',y:.55,h:.12},{c:'#eef5ff',y:0,h:.07,a:.75}]),roughness:1}));
      earth.add(mkGlow('rgba(120,170,255,1)',360));
      const moonP=new THREE.Mesh(new THREE.SphereGeometry(90,36,36),
        new THREE.MeshStandardMaterial({map:craterTex('#c2c5cc'),roughness:1}));
      const neb=[];
      for(let i=0;i<4;i++){const n=mkGlow(['rgba(80,60,160,1)','rgba(40,90,150,1)','rgba(120,50,90,1)','rgba(50,70,140,1)'][i],1800+Math.random()*1200);
        n.position.set((Math.random()-0.5)*5000,(Math.random()-0.5)*3000,-2000-Math.random()*3000);n.material.opacity=0.25;sc.add(n);neb.push(n);}
      const pl=[];
      [['#c1684a',30,[2200,500,-1800]],['#d8c498',55,[-2600,-300,-1400]],['#8fd3e0',26,[1800,-600,-2600]]].forEach(a=>{
        const m=new THREE.Mesh(new THREE.SphereGeometry(a[1],16,16),new THREE.MeshStandardMaterial({map:planetTex(a[0],[]),roughness:1}));
        m.position.set(a[2][0],a[2][1],a[2][2]);sc.add(m);pl.push(m);});
      const streak=starPoints(1200,200,1400,3); sc.add(streak);
      const craft=UFO.g.clone(true),passenger=car.clone(true);craft.scale.setScalar(.72);
      passenger.position.set(0,-2.4,0);passenger.quaternion.identity();passenger.scale.setScalar(.45);craft.add(passenger);sc.add(craft);
      const warpRings=[];
      for(let i=0;i<5;i++){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(38+(i%4)*5,.65,7,52),new THREE.MeshBasicMaterial({color:i%3===0?0xffd39a:0x9ca9c4,transparent:true,opacity:.35+(i%4)*.08,blending:THREE.AdditiveBlending,depthWrite:false}));
        ring.position.set(Math.sin(i*1.73)*20,Math.cos(i*1.17)*15,-220-i*650);sc.add(ring);warpRings.push(ring);
      }
      sc.add(earth); sc.add(moonP);
      spaceScene=sc; spaceObj={earth,moonP,sun2,streak,neb,pl,bh,disk,photon,craft,warpRings};
    }

    /* =================== GENERALIZED SURFACE (lazy, per planet) =================== */
    const surfaces={};          // key -> built surface object
    let SURF=null;              // current surface

    function buildRover(cfg){
      const rover=new THREE.Group();
      const bodyMat=new THREE.MeshStandardMaterial({color:cfg.rover_body,roughness:.5,metalness:.3});
      const b1=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.5,3.6),bodyMat); b1.position.y=0.9; b1.castShadow=true; rover.add(b1);
      const cab=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.7,1.4),new THREE.MeshStandardMaterial({color:cfg.rover_cab,roughness:.3,metalness:.4})); cab.position.set(0,1.45,-0.2); cab.castShadow=true; rover.add(cab);
      const wheelGeo=new THREE.CylinderGeometry(0.62,0.62,0.5,14); wheelGeo.rotateZ(Math.PI/2);
      const wheelMat=new THREE.MeshStandardMaterial({color:0x1b1d22,roughness:.9});
      const wheels=[];[[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]].forEach(w=>{
        const m=new THREE.Mesh(wheelGeo,wheelMat); m.position.set(w[0],0.6,w[1]); m.castShadow=true; rover.add(m); wheels.push(m);
      });
      return {rover,wheels};
    }

    function buildSurface(key){
      if(surfaces[key]){ SURF=surfaces[key]; return; }
      const cfg=PLANETS[key];
      const sc=new THREE.Scene(); sc.background=new THREE.Color(cfg.bg);
      if(cfg.fog) sc.fog=new THREE.Fog(cfg.bg,cfg.fog[0],cfg.fog[1]);

      // lights
      sc.add(new THREE.AmbientLight(cfg.amb,cfg.ambI));
      const sunDir=new THREE.Vector3(cfg.sunDir[0],cfg.sunDir[1],cfg.sunDir[2]).normalize();
      const sunL=new THREE.DirectionalLight(cfg.sun,cfg.sunI); sunL.position.copy(sunDir).multiplyScalar(400);
      sunL.castShadow=!LOW; if(!LOW){sunL.shadow.mapSize.set(1024,1024);Object.assign(sunL.shadow.camera,{left:-140,right:140,top:140,bottom:-140,near:1,far:900});}
      sc.add(sunL); sc.add(sunL.target);
      const sunMesh=new THREE.Mesh(new THREE.SphereGeometry(60,20,20),new THREE.MeshBasicMaterial({color:0xffffff}));
      sunMesh.position.copy(sunDir).multiplyScalar(6000); sunMesh.add(mkGlow('rgba(255,250,235,1)',900)); sc.add(sunMesh);

      // celestial sky
      sc.add(starPoints(cfg.atmo?1600:4000,2000,9000,3));
      if(cfg.earthInSky){
        const earthDir=new THREE.Vector3(-0.35,0.4,-0.6).normalize();
        const earth=new THREE.Mesh(new THREE.SphereGeometry(140,36,36),
          new THREE.MeshStandardMaterial({map:planetTex('#1f5fa8',[{c:'#2f7d3a',y:.22,h:.16},{c:'#2a6d33',y:.56,h:.12},{c:'#eef5ff',y:0,h:.07,a:.75}]),roughness:1,emissive:0x0a1830,emissiveIntensity:0.5}));
        earth.position.copy(earthDir).multiplyScalar(5200); earth.add(mkGlow('rgba(120,170,255,1)',520)); sc.add(earth);
      }
      [['#c1684a',50,[0.8,0.25,0.4]],['#d8c498',90,[0.2,0.5,-0.85]]].forEach(a=>{
        const m=new THREE.Mesh(new THREE.SphereGeometry(a[1],16,16),new THREE.MeshStandardMaterial({map:planetTex(a[0],[]),roughness:1}));
        m.position.copy(new THREE.Vector3(a[2][0],a[2][1],a[2][2]).normalize().multiplyScalar(7500)); sc.add(m);
      });

      // terrain tile pool (streamed)
      const TILE=200, GRID=LOW?3:5, SEG=LOW?14:26;
      const tiles=[];
      const terrMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});
      for(let n=0;n<GRID*GRID;n++){
        const g=new THREE.PlaneGeometry(TILE,TILE,SEG,SEG); g.rotateX(-Math.PI/2);
        const colors=new Float32Array((SEG+1)*(SEG+1)*3); g.setAttribute('color',new THREE.BufferAttribute(colors,3));
        const mesh=new THREE.Mesh(g,terrMat); mesh.receiveShadow=true; mesh.userData={ci:9999,cj:9999}; sc.add(mesh); tiles.push(mesh);
      }

      // road ribbon + edge reflectors
      const roadGeo=new THREE.BufferGeometry();
      const roadMesh=new THREE.Mesh(roadGeo,new THREE.MeshStandardMaterial({color:cfg.roadCol,roughness:0.95,metalness:0.0}));
      roadMesh.receiveShadow=true; sc.add(roadMesh);
      const reflGeo=new THREE.SphereGeometry(0.45,6,5);
      const reflMat=new THREE.MeshStandardMaterial({color:0x6fe3ff,emissive:0x2f8aa0,emissiveIntensity:0.8,roughness:0.4});
      const REFLN=40, refl=new THREE.InstancedMesh(reflGeo,reflMat,REFLN); refl.frustumCulled=false; sc.add(refl);

      // rover
      const rr=buildRover({rover_body:cfg.rover.body,rover_cab:cfg.rover.cab});
      sc.add(rr.rover);

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
        roadMesh,roadGeo,refl,reflMat,
        rover:rr.rover,wheels:rr.wheels,
        dust,dgeo,dpos,dlife,dvel,emitDust,
        road:{xs:[],zs:[],len:0},
        stations,stationGeoReady,
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
      if(!force && stamp===S.tileStamp) return;
      S.tileStamp=stamp;
      const half=Math.floor(GRID/2);
      let n=0;
      for(let gi=-half;gi<=half;gi++)for(let gj=-half;gj<=half;gj++){
        const ci=pcx+gi, cj=pcz+gj, mesh=S.tiles[n++];
        if(mesh.userData.ci===ci && mesh.userData.cj===cj) continue;
        mesh.userData.ci=ci; mesh.userData.cj=cj;
        const ox=ci*TILE+TILE/2, oz=cj*TILE+TILE/2;   // tile centre
        mesh.position.set(ox,0,oz);
        const pos=mesh.geometry.attributes.position, col=mesh.geometry.attributes.color, gr=cfg.ground;
        for(let v=0;v<pos.count;v++){
          const wx=ox+pos.getX(v), wz=oz+pos.getZ(v);
          const y=groundH(cfg,S.road,wx,wz,S.s);
          pos.setY(v,y);
          const shade=1+ (noise2(wx*0.05,wz*0.05)-0.5)*cfg.groundNoise + Math.max(0,y)*0.002;
          col.setXYZ(v, gr[0]*shade, gr[1]*shade, gr[2]*shade);
        }
        pos.needsUpdate=true; col.needsUpdate=true; mesh.geometry.computeVertexNormals();
      }
    }

    // --- road ribbon: rebuild the strip in a window ahead of the rover when the rover advances ---
    function rebuildRoad(S){
      const cfg=S.cfg;
      const sNow=Math.floor(S.s/60);
      if(sNow===S.roadStamp) return;
      S.roadStamp=sNow;
      const s0=Math.max(0,S.s-180), s1=S.s+1000, step=10;
      const verts=[], idx=[]; let row=0;
      for(let s=s0;s<=s1;s+=step){
        const r=roadAt(cfg,S.road,s);
        const yC=groundH(cfg,S.road,r.x,r.z,S.s)+0.07;
        verts.push(r.x+r.nx*ROADHALF, yC, r.z+r.nz*ROADHALF);
        verts.push(r.x-r.nx*ROADHALF, yC, r.z-r.nz*ROADHALF);
        if(row>0){const b=(row-1)*2;idx.push(b,b+1,b+2, b+1,b+3,b+2);}
        row++;
      }
      S.roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
      S.roadGeo.setIndex(idx); S.roadGeo.computeVertexNormals();
      // edge reflectors alternating sides every ~80m
      const dm=new THREE.Matrix4(), rp=new THREE.Vector3(), rq=new THREE.Quaternion(), rs=new THREE.Vector3(1,1,1);
      let n=0; const start=Math.ceil(s0/80)*80;
      for(let s=start;s<=s1 && n<40;s+=80){
        const r=roadAt(cfg,S.road,s), side=((s/80)|0)%2?1:-1;
        const x=r.x+r.nx*(ROADHALF+1)*side, z=r.z+r.nz*(ROADHALF+1)*side;
        rp.set(x,groundH(cfg,S.road,x,z,S.s)+0.5,z); dm.compose(rp,rq,rs); S.refl.setMatrixAt(n++,dm);
      }
      for(;n<40;n++){rp.set(0,-9999,0);dm.compose(rp,rq,rs);S.refl.setMatrixAt(n,dm);}
      S.refl.instanceMatrix.needsUpdate=true;
    }

    // --- UFO stations: keep a small pool matching milestones near the rover ---
    function syncStations(S){
      const cfg=S.cfg, every=cfg.ufoEvery;
      const kLo=Math.max(0,Math.floor((S.s-every*0.4)/every)), kHi=Math.floor((S.s+every*1.2)/every);
      // drop stations outside window
      for(let i=S.stations.length-1;i>=0;i--){ const st=S.stations[i];
        if(st.idx<kLo||st.idx>kHi){ S.scene.remove(st.grp); S.stations.splice(i,1); } }
      // add missing
      for(let k=kLo;k<=kHi;k++){
        if(S.stations.some(st=>st.idx===k)) continue;
        const r=roadAt(cfg,S.road,k*every);
        const grp=UFO.g.clone(true); grp.scale.setScalar(1.15);
        const side=k%2?1:-1;
        const gx=r.x+r.nx*(ROADHALF+9)*side, gz=r.z+r.nz*(ROADHALF+9)*side;
        grp.position.set(gx, groundH(cfg,S.road,gx,gz,S.s)+13, gz);
        S.scene.add(grp);
        S.stations.push({idx:k, grp, x:gx, z:gz, sAt:k*every});
      }
    }

    function surfaceNormal(cfg,road,x,z,sHint){
      const e=2.0;
      const hx=groundH(cfg,road,x+e,z,sHint)-groundH(cfg,road,x-e,z,sHint);
      const hz=groundH(cfg,road,x,z+e,sHint)-groundH(cfg,road,x,z-e,sHint);
      return new THREE.Vector3(-hx,2*e,-hz).normalize();
    }

    /* =================== GENERALIZED SURFACE DRIVING (kinematic) =================== */
    const _up=new THREE.Vector3(0,1,0), _n=new THREE.Vector3(), _qa=new THREE.Quaternion(), _qy=new THREE.Quaternion(), _qt=new THREE.Quaternion();
    function driveSurface(dt){
      const S=SURF, cfg=S.cfg, p=S.pos;
      const throttle=(key.f?1:0)-(key.b?1:0);
      const steer=(key.l?1:0)-(key.r?1:0);
      const speed=Math.hypot(S.vel.x,S.vel.z);
      S.yaw += steer*cfg.steer*dt*(0.35+Math.min(1,speed*0.08));
      const fx=Math.sin(S.yaw), fz=Math.cos(S.yaw);
      const ACC=cfg.accel*(key.boost?cfg.boost:1);
      S.vel.x += fx*throttle*ACC*dt; S.vel.z += fz*throttle*ACC*dt;
      const vmax=cfg.vmax*(key.boost?cfg.boost:1), sp2=Math.hypot(S.vel.x,S.vel.z);
      if(sp2>vmax){S.vel.x*=vmax/sp2;S.vel.z*=vmax/sp2;}
      const gy=groundH(cfg,S.road,p.x,p.z,S.s)+1.1;
      const terrV=(gy-(S.prevGY||gy))/Math.max(dt,0.001); S.prevGY=gy;
      if(S.grounded){ const drag=throttle?0.995:0.985; S.vel.x*=drag; S.vel.z*=drag; }
      else { S.vel.x*=0.999; S.vel.z*=0.999; }
      p.x+=S.vel.x*dt; p.z+=S.vel.z*dt;
      // vertical: crest launch, floaty fall, dust on landing
      if(S.grounded){
        p.y=gy;
        if(terrV>6 && speed>8){ S.vy=terrV*0.5; S.grounded=false; }
      } else {
        S.vy -= cfg.g*dt; p.y += S.vy*dt;
        if(p.y<=gy){ const impact=-S.vy; p.y=gy; S.vy=0; S.grounded=true;
          if(impact>3){ S.emitDust(p.x,gy-1.1,p.z,22,Math.min(10,impact*0.8),0.8); S.land=Math.min(0.4,impact*0.03); } }
      }
      if(S.grounded && throttle && speed>4 && frameN%2===0){
        S.emitDust(p.x - fx*2, gy-0.9, p.z - fz*2, 2, 2.2, 0.25);
      }
      // odometer: project onto the road centreline (never let it jump backward wildly)
      const nr=nearestRoad(cfg,S.road,p.x,p.z,S.s);
      if(Math.abs(nr.s-S.s)<400) S.s=nr.s; else S.s=Math.max(0,S.s+ (S.vel.x*fx+S.vel.z*fz)*dt);
      if(S.s>S.maxS)S.maxS=S.s;

      // ORIENTATION (root-cause fix): align rover up to the surface normal, keep heading = yaw.
      _n.copy(surfaceNormal(cfg,S.road,p.x,p.z,S.s));
      _qy.setFromAxisAngle(_up,S.yaw);
      _qa.setFromUnitVectors(_up,_n);
      _qt.copy(_qa).multiply(_qy);
      S.rover.quaternion.slerp(_qt, 1-Math.pow(0.0008,dt));
      S.rover.position.copy(p).add(new THREE.Vector3(0,-1.1,0).applyQuaternion(S.rover.quaternion));
      const roll=speed*dt*1.6; S.wheels.forEach(w=>w.rotation.x+=roll);

      // dust integrate
      const arr=S.dgeo.attributes.position.array;
      for(let i=0;i<S.dlife.length;i++){
        if(S.dlife[i]>0){
          S.dlife[i]-=dt; S.dvel[i].y-=cfg.g*0.5*dt;
          arr[i*3]+=S.dvel[i].x*dt; arr[i*3+1]+=S.dvel[i].y*dt; arr[i*3+2]+=S.dvel[i].z*dt;
          const fgy=groundH(cfg,S.road,arr[i*3],arr[i*3+2],S.s); if(arr[i*3+1]<fgy){arr[i*3+1]=fgy;S.dvel[i].set(0,0,0);}
          if(S.dlife[i]<=0)arr[i*3+1]=-9999;
        }
      }
      S.dgeo.attributes.position.needsUpdate=true;

      // stream world + stations
      rebuildTerrain(S,false); rebuildRoad(S); syncStations(S);
      S.sunL.target.position.copy(p); S.sunL.position.copy(p).add(new THREE.Vector3(cfg.sunDir[0],cfg.sunDir[1],cfg.sunDir[2]).multiplyScalar(400));

      // camera chase
      const back=12, upH=5.5;
      const goal=new THREE.Vector3(p.x-fx*back, p.y+upH, p.z-fz*back);
      C.position.lerp(goal, 1-Math.pow(0.0015,dt));
      if(S.land>0){ C.position.y+=Math.sin(t*60)*S.land; S.land*=0.85; }
      C.lookAt(p.x+fx*6, p.y+1.5, p.z+fz*6);

      // station proximity -> prompt
      api.nearStation=false; let nd=1e9, nst=null;
      for(const st of S.stations){ const d=Math.hypot(p.x-st.x,p.z-st.z); if(d<nd){nd=d;nst=st;} }
      if(nst && nd<16){ api.nearStation=true; }
      if(travelEl){ travelEl.hidden=!api.nearStation; travelEl.textContent='ENTER UFO - E'; }

      // HUD odometer
      const km=(S.maxS/1000), nextUFO=(Math.floor(S.s/cfg.ufoEvery)+1)*cfg.ufoEvery, toNext=(nextUFO-S.s)/1000;
      odo.style.opacity='1';
      odo.textContent=cfg.name+' - '+km.toFixed(2)+' km - next UFO '+toNext.toFixed(2)+' km';
    }

    /* =================== ARRIVAL (descent + gravity ramp) =================== */
    // handled inside frame() 'arrive' state

    /* =================== STATE MACHINE =================== */
    function go(s,arg){ api.state=s; t=0;
      if(s==='space'){ buildSpace(); }
      if(s==='surface'){ odo.style.opacity='1'; }
      if(s==='earth'){ C.far=savedFar; C.near=savedNear; C.updateProjectionMatrix(); say(''); odo.style.opacity='0'; if(travelEl)travelEl.hidden=true; }
    }

    // begin arrival onto planet `key`: build it, lift rover above ground, ramp gravity in
    function beginArrival(key){
      buildSurface(key); api.planet=key; const S=SURF, cfg=S.cfg;
      const r0=roadAt(cfg,S.road,0);
      S.pos.set(r0.x, groundH(cfg,S.road,r0.x,r0.z,0)+34, r0.z);
      S.vel.set(0,0,0); S.vy=0; S.yaw=0; S.grounded=false; S.s=0; S.maxS=0; S.land=0;
      // start upright-ish; orientation will slerp to the true normal as it settles
      S.rover.quaternion.identity();
      C.far=20000; C.near=0.5; C.updateProjectionMatrix();
      go('arrive'); api._gRamp=0;
      say(cfg.caption);
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
      api.target=key; go('depart');
      try{blip(300,.5,.1);}catch(e){}
    }

    api.begin=function(){
      if(api.state!=='earth'||MODE!=='world')return;
      if(travelEl)travelEl.hidden=true;
      buildSpace();go('flight');api.warpX=0;api.warpY=0;api.planet='moon';
      C.far=20000; C.near=0.5; C.updateProjectionMatrix();
      api._camFrom=C.position.clone();
      UFO.hit=true;missSet('ufo',1);blip(300,.5,.1);setTimeout(()=>blip(900,.4,.08),220);
      try{toastMsg('The UFO lifts toward the anomaly');}catch(e){}
    };

    const fade=(function(){ const d=document.createElement('div');
      d.style.cssText='position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:45;transition:opacity .15s';
      sec.appendChild(d); return d; })();

    api.frame=function(dt,now){
      t+=dt;
      if(api.state==='flight'){
        const o=spaceObj,dur=4,k=Math.min(1,t/dur),steer=((key.r?1:0)-(key.l?1:0))*20;
        fade.style.opacity=Math.max(0,1-t/.8).toFixed(2);
        o.earth.position.set(0,25,320+k*500);o.earth.scale.setScalar(1-k*.5);o.earth.rotation.y+=dt*.04;
        o.bh.position.set(0,0,-620+k*470);o.bh.scale.setScalar(.42+k*1.8);o.disk.rotation.z+=dt*.12;o.photon.rotation.z-=dt*.08;
        o.craft.position.set(steer,5+Math.sin(t*1.6)*2,95-k*190);o.craft.rotation.z=-steer*.004;
        C.position.set(o.craft.position.x,18+o.craft.position.y,o.craft.position.z+38);C.lookAt(o.bh.position);
        say(k<.55?'The UFO is pulling clear of Earth':'Black hole ahead. Hold course.');
        if(t>dur){o.bh.visible=false;go('warp')}
        R.render(spaceScene,C);return;
      }
      if(api.state==='warp'){
        const o=spaceObj,dur=12,k=Math.min(1,t/dur),camZ=120-k*3600;
        api.warpX=Math.max(-54,Math.min(54,api.warpX+((key.r?1:0)-(key.l?1:0))*dt*30));
        api.warpY=Math.max(-34,Math.min(34,api.warpY+((key.f?1:0)-(key.b?1:0))*dt*18));
        const pathX=Math.sin(t*.12)*18,pathY=Math.cos(t*.09)*10,x=pathX+api.warpX,y=pathY+api.warpY;
        o.craft.position.set(x,y,camZ-24);o.craft.rotation.z=Math.max(-.18,Math.min(.18,-api.warpX*.004));
        o.warpRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.12:-.09);ring.material.opacity=.3+.18*Math.sin(t*3+i)});
        o.streak.material.size=4+Math.sin(k*Math.PI)*54;
        C.position.set(x,y+8,camZ);C.lookAt(pathX+Math.sin(t*.3)*28,pathY,camZ-90);
        say(k<.08?'Inside the event horizon - steer through the gravity tunnel':k<.86?'Warp corridor - A/D steer - W/S climb and dive':'Moon signal ahead.');
        if(t>dur){o.streak.material.size=3;go('approach')}
        R.render(spaceScene,C);return;
      }
      if(api.state==='approach'){
        const o=spaceObj,dur=4,k=Math.min(1,t/dur),camZ=-3480;
        o.moonP.position.set(0,0,-4300+k*700);o.moonP.scale.setScalar(.6+k*1.4);o.moonP.rotation.y+=dt*.025;
        o.earth.position.set(0,20,900);o.earth.scale.setScalar(.35);
        o.craft.position.set(0,0,camZ-22);C.position.set(0,8,camZ);C.lookAt(o.moonP.position);
        fade.style.opacity=(k>.88?(k-.88)/.12:0).toFixed(2);
        say(k<.55?'The Moon is growing ahead':'Descending to the surface.');
        if(t>dur){ beginArrival('moon'); fade.style.opacity='1'; }
        R.render(spaceScene,C);return;
      }
      if(api.state==='depart'){
        // short interplanetary cruise through the starfield, then descend to api.target
        if(!spaceScene)buildSpace(); const o=spaceObj,dur=5,k=Math.min(1,t/dur);
        fade.style.opacity=Math.max(0,1-t/.6).toFixed(2);
        o.streak.material.size=3+Math.sin(k*Math.PI)*48;
        o.warpRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.12:-.09);ring.position.z=((o.warpRings[i].position.z+dt*900+5000)%5000)-4000;});
        o.craft.position.set(Math.sin(t*1.1)*6,Math.cos(t*0.8)*4,80-k*160);o.craft.rotation.z=Math.sin(t)*0.05;
        C.position.set(o.craft.position.x,o.craft.position.y+8,o.craft.position.z+40);C.lookAt(0,0,-400);
        const tgt=api.target, tn=tgt==='earth'?'Earth':PLANETS[tgt]?PLANETS[tgt].name:'destination';
        say(k<.5?'Leaving '+(PLANETS[api.planet]?PLANETS[api.planet].name:'surface'):'Approaching '+tn);
        fade.style.opacity=(k>.86?(k-.86)/.14:Math.max(0,1-t/.6)).toFixed(2);
        if(t>dur){
          o.streak.material.size=3;
          if(tgt==='earth'){ try{resetCar();}catch(e){} go('earth'); fade.style.opacity='0'; try{toastMsg('Home. Back on Earth.');}catch(e){} }
          else { beginArrival(tgt); fade.style.opacity='1'; }
        }
        R.render(spaceScene,C);return;
      }
      if(api.state==='arrive'){
        const S=SURF,cfg=S.cfg,dur=1.8,k=Math.min(1,t/dur);
        fade.style.opacity=Math.max(0,1-t/0.6).toFixed(2);
        // gravity ramps 0 -> full as the rover descends and settles onto the normal
        api._gRamp=k;
        const gy=groundH(cfg,S.road,S.pos.x,S.pos.z,S.s)+1.1;
        S.vy -= cfg.g*api._gRamp*dt; S.pos.y += S.vy*dt;
        if(S.pos.y<=gy){ S.pos.y=gy; S.vy=0; S.grounded=true; if(k<1){ S.emitDust(S.pos.x,gy-1.1,S.pos.z,26,6,0.8); } }
        _n.copy(surfaceNormal(cfg,S.road,S.pos.x,S.pos.z,S.s));
        _qy.setFromAxisAngle(_up,S.yaw); _qa.setFromUnitVectors(_up,_n); _qt.copy(_qa).multiply(_qy);
        S.rover.quaternion.slerp(_qt,1-Math.pow(0.0005,dt));
        S.rover.position.copy(S.pos).add(new THREE.Vector3(0,-1.1,0).applyQuaternion(S.rover.quaternion));
        const fx=Math.sin(S.yaw),fz=Math.cos(S.yaw);
        C.position.lerp(new THREE.Vector3(S.pos.x-fx*12,S.pos.y+5.5,S.pos.z-fz*12),1-Math.pow(0.02,dt));
        C.lookAt(S.pos.x+fx*6,S.pos.y+1.5,S.pos.z+fz*6);
        // dust integrate during landing
        const arr=S.dgeo.attributes.position.array;
        for(let i=0;i<S.dlife.length;i++){ if(S.dlife[i]>0){ S.dlife[i]-=dt; S.dvel[i].y-=cfg.g*0.5*dt;
          arr[i*3]+=S.dvel[i].x*dt;arr[i*3+1]+=S.dvel[i].y*dt;arr[i*3+2]+=S.dvel[i].z*dt; if(S.dlife[i]<=0)arr[i*3+1]=-9999; } }
        S.dgeo.attributes.position.needsUpdate=true;
        say(cfg.caption);
        if(t>dur && S.grounded){ go('surface'); }
        R.render(S.scene,C); return;
      }
      if(api.state==='surface'){
        driveSurface(dt);
        R.render(SURF.scene,C);
        return;
      }
      if(api.state==='select'){
        // paused: hold the rover still, keep rendering the live surface behind the menu
        if(SURF){ S_idle(SURF,dt); R.render(SURF.scene,C); }
        return;
      }
      if(api.state==='returning'){
        if(!spaceScene)buildSpace(); const o=spaceObj, dur=6, k=Math.min(1,t/dur);
        o.moonP.position.set(0,30,250+k*600); o.moonP.scale.setScalar(1.6-k*1.2);
        o.earth.position.set(0,0,-1500+k*1250); o.earth.scale.setScalar(0.3+k*1.5);
        o.earth.rotation.y+=dt*0.05;
        o.streak.material.size=3+Math.sin(k*Math.PI)*36;
        C.position.set(0,20,120); C.lookAt(o.earth.position);
        say(k<0.5?'Falling home':'');
        fade.style.opacity=(k>0.85?((k-0.85)/0.15):0).toFixed(2);
        if(t>dur){ try{resetCar();}catch(e){} go('earth'); fade.style.opacity='0'; try{toastMsg('Home. Back on Earth.');}catch(e){} }
        R.render(spaceScene,C);
        return;
      }
    };
    // keep the surface gently alive while the menu is open (dust settles, reflectors spin)
    function S_idle(S,dt){
      const arr=S.dgeo.attributes.position.array;
      for(let i=0;i<S.dlife.length;i++){ if(S.dlife[i]>0){ S.dlife[i]-=dt; S.dvel[i].y-=S.cfg.g*0.5*dt;
        arr[i*3]+=S.dvel[i].x*dt;arr[i*3+1]+=S.dvel[i].y*dt;arr[i*3+2]+=S.dvel[i].z*dt; if(S.dlife[i]<=0)arr[i*3+1]=-9999; } }
      S.dgeo.attributes.position.needsUpdate=true;
    }
    return api;
  })();

  function loop(now){requestAnimationFrame(loop);
    const r=sec.getBoundingClientRect();
    if(active!==wasActive){
      wasActive=active;
      if(active){poster.style.display='none'}
      else{posterState=0;posterWarm=0}   // take a fresh still: the weather may have moved on
    }
    if(!active){
      if(r.bottom<0||r.top>innerHeight||document.hidden){last=now;return}
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
    const dt=Math.min(.1,(now-last)/1000);last=now;frameN++;
    if(SPACE.state!=='earth'){ SPACE.frame(dt,now); return; }   // space/moon takes over the frame; Earth paused
    watchFps(dt);
    const sp=chassisB.velocity.length();
    if(active&&driving){
      const f=key.f?1:0,b=key.b?1:0,l=key.l?1:0,rr=key.r?1:0;
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
      const svc=Math.max(coast,gradeBrake,govBrake,braking?16:0);
      for(let i=0;i<4;i++){const fr=i<2;veh.setBrake(Math.max(svc*(fr?1.25:.75),key.h?(fr?0:52):0),i)}
      // hard ceiling: if it is still climbing past the cap, damp the velocity directly
      if(sp>vmax*1.18&&!inPond){const s=vmax*1.18/sp;chassisB.velocity.x*=s;chassisB.velocity.z*=s}
      // steeper ground => more angular damping, which is what kills the hillside wobble
      chassisB.angularDamping=.4+grade*.34;
      /* Steering input: buttons are binary, tilt is analog. Whichever the
         rider is actually using wins, so you can tap an arrow mid-corner
         without turning tilt off. */
      let steerIn=l-rr;
      if(tiltOn&&steerIn===0)steerIn=tiltSteer;
      const st=steerIn*V.steer*Math.max(.35,1-sp/46);steerActual+=(st-steerActual)*Math.min(1,dt*8);veh.setSteeringValue(steerActual,0);veh.setSteeringValue(steerActual,1);
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
      if(chassisB.position.y<(MODE==='circuit'?CIRC_Y-15:-9)||!isFinite(chassisB.position.y)||!isFinite(chassisB.velocity.x)){resetCar();toastMsg('Pulled you back onto the road')}
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
        let best=1e9,bi=0;const {CSAMP,CN}=circuit;
        for(let i=0;i<CN;i++){const dx=CSAMP[i].x-chassisB.position.x,dz=CSAMP[i].z-chassisB.position.z,d=dx*dx+dz*dz;if(d<best){best=d;bi=i}}
        const u=bi/CN;
        if(circU0<0){circU0=u;circLapT0=now}
        else{if(circU0>.82&&u<.18){circLap++;const t=now-circLapT0;circLapT0=now;
            if(!circBest||t<circBest)circBest=t;
            earnCoins(10);
            toastMsg('Lap '+circLap+' · '+fmtT(t)+' · +10 coins')}
          circU0=u}
        if(frameN%20===0)hint.textContent='Circuit · lap '+(circLap+1)+(circBest?' · best '+fmtT(circBest):'')+' · Track button to leave'}
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
        if(frameN%4===0&&!lapArmed){lapT.textContent=fmtT(now-lapStart);lapN.textContent='Lap '+lapNo;
          for(let i=0;i<lapSecs.length;i++)lapSecs[i].classList.toggle('on',lapProg>(i+1)*.25-.25)}}
      if(AC&&SND){const S=SND,T=AC.currentTime,vv=chassisB.velocity,spq=isFinite(sp)?sp:0,
          vf=vv.x*fwdScratch.x+vv.y*fwdScratch.y+vv.z*fwdScratch.z,r=Math.min(1.35,Math.abs(vf)/V.max),rev=vf<-.5,
          regen=b&&vf>1.5,load=f?1:regen?.55:(rev&&b)?.8:.1;let air=true;for(let i=0;i<4;i++)if(veh.wheelInfos[i].isInContact)air=false;
        S.bus.gain.setTargetAtTime(muted?0:.9,T,.03);
        S.tone.frequency.setTargetAtTime(sub>.05?420:18000,T,.12);
        /* motor: one smooth whine, no gear shifts. Pitch follows wheel speed (spins up a
           little in the air), level follows load, so lifting off goes quiet like a real EV */
        S.ld+=(load-S.ld)*Math.min(1,dt*6);
        const hz=(rev?100:120)+r*(rev?380:760)+(air&&f?110:0)+(boost?55:0);
        S.m1.frequency.setTargetAtTime(hz,T,.06);S.m2.frequency.setTargetAtTime(hz*.5,T,.06);S.m3.frequency.setTargetAtTime(hz*3.02,T,.06);
        S.g3.gain.setTargetAtTime(.03+(boost?.09:0)+S.ld*.03,T,.1);
        S.mF.frequency.setTargetAtTime(650+S.ld*1400+r*900,T,.08);
        S.mG.gain.setTargetAtTime((.008+S.ld*.07)*(.3+.7*Math.min(1,r*1.6+(f?.25:0))),T,.07);
        // tyres on the surface: tarmac roar on the road, gravel hiss off it
        const ground=air?0:Math.min(1,spq/V.max),off=offD>7+RWX?1:0;
        S.rF.frequency.setTargetAtTime(200+ground*1000,T,.1);
        S.rG.gain.setTargetAtTime(ground*(off?.05:.09),T,.1);
        S.gG.gain.setTargetAtTime(ground*off*.075,T,.1);
        // wind builds with the square of speed
        const wv=Math.max(0,spq/V.max-.2);S.wG.gain.setTargetAtTime(Math.min(.075,wv*wv*.13),T,.15);S.wF.frequency.setTargetAtTime(480+spq*20,T,.2);
        // squeal, only on tarmac and only past a small slip, so normal cornering stays quiet
        let sk=0;for(let i=0;i<4;i++){const w=veh.wheelInfos[i];if(w.isInContact)sk=Math.max(sk,1-(w.skidInfo==null?1:w.skidInfo))}if(key.h&&spq>5)sk=Math.max(sk,.75);
        sk=(spq<4||sub>.05||off)?0:Math.max(0,sk-.15)/.85;
        S.sG.gain.setTargetAtTime(Math.min(.05,sk*.07),T,.05);
        S.s1.frequency.setTargetAtTime(960+Math.random()*150+spq*4,T,.03);S.s2.frequency.setTargetAtTime(2100+Math.random()*240,T,.03)}
      honk(!!key.horn);
    }else{if(AC&&SND){const T=AC.currentTime;[SND.mG,SND.rG,SND.gG,SND.wG,SND.sG].forEach(g=>g.gain.setTargetAtTime(0,T,.06))}honk(false)}
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
      const k=grounded>=3?1:0,rollT=Math.max(-.075,Math.min(.075,chassisB.angularVelocity.y*vf*.0042))*k,pitchT=Math.max(-.05,Math.min(.05,-leanA*.006))*k;
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
    wl.forEach((k,i)=>{const c=wi[i].chassisConnectionPointLocal;k.w.position.set(c.x*.9,.05-wi[i].suspensionLength,c.z);k.w.rotation.set(0,i<2?wi[i].steering:0,0);k.spin.rotation.x=wi[i].rotation});
    if(active&&MP.on)MP.tick(now,dt);
    if(frameN%10===0){const ni=Math.max(0,Math.min(1.8,(.85-sun.intensity)*3.2));if(carHL)carHL.intensity=ni;headM.emissiveIntensity=1+ni*.5;npcHeadM.emissiveIntensity=.9+ni*.6;if(beams){const o=Math.min(.5,ni*.3);beams.m.opacity=o;beams.list.forEach(b=>b.visible=o>.02)};CLOUDM.opacity=.2+.6*Math.min(1,sun.intensity)}
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
    if(active&&driving&&MODE==='world')updTraffic(dt,now);
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
    if(active){const tg=at(progU).tg;fwd.set(0,0,1).applyQuaternion(car.quaternion);wrongEl.classList.toggle('on',sp>4&&(fwd.x*tg.x+fwd.z*tg.z)<-.5&&offD<9&&!inPond)}
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
      const CM=CAMS[camMode],pf=W<H?1.5:1;
      if(CM.fp){/* bonnet and bumper cams ride on the car itself */
        camT.set(0,CM.y,CM.z).applyQuaternion(car.quaternion).add(car.position);C.position.copy(camT);
        lookT.set(0,CM.y-.25,CM.z+18).applyQuaternion(car.quaternion).add(car.position)}
      else{const dist=(CM.d+Math.min(5,sp*.2)*CM.k+ce*1.9)*pf,hgt=(CM.h+Math.min(2,sp*.07)*CM.k+ce*.7)*pf;
        camT.copy(car.position).addScaledVector(fwd,-dist).add(tmp.set(0,hgt,0));
        C.position.lerp(camT,1-Math.exp(-dt*(active?CM.lag:3.2)));
        lookT.copy(car.position).addScaledVector(fwd,CM.ahead).add(tmp.set(0,CM.ly,0))}
      if(shake>.01){lookT.x+=(Math.random()-.5)*shake*.3;lookT.y+=(Math.random()-.5)*shake*.3;shake*=Math.pow(.08,dt)}
      if(CAMS[camMode].fp)look.copy(lookT);else look.lerp(lookT,1-Math.exp(-dt*9));
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
     S.fog.far+=(fogFar0*z.fog-S.fog.far)*e;S.fog.near+=(fogNear0*Math.min(1,z.fog)-S.fog.near)*e;
     const lt=(z.tint[0]+z.tint[1]+z.tint[2])/3;
     if(wxB.id==='storm'){ltT-=dt;if(ltT<=0){ltT=2.5+Math.random()*7;flashV=1;thunderAt=now+300+Math.random()*1800}}
     if(flashV>0){flashV=Math.max(0,flashV-dt*(flashV>.6?3:2.2));if(flashV<.35&&Math.random()<.35)flashV=Math.min(1,flashV+.5*Math.random())}
     if(thunderAt&&now>=thunderAt){thunderAt=0;thud(.9)}
     hemi.intensity+=((hemi0*lt+flashV*1.5)-hemi.intensity)*(flashV>.02?.7:e);sun.intensity+=(sunI0*Math.min(1.25,lt)-sun.intensity)*e}
    if(R.shadowMap.enabled){const se=ULTRA.shEvery;if(se&&frameN%se===0)sun.shadow.needsUpdate=true}
    /* reflections are captured whole, only when the light changes or you have driven somewhere new:
       no per-frame cost, and no half-updated cube that flickers as you move */
    if(cubeCam&&active&&(!cubeInit||(frameN%90===0&&(Math.abs(sun.intensity-cubeSun)>.12||Math.hypot(car.position.x-cubeX,car.position.z-cubeZ)>140)))){
      cubeCam.position.set(car.position.x,car.position.y+1.6,car.position.z);cubeCam.updateMatrixWorld();hideCars(false);cubeCam.update(R,S);hideCars(true);
      cubeInit=true;cubeSun=sun.intensity;cubeX=car.position.x;cubeZ=car.position.z}
    if(active){ANOMALY.update(dt,now);SPACE.updateEarth()}
    R.render(S,C);if(active&&frameN%6===0)drawMap(mx2,mm.width,false);
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
  const CIRC_X=0,CIRC_Z=-(WS+500),CIRC_Y=40,CIRC_LEN=420,CIRC_W=10;
  let circuit=null,worldSave=null,circU0=-1,circLap=0,circLapT0=0,circBest=null,worldFogSave=null,worldGSave=null,worldWeatherSave=null;
  function circAt(u,curve){u=((u%1)+1)%1;const p=curve.getPointAt(u).clone();const tg=curve.getTangentAt(u);return {p,tg,n:new THREE.Vector3(-tg.z,0,tg.x)}}
  function circStrip(curve,Nseg,w,yo,mat,rep){const pos=[],idx=[],uv=[];
    for(let i=0;i<=Nseg;i++){const {p,n}=circAt(i/Nseg,curve),nx=n.x*w/2,nz=n.z*w/2;
      pos.push(p.x-nx,p.y+yo,p.z-nz,p.x+nx,p.y+yo,p.z+nz);uv.push(0,i/Nseg*rep,1,i/Nseg*rep);
      if(i<Nseg){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    return new THREE.Mesh(g,mat)}
  function clearCircuit(){if(!circuit)return;S.remove(circuit.root);
    // roadStrip/edgeStrip use the world's SHARED roadM/edgeM - only dispose materials this
    // circuit actually created its own copies of (tracked in ownedMats), never blanket-dispose
    // whatever a traverse happens to find, or the next redraw would break the main map's road
    circuit.root.traverse(o=>{if(o.geometry)o.geometry.dispose()});
    (circuit.ownedMats||[]).forEach(m=>m.dispose());
    if(circuit.groundBody)world.removeBody(circuit.groundBody);
    circuit=null}
  // default theme: the original green look for freehand-drawn tracks. Preset maps (see THEMES
  // below) override this per call; nothing about the freehand-draw flow changes.
  const THEME_DEFAULT={id:'meadow',name:'Meadow',ground:0x2c3a26,field:0x2f4a28,trunk:0x3a2c20,leaf:0x33402c,
    tree:'pine',stand:0x3a3934,standTrim:0xb8322f,fog:0x0e0e0d,sky:0x0e0e0d};
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
    theme=theme||THEME_DEFAULT;
    seed=Math.max(1,Math.floor(+seed)||271828);let rngState=seed>>>0;
    const seeded=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296};
    const pts3=pts2D.map(q=>new THREE.Vector3(CIRC_X+q.x,CIRC_Y,CIRC_Z+q.y));
    const curve=new THREE.CatmullRomCurve3(pts3,true,'catmullrom',.5);
    const CN=Math.max(60,Math.min(240,Math.round(curve.getLength()/3)));
    const CSAMP=[];for(let i=0;i<CN;i++)CSAMP.push(curve.getPointAt(i/CN));
    const root=new THREE.Group();S.add(root);
    const rep=curve.getLength()/12;
    const edgeStrip=circStrip(curve,CN,CIRC_W+1.8,.04,edgeM,rep);edgeStrip.receiveShadow=true;root.add(edgeStrip);
    const roadStrip=circStrip(curve,CN,CIRC_W,.09,roadM,rep);roadStrip.receiveShadow=true;root.add(roadStrip);
    // one flat plate under the whole loop - the simplest correct collision, matching how the
    // main map already treats off-road as a logical grip penalty rather than a physical wall
    let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;pts3.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z)});
    const hx=(maxX-minX)/2+20,hz=(maxZ-minZ)/2+20,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    const groundMat=M(theme.ground,{roughness:.95});
    const groundMesh=new THREE.Mesh(new THREE.BoxGeometry(hx*2,1,hz*2),groundMat);groundMesh.position.set(cx,CIRC_Y-.5,cz);groundMesh.receiveShadow=true;root.add(groundMesh);
    const groundBody=new CANNON.Body({mass:0,material:gM});groundBody.addShape(new CANNON.Box(new CANNON.Vec3(hx,.5,hz)));groundBody.position.set(cx,CIRC_Y-.5,cz);world.addBody(groundBody);
    // scenery so the track doesn't sit in an empty void: a themed field, then a stadium ring
    // (barrier wall, grandstands, floodlights) with trees/rocks filling the gaps between stands.
    // Dedicated materials per build, not the world's shared groundM/leafM/trunkM, so weather
    // picked on the main map can't bleed into circuit colors, and each theme stays distinct.
    const ownedMats=[groundMat];
    const runoff=circStrip(curve,CN,CIRC_W+4,.025,groundMat,rep);runoff.receiveShadow=true;root.add(runoff);
    const curbRed=M(theme.standTrim,{roughness:.75}),curbWhite=M(0xdad8d0,{roughness:.8});ownedMats.push(curbRed,curbWhite);
    const curbGeo=new THREE.BoxGeometry(1.7,.18,Math.max(1.8,Math.min(4,curve.getLength()/CN)));
    const curbRedIM=new THREE.InstancedMesh(curbGeo,curbRed,CN*2),curbWhiteIM=new THREE.InstancedMesh(curbGeo,curbWhite,CN*2);
    curbRedIM.receiveShadow=true;curbWhiteIM.receiveShadow=true;root.add(curbRedIM,curbWhiteIM);
    {let redN=0,whiteN=0;const up=new THREE.Vector3(0,1,0),p0=new THREE.Vector3(),q0=new THREE.Quaternion(),s0=new THREE.Vector3(1,1,1),mx0=new THREE.Matrix4();
      for(let i=0;i<CN;i++){const {p,tg,n}=circAt(i/CN,curve),yaw=Math.atan2(tg.x,tg.z);
        for(const side of [-1,1]){p0.set(p.x+n.x*side*(CIRC_W/2+.75),CIRC_Y+.16,p.z+n.z*side*(CIRC_W/2+.75));q0.setFromAxisAngle(up,yaw);mx0.compose(p0,q0,s0);
          if((i+side+CN)%2===0)curbRedIM.setMatrixAt(redN++,mx0);else curbWhiteIM.setMatrixAt(whiteN++,mx0)}}
      curbRedIM.count=redN;curbWhiteIM.count=whiteN;curbRedIM.instanceMatrix.needsUpdate=true;curbWhiteIM.instanceMatrix.needsUpdate=true}
    const fieldMat=M(theme.field,{roughness:.98});ownedMats.push(fieldMat);
    const field=new THREE.Mesh(new THREE.PlaneGeometry((hx+160)*2,(hz+160)*2).rotateX(-Math.PI/2),fieldMat);
    field.position.set(cx,CIRC_Y-.49,cz);field.receiveShadow=true;root.add(field);
    const r0=Math.hypot(hx,hz)+15;
    // perimeter barrier wall: one continuous strip just outside the paved plate, all the way round
    {const wallMat=M(0xd9d4c6,{roughness:.7});ownedMats.push(wallMat);
     const wallCurve=new THREE.CatmullRomCurve3(pts3.map(p=>{
         const d=new THREE.Vector3(p.x-cx,0,p.z-cz).normalize();
         return new THREE.Vector3(cx+d.x*(r0-4),CIRC_Y,cz+d.z*(r0-4))}),true,'catmullrom',.5);
     const wall=circStrip(wallCurve,CN,1.1,1.1,wallMat,1);wall.castShadow=true;wall.receiveShadow=true;root.add(wall)}
    // Keep the grandstands close enough to read from the track, placed from its actual tangent.
    {const standN=Math.max(8,Math.min(16,Math.round(curve.getLength()/38)));
     const standMat=M(theme.stand,{roughness:.85}),trimMat=M(theme.standTrim,{roughness:.6});ownedMats.push(standMat,trimMat);
    const standIM=new THREE.InstancedMesh(new THREE.BoxGeometry(25,.8,8),standMat,standN);standIM.castShadow=true;standIM.receiveShadow=true;root.add(standIM);
    const trimIM=new THREE.InstancedMesh(new THREE.BoxGeometry(25,.45,8.4),trimMat,standN);trimIM.castShadow=true;root.add(trimIM);
    const seatIM=new THREE.InstancedMesh(new THREE.BoxGeometry(23,.82,1.75),trimMat,standN*5);seatIM.castShadow=true;seatIM.receiveShadow=true;root.add(seatIM);
    const roofIM=new THREE.InstancedMesh(new THREE.BoxGeometry(28,.48,10),standMat,standN);roofIM.castShadow=true;root.add(roofIM);
    const frameIM=new THREE.InstancedMesh(new THREE.BoxGeometry(.42,6.5,.42),standMat,standN*4);frameIM.castShadow=true;root.add(frameIM);
     const sM=new THREE.Matrix4(),sP=new THREE.Vector3(),sQ=new THREE.Quaternion(),sS=new THREE.Vector3(1,1,1),upAxis0=new THREE.Vector3(0,1,0);
    for(let i=0;i<standN;i++){const {p,tg,n}=circAt((i+.5)/standN,curve),side=i%2?1:-1,offset=CIRC_W/2+13+seeded()*5;
       const x=p.x+n.x*side*offset,z=p.z+n.z*side*offset;
       sQ.setFromAxisAngle(upAxis0,Math.atan2(cx-x,cz-z));
       sP.set(x,CIRC_Y-.5+.4,z);sM.compose(sP,sQ,sS);standIM.setMatrixAt(i,sM);
       sP.set(x,CIRC_Y-.5+4.4,z);sM.compose(sP,sQ,sS);trimIM.setMatrixAt(i,sM);
       sP.set(x,CIRC_Y-.5+7.7,z-1.5);sM.compose(sP,sQ,sS);roofIM.setMatrixAt(i,sM);
       for(let row=0;row<5;row++){const seatOffset=new THREE.Vector3(0,1.15+row*1.08,3.8-row*1.65).applyQuaternion(sQ);sP.set(x+seatOffset.x,CIRC_Y-.5+seatOffset.y,z+seatOffset.z);sM.compose(sP,sQ,sS);seatIM.setMatrixAt(i*5+row,sM)}
       for(let post=0;post<4;post++){const localX=post%2?11:-11,localZ=post<2?3.4:-4.4,frameOffset=new THREE.Vector3(localX,3.2,localZ).applyQuaternion(sQ);sP.set(x+frameOffset.x,CIRC_Y-.5+frameOffset.y,z+frameOffset.z);sM.compose(sP,sQ,sS);frameIM.setMatrixAt(i*4+post,sM)}}
     standIM.instanceMatrix.needsUpdate=true;trimIM.instanceMatrix.needsUpdate=true;seatIM.instanceMatrix.needsUpdate=true;roofIM.instanceMatrix.needsUpdate=true;frameIM.instanceMatrix.needsUpdate=true}
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
    // trees or rocks (per theme) fill the gaps between grandstands, same radius band as before
    if(theme.tree!=='none'){
      const trunkMat=M(theme.trunk,{roughness:.9}),leafMat=M(theme.leaf,{roughness:.95});ownedMats.push(trunkMat,leafMat);
      const treeN=Math.max(30,Math.min(110,Math.round(curve.getLength()/5)));
      const isRock=theme.tree==='rock';
      const trunkGeo=isRock?new THREE.DodecahedronGeometry(1,0):new THREE.CylinderGeometry(.18,.24,2.2,6);
      const leafGeo=theme.tree==='palm'?new THREE.ConeGeometry(1.1,2.2,6):new THREE.ConeGeometry(1.3,3.4,7);
      const trunkIM=new THREE.InstancedMesh(trunkGeo,trunkMat,treeN);trunkIM.castShadow=true;root.add(trunkIM);
      const leafIM=isRock?null:new THREE.InstancedMesh(leafGeo,leafMat,treeN);if(leafIM){leafIM.castShadow=true;root.add(leafIM)}
      const tM=new THREE.Matrix4(),tP=new THREE.Vector3(),tQ=new THREE.Quaternion(),tS=new THREE.Vector3(1,1,1),upAxis=new THREE.Vector3(0,1,0);
      const r1=r0+130;
      for(let i=0;i<treeN;i++){
        const a=seeded()*Math.PI*2,rr=r0+40+seeded()*(r1-r0-40);
        const x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr;
        tQ.setFromAxisAngle(upAxis,seeded()*Math.PI*2);
        tP.set(x,CIRC_Y-.5+(isRock?.6:1.1),z);tM.compose(tP,tQ,tS.setScalar(isRock?.7+seeded()*.8:.82+seeded()*.45));trunkIM.setMatrixAt(i,tM);
        if(leafIM){tP.set(x,CIRC_Y-.5+2.6,z);tM.compose(tP,tQ,tS.set(1,1,1));leafIM.setMatrixAt(i,tM)}}
      trunkIM.instanceMatrix.needsUpdate=true;if(leafIM)leafIM.instanceMatrix.needsUpdate=true}
    {
      const ridgeN=LOW?8:14,ridgeMat=M(theme.ground,{roughness:1,flatShading:true}),ridgeGeo=new THREE.DodecahedronGeometry(1,1),ridgeIM=new THREE.InstancedMesh(ridgeGeo,ridgeMat,ridgeN);
      ownedMats.push(ridgeMat);ridgeIM.receiveShadow=true;ridgeIM.castShadow=!LOW;
      const ridgeP=new THREE.Vector3(),ridgeQ=new THREE.Quaternion(),ridgeS=new THREE.Vector3(),ridgeM=new THREE.Matrix4(),ridgeUp=new THREE.Vector3(0,1,0);
      for(let i=0;i<ridgeN;i++){
        const a=(i/ridgeN)*Math.PI*2+(seeded()-.5)*.24,r=r0+100+seeded()*45,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
        const w=34+seeded()*42,h=11+seeded()*29,d=24+seeded()*38;
        ridgeP.set(x,CIRC_Y-1+h*.42,z);ridgeQ.setFromAxisAngle(ridgeUp,seeded()*Math.PI);
        ridgeS.set(w,h,d);ridgeM.compose(ridgeP,ridgeQ,ridgeS);ridgeIM.setMatrixAt(i,ridgeM);
        if(ridgeIM.setColorAt){const shade=.72+seeded()*.34;ridgeIM.setColorAt(i,new THREE.Color().setRGB(shade,shade,shade))}
      }
      ridgeIM.instanceMatrix.needsUpdate=true;if(ridgeIM.instanceColor)ridgeIM.instanceColor.needsUpdate=true;root.add(ridgeIM);
    }
    const startP=circAt(0,curve);
    const flagMat=new THREE.MeshBasicMaterial({color:0xf2eee6,transparent:true,opacity:.85,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});ownedMats.push(flagMat);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(CIRC_W,1.6).rotateX(-Math.PI/2),flagMat);
    flag.position.set(startP.p.x,CIRC_Y+.12,startP.p.z);flag.rotation.y=Math.atan2(startP.tg.x,startP.tg.z);root.add(flag);
    {
      const yaw=Math.atan2(startP.tg.x,startP.tg.z),pitRoot=new THREE.Group(),pitMat=M(theme.stand,{roughness:.82}),roofMat=M(theme.standTrim,{roughness:.68}),glassMat=M(0x9db9c1,{roughness:.32,metalness:.22}),lampMat=new THREE.MeshBasicMaterial({color:0xfff1c8});
      ownedMats.push(pitMat,roofMat,glassMat,lampMat);pitRoot.position.set(startP.p.x,startP.p.y,startP.p.z);pitRoot.rotation.y=yaw;
      const pitSide=CIRC_W/2+13,pit=new THREE.Mesh(new THREE.BoxGeometry(14,4.8,25),pitMat);pit.position.set(pitSide,2.4,-12);pit.castShadow=true;pit.receiveShadow=true;pitRoot.add(pit);
      const roof=new THREE.Mesh(new THREE.BoxGeometry(15,.55,26),roofMat);roof.position.set(pitSide,5.05,-12);roof.castShadow=true;pitRoot.add(roof);
      const doors=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,2.4,3.2),glassMat,5),doorMatrix=new THREE.Matrix4();
      for(let i=0;i<5;i++){doorMatrix.makeTranslation(pitSide-7.1,1.65,-22+i*5);doors.setMatrixAt(i,doorMatrix)}doors.instanceMatrix.needsUpdate=true;pitRoot.add(doors);
      const tower=new THREE.Mesh(new THREE.BoxGeometry(5.5,10,7),pitMat);tower.position.set(pitSide+9.5,5,-8);tower.castShadow=true;pitRoot.add(tower);
      const towerGlass=new THREE.Mesh(new THREE.BoxGeometry(5.7,1.8,7.2),glassMat);towerGlass.position.set(pitSide+9.5,8.5,-8);pitRoot.add(towerGlass);
      const gantry=new THREE.Group();gantry.position.z=18;[-1,1].forEach(side=>{const post=new THREE.Mesh(new THREE.BoxGeometry(.28,6,.28),pitMat);post.position.set(side*(CIRC_W/2+4),3,0);gantry.add(post)});
      const bar=new THREE.Mesh(new THREE.BoxGeometry(CIRC_W+8,.42,.5),pitMat);bar.position.y=6;gantry.add(bar);
      const startLights=new THREE.InstancedMesh(new THREE.SphereGeometry(.26,8,6),lampMat,5),lightMatrix=new THREE.Matrix4();
      for(let i=0;i<5;i++){lightMatrix.makeTranslation((i-2)*1.7,6.55,0);startLights.setMatrixAt(i,lightMatrix)}startLights.instanceMatrix.needsUpdate=true;gantry.add(startLights);
      pitRoot.add(gantry);root.add(pitRoot);
    }
    circuit={curve,CN,CSAMP,root,groundBody,startP,ownedMats,theme,seed,venue:venue||{weather:'day',time:'day'}};
    return circuit}
  function enterCircuit(){if(!circuit)return;
    worldSave={p:chassisB.position.clone(),q:chassisB.quaternion.clone()};
    MODE='circuit';circU0=-1;circLap=0;circBest=null;circLapT0=performance.now();
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
    toastMsg('Venue · '+th.name+' · seed '+circuit.seed);updCircBtn()}
  function leaveCircuit(){if(MODE!=='circuit')return;
    MODE='world';
    if(worldSave){PREV.ok=false;physAcc=0;chassisB.position.copy(worldSave.p);chassisB.quaternion.copy(worldSave.q);chassisB.velocity.set(0,0,0);chassisB.angularVelocity.set(0,0,0)}
    if(worldFogSave){S.fog.color.setHex(worldFogSave.fog);S.background.setHex(worldFogSave.bg);worldFogSave=null}
    if(worldGSave!=null){world.gravity.y=worldGSave;worldGSave=null}
    if(worldWeatherSave){const saved=worldWeatherSave;worldWeatherSave=null;setWeather(saved.lock||'auto',true);if(!saved.lock&&saved.id)mood(saved.id,.8)}
    hint.textContent=TOUCH?'':'WASD drive · C camera · L time a lap · M map · R reset';
    toastMsg('Back to the valley');updCircBtn()}
  /* ---------- drawing overlay ---------- */
  const circDrawEl=$('#dcirc'),circCv=$('#dcircdraw'),circErrEl=$('#dcircerr'),circGoEl=$('#dcircgo'),circSeedEl=$('#dcircseed');
  const circCx=circCv?circCv.getContext('2d'):null;
  let drawPts=[],drawingNow=false,pendingTrack=null;
  function resizeDrawCv(){if(!circCv)return;circCv.width=innerWidth;circCv.height=innerHeight}
  addEventListener('resize',resizeDrawCv);
  function redrawPath(){if(!circCx)return;circCx.clearRect(0,0,circCv.width,circCv.height);
    if(drawPts.length<2)return;
    circCx.strokeStyle='#f2eee6';circCx.lineWidth=4;circCx.lineJoin='round';circCx.lineCap='round';
    circCx.beginPath();circCx.moveTo(drawPts[0].x,drawPts[0].y);
    for(let i=1;i<drawPts.length;i++)circCx.lineTo(drawPts[i].x,drawPts[i].y);
    circCx.stroke()}
  function openDrawer(){if(!circDrawEl)return;if(MODE==='circuit'){toastMsg('Return to Earth before generating a new venue');return}resizeDrawCv();drawPts=[];drawingNow=false;pendingTrack=null;if(circGoEl)circGoEl.disabled=true;if(circErrEl)circErrEl.textContent='';redrawPath();circDrawEl.classList.add('on')}
  function closeDrawer(){if(circDrawEl)circDrawEl.classList.remove('on')}
  if(circCv){
    const posOf=e=>{const r=circCv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
    circCv.addEventListener('pointerdown',e=>{drawingNow=true;pendingTrack=null;if(circGoEl)circGoEl.disabled=true;drawPts=[posOf(e)];if(circErrEl)circErrEl.textContent='';try{circCv.setPointerCapture(e.pointerId)}catch(_){}});
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
    if(drawPts.length<8){drawFail('Draw a bigger loop.');return}
    const first=drawPts[0],last=drawPts[drawPts.length-1];
    const closeDist=Math.hypot(last.x-first.x,last.y-first.y);
    let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;drawPts.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)});
    const diag=Math.hypot(maxX-minX,maxY-minY);
    if(diag<120){drawFail('Draw a bigger loop.');return}
    if(closeDist>diag*.22){drawFail('Loop has to close - end near where you started.');return}
    const closed=drawPts.slice();closed.push({x:first.x,y:first.y});
    // target a fixed point count by picking the step from the path's own length, rather than
    // resampling then truncating the array - truncating after the fact can chop off the closing
    // stretch of the loop and silently hide a crossing that falls past the cutoff
    let rawLen=0;for(let i=1;i<closed.length;i++)rawLen+=Math.hypot(closed[i].x-closed[i-1].x,closed[i].y-closed[i-1].y);
    const step=Math.max(4,rawLen/110);
    const rs=resamplePath(closed,step);
    if(rs.length<10){drawFail('Draw a bigger loop.');return}
    for(let i=0;i<rs.length-1;i++)for(let j=i+2;j<rs.length-1;j++){
      if(i===0&&j===rs.length-2)continue;
      if(segInt(rs[i],rs[i+1],rs[j],rs[j+1])){drawFail('Track crosses itself. Try a simpler loop.');return}}
    for(let i=0;i<rs.length-1;i++){
      const a=rs[(i-1+rs.length-1)%(rs.length-1)],b=rs[i],c=rs[i+1];
      const v1x=b.x-a.x,v1y=b.y-a.y,v2x=c.x-b.x,v2y=c.y-b.y,l1=Math.hypot(v1x,v1y)||1,l2=Math.hypot(v2x,v2y)||1;
      const cos=Math.max(-1,Math.min(1,(v1x*v2x+v1y*v2y)/(l1*l2))),ang=Math.acos(cos)*180/Math.PI;
      if(ang>95){drawFail('Track has a sharp corner. Try drawing a wider turn.');return}}
    pendingTrack=normalizeLoop(rs.slice(0,rs.length-1));
    if(circGoEl)circGoEl.disabled=false;
    if(circErrEl)circErrEl.textContent='Loop validated. Choose venue settings, then press GO.'}
  function generateVenue(){
    if(!pendingTrack)return;
    const seed=Math.max(1,Math.min(2147483647,Math.floor(Number(circSeedEl&&circSeedEl.value)||271828)));
    let state=seed>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
    const choose=(value,options)=>value==='random'?options[Math.floor(rand()*options.length)]:value;
    const sceneryEl=$('#dcircscenery'),weatherEl=$('#dcircweather'),timeEl=$('#dcirctime');
    const scenery=choose(sceneryEl?sceneryEl.value:'meadow',THEMES.map(t=>t.id));
    const weather=choose(weatherEl?weatherEl.value:'day',WEATHERS.map(w=>w.id));
    const time=choose(timeEl?timeEl.value:'day',['day','dusk','sunset','night']);
    const theme=THEMES.find(t=>t.id===scenery)||THEME_DEFAULT,venue={weather,time};
    try{localStorage.setItem('sl_venue',JSON.stringify({seed,scenery,weather,time}))}catch(e){}
    buildCircuit(pendingTrack,theme,seed,venue);closeDrawer();enterCircuit();updCircBtn();
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
  if(circBtn)circBtn.onclick=()=>{if(MODE==='circuit'){leaveCircuit();return}if(circuit){enterCircuit();return}openDrawer()};
  {const x=$('#dcircx'),cl=$('#dcircclear');
   if(x)x.onclick=closeDrawer;
  if(cl)cl.onclick=()=>{drawPts=[];pendingTrack=null;if(circGoEl)circGoEl.disabled=true;redrawPath();if(circErrEl)circErrEl.textContent=''}}
  updCircBtn();
  {const newVenue=$('#dmapsb');if(newVenue)newVenue.onclick=openDrawer;
   const saved=(()=>{try{return JSON.parse(localStorage.getItem('sl_venue')||'null')}catch(e){return null}})();
   if(saved){if(circSeedEl)circSeedEl.value=String(saved.seed||271828);const scenery=$('#dcircscenery'),weather=$('#dcircweather'),time=$('#dcirctime');
     if(scenery&&scenery.querySelector('option[value="'+saved.scenery+'"]'))scenery.value=saved.scenery;
     if(weather&&weather.querySelector('option[value="'+saved.weather+'"]'))weather.value=saved.weather;
     if(time&&time.querySelector('option[value="'+saved.time+'"]'))time.value=saved.time}}
  requestAnimationFrame(loop);
  /* ---------- rooms: ghost cars over a shared channel ----------
     Everybody drives their own physics on their own machine. What travels is a small pose
     ten times a second, and the other drivers are see-through ghosts with no body in the
     world, so nothing ever collides. A room is just a code: the code names a broadcast
     channel, and anyone who opens the same channel is in the same room. There is no server
     code and nothing is stored; a channel exists only while somebody is on it. */
  const MP=(function(){
    const CFG={ws:'wss://oceaylrebzflgyxfjqfb.supabase.co/realtime/v1/websocket',
      key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZWF5bHJlYnpmbGd5eGZqcWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NDk5ODUsImV4cCI6MjEwNjAyNTk4NX0.RTdGpoSF7ZX8oaIrLEY4VAmV14GVHY8rYT1H5j18OHs'};
    const MAXP=4,HZ=10,STALE=6500,PAL=[0x1f5fbf,0x2f9e5b,0xd9a12a,0x7a3fb0],HEX=c=>'#'+c.toString(16).padStart(6,'0');
    const LOCAL=/[?&]net=local\b/.test(location.search);
    const ALPH='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',rid=n=>{let s='';for(let i=0;i<n;i++)s+=ALPH[Math.random()*32|0];return s};
    const me={id:rid(8),n:'',j:0},LOG=[],lg=(...a)=>{LOG.push(Math.round(performance.now())+' '+a.join(' '));if(LOG.length>60)LOG.shift()};
    let room=null,net=null,status='off',peers=new Map(),lastSend=0,lastHi=0,lastUI=0,lastPing=0,pingSeq=0,pendingPings=new Map(),
      race={id:'',st:0,t0:0,d0:0,rp:0,lastU:0,slot:0,ms:0,lastP:0,hold:null,cdN:-1,fins:0,endAt:0},
        myFin=0;
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
    function sendHi(rep){send({k:'hi',n:myName(),j:me.j,r:rep?1:0,car:curCarId,rid:race.id,rs:race.st,startAt:race.startAt,fin:myFin,d:race.st>=2?race.d0+race.rp:0})}
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
        case 'hi':if(!m.r)sendHi(true);syncRace(P,m);break;
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
        case 'race':beginCountdown(P.n,num(m.startAt,0,1e15,Date.now()+CD_LEAD),String(m.rid||''));break;
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
      if(race.st===1||race.st===2){note('A race is already running');return}
      const startAt=Date.now()+CD_LEAD,rid=me.id+'-'+startAt;send({k:'race',startAt,rid});beginCountdown('You',startAt,rid)}
    function beginCountdown(who,startAt,rid){
      rid=String(rid||('legacy-'+startAt));
      if(race.id===rid&&race.st>=1)return;
      if(raceMode)stopRace();
      closePanel();
      // startAt is a shared wall-clock instant (Date.now(), not performance.now(), since it has to mean
      // the same thing on every client's clock) so everyone's countdown hits GO at roughly the same moment,
      // regardless of when the 'race' broadcast actually arrived on each connection
      race={id:rid,st:1,startAt,t0:0,d0:0,rp:0,lastU:0,slot:slotOf(),ms:0,lastP:0,hold:null,cdN:-1,fins:0,endAt:0};myFin=0;
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
        const rn=roadNear(car.position.x,car.position.z);
        if(race.lastU<0){race.lastU=rn.u;race.d0=rn.u>.5?rn.u-1:rn.u;race.rp=0}
        else{let du=rn.u-race.lastU;if(du<-.5)du+=1;else if(du>.5)du-=1;
          if(!rn.branch&&Math.abs(du)<.06&&rn.d<16+RWX*1.5)race.rp+=du;race.lastU=rn.u}
        if(!myFin&&race.d0+race.rp>=1){myFin=now-race.t0;race.ms=myFin;race.fins++;send({k:'fin',rid:race.id,ms:Math.round(myFin)});
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
      raceTick(now,dt);
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
    function ui(){
      if(el.btn)el.btn.textContent=room?('Room · '+room):'Room';
      if(el.out)el.out.style.display=room?'none':'block';
      if(el.inn)el.inn.style.display=room?'block':'none';
      if(el.codeOut)el.codeOut.textContent=room||'';
      if(el.race){el.race.disabled=!room||status!=='up'||race.st===1||race.st===2||race.st===4;
        el.race.textContent=race.st===3?'Rematch':'Start race'}
      if(el.raceStatus)el.raceStatus.textContent=!room?'Create or join a room to race.':status!=='up'?'Connecting to room…':race.st===1?'Race countdown in progress':race.st===2?'Race in progress · finish times appear here as drivers finish':race.st===4?'Race in progress · you joined as a spectator':race.st===3?'Race complete · final times are shown below':'Room ready · anyone can start a race';
      if(el.list){const host=isHost(),racing=race.st>=2,rows=[{id:me.id,n:myName(),c:0x640c0e,me:1,watching:race.st===4,d:racing?race.d0+race.rp:0,fin:myFin,ping:null,off:false}];
        peers.forEach(P=>rows.push({id:P.id,n:P.n,c:colorOf(P.id),d:P.d,fin:P.fin,ping:P.ping,off:!P.got}));
        if(racing)rows.sort((a,b)=>a.watching?1:b.watching?-1:a.fin&&b.fin?a.fin-b.fin:a.fin?-1:b.fin?1:b.d-a.d);
        const lead=Math.max.apply(null,rows.filter(P=>!P.fin).map(P=>P.d).concat([0]));
        let h='';rows.forEach((P,i)=>{let timing=P.watching?'Spectating':P.fin?fmtT(P.fin):racing?(P.off?'Connecting':P.d>=lead-1e-4?'Leading':'-'+Math.max(0,Math.round((lead-P.d)*TLEN))+' m'):(P.off?'Joining':'Ready');
          const ping=P.me?'':P.ping==null?'Ping…':P.ping+' ms';
          h+='<li class="'+(P.me?'me':'')+'"><i style="background:'+HEX(P.c)+'"></i><span class="mp-driver">'+(racing?'<em>'+(P.fin?i+1:'')+'</em>':'')+esc(P.n)+(P.me?' (you)':'')+'</span><span class="mp-timing">'+timing+(ping?' · '+ping:'')+
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
    function carChanged(){if(room)sendHi(true)}
    mpCarNotify=carChanged;
    return {tick,join,leave,LOG,get on(){return !!room},get state(){return {room,status,peers,race,me}},_dbg:{sorted}}
  })();
  /* ---------- go ---------- */
  function resize(){W=sec.clientWidth;H=sec.clientHeight;R.setPixelRatio(DPR());R.setSize(W,H,false);C.aspect=W/H;C.updateProjectionMatrix();if(sun.shadow)sun.shadow.needsUpdate=true}addEventListener('resize',resize);
  function enterDrive(){active=true;sec.classList.add('active');if(TOUCH)sec.classList.add('touch');resize();{const l=$('#dload');if(l)l.remove()}
    missEl.classList.add('on');driving=true;hud.classList.add('on');if(TOUCH)mob.classList.add('on');checkRot();
    hint.textContent=TOUCH?'':'WASD drive · C camera · L time a lap · M map · R reset';
    {const {p,tg}=at(progU||0);C.position.set(p.x-tg.x*10,p.y+5,p.z-tg.z*10);look.set(p.x+tg.x*6,p.y+1,p.z+tg.z*6)}
    const m0=curMission();if(m0)setTimeout(()=>toastMsg('Mission \u00b7 '+m0.name),1200)}
  HF.paint(0,[1,1,1]);applyWx(true);applyQ();
  // browsers keep sound off until the first key press or tap
  ['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>audioInit(),{passive:true}));
  enterDrive();
})();
