/* In-car FM radio. Every song is written on the fly with Web Audio, so there are no music files and
   nothing to license: a station picks a key, a tempo and a chord progression, then plays an intro,
   a groove, a melody section, a breakdown and an outro over about three minutes before the next song.
     88.6  Lo-fi Drive   dusty electric piano, swung beat, vinyl crackle
     94.2  Sunset Wave   synthwave pads, arpeggios, big snare
     101.7 Night Jazz    seventh chords, walking bass, ride and brushes, vibes
   window.Radio: .cycle() off -> each station -> off, .tune(i), .station(), .setVolume(0..1), .setMuted(m), .label(), .onInfo = fn(text). */
(function(window){
  'use strict';
  const mtof=m=>440*Math.pow(2,(m-69)/12),rnd=Math.random,pick=a=>a[Math.floor(rnd()*a.length)];
  const CH={maj7:[0,4,7,11],maj9:[0,4,7,11,14],m7:[0,3,7,10],m9:[0,3,7,10,14],d7:[0,4,7,10],d9:[0,4,10,14],m11:[0,3,7,10,17],sus:[0,5,7,10,14],add9:[0,4,7,14]};
  const STATIONS=[
    {fm:'88.6',name:'Lo-fi Drive',style:'lofi',bpm:[72,84],swing:.18,
     progs:[[[2,'m9'],[7,'d9'],[0,'maj9'],[9,'m7']],[[5,'maj7'],[4,'m7'],[2,'m9'],[0,'maj9']],[[9,'m9'],[5,'maj9'],[0,'maj7'],[7,'sus']],[[0,'maj9'],[4,'m7'],[5,'maj7'],[5,'m7']]]},
    {fm:'94.2',name:'Sunset Wave',style:'wave',bpm:[96,110],swing:0,
     progs:[[[9,'m7'],[5,'maj7'],[0,'add9'],[7,'sus']],[[9,'m9'],[7,'add9'],[5,'maj7'],[7,'sus']],[[0,'add9'],[7,'add9'],[9,'m7'],[5,'maj7']]]},
    {fm:'101.7',name:'Night Jazz',style:'jazz',bpm:[84,100],swing:.3,
     progs:[[[2,'m9'],[7,'d9'],[0,'maj9'],[0,'maj7']],[[0,'maj9'],[9,'d7'],[2,'m9'],[7,'d9']],[[4,'m7'],[9,'d7'],[2,'m9'],[7,'d9']],[[5,'maj9'],[5,'m7'],[0,'maj9'],[9,'d7']]]}
  ];
  const TA=['Paper','Velvet','Neon','Slow','Golden','Quiet','Midnight','Coastal','Amber','Silver','Lazy','Hazy','Late','Soft'],
        TB=['Moons','Highway','Rain','Lights','Exit','Avenue','Drift','Summer','Window','Tide','Static','Signals','Hours','Bloom'],
        AR=['Koi Static','The Low Gears','Mira Vale','Cassette Park','North Lantern','Juno & the Tides','Slow Coast','Hotel Atlas'];

  let ac=null,master=null,dry=null,verb=null,noise=null,crackle=null,crackleG=null,timer=null;
  let on=false,st=-1,muted=false,song=null,step=0,nextT=0,vol=.65;
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
  function newSong(){
    const S=STATIONS[st],prog=pick(S.progs),key=48+Math.floor(rnd()*7)-2;   // root around C3
    song={style:S.style,swing:S.swing,bpm:S.bpm[0]+Math.floor(rnd()*(S.bpm[1]-S.bpm[0]+1)),key,prog,bars:S.style==='jazz'?56:64,bar:0,motif:null,voicing:null,title:pick(TA)+' '+pick(TB),artist:pick(AR)};
    step=0;
    if(crackleG)crackleG.gain.setTargetAtTime(S.style==='lofi'&&!muted?.035:0,ac.currentTime,.4);
    info()}
  function info(){if(R.onInfo&&song)R.onInfo('FM '+STATIONS[st].fm+' · '+STATIONS[st].name+' — “'+song.title+'” · '+song.artist)}
  function section(b,n){if(b<4)return'intro';if(b>=n-4)return'outro';const k=(b-4)/(n-8);return k<.25?'groove':k<.55?'melody':k<.68?'break':'melody'}
  // chord tones placed close to the last voicing, kept between E3 and E5
  function voice(root,type){const iv=CH[type],prev=song.voicing,notes=iv.map(i=>{let m=song.key+root+i;while(m<52)m+=12;while(m>76)m-=12;return m}).sort((a,b)=>a-b);
    if(prev){const pc=prev.reduce((a,b)=>a+b,0)/prev.length,nc=notes.reduce((a,b)=>a+b,0)/notes.length;if(nc-pc>6)notes.forEach((m,i)=>notes[i]=m-12>=48?m-12:m);if(pc-nc>6)notes.forEach((m,i)=>notes[i]=m+12<=79?m+12:m)}
    song.voicing=notes;return notes}
  const PENTA=[0,2,4,7,9];
  function scaleNote(deg){const o=Math.floor(deg/5),d=((deg%5)+5)%5;return song.key+24+o*12+PENTA[d]}
  function makeMotif(){const rh=pick([[0,6,8,12],[0,3,8],[2,6,10,14],[0,8,10],[4,6,12],[0,6,10,12,14]]);let d=Math.floor(rnd()*5)+3;
    return rh.map((s,i)=>{d+=pick([-2,-1,-1,1,1,2,0]);d=Math.max(0,Math.min(10,d));return{s,d,len:i===rh.length-1?pick([4,6,8]):2}})}

  function playStep(t){
    const n=song.bars,b=song.bar,s=step,sec=section(b,n),stepDur=60/song.bpm/4,beat=stepDur*4;
    const [root,type]=song.prog[b%song.prog.length],style=song.style;
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
  function tick(){
    if(!on||!song)return;
    const T=ac.currentTime;if(nextT<T)nextT=T+.05;
    while(nextT<T+.3){
      playStep(nextT);
      nextT+=60/song.bpm/4;step++;
      if(step>=16){step=0;song.bar++;if(song.bar>=song.bars){newSong();nextT+=1.2}}}}

  function tune(i){
    init();st=i;on=i>=0;
    const T=ac.currentTime;
    if(!on){master.gain.setTargetAtTime(0,T,.15);crackleG.gain.setTargetAtTime(0,T,.15);clearInterval(timer);timer=null;if(R.onInfo)R.onInfo('Radio off');return}
    try{ac.resume()}catch(e){}
    master.gain.cancelScheduledValues(T);master.gain.setValueAtTime(0,T);master.gain.linearRampToValueAtTime(muted?0:vol,T+.8);
    song=null;newSong();nextT=T+.1;if(!timer)timer=setInterval(tick,60)}

  R.cycle=()=>tune(st+1>=STATIONS.length?-1:st+1);
  R.setMuted=m=>{muted=!!m;if(!ac)return;const T=ac.currentTime;master.gain.setTargetAtTime(on&&!muted?vol:0,T,.1);
    crackleG.gain.setTargetAtTime(on&&!muted&&song&&song.style==='lofi'?.035:0,T,.1)};
  R.tune=i=>{if(i===st&&on)return;tune(i)};
  R.station=()=>on?st:-1;
  R.setVolume=x=>{vol=Math.max(0,Math.min(1.2,x))*1;if(ac&&on&&!muted)master.gain.setTargetAtTime(vol,ac.currentTime,.08)};   // 0..1 from the settings
  R.label=()=>on?'Radio: '+STATIONS[st].fm:'Radio: off';
  R.stations=STATIONS;
  window.Radio=R;
})(window);
