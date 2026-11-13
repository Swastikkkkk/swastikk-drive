/* Big-screen UI scale.
   The HUD, menus and panels are sized in px for a ~1080p screen, so on a 1440p / 4K monitor or TV they shrank to
   a sliver in the corners. Above 1920x1080 every overlay (never the 3D canvas or the track-drawing canvas) gets
   CSS zoom = min(w/1920, h/1080), capped at 2.5. Overlays set --vz to the same factor so vw/vh lengths in the CSS
   (written as calc(Nvw / var(--vz,1))) still mean the real viewport. Only used where the browser has
   standardized zoom (rects and pointer events in screen px); anywhere else the UI just stays at 1x. */
(function(){
  window.UIZ = 1;
  var ok = false;
  try {
    if (window.CSS && CSS.supports && CSS.supports('zoom', '2')) {
      var p = document.createElement('div');
      p.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;zoom:2';
      document.documentElement.appendChild(p);
      ok = Math.abs(p.getBoundingClientRect().width - 20) < 0.5;
      p.remove();
    }
  } catch (e) {}
  if (!ok) return;

  var st = document.createElement('style');
  st.textContent =
    'html.uiz body>*:not(#drive):not(script):not(style):not(canvas):not(#dload),' +
    'html.uiz #drive>*:not(canvas):not(style):not(#dcirc){zoom:var(--uiz);--vz:var(--uiz)}';
  document.head.appendChild(st);

  var root = document.documentElement, last = 0;
  function apply(){
    var w = window.innerWidth, h = window.innerHeight;
    var z = Math.min(w / 1920, h / 1080);
    z = z > 1.04 ? Math.min(2.5, Math.round(z * 20) / 20) : 1;
    if (z === last) return;
    last = z; window.UIZ = z;
    root.style.setProperty('--uiz', String(z));
    root.classList.toggle('uiz', z > 1);
    try { window.dispatchEvent(new CustomEvent('uiscale', { detail: z })); } catch (e) {}
  }
  apply();
  window.addEventListener('resize', apply);
})();
