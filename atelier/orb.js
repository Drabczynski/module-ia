/* ==========================================================================
   Orbe « Siri Sheet » — version sans dépendance, adaptée au fond clair.
   Portage du composant React fourni : même shader, mêmes états et mêmes
   transitions (idle, connecting, listening, thinking, speaking, error,
   disabled). La couleur finale est recomposée sur une base claire : bandes
   colorées dans une sphère blanche translucide, halo teinté autour.
   Usage : var orb = SiriOrb(el, { size: 168 }); orb.setState("speaking");
           orb.setLevel(fn) où fn() renvoie un niveau 0..1 ou -1 (aucun son).
   ========================================================================== */
(function () {
  "use strict";

  var STATES = ["idle", "connecting", "listening", "thinking", "speaking", "error", "disabled"];
  var ERROR_FROM = "#fb7185", ERROR_TO = "#f43f5e";

  function hexToRgb(hex) {
    var c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map(function (x) { return x + x; }).join("");
    var n = parseInt(c, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toLin(c) { var v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function toSrgb(v) { var c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.min(255, Math.max(0, c * 255)); }
  function mixRgb(a, b, t) { return [0, 1, 2].map(function (i) { return toSrgb(toLin(a[i]) + (toLin(b[i]) - toLin(a[i])) * t); }); }
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }
  function approach(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
  function wave(x) { return 0.5 - 0.5 * Math.cos(x); }

  function stateEnergy(s, t) {
    switch (s) {
      case "listening": return 0.4 + 0.32 * wave(t * 17) + 0.18 * wave(t * 8.2 + 3);
      case "speaking": return 0.3 + 0.24 * wave(t * 12.4) + 0.16 * wave(t * 6 + 1.2);
      case "thinking": return 0.24 + 0.2 * wave(t * 4.8);
      case "connecting": return 0.12 + 0.1 * wave(t * 3.2);
      case "error": return 0.2;
      default: return 0;
    }
  }
  function stateRate(s) { return s === "idle" || s === "disabled" ? 5 : s === "error" ? 10 : 14; }

  function createMix(initial) {
    var w = {};
    STATES.forEach(function (k) { w[k] = k === initial ? 1 : 0; });
    return {
      weights: w,
      update: function (state, dt) {
        var rate = stateRate(state), total = 0;
        STATES.forEach(function (k) {
          var target = k === state ? 1 : 0, next = approach(w[k], target, rate, dt);
          w[k] = target === 0 && next < 0.001 ? 0 : next;
          total += w[k];
        });
        if (total > 0) STATES.forEach(function (k) { w[k] /= total; });
        return w;
      }
    };
  }
  function blend(w, table) {
    var out = {};
    STATES.forEach(function (k) {
      if (!w[k]) return;
      var row = table[k];
      Object.keys(row).forEach(function (p) { out[p] = (out[p] || 0) + row[p] * w[k]; });
    });
    return out;
  }
  function blendEnergy(w, t) { var e = 0; STATES.forEach(function (k) { if (w[k] > 0) e += w[k] * stateEnergy(k, t); }); return e; }

  var TABLE = {
    idle: { speed: 0.3, warp: 0.52, ridge: 0.5, sharp: 0.9, zoom: 0.94, exposure: 0.9, mute: 0.12, glow: 0.12, rim: 0.55, hear: 0, voice: 0, fade: 1 },
    connecting: { speed: 0.5, warp: 0.78, ridge: 0.72, sharp: 0.95, zoom: 0.97, exposure: 0.84, mute: 0.16, glow: 0.22, rim: 0.7, hear: 0, voice: 0, fade: 1 },
    listening: { speed: 0.55, warp: 0.66, ridge: 0.7, sharp: 1, zoom: 1, exposure: 1.04, mute: 0, glow: 0.3, rim: 0.85, hear: 1, voice: 0, fade: 1 },
    thinking: { speed: 1, warp: 1, ridge: 1, sharp: 1, zoom: 1, exposure: 1, mute: 0, glow: 0.28, rim: 0.8, hear: 0, voice: 0, fade: 1 },
    speaking: { speed: 0.78, warp: 0.72, ridge: 0.9, sharp: 1, zoom: 1, exposure: 0.96, mute: 0, glow: 0.34, rim: 0.8, hear: 0, voice: 1, fade: 1 },
    error: { speed: 0.5, warp: 0.7, ridge: 0.8, sharp: 1, zoom: 0.98, exposure: 0.94, mute: 0, glow: 0.3, rim: 0.8, hear: 0, voice: 0, fade: 1 },
    disabled: { speed: 0, warp: 0.42, ridge: 0.36, sharp: 0.88, zoom: 0.93, exposure: 0.42, mute: 0.92, glow: 0, rim: 0.35, hear: 0, voice: 0, fade: 0.62 }
  };

  function rotateHue(rgb, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = 1 / 3, q = Math.sqrt(k);
    var m0 = c + (1 - c) * k, m1 = k * (1 - c) - q * s, m2 = k * (1 - c) + q * s;
    var cl = function (v) { return Math.min(255, Math.max(0, v)); };
    return [cl(rgb[0] * m0 + rgb[1] * m1 + rgb[2] * m2), cl(rgb[0] * m2 + rgb[1] * m0 + rgb[2] * m1), cl(rgb[0] * m1 + rgb[1] * m2 + rgb[2] * m0)];
  }
  function muteRgb(rgb, amt) { var l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; return mixRgb(rgb, [l, l, l], amt); }
  function unit(rgb) { return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]; }
  var WHITE = [255, 255, 255];
  function palette(from, to, mute, extra) {
    var a = muteRgb(from, mute), b = muteRgb(to, mute);
    var c = muteRgb(extra ? extra[0] : rotateHue(mixRgb(from, to, 0.35), -38), mute);
    var d = muteRgb(extra ? extra[1] : rotateHue(mixRgb(from, to, 0.65), 42), mute);
    var mid = mixRgb(a, b, 0.5);
    return { a: unit(a), b: unit(b), c: unit(c), d: unit(d), hi: unit(mixRgb(mid, WHITE, 0.82)), cool: unit(mixRgb(a, WHITE, 0.15)), warm: unit(mixRgb(d, WHITE, 0.1)), glow: unit(mid) };
  }

  var VERT = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}";

  // shader d'origine ; seule la composition finale change pour un fond clair
  var FRAG = [
    "precision highp float;",
    "uniform float uSize,uPhase,uLevel,uWarp,uRidge,uSharp,uZoom,uExposure,uGlow,uRim,uHear,uFade;",
    "uniform vec3 uColA,uColB,uColC,uColD,uHi,uCool,uWarm,uGlowCol;",
    "const float RAD=0.86;const float SOFT=0.005;",
    "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}",
    "float fbm(vec2 p){float s=0.0;float a=0.5;for(int i=0;i<4;i++){s+=a*noise(p);p=mat2(0.8,0.6,-0.6,0.8)*p*2.03;a*=0.5;}return s/0.9375;}",
    "vec2 band(vec2 q,float drift,float offset,float amp,float mainY,float env,float soft){float y=amp*env*sin(q.x*1.0+drift+offset);float d=abs(q.y-y);float line=0.018/(sqrt(d*d+soft*soft)+0.026);float bd=max(0.0,max(q.y-max(mainY,y),min(mainY,y)-q.y));float fillB=0.014/(bd*bd*5.0+0.06);return vec2(line,fillB);}",
    "vec3 sheet(vec2 p,float t){float scale=0.74+uZoom*0.34;vec2 q=p/scale;vec2 w=vec2(fbm(q*1.1+vec2(0.0,t*0.09)),fbm(q*1.1+vec2(7.7,-t*0.07)))-0.5;q+=uWarp*0.075*w;float xn=q.x;float envB=cos(1.57079633*min(abs(0.9*xn),1.0));float env=envB*envB;float low=0.5+0.5*cos(t*0.37);float mid=0.5+0.5*sin(t*0.51+1.2);float high=0.5+0.5*cos(t*0.73+2.1);float drift=t*2.4;float mainAmp=0.1+uRidge*0.17+low*0.018;float bandAmp=mainAmp+mid*0.025+high*0.018;float mainY=mainAmp*env*sin(q.x*1.1+drift);float sep=1.85+uWarp*0.12+mid*0.28;float soft=0.03/max(uSharp,0.2)+mid*0.006;",
    "vec2 b0=band(q,drift,-sep,bandAmp,mainY,env,soft);vec2 b1=band(q,drift,-sep*0.34,bandAmp,mainY,env,soft);vec2 b2=band(q,drift,sep*0.34,bandAmp,mainY,env,soft);vec2 b3=band(q,drift,sep,bandAmp,mainY,env,soft);",
    "float w0=b0.x+b0.y;float w1=b1.x+b1.y;float w2=b2.x+b2.y;float w3=b3.x+b3.y;float total=w0+w1+w2+w3;float d0=w0*w0;float d1=w1*w1;float d2=w2*w2;float d3=w3*w3;",
    "vec3 spectral=(uColA*d0+uColC*d1+uColB*d2+uColD*d3)/max(d0+d1+d2+d3,0.0001);float energy=(1.0-exp(-max(total-0.12,0.0)*0.75))*env;float md=abs(q.y-mainY);float core=exp(-md*md/(0.0028/max(uSharp,0.2)))*env;",
    "float haze=fbm(q*1.6+vec2(t*0.05,-t*0.03));vec3 atmos=mix(uColD,uColB,smoothstep(-0.7,0.7,q.y))*(0.012+0.022*haze);atmos+=mix(uColA,uColC,haze)*0.035*exp(-q.y*q.y*7.0)*haze;",
    "vec3 col=atmos+spectral*energy*1.14;col+=uHi*core*(0.2+0.1*low);col=col/(1.0+col*0.18);col=mix(col,uHi,0.06*smoothstep(0.15,1.15,dot(p,vec2(-0.32,0.78))));col*=1.0-0.3*smoothstep(-0.1,1.2,dot(p,vec2(0.45,-0.62)));return col;}",
    "float profile(float t){float d=clamp(t,0.0,1.0);return 1.0-sqrt(max(1.0-(1.0-d)*(1.0-d),0.0));}",
    "float lobe(vec2 n,vec2 dir,float cut,float power){return pow(clamp((dot(n,dir)-cut)/max(1.0-cut,0.001),0.0,1.0),power);}",
    "vec3 over(vec3 dst,vec3 src,float a){float k=clamp(a,0.0,1.0);return src*k+dst*(1.0-k);}",
    "void main(){vec2 uv=(gl_FragCoord.xy*2.0-uSize)/uSize;float r=length(uv);float ang=atan(uv.y,uv.x);float t=uPhase;",
    "float contour=uHear*uLevel*(0.011*sin(ang*3.0+t*1.9)+0.006*sin(ang*5.0-t*1.3+1.7));float rad=RAD*(1.0+contour);",
    "vec3 glowCol=uGlowCol*(0.6+0.4*uHear*uLevel);float glowAmt=uGlow*(1.0+0.9*uHear*uLevel);",
    // halo : teinte douce, alpha prémultiplié, lisible sur fond blanc
    "if(r>rad*(1.01+SOFT)){float h=glowAmt*exp(-(r-rad)*11.0)*(1.0-smoothstep(rad,0.995,r));h=clamp(h*2.2,0.0,1.0);gl_FragColor=vec4(glowCol*h,h)*uFade;return;}",
    "vec2 p=uv/rad;float pd=length(p);vec2 n=pd>0.0001?p/pd:vec2(0.0);float edge=max(1.0-pd,0.0);float prof=pow(profile(edge/0.3),0.68);vec2 rp=p-n*prof*0.5;",
    "vec3 fcol;if(prof>0.002){float split=0.12*prof;fcol=vec3(sheet(rp-n*split,t).r,sheet(rp,t).g,sheet(rp+n*split,t).b);}else{fcol=sheet(p,t);}",
    "float lum=dot(fcol,vec3(0.213,0.715,0.072));vec3 col=clamp(vec3(lum)+(fcol-vec3(lum))*1.18,0.0,1.0);",
    "float rimReact=uRim*(1.0+0.45*uHear*uLevel);float surfW=0.035+0.03*uHear*uLevel;float surf=1.0-smoothstep(0.0,surfW,edge);float optical=pow(surf,1.8);",
    "col=over(col,mix(uColA,uHi,0.5)*0.35,optical*0.1*rimReact);float coolS=lobe(n,normalize(vec2(0.84,0.54)),0.05,1.6);float warmS=lobe(n,normalize(vec2(-0.62,-0.78)),0.05,1.8);float disp=optical*0.5*rimReact;col=over(col,uCool,disp*coolS);col=over(col,uWarm,disp*warmS);",
    "col*=1.0-optical*0.12*(0.15+0.85*max(dot(n,vec2(0.45,-0.89)),0.0));float key=optical*lobe(n,normalize(vec2(-0.68,0.73)),0.2,2.8)*0.6*rimReact;float fillL=optical*lobe(n,normalize(vec2(0.74,-0.67)),0.4,3.6)*0.4*rimReact;",
    "col=over(col,mix(uHi,vec3(1.0),0.35),key);col=over(col,mix(uColC,uHi,0.55),fillL);",
    "col+=mix(uColA,uColB,0.3+0.3*sin(ang+t*0.6))*optical*0.3*uHear*uLevel;float spec=exp(-dot(p-vec2(-0.38,0.46),p-vec2(-0.38,0.46))*22.0);",
    "col=clamp(col*max(uExposure,0.0),0.0,1.0);",
    // recomposition claire : l'intensité des bandes teinte une sphère presque blanche
    "float peak=max(col.r,max(col.g,col.b));vec3 hue=col/max(peak,0.0001);float inten=smoothstep(0.06,1.0,peak);inten=inten*inten*(3.0-2.0*inten)*(1.0-smoothstep(0.62,0.95,pd));",
    "vec3 base=vec3(0.992,0.99,0.988);vec3 tint=mix(vec3(1.0),hue,0.92);vec3 light=mix(base,tint*0.99,inten*0.95);",
    "float ring=smoothstep(0.955,0.992,pd)*(1.0-smoothstep(0.992,1.01,pd));vec3 iri=mix(uColA,uColD,0.5+0.5*dot(n,normalize(vec2(-0.7,0.7))));",
    "light=mix(light,mix(iri,vec3(0.72),0.35),0.55*ring);light=mix(light,vec3(1.0),0.35*(1.0-smoothstep(0.0,0.75,pd))*(1.0-inten));",
    "light=clamp(light,0.0,1.0);",
    "float ballA=1.0-smoothstep(0.99-SOFT,1.01+SOFT,pd);float outside=smoothstep(rad-SOFT,rad+SOFT,r);",
    "float h=clamp(glowAmt*exp(-max(r-rad,0.0)*11.0)*(1.0-smoothstep(rad,0.995,r))*outside*2.2,0.0,1.0);",
    "vec3 outc=light*ballA+glowCol*h*(1.0-ballA);float a=clamp(max(ballA,h),0.0,1.0);gl_FragColor=vec4(outc,a)*uFade;}"
  ].join("\n");

  var U = ["uSize", "uPhase", "uLevel", "uWarp", "uRidge", "uSharp", "uZoom", "uExposure", "uGlow", "uRim", "uHear", "uFade", "uColA", "uColB", "uColC", "uColD", "uHi", "uCool", "uWarm", "uGlowCol"];

  window.SiriOrb = function (host, opts) {
    opts = opts || {};
    var size = opts.size || 168, speed = opts.speed == null ? 1 : opts.speed;
    var colorFrom = opts.colorFrom || "#34e0f2", colorTo = opts.colorTo || "#ff7a59";
    var extra = opts.colorFrom ? null : [hexToRgb("#ff8fb8"), hexToRgb("#ffb23f")];   // rose et ambre
    var state = opts.state || "idle", levelFn = null;
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    host.classList.add("orb");
    host.style.width = host.style.height = size + "px";
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", opts.label || "Assistant pédagogique");
    host.dataset.state = state;

    var canvas = document.createElement("canvas");
    canvas.style.width = canvas.style.height = size + "px";
    host.appendChild(canvas);
    var gl = null;
    try { gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" }); } catch (e) { gl = null; }

    var draw = null;
    if (gl) draw = setupGL();
    if (!draw) {                                        // secours sans WebGL
      canvas.remove();
      var fb = document.createElement("div");
      fb.className = "orb-fallback";
      fb.style.cssText = "position:absolute;inset:7%;border-radius:50%;background:radial-gradient(ellipse 70% 16% at 50% 50%," + colorFrom + " 0%,transparent 70%),radial-gradient(ellipse 85% 34% at 50% 52%," + colorTo + "55 0%,transparent 70%),radial-gradient(circle at 34% 28%,#fff,transparent 40%),#f4f5fa;box-shadow:inset 0 0 0 1.5px " + colorTo + "55;transform:scaleY(calc(1 + var(--orb-level,0) * .06))";
      host.appendChild(fb);
    }

    function setupGL() {
      function compile(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
      var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG), prog = gl.createProgram();
      if (!vs || !fs) return null;
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);
      var dpr = Math.min(window.devicePixelRatio || 1, 2), px = Math.max(1, Math.round(size * dpr));
      canvas.width = canvas.height = px;
      gl.viewport(0, 0, px, px);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      var loc = {};
      U.forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
      gl.uniform1f(loc.uSize, px);
      var set3 = function (n, v) { gl.uniform3f(loc[n], v[0], v[1], v[2]); };
      var errF = hexToRgb(ERROR_FROM), errT = hexToRgb(ERROR_TO);
      return function (frame, sheet) {
        var p = blend(frame.weights, TABLE), level = clamp01(frame.level), voice = p.voice * level;
        var from = mixRgb(hexToRgb(colorFrom), errF, frame.weights.error), to = mixRgb(hexToRgb(colorTo), errT, frame.weights.error);
        var pal = palette(from, to, clamp01(p.mute), extra && frame.weights.error < 0.5 ? extra : null);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(loc.uPhase, sheet);
        gl.uniform1f(loc.uLevel, level);
        gl.uniform1f(loc.uWarp, p.warp * 3.2 + 0.85 * voice);
        gl.uniform1f(loc.uRidge, p.ridge + 0.35 * voice + 0.25 * p.hear * level);
        gl.uniform1f(loc.uSharp, p.sharp * 0.75);
        gl.uniform1f(loc.uZoom, p.zoom);
        gl.uniform1f(loc.uExposure, p.exposure * 1.9 * (1 + 0.12 * voice + 0.1 * p.hear * level));
        gl.uniform1f(loc.uGlow, p.glow * 0.22);
        gl.uniform1f(loc.uRim, p.rim);
        gl.uniform1f(loc.uHear, p.hear);
        gl.uniform1f(loc.uFade, p.fade);
        set3("uColA", pal.a); set3("uColB", pal.b); set3("uColC", pal.c); set3("uColD", pal.d);
        set3("uHi", pal.hi); set3("uCool", pal.cool); set3("uWarm", pal.warm); set3("uGlowCol", pal.glow);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
    }

    // boucle d'animation : suspendue hors écran ou onglet masqué
    var mix = createMix(state), frame = { weights: mix.weights, level: 0, phase: 0 }, sheetPhase = 1.7, lastPhase = 0;
    var raf = 0, last = null, visible = true;
    function tick(now) {
      raf = 0;
      var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      mix.update(state, dt);
      var dPhase = reduced ? 0 : dt * speed;
      frame.phase += dPhase;
      var live = levelFn ? levelFn() : -1;
      var target = reduced ? 0 : live >= 0 ? live : blendEnergy(mix.weights, frame.phase);
      frame.level = approach(frame.level, target, target > frame.level ? 14 : 4, dt);
      var p = blend(mix.weights, TABLE);
      sheetPhase += Math.max(0, frame.phase - lastPhase) * p.speed * (1 + 0.7 * p.voice * clamp01(frame.level));
      lastPhase = frame.phase;
      host.style.setProperty("--orb-level", frame.level.toFixed(3));
      if (draw) draw(frame, sheetPhase);
      if (visible && !(reduced && mix.weights[state] > 0.999)) raf = requestAnimationFrame(tick);
      else last = null;
    }
    function wake() { if (!raf && visible) raf = requestAnimationFrame(tick); }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visible = e[e.length - 1].isIntersecting && document.visibilityState === "visible"; if (visible) wake(); }).observe(host);
    document.addEventListener("visibilitychange", function () { visible = document.visibilityState === "visible"; if (visible) wake(); });
    wake();

    return {
      el: host,
      setState: function (s) { if (STATES.indexOf(s) < 0 || s === state) return; state = s; host.dataset.state = s; wake(); },
      getState: function () { return state; },
      setLevel: function (fn) { levelFn = fn; wake(); }
    };
  };
})();
