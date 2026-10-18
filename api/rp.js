// Same-origin relay for Radio Paradise's now-playing API, which sends no CORS headers.
// GET /api/rp?chan=0  ->  {"title":"...","artist":"..."}
module.exports=async(req,res)=>{
  const ch=String((req.query&&req.query.chan)||'0').replace(/\D/g,'').slice(0,2)||'0';
  try{
    const r=await fetch('https://api.radioparadise.com/api/now_playing?chan='+ch,{headers:{'user-agent':'sketchracer-radio'}});
    const j=await r.json();
    res.setHeader('Cache-Control','public, max-age=10, s-maxage=15, stale-while-revalidate=30');
    res.status(200).json({title:String(j.title||''),artist:String(j.artist||'')});
  }catch(e){res.setHeader('Cache-Control','no-store');res.status(502).json({title:'',artist:''})}
};
