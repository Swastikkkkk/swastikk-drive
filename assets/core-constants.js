/**
 * Core Game Constants: Vehicles, Garages, Weathers, and Particle Styles
 */
(function(window) {
  window.ACTS = [
    [.008,'day'],[.075,'day'],[.145,'day'],[.215,'day'],[.295,'rain'],
    [.395,'dusk'],[.5,'dusk'],[.575,'day'],[.65,'dusk'],[.762,'day'],
    [.845,'autumn'],[.905,'autumn'],[.962,'dusk']
  ];
  window.CHMOOD = window.ACTS.map(function(a){ return a[1]; });

  window.VEHS = {
    car: { label:'Car', engine:650, max:30.8, slip:2.4, xw:1.05, zf:1.35, zb:-1.35, r:.46, rest:.42, steer:.55, roll:.02 },
  };

  window.GARAGE = [
    {id:'aster',label:'Aster',type:'ev',blurb:'Balanced',mass:190,F:2.42,B:-2.36,W:2.3,price:0,
     V:{engine:650,max:30.8,slip:2.4,xw:1.05,zf:1.35,zb:-1.35,r:.46,rest:.42,steer:.55,roll:.02},
     paints:[0x640c0e,0x14161b,0xd9d4c6,0x27476b]},
    {id:'f1_apex',label:'F1 Apex',type:'f1',blurb:'Extreme downforce, insane cornering',mass:135,F:2.7,B:-2.3,W:2.05,price:0,
     V:{engine:980,max:44.0,slip:3.6,xw:1.15,zf:1.45,zb:-1.45,r:.38,rest:.32,steer:.75,roll:.008},
     paints:[0xbf1b1b,0x121214,0x0984e3,0x00b894,0xfdcb6e]},
    {id:'titan_suv',label:'Titan 4x4',type:'suv',blurb:'Heavy off-road suspension, rugged beast',mass:290,F:2.45,B:-2.35,W:2.38,price:0,
     V:{engine:750,max:28.5,slip:2.95,xw:1.18,zf:1.4,zb:-1.4,r:.52,rest:.52,steer:.50,roll:.032},
     paints:[0x2d3436,0x636e72,0x2e4a3a,0xd63031,0xe17055]},
    {id:'hayabusa',label:'Phantom Bike',type:'bike',blurb:'Ultra-fast, agile 2-track speed demon',mass:110,F:1.65,B:-1.55,W:1.1,price:0,
     V:{engine:860,max:41.5,slip:2.8,xw:0.42,zf:1.15,zb:-1.15,r:.36,rest:.34,steer:.78,roll:.014},
     paints:[0x0984e3,0xd63031,0x111114,0xfdcb6e,0xffffff]},
    {id:'valkyrie',label:'Valkyrie LeMans',type:'hypercar',blurb:'Active aero, extreme top speed hypercar',mass:160,F:2.55,B:-2.45,W:2.42,price:0,
     V:{engine:1050,max:46.5,slip:3.3,xw:1.18,zf:1.42,zb:-1.42,r:.42,rest:.35,steer:.68,roll:.010},
     paints:[0x111114,0x00cec9,0xe84393,0xdfe6e9,0xf39c12]},
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

  window.WEATHERS = [
    {id:'day',label:'Day',bg:0x9dc0dd,fog:[110,300],hemi:.62,sun:0xfff7e8,sunI:1.12,ground:0x5c6b44,leaf:0x39672b,part:null,slip:1,skyTop:0x4a86c6,skyBottom:0xc3d9ea,star:0,sunA:.7,terr:[1.06,1.1,.98],snow:0,water:0x2f6f8c,ridge:[.46,.53,.62]},
    {id:'dusk',label:'Dusk',bg:0x2e2418,fog:[80,240],hemi:.5,sun:0xffcf92,sunI:1.0,ground:0x3a3124,leaf:0x3d4a2c,part:null,slip:1,skyTop:0x3d4a72,skyBottom:0xd98f4e,star:.72,sunA:1,terr:[1.16,1,.82],snow:0,water:0x3c4f5e,ridge:[.3,.28,.3]},
    {id:'rain',label:'Rain',bg:0x5b656d,fog:[45,175],hemi:.52,sun:0xc3d0dc,sunI:.42,ground:0x15171a,leaf:0x27342c,part:'rain',slip:.75,skyTop:0x4d5760,skyBottom:0x707a82,star:.04,sunA:.25,terr:[.8,.88,.96],snow:0,water:0x25404e,ridge:[.16,.18,.22]},
    {id:'snow',label:'Snow',bg:0xc4cad0,fog:[38,160],hemi:.66,sun:0xffffff,sunI:.62,ground:0xd8dde1,leaf:0xdfe6ea,part:'snow',slip:.55,skyTop:0xf0f4f8,skyBottom:0xc4cad0,star:0,sunA:.5,terr:[1.02,1.04,1.08],snow:.88,water:0x5d7581,ridge:[.62,.66,.72]},
    {id:'autumn',label:'Autumn',bg:0x6a4a2c,fog:[75,240],hemi:.54,sun:0xffc082,sunI:1.02,ground:0x2a2016,leaf:0xc2561f,part:'leaves',slip:.95,skyTop:0x6c5330,skyBottom:0xb08046,star:.34,sunA:.85,terr:[1.42,1.04,.68],snow:0,water:0x3d4a44,ridge:[.3,.22,.15]},
    {id:'night',label:'Night',bg:0x070b16,fog:[64,250],hemi:.30,sun:0xbcd0f2,sunI:.42,ground:0x121722,leaf:0x1b2a22,part:null,slip:.95,skyTop:0x05080f,skyBottom:0x172542,star:1,sunA:.22,terr:[.70,.78,.98],snow:0,water:0x15273a,ridge:[.09,.12,.20]},
    {id:'overcast',label:'Overcast',bg:0x9aa3ab,fog:[70,240],hemi:.62,sun:0xdfe6ec,sunI:.55,ground:0x4d5a40,leaf:0x33502b,part:null,slip:.95,skyTop:0x7d8791,skyBottom:0xb4bcc3,star:0,sunA:.12,terr:[.92,.98,.94],snow:0,water:0x3a5666,ridge:[.4,.44,.5]},
    {id:'sunset',label:'Sunset',bg:0xc98a52,fog:[90,280],hemi:.55,sun:0xffb066,sunI:1.15,ground:0x4a3b28,leaf:0x5a5a2a,part:null,slip:1,skyTop:0x59608f,skyBottom:0xeba15e,star:.1,sunA:1,terr:[1.22,1.02,.8],snow:0,water:0x6a5a58,ridge:[.4,.29,.27]},
    {id:'storm',label:'Storm',bg:0x2b3138,fog:[30,130],hemi:.38,sun:0x8d9db0,sunI:.22,ground:0x0f1114,leaf:0x1c2820,part:'rain',slip:.62,skyTop:0x1f252b,skyBottom:0x454e56,star:0,sunA:.05,terr:[.66,.74,.82],snow:0,water:0x1b3140,ridge:[.10,.12,.15]},
    {id:'fog',label:'Fog',bg:0xb7bec2,fog:[8,85],hemi:.7,sun:0xf0f0ea,sunI:.5,ground:0x56624c,leaf:0x38553a,part:null,slip:.9,skyTop:0xc3c9cc,skyBottom:0xb7bec2,star:0,sunA:.1,terr:[.95,1,.96],snow:0,water:0x5b6f76,ridge:[.6,.63,.65]},
    {id:'sand',label:'Sandstorm',bg:0xc9a266,fog:[14,110],hemi:.6,sun:0xffe0a0,sunI:.55,ground:0x8a6f44,leaf:0x7c6a3a,part:'sand',slip:.8,skyTop:0xb8935c,skyBottom:0xd2ac6e,star:.2,sunA:.2,terr:[1.35,1.1,.72],snow:0,water:0x7a6a4a,ridge:[.55,.43,.27]},
    {id:'blizzard',label:'Blizzard',bg:0xdfe6ea,fog:[10,75],hemi:.72,sun:0xffffff,sunI:.4,ground:0xe6eaed,leaf:0xe6eef2,part:'snow',slip:.48,skyTop:0xeaf0f4,skyBottom:0xdfe6ea,star:0,sunA:.1,terr:[1.05,1.07,1.1],snow:.95,water:0x6f8794,ridge:[.7,.74,.78]},
  ];

  window.PSTYLE = {
    rain: {size:.16, fall:38, wind:0, col:0x9fb4c8},
    storm: {size:.2, fall:54, wind:9, col:0x8fa4b8},
    snow: {size:.34, fall:4, wind:0, col:0xffffff},
    blizzard: {size:.5, fall:11, wind:16, col:0xffffff},
    sand: {size:.3, fall:1.2, wind:26, col:0xd8b070},
    autumn: {size:.5, fall:3, wind:0, col:0xd0692a}
  };
})(window);
