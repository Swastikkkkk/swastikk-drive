/* Combustion engine sound, built from the engine itself rather than from oscillators.
   Every cylinder fires at its real crank angle (so a cross-plane V8 burbles, an inline-6 is smooth,
   a V10 screams). Each firing is a short pressure pulse plus a burst of noise, sent down one exhaust
   pipe per bank: a delay line with an inverting reflection, then a muffler made of resonant filters
   and a little saturation. Intake roar rides on top. Lifting off at high revs pops and crackles,
   and the fuel cut (rev limiter, gear changes) drops the firing pulses to almost nothing.
   No sound files: the DSP runs in an AudioWorklet, or a ScriptProcessor where worklets aren't allowed.
   window.EngineAudio.create(ctx, destination) -> {setCar(id), set(rpm, load, cut, vol, overrun, soft)}.
   window.EngineAudio.CARS holds each car's engine and gearbox. */
(function(window){
  'use strict';

  /* ---- the DSP; self-contained because its source is also shipped into the worklet ---- */
  function EngineDSP(sr){
    this.sr=sr;this.c=null;
    this.rpm=800;this.tRpm=800;this.load=0;this.tLoad=0;this.cut=0;this.ovr=0;this.tOvr=0;this.vol=0;this.tVol=0;this.soft=0;this.tSoft=0;
    this.cyc=0;this.nEnv=0;this.pop=0;this.pl=0;this.lift=0;this.dcx=0;this.dcy=0;this.ix1=0;this.ix2=0;this.iy1=0;this.iy2=0;
    this.bank=[0,1].map(function(){return{p1:0,p2:0,imp:0,n:0,d:new Float32Array(8192),w:0,lp:0}});
    this.eq=[];this.lp1=0;this.lp2=0;
  }
  EngineDSP.prototype.setCar=function(c){
    var sr=this.sr,eq=[],i;
    // RBJ peaking filters for the muffler body
    for(i=0;i<c.eq.length;i++){var f=c.eq[i][0],q=c.eq[i][1],A=Math.pow(10,c.eq[i][2]/40),w=2*Math.PI*f/sr,al=Math.sin(w)/(2*q),cs=Math.cos(w),a0=1+al/A;
      eq.push({b0:(1+al*A)/a0,b1:-2*cs/a0,b2:(1-al*A)/a0,a1:-2*cs/a0,a2:(1-al/A)/a0,x1:0,x2:0,y1:0,y2:0})}
    this.eq=eq;
    // intake: bandpass around the airbox resonance
    {var w2=2*Math.PI*(c.intakeHz||1800)/sr,al2=Math.sin(w2)/(2*1.2),a02=1+al2;
     this.ib={b0:al2/a02,b2:-al2/a02,a1:-2*Math.cos(w2)/a02,a2:(1-al2)/a02}}
    this.lpa=1-Math.exp(-2*Math.PI*c.lp/sr);
    this.pipeN=c.pipes.map(function(p){return Math.max(2,Math.min(8000,Math.round(p[0]*sr/1000)))});
    this.cyl=c.fire.map(function(x){return{a:x[0]/720,b:x[1]||0,g:x[2]==null?1:x[2]}});
    this.drive=c.drive;this.norm=1/Math.tanh(c.drive);
    if(!this.c){this.rpm=this.tRpm=c.idle}
    this.c=c;
  };
  EngineDSP.prototype.set=function(rpm,load,cut,vol,ovr,soft){this.tRpm=rpm;this.tLoad=load;this.cut=cut;this.tVol=vol;this.tOvr=ovr||0;this.tSoft=soft||0};
  EngineDSP.prototype.process=function(out,n){
    var c=this.c,i,k;if(!c){for(i=0;i<n;i++)out[i]=0;return}
    var sr=this.sr,B=this.bank,cyl=this.cyl,nc=cyl.length,eq=this.eq,ne=eq.length,ib=this.ib;
    var rs=1-Math.exp(-1/(.012*sr)),ls=1-Math.exp(-1/(.02*sr)),vs=1-Math.exp(-1/(.05*sr));
    // pulse width is set in crank degrees, so it shortens as the revs climb, like a real exhaust valve event
    var degS=60/Math.max(200,this.rpm)/360,tau=Math.max(.00035,c.tau*degS),pa=Math.exp(-1/(tau*sr)),pk=(1-pa),
        imp=2.718/(1-pa),na=Math.exp(-1/(Math.max(.0002,tau*.7)*sr)),popA=Math.exp(-1/(.035*sr)),
        rN=Math.min(1.2,this.rpm/c.red),idleRough=1+Math.max(0,1-rN*2.5)*1.5;
    for(i=0;i<n;i++){
      this.lift=this.tLoad<.1?this.lift+1/sr:0;this.rpm+=(this.tRpm-this.rpm)*rs;this.load+=(this.tLoad-this.load)*ls;this.vol+=(this.tVol-this.vol)*vs;this.ovr+=(this.tOvr-this.ovr)*vs;this.soft+=(this.tSoft-this.soft)*vs*.2;
      var prev=this.cyc,cy=prev+this.rpm/120/sr,wrap=cy>=1;if(wrap)cy-=1;this.cyc=cy;
      for(k=0;k<nc;k++){var C=cyl[k];
        if(wrap?(C.a>prev||C.a<=cy):(C.a>prev&&C.a<=cy)){
          // closed throttle fires weak, even pulses; braking cuts the fuel on the overrun, so it goes quieter still
          var ld=this.load,amp=C.g*(.13+.87*ld)*(1+c.rough*(idleRough*.6+ld*.4)*(Math.random()-.5)*2)*(1-.6*this.ovr);
          if(this.cut>.5)amp*=.1;
          // overrun: a few pops in the first second or so after lifting, then it settles
          else if(ld<.1&&this.ovr<.3&&rN>.4&&Math.random()<c.crackle*rN*.18*Math.exp(-this.lift/.9)){amp*=2+Math.random()*1.6;this.pop+=.15+Math.random()*.2}
          var bk=B[C.b];bk.imp+=amp*imp;bk.n+=amp*c.noise}}
      var mix=0,pulse=0;
      for(k=0;k<2;k++){var b=B[k],N=this.pipeN[k];if(N==null)continue;
        b.p1+=pk*(b.imp-b.p1);b.p2+=pk*(b.p1-b.p2);b.imp=0;b.n*=na;
        var s=b.p2+(Math.random()*2-1)*b.n;pulse+=b.p2;
        // exhaust pipe: open end reflects inverted, a little damped
        var r=b.w-N;if(r<0)r+=8192;b.lp+=(b.d[r]-b.lp)*c.damp;
        var y=s-c.pipes[k][1]*b.lp;b.d[b.w]=y;b.w=(b.w+1)&8191;mix+=y}
      this.pop*=popA;this.pl+=((Math.random()*2-1)*this.pop-this.pl)*.22;mix+=this.pl*1.8;   // the pop's noise is darkened: a bang, not a hiss
      // DC blocker: the pulses only push one way
      var dc=mix-this.dcx+.996*this.dcy;this.dcx=mix;this.dcy=dc;var x=dc;
      for(k=0;k<ne;k++){var e=eq[k],yv=e.b0*x+e.b1*e.x1+e.b2*e.x2-e.a1*e.y1-e.a2*e.y2;e.x2=e.x1;e.x1=x;e.y2=e.y1;e.y1=yv;x=yv}
      // intake roar, breathing with the firing pulses
      if(c.intake){var iw=(Math.random()*2-1)*(.25+Math.min(2,pulse*.6))*this.load*Math.min(.8,rN)*c.intake*.5*(1-.75*this.soft),
          iy=ib.b0*iw+ib.b2*this.ix2-ib.a1*this.iy1-ib.a2*this.iy2;this.ix2=this.ix1;this.ix1=iw;this.iy2=this.iy1;this.iy1=iy;x+=iy}
      var lpa=this.lpa*(1-.6*this.soft);this.lp1+=(x-this.lp1)*lpa;this.lp2+=(this.lp1-this.lp2)*lpa;   // cruising: a darker, rounder tone
      out[i]=Math.tanh(this.lp2*c.gain*.35*this.drive)*this.norm*this.vol}
  };

  /* ---- the cars ----
     fire: [crank angle 0-720, exhaust bank 0/1, cylinder level]   idle/red: rpm
     tau: pulse width in crank degrees   noise: combustion noise   rough: firing-to-firing variation
     pipes: [length ms, reflection] per bank   damp: pipe damping   eq: muffler [Hz, Q, dB]   lp: top end
     drive: saturation   intake: airbox roar   crackle: pops on the overrun   gain: level match
     gears, first: top speed fraction 1st gear reaches at the limiter   shift: seconds the clutch is in
     turbo: whistle level (with blow-off), turboHz */
  var even=function(n,banks,gains){var o=[];for(var i=0;i<n;i++)o.push([i*720/n,banks?i%2:0,gains?gains[i%gains.length]:1]);return o};
  // cross-plane V8, firing order 1-8-4-3-6-5-7-2, odd cylinders on the left bank: the uneven gaps per bank are the burble
  var XV8=[[0,0,1],[90,1,.86],[180,1,.93],[270,0,.9],[360,1,.88],[450,0,.97],[540,0,.92],[630,1,.84]];
  var CARS={
    outlaw:     {fire:XV8,idle:620,red:6200,tau:44,noise:.32,rough:.22,pipes:[[6.2,.52],[6.9,.52]],damp:.38,eq:[[78,1,7],[260,1.1,4]],lp:2900,drive:2.7,intake:.32,intakeHz:950,crackle:.14,gain:.9,gears:4,first:.24,shift:.24},
    kestrel:    {fire:even(4,0,[1,.93,.97,.9]),idle:850,red:7800,tau:34,noise:.22,rough:.1,pipes:[[3.4,.45]],damp:.5,eq:[[170,1,4],[1300,1.2,3]],lp:5200,drive:1.6,intake:.3,intakeHz:1900,crackle:.03,gain:1.2,gears:5,first:.22,shift:.22},
    ridgeback:  {fire:[[0,0,1],[144,0,.9],[288,0,.96],[432,0,.88],[576,0,.94]],idle:750,red:6800,tau:38,noise:.25,rough:.12,pipes:[[4.6,.5]],damp:.45,eq:[[130,1,5],[850,1,3]],lp:3900,drive:1.8,intake:.25,intakeHz:1500,crackle:.04,gain:1.3,gears:5,first:.2,shift:.25,turbo:.04,turboHz:1500},
    mamba:      {fire:XV8,idle:700,red:6600,tau:40,noise:.3,rough:.16,pipes:[[5.6,.5],[6.3,.5]],damp:.4,eq:[[95,1,6],[320,1.2,3]],lp:3200,drive:2.4,intake:.3,intakeHz:1100,crackle:.08,gain:.85,gears:6,first:.18,shift:.2},
    f1apex:     {fire:even(10,1,[1,.95,.98,.92,.97]),idle:4200,red:18500,tau:30,noise:.18,rough:.06,pipes:[[1.1,.35],[1.25,.35]],damp:.6,eq:[[1700,1.3,5],[3600,2,3]],lp:9500,drive:1.8,intake:.35,intakeHz:2600,crackle:.05,gain:1.25,gears:8,first:.2,shift:.05},
    titan4x4:   {fire:XV8,idle:650,red:5600,tau:46,noise:.28,rough:.18,pipes:[[6.8,.5],[7.4,.5]],damp:.35,eq:[[80,1,6],[220,1.1,4]],lp:2500,drive:2,intake:.25,intakeHz:900,crackle:.03,gain:.95,gears:4,first:.25,shift:.35},
    phantombike:{fire:even(4,0,[1,.94,.98,.91]),idle:1300,red:14500,tau:28,noise:.25,rough:.1,pipes:[[1.9,.42]],damp:.55,eq:[[550,1.2,4],[2300,1.5,4]],lp:7500,drive:2,intake:.55,intakeHz:2200,crackle:.07,gain:1.05,gears:6,first:.2,shift:.06},
    valkyrie:   {fire:even(12,1,[1,.95,.98,.93]),idle:1000,red:11100,tau:30,noise:.2,rough:.06,pipes:[[1.6,.38],[1.75,.38]],damp:.55,eq:[[900,1,4],[2600,1.6,4]],lp:8500,drive:1.7,intake:.35,intakeHz:2400,crackle:.05,gain:1.35,gears:7,first:.19,shift:.08},
    rx7spirit:  {fire:[[0,0,1],[180,0,.9],[360,0,1],[540,0,.9]],idle:900,red:9000,tau:18,noise:.5,rough:.25,pipes:[[2.6,.45]],damp:.5,eq:[[650,1.4,5],[2000,2,4]],lp:6500,drive:2.6,intake:.3,intakeHz:2000,crackle:.12,gain:0.75,gears:5,first:.22,shift:.18,turbo:.03,turboHz:1700},
    skyline:    {fire:[[0,0,1],[120,1,.95],[240,0,.97],[360,1,.92],[480,0,.98],[600,1,.94]],idle:900,red:8000,tau:32,noise:.22,rough:.08,pipes:[[3,.45],[3.3,.45]],damp:.5,eq:[[240,1,3],[1500,1.3,4]],lp:6000,drive:1.7,intake:.3,intakeHz:1800,crackle:.06,gain:1.3,gears:6,first:.19,shift:.18,turbo:.06,turboHz:1600},
    countach:   {fire:even(12,1,[1,.94,.98,.92]),idle:900,red:7500,tau:36,noise:.24,rough:.08,pipes:[[2.4,.42],[2.6,.42]],damp:.5,eq:[[380,1,4],[1700,1.3,3]],lp:6500,drive:2,intake:.4,intakeHz:1600,crackle:.06,gain:1.55,gears:5,first:.22,shift:.25},
    truck:      {fire:[[0,0,1],[120,0,.93],[240,0,.97],[360,0,.9],[480,0,.98],[600,0,.92]],idle:600,red:2100,tau:22,noise:.55,rough:.2,pipes:[[9,.45]],damp:.3,eq:[[70,1,6],[180,1,3],[2400,2,3]],lp:3600,drive:2,intake:.2,intakeHz:1200,crackle:0,gain:0.8,gears:10,first:.08,shift:.45,turbo:.06,turboHz:900},
    classicmini:{fire:even(4,0,[1,.9,.96,.88]),idle:900,red:6500,tau:38,noise:.3,rough:.2,pipes:[[3.2,.48]],damp:.45,eq:[[300,1.2,4],[1200,1.5,4]],lp:4200,drive:2.2,intake:.3,intakeHz:1500,crackle:.05,gain:0.85,gears:4,first:.25,shift:.3},
    gt40:       {fire:XV8,idle:900,red:7000,tau:36,noise:.3,rough:.12,pipes:[[3.8,.5],[4.2,.5]],damp:.45,eq:[[120,1,5],[500,1.2,3]],lp:4500,drive:2.6,intake:.35,intakeHz:1300,crackle:.1,gain:.85,gears:5,first:.21,shift:.22}
  };

  /* ---- worklet / fallback plumbing ---- */
  var SRC=EngineDSP.toString()+';EngineDSP.prototype.setCar='+EngineDSP.prototype.setCar.toString()+
    ';EngineDSP.prototype.set='+EngineDSP.prototype.set.toString()+';EngineDSP.prototype.process='+EngineDSP.prototype.process.toString()+
    ';registerProcessor("engine-dsp",class extends AudioWorkletProcessor{constructor(){super();this.d=new EngineDSP(sampleRate);'+
    'this.port.onmessage=e=>{const m=e.data;if(m.car)this.d.setCar(m.car);if(m.s)this.d.set(m.s[0],m.s[1],m.s[2],m.s[3],m.s[4],m.s[5])}}'+
    'process(i,o){const ch=o[0];this.d.process(ch[0],ch[0].length);for(let k=1;k<ch.length;k++)ch[k].set(ch[0]);return true}})';

  function create(ac,dest){
    var api={car:null,ready:false,node:null,send:null,
      setCar:function(id){var c=CARS[id];if(!c||api.car===id)return c;api.car=id;if(api.send)api.send({car:c});return c},
      set:function(rpm,load,cut,vol,ovr,soft){if(api.send)api.send({s:[rpm,load,cut?1:0,vol,ovr||0,soft||0]})}};
    function fallback(){
      if(api.node)return;
      var d=new EngineDSP(ac.sampleRate),sp=ac.createScriptProcessor(1024,0,1);
      sp.onaudioprocess=function(e){d.process(e.outputBuffer.getChannelData(0),e.outputBuffer.length)};
      sp.connect(dest);api.node=sp;
      api.send=function(m){if(m.car)d.setCar(m.car);if(m.s)d.set(m.s[0],m.s[1],m.s[2],m.s[3],m.s[4],m.s[5])};
      if(api.car)d.setCar(CARS[api.car]);api.ready=true}
    try{
      if(!ac.audioWorklet||typeof AudioWorkletNode==='undefined')throw 0;
      var url=URL.createObjectURL(new Blob([SRC],{type:'application/javascript'}));
      ac.audioWorklet.addModule(url).then(function(){
        if(api.node)return;
        var node=new AudioWorkletNode(ac,'engine-dsp',{numberOfInputs:0,outputChannelCount:[1]});
        node.connect(dest);api.node=node;api.send=function(m){node.port.postMessage(m)};
        if(api.car)api.send({car:CARS[api.car]});api.ready=true
      }).catch(fallback)
    }catch(e){fallback()}
    return api}

  window.EngineAudio={CARS:CARS,create:create,EngineDSP:EngineDSP};
})(window);
