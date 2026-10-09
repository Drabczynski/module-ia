/* ==========================================================================
   Sphère de cristal de l'accueil.
   - Verre (WebGL) : le fond apparaît retourné et agrandi comme dans une vraie
     boule de cristal, dispersion des couleurs au bord, nébuleuse rose en volume,
     reflets irisés, halo. Sans WebGL : verre laiteux dessiné en canvas 2D.
   - Maillage (canvas 2D) : arêtes lumineuses d'une triangulation irrégulière,
     impulsions de lumière qui courent d'arête en arête, galaxie de poussière
     qui tourne au cœur, éclats, reflets d'objectif, halo lumineux (bloom).
   - Mise en scène : la sphère se construit (arêtes qui se tracent, poussière qui
     converge, éclair, onde de choc) ; on la fait tourner à la souris (avec élan),
     un clic envoie une onde à sa surface ; elle s'anime davantage pendant la voix.
   Usage : var s = CrystalScene(); parent.appendChild(s.el);
           chaque image : s.render(maintenant, cx, cy, R, parole 0..1) ;
           s.intro() relance la construction ; s.kick() donne une impulsion.
   ========================================================================== */
(function () {
  "use strict";

  function rnd(seed) {
    var a = seed | 0;
    return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function randSphere(n, r) {
    var pts = [];
    while (pts.length < n) {
      var u = r() * 2 - 1, th = r() * 6.283, q = Math.sqrt(1 - u * u), p = [q * Math.cos(th), u, q * Math.sin(th)];
      // pas deux sommets collés : des triangles irréguliers mais lisibles
      if (pts.every(function (o) { return Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) > .26; })) pts.push(p);
    }
    return pts;
  }
  function onSphere(n, r) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      // répartition régulière (Fibonacci) puis bousculée : un maillage fin, sans trous
      var y = 1 - 2 * (i + .5) / n, q = Math.sqrt(1 - y * y), th = i * 2.399963, j = 1.5 / Math.sqrt(n);
      var p = [Math.cos(th) * q + (r() - .5) * j, y + (r() - .5) * j, Math.sin(th) * q + (r() - .5) * j];
      var l = Math.hypot(p[0], p[1], p[2]); pts.push([p[0] / l, p[1] / l, p[2] / l]);
    }
    return pts;
  }
  // triangulation de Delaunay sur la sphère = enveloppe convexe ; on ne garde que les arêtes
  function hullEdges(P, near) {
    var n = P.length, nb = [], seen = {}, edges = [];
    for (var i = 0; i < n; i++) {
      nb.push([]);
      for (var j = 0; j < n; j++) if (j !== i && Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]) < near) nb[i].push(j);
    }
    for (i = 0; i < n; i++) {
      var L = nb[i];
      for (var x = 0; x < L.length; x++) for (var y = x + 1; y < L.length; y++) {
        var b = L[x], c = L[y];
        if (b < i || c < i) continue;
        var a = P[i], u = [P[b][0] - a[0], P[b][1] - a[1], P[b][2] - a[2]], v = [P[c][0] - a[0], P[c][1] - a[1], P[c][2] - a[2]];
        var nr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (nr[0] * a[0] + nr[1] * a[1] + nr[2] * a[2] < 0) nr = [-nr[0], -nr[1], -nr[2]];
        var ok = true;
        for (var m = 0; m < L.length && ok; m++) {
          if (L[m] === b || L[m] === c) continue;
          var p = P[L[m]];
          if (nr[0] * (p[0] - a[0]) + nr[1] * (p[1] - a[1]) + nr[2] * (p[2] - a[2]) > 1e-9) ok = false;
        }
        if (!ok) continue;
        [[i, b], [i, c], [b, c]].forEach(function (e) {
          var key = Math.min(e[0], e[1]) + "-" + Math.max(e[0], e[1]);
          if (!seen[key]) { seen[key] = 1; edges.push([e[0], e[1]]); }
        });
      }
    }
    return edges;
  }
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var easeOut = function (x) { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };

  /* ---------- le verre, en WebGL ---------- */
  var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
    "uniform vec2 uRes,uC,uLight;uniform float uR,uT,uA,uSpeak,uFlash,uGlass;uniform mat3 uRot;",
    "float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}",
    "float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);",
    " return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),",
    "            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}",
    "float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}",
    // le fond de la page, recalculé pour la réfraction (même dégradé que .wl-bg)
    "vec3 bg(vec2 uv){",
    " vec3 c=mix(vec3(.863,.843,.894),vec3(.698,.651,.839),smoothstep(0.,.38,uv.x));",
    " c=mix(c,vec3(.690,.427,.690),smoothstep(.38,.68,uv.x));c=mix(c,vec3(.851,.502,.533),smoothstep(.68,1.,uv.x));",
    " c=mix(c,vec3(.933,.922,.945),(1.-smoothstep(0.,.42,length((uv-vec2(.04,.58))*vec2(1.,.75))))*.85);",
    " c=mix(c,vec3(.541,.208,.635),(1.-smoothstep(0.,.45,length((uv-vec2(.7,1.04))*vec2(1.,.9))))*.8);",
    " c=mix(c,vec3(.878,.478,.502),(1.-smoothstep(0.,.5,length(uv-vec2(1.04,.22))))*.8);",
    " c=mix(c,vec3(.561,.533,.8),(1.-smoothstep(0.,.45,length(uv-vec2(.24,-.04))))*.7);",
    " return c;}",
    "void main(){",
    " vec2 q=(gl_FragCoord.xy-uC)/uR;float rr=length(q),aa=1.5/uR;",
    " vec3 hc=vec3(1.,.86,.98);",
    " float d=max(rr-1.,0.);",
    " float halo=(exp(-d*5.)*(.26+.22*uSpeak)*uGlass+uFlash*exp(-d*1.6)*.6)*smoothstep(1.-aa,1.+aa,rr);",
    " if(rr>1.+aa){gl_FragColor=vec4(hc*halo,halo)*uA;return;}",
    " float z=sqrt(max(0.,1.-rr*rr));vec3 n=vec3(q,z);float fres=pow(1.-z,2.2);",
    " vec2 cuv=uC/uRes,off=-q*uR/uRes*.82*(1.-.3*fres);",
    // boule de verre : image retournée, dispersion sur le bord
    " vec3 refr=vec3(bg(cuv+off*1.07).r,bg(cuv+off).g,bg(cuv+off*.93).b);",
    " float neb=0.;",
    " for(int i=0;i<5;i++){float zz=z-(float(i)+.5)*(2.*z/5.);vec3 pp=uRot*vec3(q,zz);",
    "  float f=fbm(pp*1.7+vec3(0.,uT*.06,uT*.035));",
    "  float sw=sin(atan(pp.z,pp.x)*2.+length(pp.xz)*6.5-uT*.5+f*4.);",
    "  neb+=smoothstep(.58,1.08,f+.26*sw);}",
    " neb/=5.;",
    " vec3 col=mix(refr*.97,vec3(.97,.94,.99),.24);",
    " col+=neb*vec3(1.,.42,.86)*(.42+.5*uSpeak);",
    " col=mix(col,vec3(1.,.97,1.),fres*.42);",
    " col+=(.5+.5*cos(6.2831*(fres*1.4+vec3(0.,.33,.67))+uT*.35))*fres*.24;",
    " vec3 L=normalize(vec3(-.45+uLight.x,.55-uLight.y,.72));float l=max(dot(n,L),0.);",
    " col+=pow(l,14.)*.08;",
    " col+=uFlash*.4;",
    " float a=(1.-smoothstep(1.-aa,1.+aa,rr))*uGlass;",
    " vec4 o=vec4(col*a,a)+vec4(hc*halo,halo)*(1.-a);",
    " gl_FragColor=o*uA;}"
  ].join("\n");

  function makeGL(canvas) {
    var gl = null;
    try { gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ["uRes", "uC", "uLight", "uR", "uT", "uA", "uSpeak", "uFlash", "uGlass", "uRot"].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
    return { gl: gl, U: U };
  }

  window.CrystalScene = function () {
    var r = rnd(11);
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* géométrie */
    var big = randSphere(40, r), bigE = hullEdges(big, 1.5);
    var fine = onSphere(190, r), fineE = hullEdges(fine, .62);
    bigE.forEach(function (e) {
      var k = r();
      e.push(k < .3 ? .35 : k < .75 ? .7 : 1);                                  // éclat propre à chaque arête
      e.push(.12 + 1.15 * clamp((1 - (big[e[0]][1] + big[e[1]][1]) / 2) / 2, 0, 1) + r() * .2);   // ordre de tracé, du haut vers le bas
    });
    fineE.forEach(function (e) { e.push(.8 + r() * .9); });
    var adj = big.map(function () { return []; });
    bigE.forEach(function (e, i) { adj[e[0]].push(i); adj[e[1]].push(i); });

    // poussière : galaxie en spirale (rotation différentielle) et paillettes roses dans le volume
    var dust = [];
    for (var i = 0; i < 1500; i++) {
      var arm = i % 3, s = Math.pow(r(), .7);
      dust.push({ g: 1, ang: arm * 2.094 + s * 5.2 + (r() - .5) * .9, rad: .06 + s * .62, h: (r() - .5) * .1 * (1 - s * .5), sz: r() < .12 ? 1.7 : 1.05, c: i % 4 ? "#ffffff" : "#c9fff4", dl: .1 + r() * .9, far: 2.2 + r() * 2.4, sp: (r() - .5) * 3 });
    }
    for (i = 0; i < 520; i++) {
      var u = r() * 2 - 1, th = r() * 6.283, q = Math.sqrt(1 - u * u), rr = Math.cbrt(r()) * .96;
      dust.push({ g: 0, p: [q * Math.cos(th) * rr, u * rr, q * Math.sin(th) * rr], sz: r() < .2 ? 1.6 : 1, c: "#ff9fe0", dl: .1 + r() * .9, far: 2.2 + r() * 2.4, sp: (r() - .5) * 3 });
    }

    /* calques */
    var el = document.createElement("div");
    el.className = "wl-canvas crystal";
    var cvG = document.createElement("canvas"), cv = document.createElement("canvas");
    el.appendChild(cvG); el.appendChild(cv);
    [cvG, cv].forEach(function (c) { c.style.cssText = "position:absolute;inset:0;width:100%;height:100%"; });
    var ctx = cv.getContext("2d");
    var glow = document.createElement("canvas"), gx = glow.getContext("2d");
    var glowB = document.createElement("canvas"), gbx = glowB.getContext("2d");
    var hasFilter = typeof gbx.filter === "string";
    var GL = makeGL(cvG);
    if (!GL) cvG.style.display = "none";

    /* état */
    var W = 0, H = 0, dpr = 1, dprG = 1;
    var yaw = .4, pitch = .32, spin = 0, vy = 0, vp = 0, tiltX = 0, tiltY = 0, mtx = 0, mty = 0;
    var mx = -9999, my = -9999, last = 0, tPrev = 0, t0 = performance.now() / 1000, introAt = -99, flash = 0, kickAt = -99;
    var ripples = [], rings = [], sparks = [], pulses = [];
    var drag = null, cur = { cx: 0, cy: 0, R: 0 }, alive = 0;
    var M = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    function size() {
      var w = el.clientWidth, h = el.clientHeight, d = Math.min(2, window.devicePixelRatio || 1), dg = Math.min(1.5, d);
      if (w === W && h === H && d === dpr) return;
      W = w; H = h; dpr = d; dprG = dg;
      cv.width = Math.round(w * d); cv.height = Math.round(h * d);
      cvG.width = Math.round(w * dg); cvG.height = Math.round(h * dg);
      glow.width = glowB.width = Math.max(1, Math.round(w / 4)); glow.height = glowB.height = Math.max(1, Math.round(h / 4));
    }

    /* interaction : tourner à la souris, onde au clic */
    function inSphere(x, y) { return cur.R > 20 && Math.hypot(x - cur.cx, y - cur.cy) < cur.R * 1.05; }
    function active() { return performance.now() - alive < 250; }
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      mtx = (e.clientY / window.innerHeight - .5); mty = (e.clientX / window.innerWidth - .5);
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(8, e.timeStamp - drag.ts) / 1000;
        yaw += dx * .006; pitch = clamp(pitch + dy * .006, -1.2, 1.2);
        vy = dx * .006 / dt; vp = dy * .006 / dt;
        drag.x = e.clientX; drag.y = e.clientY; drag.ts = e.timeStamp; drag.moved += Math.abs(dx) + Math.abs(dy);
      }
      if (active()) document.documentElement.classList.toggle("crystal-hover", !!drag || inSphere(mx, my));
    });
    window.addEventListener("pointerdown", function (e) {
      if (!active() || !inSphere(e.clientX, e.clientY) || e.target.closest("button, a, input, textarea")) return;
      drag = { x: e.clientX, y: e.clientY, ts: e.timeStamp, t: e.timeStamp, moved: 0 };
      document.documentElement.classList.add("crystal-drag");
    });
    window.addEventListener("pointerup", function (e) {
      if (!drag) return;
      if (drag.moved < 6 && e.timeStamp - drag.t < 350) poke(e.clientX, e.clientY, 1);
      drag = null;
      document.documentElement.classList.remove("crystal-drag");
    });

    function viewToObj(v) { return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; }
    function poke(x, y, k) {
      var px = (x - cur.cx) / cur.R, py = (y - cur.cy) / cur.R, d2 = px * px + py * py;
      if (d2 > 1) { var l = Math.sqrt(d2); px /= l; py /= l; d2 = 1; }
      var t = now();
      ripples.push({ d: viewToObj([px, py, Math.sqrt(1 - d2)]), t: t, k: k });
      if (ripples.length > 5) ripples.shift();
      flash = Math.max(flash, .35 * k);
      rings.push({ t: t, k: k * .7 });
      for (var i = 0; i < 46; i++) {
        var a = Math.random() * 6.283, v = (120 + Math.random() * 320) * k;
        sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: t, life: .5 + Math.random() * .6, c: Math.random() < .5 ? "255,255,255" : "255,150,225" });
      }
      for (i = 0; i < 6; i++) spawnPulse();
    }
    function now() { return performance.now() / 1000 - t0; }

    /* impulsions de lumière le long des arêtes */
    function spawnPulse() {
      var e = (Math.random() * bigE.length) | 0;
      pulses.push({ e: e, dir: Math.random() < .5 ? 0 : 1, s: 0, hops: 3 + (Math.random() * 6 | 0), sp: 1.1 + Math.random() * 1.2 });
    }

    function rotM() {
      var ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(pitch + tiltX), sb = Math.sin(pitch + tiltX);
      // matrice objet -> vue, rangée ligne par ligne
      M = [ca, 0, sa, sa * sb, cb, -ca * sb, -sa * cb, sb, ca * cb];
    }
    function toView(p) { return [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]]; }

    // ondes à la surface : déplacement radial d'un sommet, et intensité lumineuse
    function wave(p, t) {
      var dsp = 0, lit = 0;
      for (var i = 0; i < ripples.length; i++) {
        var R0 = ripples[i], age = t - R0.t;
        if (age < 0 || age > 2.4) continue;
        var ang = Math.acos(clamp(p[0] * R0.d[0] + p[1] * R0.d[1] + p[2] * R0.d[2], -1, 1));
        var g = Math.exp(-Math.pow((ang - age * 2.3) * 3.2, 2)) * Math.exp(-age * 1.5) * R0.k;
        dsp += .085 * g; lit += g;
      }
      return [dsp, lit];
    }

    function project(P, t, intro, out) {
      for (var i = 0; i < P.length; i++) {
        var w = wave(P[i], t), k = 1 + w[0] + .006 * Math.sin(t * 1.3 + i);
        var v = toView([P[i][0] * k, P[i][1] * k, P[i][2] * k]), f = 1 / (1 - v[2] * .1);
        out[i] = [cur.cx + v[0] * cur.R * f, cur.cy + v[1] * cur.R * f, v[2], w[1]];
      }
      return out;
    }
    var PB = [], PF = [];

    function render(nowMs, cx, cy, R, speak) {
      alive = performance.now();
      size();
      var t = nowMs / 1000 - t0, dt = clamp(t - (tPrev || t), 0, .05); tPrev = t;
      cur.cx = cx; cur.cy = cy; cur.R = R;
      speak = speak || 0;

      /* mouvement */
      if (!drag) {
        yaw += (reduce ? .05 : .13) * dt + vy * dt + spin * dt;
        pitch = clamp(pitch + vp * dt, -1.2, 1.2);
        vy *= Math.exp(-2.2 * dt); vp *= Math.exp(-2.2 * dt); spin *= Math.exp(-1.6 * dt);
        pitch += (.32 - pitch) * (1 - Math.exp(-.5 * dt));                  // revient doucement à son inclinaison
      }
      tiltX += (mtx * .35 - tiltX) * (1 - Math.exp(-3 * dt));
      tiltY += (mty * .5 - tiltY) * (1 - Math.exp(-3 * dt));
      yaw += (tiltY - (render.ty || 0)); render.ty = tiltY;
      rotM();
      flash *= Math.exp(-4.2 * dt);

      var ia = t - introAt;                                            // âge de la construction
      var glassA = reduce ? 1 : clamp((ia - .3) / 1.3, 0, 1);
      if (ia > 1.75 && ia - dt <= 1.75) {                               // la sphère est formée : éclair et onde
        flash = 1; rings.push({ t: t, k: 1 });
        ripples.push({ d: viewToObj([0, 0, 1]), t: t, k: 1.2 });
        for (var n0 = 0; n0 < 10; n0++) spawnPulse();
      }

      /* verre */
      if (GL) {
        var gl = GL.gl, U = GL.U;
        gl.viewport(0, 0, cvG.width, cvG.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.uRes, cvG.width, cvG.height);
        gl.uniform2f(U.uC, cx * dprG, cvG.height - cy * dprG);
        gl.uniform1f(U.uR, R * dprG);
        gl.uniform1f(U.uT, t);
        gl.uniform1f(U.uA, 1);
        gl.uniform1f(U.uGlass, glassA);
        gl.uniform1f(U.uSpeak, speak);
        gl.uniform1f(U.uFlash, flash);
        gl.uniform2f(U.uLight, tiltY * .6, tiltX * .6);
        gl.uniformMatrix3fv(U.uRot, false, new Float32Array(M));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      gx.setTransform(.25, 0, 0, .25, 0, 0);
      gx.clearRect(0, 0, W, H);
      if (R < 4) return;
      var gk = clamp(R / 260, .3, 1);                                    // lueur proportionnée à la taille

      if (!GL) {                                                        // verre de secours
        ctx.globalAlpha = glassA;
        var hg = ctx.createRadialGradient(cx, cy, R * .85, cx, cy, R * 1.35);
        hg.addColorStop(0, "rgba(255,225,250,.3)"); hg.addColorStop(1, "rgba(255,225,250,0)");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, 6.283); ctx.fill();
        var bg = ctx.createRadialGradient(cx - R * .25, cy - R * .3, R * .1, cx, cy, R);
        bg.addColorStop(0, "rgba(255,246,252,.2)"); bg.addColorStop(.7, "rgba(246,226,246,.3)"); bg.addColorStop(1, "rgba(255,236,252,.62)");
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1;
      }

      project(big, t, ia, PB); project(fine, t, ia, PF);
      var mxs = mx, mys = my, hov = inSphere(mxs, mys) ? 1 : 0;

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      // arêtes : retour de la construction (part tracée) et intensité
      function grow(e) { return reduce ? 1 : easeOut((ia - e[3]) / .5); }
      function edgeSet(P, E, front, alpha, w, isBig, toGlow) {
        for (var i = 0; i < E.length; i++) {
          var e = E[i], a = P[e[0]], b = P[e[1]], z = (a[2] + b[2]) / 2;
          if ((z > 0) !== front) continue;
          var g = reduce ? 1 : isBig ? grow(e) : clamp((ia - e[2]) / .8, 0, 1);
          if (g <= 0) continue;
          var k = isBig ? e[2] : 1, al = front ? alpha * k * (.55 + .45 * z) : alpha * k * (.6 + .4 * (1 + z));
          al *= 1 + .6 * Math.pow(1 - Math.abs(z), 3);                    // le bord accroche la lumière
          al *= 1 + (a[3] + b[3]) * 1.6 + speak * .35;                   // onde et voix
          if (front && hov) {                                             // près du curseur
            var dm = Math.hypot((a[0] + b[0]) / 2 - mxs, (a[1] + b[1]) / 2 - mys) / cur.R;
            al *= 1 + 1.3 * Math.exp(-dm * dm / .06);
          }
          var ex = a[0] + (b[0] - a[0]) * g, ey = a[1] + (b[1] - a[1]) * g;
          ctx.globalAlpha = Math.min(1, al); ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(ex, ey); ctx.stroke();
          if (toGlow) { gx.globalAlpha = Math.min(1, al * .9); gx.lineWidth = 9 * gk; gx.beginPath(); gx.moveTo(a[0], a[1]); gx.lineTo(ex, ey); gx.stroke(); }
          if (isBig && g < 1 && g > 0) {                                   // pointe qui trace l'arête
            ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, 6.283); ctx.fill();
            gx.globalAlpha = 1; gx.fillStyle = "#fff"; gx.beginPath(); gx.arc(ex, ey, 16 * gk, 0, 6.283); gx.fill();
          }
        }
      }
      ctx.strokeStyle = gx.strokeStyle = "#fff4fc";
      edgeSet(PF, fineE, false, .1, .8, false, false);
      edgeSet(PB, bigE, false, .22, 1.1, true, false);

      /* poussière */
      var spinG = t * .16, gca = Math.cos(tiltY * .8 + .25), gsa = Math.sin(tiltY * .8 + .25), gcb = Math.cos(tiltX * .8 - .15), gsb = Math.sin(tiltX * .8 - .15);
      // la galaxie garde sa face vers le lecteur ; la souris la fait pivoter un peu
      function gal(p) { var x = p[0] * gca + p[2] * gsa, z = -p[0] * gsa + p[2] * gca; return [x, p[1] * gcb - z * gsb, p[1] * gsb + z * gcb]; }
      for (var i = 0; i < dust.length; i++) {
        var d = dust[i], p;
        if (d.g) {
          var an = d.ang + spinG / (d.rad + .25), gx0 = Math.cos(an) * d.rad, gz0 = Math.sin(an) * d.rad;
          p = [gx0, d.h * .5 - gz0 * .87, d.h * .87 + gz0 * .5];          // disque penché vers le lecteur
        } else {
          var dr = t * .05;
          p = [d.p[0] * Math.cos(dr) - d.p[2] * Math.sin(dr), d.p[1], d.p[0] * Math.sin(dr) + d.p[2] * Math.cos(dr)];
        }
        var v = d.g ? gal(p) : toView(p), f = 1 / (1 - v[2] * .1);
        var sx = cx + v[0] * R * f, sy = cy + v[1] * R * f;
        var e = reduce ? 1 : easeOut((ia - d.dl) / 1.2);
        if (e < 1) {                                                     // arrive de loin, en spirale
          var far = d.far * (1 - e), ang2 = d.sp * (1 - e);
          var ox = v[0] * (1 + far), oy = v[1] * (1 + far);
          sx = cx + (ox * Math.cos(ang2) - oy * Math.sin(ang2)) * R;
          sy = cy + (ox * Math.sin(ang2) + oy * Math.cos(ang2)) * R;
        }
        var dep = (v[2] + 1) / 2;
        ctx.globalAlpha = ((d.g ? .55 : .3) + .45 * dep) * (e < 1 ? .4 + .6 * e : 1) * (1 + speak * .3);
        ctx.fillStyle = d.c;
        var sz = d.sz * (.9 + .6 * dep) * Math.max(.8, R / 300);
        ctx.fillRect(sx, sy, sz, sz);
      }

      edgeSet(PF, fineE, true, .26, .8, false, false);
      ctx.strokeStyle = "rgba(255,200,245,1)";
      edgeSet(PB, bigE, true, .26, 4.5, true, false);
      ctx.strokeStyle = gx.strokeStyle = "#ffffff";
      edgeSet(PB, bigE, true, .95, 1.4, true, true);

      /* impulsions */
      var want = reduce ? 4 : Math.round(16 + 46 * speak);
      if (ia > 1.75 || reduce) while (pulses.length < want) spawnPulse();
      for (i = pulses.length - 1; i >= 0; i--) {
        var pu = pulses[i], ed = bigE[pu.e], A0 = big[ed[pu.dir]], B0 = big[ed[1 - pu.dir]];
        var len = Math.hypot(A0[0] - B0[0], A0[1] - B0[1], A0[2] - B0[2]);
        pu.s += dt * pu.sp * (1 + speak * .8) / Math.max(.3, len);
        if (pu.s >= 1) {
          pu.hops--;
          if (pu.hops <= 0 || pulses.length > want + 4) { pulses.splice(i, 1); continue; }
          var vtx = ed[1 - pu.dir], opts = adj[vtx].filter(function (x) { return x !== pu.e; });
          pu.e = opts[(Math.random() * opts.length) | 0]; pu.dir = bigE[pu.e][0] === vtx ? 0 : 1; pu.s = 0;
          continue;
        }
        var pa = PB[ed[pu.dir]], pb = PB[ed[1 - pu.dir]], zz = pa[2] + (pb[2] - pa[2]) * pu.s;
        if (zz < -.15) continue;
        var hx = pa[0] + (pb[0] - pa[0]) * pu.s, hy = pa[1] + (pb[1] - pa[1]) * pu.s, s0 = Math.max(0, pu.s - .35);
        var tx0 = pa[0] + (pb[0] - pa[0]) * s0, ty0 = pa[1] + (pb[1] - pa[1]) * s0, fa = clamp(.4 + zz, 0, 1);
        var gr = ctx.createLinearGradient(tx0, ty0, hx, hy);
        gr.addColorStop(0, "rgba(255,190,240,0)"); gr.addColorStop(1, "rgba(255,255,255," + fa + ")");
        ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.globalAlpha = fa; ctx.beginPath(); ctx.arc(hx, hy, 2.3, 0, 6.283); ctx.fill();
        gx.globalAlpha = fa; gx.fillStyle = "#ffd6f5"; gx.beginPath(); gx.arc(hx, hy, 18 * gk, 0, 6.283); gx.fill();
      }

      /* éclats aux sommets */
      for (i = 0; i < big.length; i += 2) {
        var vv = PB[i];
        if (vv[2] < .1) continue;
        var tw = (.5 + .5 * Math.sin(t * 1.7 + i * 1.3)) * vv[2] * (reduce ? 1 : clamp(ia - 1.3, 0, 1)) + vv[3] * 1.5, x = vv[0], y = vv[1], rr2 = 3 + 8 * tw;
        if (tw < .05) continue;
        var sg = ctx.createRadialGradient(x, y, 0, x, y, rr2);
        sg.addColorStop(0, "rgba(255,255,255," + Math.min(1, .75 * tw) + ")"); sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, rr2, 0, 6.283); ctx.fill();
        if (tw > .5) {                                                   // petite croix d'étoile
          ctx.globalAlpha = (tw - .5) * .8; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x - rr2 * 2.2, y); ctx.lineTo(x + rr2 * 2.2, y); ctx.moveTo(x, y - rr2 * 2.2); ctx.lineTo(x, y + rr2 * 2.2); ctx.stroke();
        }
      }

      /* liseré irisé */
      ctx.globalCompositeOperation = "source-over";
      var rimA = reduce ? 1 : clamp((ia - .2) / 1, 0, 1);
      ctx.globalAlpha = rimA;
      ctx.lineWidth = 2.2; ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(cx, cy, R, -1.6, -1.6 + 6.283 * rimA); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,140,220,.35)"; ctx.beginPath(); ctx.arc(cx + 1.5, cy, R + 2, -1.6, -1.6 + 6.283 * rimA); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(150,200,255,.3)"; ctx.beginPath(); ctx.arc(cx - 1.5, cy, R - 2.5, -1.6, -1.6 + 6.283 * rimA); ctx.stroke();
      gx.globalAlpha = .5 * rimA; gx.lineWidth = 10 * gk; gx.strokeStyle = "#ffe0f6"; gx.beginPath(); gx.arc(cx, cy, R, 0, 6.283); gx.stroke();

      ctx.globalCompositeOperation = "lighter";
      /* reflets d'objectif, qui suivent la lumière */
      var Lx = cx + R * (-.42 + tiltY * .6), Ly = cy + R * (-.5 + tiltX * .6);
      [[.55, .16, "190,255,170", .16], [1.25, .07, "255,170,235", .2], [1.9, .26, "170,210,255", .08], [2.6, .11, "255,240,180", .12]].forEach(function (g) {
        var fx = Lx + (cx - Lx) * g[0] * 2, fy = Ly + (cy - Ly) * g[0] * 2, fr = R * g[1];
        var lg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
        lg.addColorStop(0, "rgba(" + g[2] + "," + g[3] * glassA + ")"); lg.addColorStop(.6, "rgba(" + g[2] + "," + g[3] * .45 * glassA + ")"); lg.addColorStop(1, "rgba(" + g[2] + ",0)");
        ctx.globalAlpha = 1; ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(fx, fy, fr, 0, 6.283); ctx.fill();
      });
      var st = ctx.createLinearGradient(Lx - R * .9, Ly, Lx + R * .9, Ly);       // traînée horizontale
      st.addColorStop(0, "rgba(255,230,250,0)"); st.addColorStop(.5, "rgba(255,240,252," + .22 * glassA + ")"); st.addColorStop(1, "rgba(255,230,250,0)");
      ctx.fillStyle = st; ctx.fillRect(Lx - R * .9, Ly - 1.2, R * 1.8, 2.4);

      /* ondes de choc */
      for (i = rings.length - 1; i >= 0; i--) {
        var ag = t - rings[i].t;
        if (ag > 1.4) { rings.splice(i, 1); continue; }
        var rr3 = R * (1 + easeOut(ag / 1.4) * 1.1), ra = (1 - ag / 1.4) * .7 * rings[i].k;
        ctx.globalAlpha = ra; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5 * (1 - ag / 1.4) + .5;
        ctx.beginPath(); ctx.arc(cx, cy, rr3, 0, 6.283); ctx.stroke();
        gx.globalAlpha = ra; gx.lineWidth = 14; gx.strokeStyle = "#ffd8f4"; gx.beginPath(); gx.arc(cx, cy, rr3, 0, 6.283); gx.stroke();
      }
      /* étincelles */
      for (i = sparks.length - 1; i >= 0; i--) {
        var sp = sparks[i], sa = t - sp.t;
        if (sa > sp.life) { sparks.splice(i, 1); continue; }
        var dmp = (1 - Math.exp(-2.6 * sa)) / 2.6, px2 = sp.x + sp.vx * dmp, py2 = sp.y + sp.vy * dmp;
        var tail = .03, qx = sp.x + sp.vx * Math.max(0, dmp - tail), qy = sp.y + sp.vy * Math.max(0, dmp - tail), fa2 = 1 - sa / sp.life;
        ctx.globalAlpha = fa2; ctx.strokeStyle = "rgb(" + sp.c + ")"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px2, py2); ctx.stroke();
        gx.globalAlpha = fa2 * .8; gx.fillStyle = "rgb(" + sp.c + ")"; gx.beginPath(); gx.arc(px2, py2, 8, 0, 6.283); gx.fill();
      }

      /* halo lumineux (bloom) : le calque de lueur, flouté puis ajouté */
      gbx.setTransform(1, 0, 0, 1, 0, 0);
      gbx.clearRect(0, 0, glowB.width, glowB.height);
      if (hasFilter) gbx.filter = "blur(3px)";
      gbx.globalAlpha = 1; gbx.drawImage(glow, 0, 0);
      if (hasFilter) gbx.filter = "none";
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (.85 + .4 * speak + flash * .5) * (.45 + .55 * gk);
      ctx.drawImage(glowB, 0, 0, W, H);
      if (flash > .02) {                                                 // éclair
        var fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
        fg.addColorStop(0, "rgba(255,245,252," + .42 * flash + ")"); fg.addColorStop(1, "rgba(255,245,252,0)");
        ctx.globalAlpha = 1; ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.6, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }

    return {
      el: el,
      render: render,
      intro: function () { introAt = now(); ripples = []; rings = []; sparks = []; pulses = []; spin = 2.2; },
      kick: function () { spin = 5; poke(cur.cx, cur.cy, 1.3); },
      release: function () { document.documentElement.classList.remove("crystal-hover", "crystal-drag"); drag = null; }
    };
  };
})();
