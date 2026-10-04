/* Handling test: drives every car in the garage on a flat pad with a fixed 60 Hz clock and
   prints acceleration, top speed, braking and cornering figures.
   Needs a local server on the repo root, e.g. `python3 -m http.server 8765`, then:
   node scripts/handling-test.js [carId ...]                                       */
const {chromium}=require(process.env.PW||'playwright');
const URL=process.env.URL||'http://localhost:8765/?net=local&dev=1';
(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  const p=await b.newPage({viewport:{width:900,height:600}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  // a clock we step by hand: the game's frame loop only runs when the test says so
  await p.addInitScript(()=>{try{localStorage.setItem('sl_car',JSON.stringify({id:'aster'}))}catch(e){}
    let T=0,q=[];window.__raf=q;
    window.requestAnimationFrame=f=>{q.push(f);return q.length};window.cancelAnimationFrame=()=>{};
    const pn=performance.now.bind(performance);window.__fake=false;
    Object.defineProperty(performance,'now',{value:()=>window.__fake?T:pn(),configurable:true});
    window.__tick=n=>{if(!window.__fake){T=pn();window.__fake=true}
      for(let i=0;i<n;i++){T+=1000/60;const fs=q.splice(0);fs.forEach(f=>{try{f(T)}catch(e){window.__err=String(e)}})}}});
  await p.goto(URL);
  await p.waitForFunction(()=>window.__dev&&window.THREE,null,{timeout:60000});
  await p.evaluate(()=>{__dev.R.render=function(){};
    const g=document.querySelector('#dgarage');if(g)g.classList.remove('on');
    __dev.enterDrive();__tick(5)});
  const ids=process.argv.slice(2).length?process.argv.slice(2):await p.evaluate(()=>__dev.GARAGE.map(g=>g.id));
  const rows=[];
  for(const id of ids){
    const r=await p.evaluate(id=>{document.querySelector('#dgarage').classList.remove('on');const D=__dev,c=D.chassisB,k=D.key;
      const clear=()=>{for(const x of Object.keys(k))k[x]=false};
      const sp=()=>Math.hypot(c.velocity.x,c.velocity.z)*3.6;
      const yawRate=()=>c.angularVelocity.y;
      const start=()=>{clear();D.pad();__tick(40)};
      D.setCar(id,null,true);const out={id};
      // 0-100 and top speed
      start();k.f=true;let t=0,t100=null;for(;t<40*60;t++){__tick(1);if(t100==null&&sp()>=100)t100=t/60;}
      out.t100=t100;out.top=Math.round(sp());
      // braking 100 -> 0
      start();k.f=true;for(let i=0;i<60*20&&sp()<100;i++)__tick(1);k.f=false;k.b=true;
      let z0=c.position.z,x0=c.position.x,n=0,pitch=0;const fq=new CANNON.Vec3();while(sp()>2&&n<60*15){__tick(1);n++;fq.set(0,0,1);c.quaternion.vmult(fq,fq);pitch=Math.max(pitch,Math.abs(Math.asin(fq.y))*57.3)}out.pitch=+pitch.toFixed(1);out.brake=Math.round(Math.hypot(c.position.z-z0,c.position.x-x0));k.b=false;
      // steady cornering: hold full steer at ~70 km/h for 6 s; lateral g and whether it spins
      const corner=(v)=>{start();k.f=true;for(let i=0;i<60*20&&sp()<v;i++)__tick(1);
        let maxYaw=0,latMax=0,spin=false,slipMax=0,roll=0;k.l=true;const rt=new CANNON.Vec3();
        for(let i=0;i<360;i++){k.f=sp()<v;__tick(1);const vv=c.velocity,fw=new CANNON.Vec3(0,0,1);c.quaternion.vmult(fw,fw);
          const s=Math.hypot(vv.x,vv.z)||1e-6,heading=Math.atan2(fw.x,fw.z),course=Math.atan2(vv.x,vv.z);
          let slip=Math.abs(((heading-course+Math.PI*3)%(Math.PI*2))-Math.PI)*180/Math.PI;if(s<2)slip=0;slipMax=Math.max(slipMax,slip);
          if(i>120){latMax=Math.max(latMax,Math.abs(yawRate())*s/9.81)}if(slip>35)spin=true;rt.set(1,0,0);c.quaternion.vmult(rt,rt);roll=Math.max(roll,Math.abs(Math.asin(rt.y))*57.3)}
        clear();return {lat:+latMax.toFixed(2),slip:Math.round(slipMax),spin,roll:+roll.toFixed(1),end:Math.round(sp())}};
      out.c60=corner(60);out.c110=corner(110);
      // lane change at 100: half-steer left 0.6 s, right 0.6 s, straight 2 s; residual yaw tells us how settled it is
      start();k.f=true;for(let i=0;i<60*20&&sp()<100;i++)__tick(1);
      const seq=[['l',36],['r',36],[null,120]];let slipLC=0,resid=0,j=0;
      for(const [d,f] of seq)for(let i=0;i<f;i++,j++){clear();k.f=sp()<100;if(d)k[d]=true;__tick(1);
        const vv=c.velocity,fw=new CANNON.Vec3(0,0,1);c.quaternion.vmult(fw,fw);const s=Math.hypot(vv.x,vv.z);
        if(s>2){let sl=Math.abs(((Math.atan2(fw.x,fw.z)-Math.atan2(vv.x,vv.z)+Math.PI*3)%(Math.PI*2))-Math.PI)*180/Math.PI;slipLC=Math.max(slipLC,sl)}
        if(j>72+60)resid=Math.max(resid,Math.abs(yawRate()))}
      out.lc={slip:Math.round(slipLC),resid:+resid.toFixed(2),end:Math.round(sp())};
      clear();return out},id);
    rows.push(r);console.log(JSON.stringify(r));
  }
  if(errs.length)console.log('errors',errs.slice(0,5));
  await b.close();
})();
