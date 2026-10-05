/* In-car FM radio. The dial is 28 live internet stations (SomaFM, Radio Paradise, Nightride FM: real music, free, ad-free; see LIVE below).
   Each FM is one live station. The studio code below (songs written on the fly with Web Audio, no music files,
   nothing to license) is kept but is not on the dial: a station picks a key, a tempo and a chord progression, then plays an intro,
   a groove, a melody section, a breakdown and an outro over about three minutes before the next song.
     88.6  Lo-fi Drive   dusty electric piano, swung beat, vinyl crackle
     94.2  Sunset Wave   synthwave pads, arpeggios, big snare
     101.7 Night Jazz    seventh chords, walking bass, ride and brushes, vibes
     107.5 Night Riff    brooding minor-key indie: a looping organ riff, a slow build, then a big distorted finale
   Songs are seeded, so every one can be played again: .prev() replays the one before, .next() skips, .playlist()
   lists what was played, what is on and what is next, .jump(i) plays one of them. With .setSpeed(kmh) and auto
   on, driving fast (over 120 km/h) fades over to Night Riff, and slowing down returns to your station.
   window.Radio: .cycle() off -> each station -> off, .tune(i), .station(), .setVolume(0..1), .setMuted(m), .label(), .onInfo = fn(text). */
(function(window){
  'use strict';
  const mtof=m=>440*Math.pow(2,(m-69)/12),rnd=Math.random,pick=a=>a[Math.floor(rnd()*a.length)];
  // a song's choices come from its own seed, so replaying it from the history plays the same song
  const mul=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  let sr=rnd;const spick=a=>a[Math.floor(sr()*a.length)];
  const CH={maj7:[0,4,7,11],maj9:[0,4,7,11,14],m7:[0,3,7,10],m9:[0,3,7,10,14],d7:[0,4,7,10],d9:[0,4,10,14],m11:[0,3,7,10,17],sus:[0,5,7,10,14],add9:[0,4,7,14]};
  /* Live stations: real music from SomaFM, a free, listener-supported, ad-free internet radio (somafm.com).
     Each FM is a different SomaFM channel streamed in an <audio> element, with the track name read from their
     public song list. If a stream can't be reached (offline, blocked), the radio drops to the studio stations below. */
  /* Live stations, all free, listener-supported internet radio that anyone may listen to:
       SomaFM (somafm.com): live = their channel id; the track name comes from their public song list.
       Radio Paradise (radioparadise.com): rp = its channel number; the track name comes from their now-playing API.
       Nightride FM (nightride.fm): synthwave channels, stream only.
     The FM numbers are handed out along the dial in this order. */
  const SOMA=id=>({live:id}),RP=(path,ch)=>({url:'https://stream.radioparadise.com/'+path,rp:ch}),NRF=id=>({url:'https://stream.nightride.fm/'+id+'.m4a'});
  const LIVE=[
    ['Groove Salad','Chill downtempo beats',SOMA('groovesalad')],
    ['Radio Paradise','Rock, pop and indie, old and new',RP('mp3-128',0)],
    ['Indie Pop Rocks','Indie pop and rock',SOMA('indiepop')],
    ['Nightride FM','Synthwave for night drives',NRF('nightride')],
    ['Underground 80s','80s new wave and synthpop',SOMA('u80s')],
    ['Paradise Rock','Rock, classic and new',RP('rock-128',2)],
    ['PopTron','Electropop and indie dance',SOMA('poptron')],
    ['Chillsynth','Chilled synthwave',NRF('chillsynth')],
    ['Suburbs of Goa','Desi and Asian electronic',SOMA('suburbsofgoa')],
    ['DEF CON Radio','Dark electronic',SOMA('defcon')],
    ['Darksynth','Heavy, fast synthwave',NRF('darksynth')],
    ['Left Coast 70s','70s rock and pop',SOMA('seventies')],
    ['Covers','Famous songs, covered',SOMA('covers')],
    ['BAGeL Radio','Alternative rock',SOMA('bagel')],
    ['Beat Blender','Deep house and downtempo',SOMA('beatblender')],
    ['The Trip','Progressive house and trance',SOMA('thetrip')],
    ['Dub Step Beyond','Dubstep and bass',SOMA('dubstep')],
    ['Secret Agent','Spy lounge and cinematic grooves',SOMA('secretagent')],
    ['Lush','Mellow vocals, electronic',SOMA('lush')],
    ['Sonic Universe','Modern jazz',SOMA('sonicuniverse')],
    ['Fluid','Instrumental hip-hop and future soul',SOMA('fluid')],
    ['Seven Inch Soul','Vintage soul 45s',SOMA('7soul')],
    ['Heavyweight Reggae','Reggae, ska and rocksteady',SOMA('reggae')],
    ['Paradise Mellow','Mellow rock and acoustic',RP('mellow-128',1)],
    ['Metal Detector','Heavy metal',SOMA('metal')],
    ['Boot Liquor','Americana and roots',SOMA('bootliquor')],
    ['Vaporwaves','Vaporwave',SOMA('vaporwaves')],
    ['Spacesynth','Spacesynth and italo',NRF('spacesynth')]
  ].map(([name,genre,src],k)=>Object.assign({fm:(87.7+k*.7).toFixed(1),name,genre},src));
  const STATIONS=LIVE.concat([
    {fm:'88.6',name:'Lo-fi Drive',style:'lofi',bpm:[72,84],swing:.18,
     progs:[[[2,'m9'],[7,'d9'],[0,'maj9'],[9,'m7']],[[5,'maj7'],[4,'m7'],[2,'m9'],[0,'maj9']],[[9,'m9'],[5,'maj9'],[0,'maj7'],[7,'sus']],[[0,'maj9'],[4,'m7'],[5,'maj7'],[5,'m7']]]},
    {fm:'94.2',name:'Sunset Wave',style:'wave',bpm:[96,110],swing:0,
     progs:[[[9,'m7'],[5,'maj7'],[0,'add9'],[7,'sus']],[[9,'m9'],[7,'add9'],[5,'maj7'],[7,'sus']],[[0,'add9'],[7,'add9'],[9,'m7'],[5,'maj7']]]},
    {fm:'101.7',name:'Night Jazz',style:'jazz',bpm:[84,100],swing:.3,
     progs:[[[2,'m9'],[7,'d9'],[0,'maj9'],[0,'maj7']],[[0,'maj9'],[9,'d7'],[2,'m9'],[7,'d9']],[[4,'m7'],[9,'d7'],[2,'m9'],[7,'d9']],[[5,'maj9'],[5,'m7'],[0,'maj9'],[9,'d7']]]},
    // minor-key progressions that loop under one riff; roots are semitones above a minor tonic
    {fm:'107.5',name:'Night Riff',style:'indie',bpm:[132,146],swing:0,
     progs:[[[0,'mi'],[0,'mi'],[8,'ma'],[10,'ma']],[[0,'mi'],[10,'ma'],[8,'ma'],[7,'mi']],[[0,'mi'],[3,'ma'],[10,'ma'],[8,'ma']],[[0,'mi'],[8,'ma'],[3,'ma'],[10,'ma']],[[0,'mi'],[0,'mi'],[5,'mi'],[7,'ma']]]}
  ]);
  const isLive=i=>i>=0&&!!(STATIONS[i]&&(STATIONS[i].live||STATIONS[i].url)),NR=STATIONS.length-1,FASTLIVE=LIVE.findIndex(s=>s.live==='indiepop');
  let liveDown=false;const fastIdx=()=>FASTLIVE;
  CH.mi=[0,3,7];CH.ma=[0,4,7];
  const TI=['Five Hundred Nights','Blue Exit','Tail Lights','Room 214','Last Train South','Neon Static','Slow Burn','Do You Still Drive','Glass Highway','After Hours','Velvet Overpass','Red Line Home','Midnight Return','Hotel Corridor'],
        AI=['The Late Arcades','Monday Static','Hollow Avenue','Velvet Signals','The Night Ferries','Arcade Moons'];
  const TA=['Paper','Velvet','Neon','Slow','Golden','Quiet','Midnight','Coastal','Amber','Silver','Lazy','Hazy','Late','Soft'],
        TB=['Moons','Highway','Rain','Lights','Exit','Avenue','Drift','Summer','Window','Tide','Static','Signals','Hours','Bloom'],
        AR=['Koi Static','The Low Gears','Mira Vale','Cassette Park','North Lantern','Juno & the Tides','Slow Coast','Hotel Atlas'];

  let ac=null,master=null,dry=null,verb=null,noise=null,crackle=null,crackleG=null,timer=null;
  let on=false,st=-1,muted=false,song=null,step=0,nextT=0,vol=.65,hist=[],hi=-1,auto=true,fastT=0,slowT=0,homeSt=-1;
  const R={onInfo:null};

  function init(){
    if(ac)return;
    ac=new (window.AudioContext||window.webkitAudioContext)();
    const comp=ac.createDynamicsCompressor();comp.threshold.value=-20;comp.ratio.value=3;comp.attack.value=.01;comp.release.value=.3;
    master=ac.createGain();master.gain.value=0;master.connect(comp);comp.connect(ac.destination);
    dry=ac.createGain();dry.connect(master);
    // a soft room: decaying stereo noise as the impulse
    verb=ac.createConvolver();{const len=ac.sampleRate*2.4|0,b=ac.createBuffer(2,len,ac.sampleRate);
      for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(rnd()*2-1)*Math.pow(1-i/len,3.2)}verb.buffer=b}
    const vg=ac.createGain();vg.gain.value=.55;verb.connect(vg);vg.connect(master);
    noise=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);{const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=rnd()*2-1}
    // vinyl: a bed of hiss with sparse clicks, for the lo-fi station
    {const len=ac.sampleRate*3,b=ac.createBuffer(1,len,ac.sampleRate),d=b.getChannelData(0);let lp=0;
     for(let i=0;i<len;i++){lp+=((rnd()*2-1)-lp)*.08;d[i]=lp*.25+(rnd()<.0004?(rnd()*2-1)*.9:0)}
     crackle=ac.createBufferSource();crackle.buffer=b;crackle.loop=true;crackleG=ac.createGain();crackleG.gain.value=0;
     const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;crackle.connect(hp);hp.connect(crackleG);crackleG.connect(master);crackle.start()}
    document.addEventListener('visibilitychange',()=>{try{if(document.hidden)ac.suspend();else if(on&&!muted)ac.resume()}catch(e){}});
  }

  /* ---- instruments ---- */
  function env(g,t,a,peak,dur,rel){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.setTargetAtTime(0,t+a+dur*.15,Math.max(.02,(dur+rel)/4))}
  function out(node,send){node.connect(dry);if(send){const s=ac.createGain();s.gain.value=send;node.connect(s);s.connect(verb)}}
  function osc(type,f,t,stop,det){const o=ac.createOscillator();o.type=type;o.frequency.value=f;if(det)o.detune.value=det;o.start(t);o.stop(stop);return o}
  function epiano(t,m,dur,v,send){const f=mtof(m),g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=song.style==='lofi'?1800:2600;
    const e=t+dur+1.6;osc('sine',f,t,e).connect(g);
    const g2=ac.createGain();g2.gain.setValueAtTime(.35,t);g2.gain.exponentialRampToValueAtTime(.001,t+.6);osc('sine',f*2,t,e,3).connect(g2);g2.connect(g);
    const g3=ac.createGain();g3.gain.setValueAtTime(.12,t);g3.gain.exponentialRampToValueAtTime(.001,t+.12);osc('sine',f*7,t,e).connect(g3);g3.connect(g);   // the tine's ping
    env(g,t,.006,v,dur,1.2);g.connect(lp);out(lp,send)}
  function pad(t,m,dur,v){const f=mtof(m),g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=.7;
    lp.frequency.setValueAtTime(700,t);lp.frequency.linearRampToValueAtTime(1900,t+dur*.6);const e=t+dur+1.5;
    osc('sawtooth',f,t,e,-9).connect(lp);osc('sawtooth',f,t,e,9).connect(lp);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.35);g.gain.setValueAtTime(v,t+dur);g.gain.setTargetAtTime(0,t+dur,.35);lp.connect(g);out(g,.5)}
  function pluck(t,m,v,send){const f=mtof(m),g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=4;
    lp.frequency.setValueAtTime(3200,t);lp.frequency.exponentialRampToValueAtTime(500,t+.25);osc('square',f,t,t+.5).connect(lp);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.4);lp.connect(g);out(g,send)}
  function lead(t,m,dur,v){const f=mtof(m),g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2200;const e=t+dur+.6;
    const o=osc('sawtooth',f,t,e),o2=osc('triangle',f*2,t,e,4),vib=osc('sine',5.5,t,e),vg=ac.createGain();vg.gain.setValueAtTime(0,t);vg.gain.linearRampToValueAtTime(f*.006,t+.4);
    vib.connect(vg);vg.connect(o.frequency);vg.connect(o2.frequency);const g2=ac.createGain();g2.gain.value=.3;o2.connect(g2);g2.connect(lp);o.connect(lp);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.03);g.gain.setValueAtTime(v*.8,t+dur);g.gain.setTargetAtTime(0,t+dur,.12);lp.connect(g);out(g,.45)}
  function vibes(t,m,dur,v){const f=mtof(m),g=ac.createGain(),e=t+dur+2;const o=osc('sine',f,t,e),o2=osc('sine',f*4,t,e),g2=ac.createGain();
    g2.gain.setValueAtTime(.18,t);g2.gain.exponentialRampToValueAtTime(.001,t+.3);o2.connect(g2);g2.connect(g);o.connect(g);
    const tr=osc('sine',5,t,e),tg=ac.createGain();tg.gain.value=v*.25;tr.connect(tg);tg.connect(g.gain);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.005);g.gain.setTargetAtTime(0,t+.02,Math.max(.25,dur*.6));out(g,.5)}
  function bass(t,m,dur,v){const f=mtof(m),g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=song.style==='wave'?600:420;
    const e=t+dur+.3;osc(song.style==='wave'?'sawtooth':'triangle',f,t,e).connect(lp);osc('sine',f,t,e).connect(lp);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.setValueAtTime(v*.85,t+dur*.8);g.gain.setTargetAtTime(0,t+dur*.85,.05);lp.connect(g);out(g,0)}
  function nz(t,dur,type,f,q,v,send,dest){const s=ac.createBufferSource();s.buffer=noise;const fl=ac.createBiquadFilter();fl.type=type;fl.frequency.value=f;if(q)fl.Q.value=q;
    const g=ac.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(fl);fl.connect(g);
    if(dest)g.connect(dest);else out(g,send);s.start(t,rnd()*.5);s.stop(t+dur+.05)}
  function kick(t,v){const o=ac.createOscillator(),g=ac.createGain();o.frequency.setValueAtTime(115,t);o.frequency.exponentialRampToValueAtTime(42,t+.13);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.38);o.connect(g);out(g,0);o.start(t);o.stop(t+.4)}
  function snare(t,v){const lofi=song.style==='lofi';nz(t,lofi?.16:.24,'bandpass',lofi?1500:1900,.8,v,song.style==='wave'?.7:.25);
    const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(200,t);o.frequency.exponentialRampToValueAtTime(150,t+.08);
    g.gain.setValueAtTime(v*.5,t);g.gain.exponentialRampToValueAtTime(.001,t+.1);o.connect(g);out(g,.2);o.start(t);o.stop(t+.12)}
  const hat=(t,v,open)=>nz(t,open?.22:.045,'highpass',song.style==='lofi'?6000:7500,0,v,.1);
  const ride=(t,v)=>nz(t,.35,'bandpass',5200,1.5,v,.25);
  const brush=(t,v)=>nz(t,.18,'bandpass',3000,.6,v,.15);

  /* ---- writing a song ---- */
  // the history: every song is {st, seed}; hi is the one playing. Newer entries past hi are the 'next' queue
  function makeSong(st0,seed){
    const S=STATIONS[st0];sr=mul(seed);
    const prog=spick(S.progs),key=S.style==='indie'?45+Math.floor(sr()*6):48+Math.floor(sr()*7)-2;   // root around C3 (indie: A2-D3, darker)
    const indie=S.style==='indie';
    return {st:st0,seed,style:S.style,swing:S.swing,bpm:S.bpm[0]+Math.floor(sr()*(S.bpm[1]-S.bpm[0]+1)),key,prog,bars:S.style==='jazz'?56:indie?72:64,bar:0,motif:null,voicing:null,
      title:indie?spick(TI):spick(TA)+' '+spick(TB),artist:indie?spick(AI):spick(AR),riff:indie?makeRiff():null}}
  function newSong(st0,seed){
    if(seed==null){seed=(rnd()*4294967296)>>>0;st0=st;
      // a fresh song goes after the one playing (dropping any queue)
      hist=hist.slice(0,hi+1);hist.push({st:st0,seed});hi=hist.length-1;if(hist.length>40){hist.shift();hi--}}
    st=st0;song=makeSong(st0,seed);
    step=0;
    if(crackleG)crackleG.gain.setTargetAtTime(STATIONS[st].style==='lofi'&&!muted?.035:0,ac.currentTime,.4);
    info()}
  /* ---- live streams ---- */
  let failRun=0,el=null,liveOk=false,liveTimer=null,metaT=null,srvI=0,meta=null,recent=[];
  const SRV=[2,4,1,6,5,3],liveUrl=S=>S.url||'https://ice'+SRV[srvI%SRV.length]+'.somafm.com/'+S.live+'-128-mp3';
  function liveEl(){if(el)return el;el=new Audio();el.preload='none';el.setAttribute('playsinline','');
    el.addEventListener('playing',()=>{liveOk=true;failRun=0;liveDown=false;clearTimeout(liveTimer);if(R.onChange)R.onChange()});
    el.addEventListener('error',()=>{if(el.getAttribute('src'))liveFail()});return el}
  function liveVol(){if(el){el.volume=Math.min(1,vol);el.muted=muted||!on||!isLive(st)}}
  function livePlay(){const a=liveEl();a.src=liveUrl(STATIONS[st]);liveVol();const p=a.play();
    if(p&&p.catch)p.catch(e=>{if(!e||e.name!=='NotAllowedError')liveFail()});   // NotAllowed: waits for a tap, not a failure
    clearTimeout(liveTimer);liveTimer=setTimeout(()=>{if(!liveOk&&!a.paused)liveFail()},15000)}
  function liveStart(){srvI=0;liveOk=false;meta=null;recent=[];livePlay();fetchMeta();clearInterval(metaT);metaT=setInterval(fetchMeta,20000);info()}
  function liveStop(){clearInterval(metaT);clearTimeout(liveTimer);if(el&&el.getAttribute('src')){el.pause();el.removeAttribute('src');try{el.load()}catch(e){}}}
  // a stream that won't start: SomaFM gets two more relay servers, others one more try; then the next station on the dial.
  // Three stations in a row failing means no internet radio here: the studio stations take over.
  let lastDir=1;
  function liveFail(){if(!on||!isLive(st))return;srvI++;if(srvI<(STATIONS[st].live?3:2)){livePlay();return}
    const n=STATIONS[st].name;failRun++;
    if(failRun>=3){failRun=0;const why=el&&el.error?' (error '+el.error.code+')':'';tune(-1);if(R.onInfo)R.onInfo('No signal · internet radio can\'t be reached right now'+why);return}
    liveStep(lastDir);if(R.onInfo)R.onInfo(n+' is off air · tuning to '+STATIONS[st].name)}
  function fetchMeta(){const S=STATIONS[st];if(!S||!isLive(st))return;const key=S.name,ok=()=>STATIONS[st]&&STATIONS[st].name===key,
      set=list=>{if(!ok())return;recent=list;const t=recent[0],k=t?t.title+'|'+t.artist:null;if(k!==meta){meta=k;info()}};
    if(S.live)fetch('https://somafm.com/songs/'+S.live+'.json',{cache:'no-store'}).then(r=>r.json()).then(j=>set((j.songs||[]).slice(0,8))).catch(()=>{});
    else if(S.rp!=null)fetch('https://api.radioparadise.com/api/now_playing?chan='+S.rp,{cache:'no-store'}).then(r=>r.json()).then(j=>{if(j&&j.title)set([{title:j.title,artist:j.artist}])}).catch(()=>{})}
  function liveNow(){const S=STATIONS[st],t=recent[0];return {title:t&&t.title||S.genre,artist:t&&t.artist||'Live radio'}}
  function info(){if(on&&isLive(st)){const n=liveNow();if(R.onInfo)R.onInfo('FM '+STATIONS[st].fm+' · '+STATIONS[st].name+' — “'+n.title+'” · '+n.artist);if(R.onChange)R.onChange();return}
    if(R.onInfo&&song)R.onInfo('FM '+STATIONS[st].fm+' · '+STATIONS[st].name+' — “'+song.title+'” · '+song.artist);if(R.onChange)R.onChange()}
  function section(b,n){
    // the slow-build arc: a quiet riff, the verse, a bigger chorus, a near-silent break, then the loud finale
    if(song.style==='indie'){if(b<8)return'intro';if(b>=n-4)return'outro';const k=(b-8)/(n-12);return k<.3?'verse':k<.5?'chorus':k<.58?'break':k<.75?'verse':'finale'}
    if(b<4)return'intro';if(b>=n-4)return'outro';const k=(b-4)/(n-8);return k<.25?'groove':k<.55?'melody':k<.68?'break':'melody'}
  // chord tones placed close to the last voicing, kept between E3 and E5
  function voice(root,type){const iv=CH[type],prev=song.voicing,notes=iv.map(i=>{let m=song.key+root+i;while(m<52)m+=12;while(m>76)m-=12;return m}).sort((a,b)=>a-b);
    if(prev){const pc=prev.reduce((a,b)=>a+b,0)/prev.length,nc=notes.reduce((a,b)=>a+b,0)/notes.length;if(nc-pc>6)notes.forEach((m,i)=>notes[i]=m-12>=48?m-12:m);if(pc-nc>6)notes.forEach((m,i)=>notes[i]=m+12<=79?m+12:m)}
    song.voicing=notes;return notes}
  const PENTA=[0,2,4,7,9];
  function scaleNote(deg){const o=Math.floor(deg/5),d=((deg%5)+5)%5;return song.key+24+o*12+PENTA[d]}
  // the riff: eight eighth-notes over the chord, mostly root/third/fifth/octave, a step above or below now and then
  function makeRiff(){const pat=[];const tones=[0,1,2,3,2,1,3,2];for(let i=0;i<8;i++){const r=sr();pat.push(r<.15?-1:r<.75?tones[(i+Math.floor(sr()*3))%8]:Math.floor(sr()*4))}return pat}
  function organ(t,m,dur,v){const f=mtof(m),g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2600;const e=t+dur+.2;
    osc('square',f,t,e,-6).connect(lp);osc('square',f*2,t,e,5).connect(lp);const g2=ac.createGain();g2.gain.value=.4;osc('sine',f/2,t,e).connect(g2);g2.connect(lp);
    const tr=osc('sine',6.2,t,e),tg=ac.createGain();tg.gain.value=v*.18;tr.connect(tg);tg.connect(g.gain);   // leslie-ish wobble
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.setValueAtTime(v*.8,t+dur*.8);g.gain.setTargetAtTime(0,t+dur*.85,.04);lp.connect(g);out(g,.35)}
  let dist=null;function distCurve(){if(dist)return dist;const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/n*2-1;c[i]=Math.tanh(x*6)}dist=c;return c}
  function guitar(t,notes,dur,v){const ws=ac.createWaveShaper();ws.curve=distCurve();ws.oversample='2x';const pre=ac.createGain();pre.gain.value=.6;
    const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2400;const g=ac.createGain(),e=t+dur+.3;
    notes.forEach((m,i)=>{const f=mtof(m);osc('sawtooth',f,t+i*.006,e,-7).connect(pre);osc('sawtooth',f,t+i*.006,e,7).connect(pre)});
    pre.connect(ws);ws.connect(lp);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.setValueAtTime(v*.85,t+dur*.85);g.gain.setTargetAtTime(0,t+dur*.9,.06);lp.connect(g);out(g,.25)}
  function makeMotif(){const rh=pick([[0,6,8,12],[0,3,8],[2,6,10,14],[0,8,10],[4,6,12],[0,6,10,12,14]]);let d=Math.floor(rnd()*5)+3;
    return rh.map((s,i)=>{d+=pick([-2,-1,-1,1,1,2,0]);d=Math.max(0,Math.min(10,d));return{s,d,len:i===rh.length-1?pick([4,6,8]):2}})}

  function playStep(t){
    const n=song.bars,b=song.bar,s=step,sec=section(b,n),stepDur=60/song.bpm/4,beat=stepDur*4;
    const [root,type]=song.prog[b%song.prog.length],style=song.style;
    if(style==='indie')return playIndie(t,s,b,n,sec,stepDur,root,type);
    if(s%2===1&&song.swing)t+=song.swing*stepDur;                   // swung off-beat 16ths
    const fade=sec==='outro'?Math.max(.15,1-(b-(n-4)+s/16)/4):sec==='intro'?.6+.1*b:1;
    const drums=sec==='groove'||sec==='melody',hum=v=>v*(.85+rnd()*.3)*fade;
    // chords
    if(style==='lofi'){if(s===0||(s===10&&rnd()<.35)){const v=voice(root,type);v.forEach((m,i)=>epiano(t+i*.012,m,s===0?beat*3.4:beat*1.4,hum(.065),.35))}}
    else if(style==='wave'){if(s===0){voice(root,type).forEach(m=>pad(t,m,beat*3.9,hum(.026)))}
      if(sec!=='intro'&&sec!=='outro'||s%4===0){const v=song.voicing;if(v)pluck(t,v[[0,1,2,3,2,1,3,2][s%8]%v.length]+12,hum(.045),.3)}}
    else{if(s===0||(rnd()<.18&&s%2===0&&s>2)){const v=voice(root,type);v.forEach(m=>epiano(t,m,beat*(s===0?1.6:.8),hum(.05),.3))}}
    // bass
    if(sec!=='intro'){
      const r=song.key-12+root;
      if(style==='jazz'){if(s%4===0){const next=song.key-12+song.prog[(b+1)%song.prog.length][0],q=s/4;
          const m=q===0?r:q===3?next+(rnd()<.5?1:-1):r+CH[type][Math.min(CH[type].length-1,q)]%12;bass(t,m<28?m+12:m,beat*.9,hum(.2))}}
      else if(style==='wave'){if(s%2===0)bass(t,r,stepDur*1.6,hum(.17))}
      else{if(s===0)bass(t,r,beat*1.6,hum(.24));else if(s===10)bass(t,r+(rnd()<.5?7:12),beat*.8,hum(.17));else if(s===14&&rnd()<.4)bass(t,r+5,stepDur*1.5,hum(.12))}}
    // drums
    if(drums||sec==='break'&&style==='wave'){
      if(style==='lofi'){if(drums&&(s===0||s===10||(s===7&&rnd()<.3)))kick(t,hum(.5));if(drums&&(s===4||s===12))snare(t,hum(.18));if(s%2===0)hat(t,hum(s%4===0?.05:.03))}
      else if(style==='wave'){if(drums&&s%4===0)kick(t,hum(.55));if(drums&&(s===4||s===12))snare(t,hum(.22));if(s%2===0)hat(t,hum(s%4===2?.05:.025),s%8===6)}
      else{if([0,4,6,8,12,14].includes(s))ride(t,hum(s===6||s===14?.03:.045));if(s===4||s===12)brush(t,hum(.05));if(s===0&&rnd()<.5)kick(t,hum(.22))}}
    // melody
    if(sec==='melody'||sec==='break'){
      if(s===0&&b%4===0)song.motif=makeMotif();
      const mo=song.motif,shift=(b%4===2)?pick([-1,1,2]):b%4===3?-1:0;
      if(mo&&b%4!==3||mo&&s<8)for(const nt of mo)if(nt.s===s){const m=scaleNote(nt.d+shift);
        if(style==='wave')lead(t,m,stepDur*nt.len,hum(.03));else if(style==='jazz')vibes(t,m,stepDur*nt.len,hum(.07));else epiano(t,m+12,stepDur*nt.len*1.5,hum(.045),.45)}}
  }
  /* Night Riff: the riff runs on eighth notes all the way through; the band joins in stages. Intro: riff alone, soft.
     Verse: bass and a light beat, a sung-like lead. Chorus: full kit, held chords. Break: riff almost alone again.
     Finale: everything, with distorted guitar chords, louder, the lead an octave up. Outro: the riff fading out. */
  function playIndie(t,s,b,n,sec,stepDur,root,type){
    const lvl={intro:.55,verse:.8,chorus:1,break:.5,finale:1.15,outro:Math.max(.15,1-(b-(n-4)+s/16)/4)}[sec]||1,hum=v=>v*(.88+rnd()*.24)*lvl;
    const chord=CH[type].map(i=>song.key+12+root+i),rt=song.key+root;
    // organ riff on eighths
    if(s%2===0){const ri=song.riff[(s/2)%8];if(ri>=0){const m=ri===3?rt+24:chord[ri]+12;organ(t,m,stepDur*1.8,hum(sec==='finale'?.03:.04))}}
    if(sec==='intro'&&b<4)return;
    // bass: long root notes, pushing eighths in the chorus and finale
    if(sec!=='break'){if(sec==='chorus'||sec==='finale'){if(s%2===0)bass(t,rt-12,stepDur*1.7,hum(.2))}else if(s===0||s===8)bass(t,rt-12,stepDur*7,hum(.2))}
    // drums
    if(sec==='verse'){if(s===0||s===10)kick(t,hum(.45));if(s===8)snare(t,hum(.14));if(s%4===2)hat(t,hum(.03))}
    if(sec==='chorus'||sec==='finale'){if(s%8===0||s===6||s===14&&sec==='finale')kick(t,hum(.55));if(s===4||s===12)snare(t,hum(.24));if(s%2===0)hat(t,hum(sec==='finale'?.05:.035),s%8===6);
      if(s===0&&b%8===0)nz(t,1.4,'highpass',4500,0,hum(.08),.4)}   // crash
    if(sec==='intro'&&s===0&&b>=6)kick(t,hum(.3));
    // held chords: soft pads in the chorus, distorted guitar in the finale
    if(s===0&&sec==='chorus')chord.forEach(m=>pad(t,m,stepDur*15,hum(.02)));
    if(sec==='finale'&&(s===0||s===8))guitar(t,[rt,rt+7,rt+12],stepDur*7.5,hum(.05));
    // a sung-like lead: long notes from the chord, answered at the end of each 4 bars
    if((sec==='verse'||sec==='chorus'||sec==='finale')&&(s===0||s===6||s===12&&b%2===1)){if(s===0&&b%4===0)song.motif=makeMotif();
      const pos=(b%4)*3+(s===0?0:s===6?1:2),deg=[4,5,4,3,4,6,7,6,5,3,2,1][pos%12],m=song.key+12+[0,2,3,5,7,8,10][deg%7]+12*Math.floor(deg/7)+(sec==='finale'?12:0);
      lead(t,m,stepDur*(s===0?5:3),hum(sec==='finale'?.026:.022))}}
  function tick(){
    if(!on||!song)return;
    const T=ac.currentTime;if(nextT<T)nextT=T+.05;
    while(nextT<T+.3){
      playStep(nextT);
      nextT+=60/song.bpm/4;step++;
      if(step>=16){step=0;song.bar++;if(song.bar>=song.bars){
        // the song ended: play the queued next one if there is one, otherwise write a new one
        if(hi<hist.length-1){hi++;newSong(hist[hi].st,hist[hi].seed)}else newSong();nextT+=1.2}}}}

  function tune(i){
    init();st=i;on=i>=0;
    const T=ac.currentTime;
    if(!isLive(i))liveStop();
    if(!on){master.gain.setTargetAtTime(0,T,.15);crackleG.gain.setTargetAtTime(0,T,.15);clearInterval(timer);timer=null;if(R.onInfo)R.onInfo('Radio off');if(R.onChange)R.onChange();return}
    if(isLive(i)){master.gain.setTargetAtTime(0,T,.15);crackleG.gain.setTargetAtTime(0,T,.15);clearInterval(timer);timer=null;song=null;try{ac.resume()}catch(e){}liveStart();return}
    try{ac.resume()}catch(e){}
    master.gain.cancelScheduledValues(T);master.gain.setValueAtTime(0,T);master.gain.linearRampToValueAtTime(muted?0:vol,T+.8);
    song=null;newSong();nextT=T+.1;if(!timer)timer=setInterval(tick,60)}
  // jump to song i of the history with a short fade
  function playAt(i){if(i<0||i>=hist.length)return;if(isLive(st))liveStop();init();const T=ac.currentTime;if(!on){on=true;try{ac.resume()}catch(e){};if(!timer)timer=setInterval(tick,60)}
    master.gain.cancelScheduledValues(T);master.gain.setValueAtTime(master.gain.value,T);master.gain.linearRampToValueAtTime(0,T+.15);master.gain.linearRampToValueAtTime(muted?0:vol,T+.9);
    hi=i;newSong(hist[i].st,hist[i].seed);nextT=T+.2}

  R.cycle=()=>tune(st+1>=LIVE.length?-1:st+1);
  // on a live station back and next move along the live dial (a live stream can't be skipped)
  const liveStep=d=>{lastDir=d;const n=LIVE.length;tune(((st+d)%n+n)%n)};
  R.prev=()=>{if(!on)return;if(isLive(st))return liveStep(-1);if(song&&song.bar>=3||hi<=0){playAt(hi)}else playAt(hi-1)};   // like a car stereo: back restarts the song, twice goes to the one before
  R.next=()=>{if(!on){tune(Math.max(0,homeSt));return}if(isLive(st))return liveStep(1);if(hi<hist.length-1)playAt(hi+1);else{const T=ac.currentTime;master.gain.setValueAtTime(master.gain.value,T);master.gain.linearRampToValueAtTime(0,T+.15);master.gain.linearRampToValueAtTime(muted?0:vol,T+.9);newSong();nextT=T+.2}};
  R.toggle=()=>{if(on){homeSt=st;tune(-1)}else tune(homeSt>=0?homeSt:0)};
  R.jump=i=>{if(typeof i==='string'&&i[0]==='s')return tune(+i.slice(1));if(!isLive(st))playAt(i)};
  R.playing=()=>on&&isLive(st)?Object.assign(liveNow(),{fm:STATIONS[st].fm,station:STATIONS[st].name,style:'live',live:true,progress:liveOk?1:0}):on&&song?{title:song.title,artist:song.artist,fm:STATIONS[st].fm,station:STATIONS[st].name,style:song.style,progress:(song.bar+step/16)/song.bars}:null;
  // the list: up to 6 played before, the current one, and the queued ones (a peek at what is next is written, not played)
  // live: the dial (tap one to tune), with what each live station is; studio: the song history
  R.playlist=()=>{if(on&&isLive(st))return LIVE.map((S,k)=>({i:'s'+k,title:S.name,artist:k===st?liveNow().title+' · '+liveNow().artist:S.genre,fm:S.fm,current:k===st}));
    const out=[];for(let i=Math.max(0,hi-6);i<hist.length;i++){const sg=makeSong(hist[i].st,hist[i].seed);out.push({i,title:sg.title,artist:sg.artist,fm:STATIONS[hist[i].st].fm,current:i===hi})}
    if(on&&hi===hist.length-1){const seed=(rnd()*4294967296)>>>0;hist.push({st,seed});const sg=makeSong(st,seed);out.push({i:hist.length-1,title:sg.title,artist:sg.artist,fm:STATIONS[st].fm,current:false})}
    return out};
  R.setAuto=v=>{auto=!!v};
  // speed: over 120 km/h for 3 s fades over to Night Riff; under 70 km/h for 8 s goes back to the station you had
  R.setSpeed=(kmh,dt)=>{if(!on||!auto)return;const F=fastIdx();
    if(st!==F){if(kmh>120){fastT+=dt;if(fastT>3){fastT=0;homeSt=st;if(isLive(F))tune(F);else{hist=hist.slice(0,hi+1);hist.push({st:F,seed:(rnd()*4294967296)>>>0});if(isLive(st))liveStop();playAt(hist.length-1)}if(R.onAuto)R.onAuto(true)}}else fastT=0}
    else if(homeSt>=0&&homeSt!==F){if(kmh<70){slowT+=dt;if(slowT>8){slowT=0;const h=homeSt;homeSt=-1;tune(h);if(R.onAuto)R.onAuto(false)}}else slowT=0}};
  R.setMuted=m=>{muted=!!m;liveVol();if(!ac)return;const T=ac.currentTime;master.gain.setTargetAtTime(on&&!muted?vol:0,T,.1);
    crackleG.gain.setTargetAtTime(on&&!muted&&song&&song.style==='lofi'?.035:0,T,.1)};
  R.tune=i=>{if(i===st&&on)return;tune(i)};
  R.station=()=>on?st:-1;
  R.setVolume=x=>{vol=Math.max(0,Math.min(1.2,x))*1;liveVol();if(ac&&on&&!muted)master.gain.setTargetAtTime(vol,ac.currentTime,.08)};   // 0..1 from the settings
  R.label=()=>on?'Radio: '+STATIONS[st].fm:'Radio: off';
  R.stations=STATIONS;R.live=LIVE;
  R.fastName=()=>STATIONS[fastIdx()].name;
  window.Radio=R;
})(window);
