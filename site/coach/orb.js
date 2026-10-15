/* ==========================================================================
   Orbe « Siri Sheet » — version sans dépendance, adaptée au fond clair.
   Portage du composant React fourni : même shader, mêmes états et mêmes
   transitions (idle, connecting, listening, thinking, speaking, error,
   disabled). La couleur finale est recomposée sur une base claire : bandes
   colorées dans une sphère blanche translucide, halo teinté autour.
   Usage : const orb = new Orb(element, { size: 168, style }); orb.setState("speaking");   (style "glass" : bille de verre bleu-violet)
           orb.setLevel(fonction) où fonction() renvoie un niveau 0..1 ou -1 (aucun son).
   ========================================================================== */

const STATES = ["idle", "connecting", "listening", "thinking", "speaking", "error", "disabled"];
const ERROR_FROM = "#fb7185";
const ERROR_TO = "#f43f5e";
const WHITE = [255, 255, 255];

const hexToRgb = (hex) => {
  let digits = hex.replace("#", "");
  if (digits.length === 3) digits = digits.split("").map((digit) => digit + digit).join("");
  const value = parseInt(digits, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const toLinear = (channel) => { const unit = channel / 255; return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4; };
const toSrgb = (linear) => { const channel = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055; return Math.min(255, Math.max(0, channel * 255)); };
const mixRgb = (from, to, ratio) => [0, 1, 2].map((index) => toSrgb(toLinear(from[index]) + (toLinear(to[index]) - toLinear(from[index])) * ratio));
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const approach = (current, target, rate, delta) => current + (target - current) * (1 - Math.exp(-rate * delta));
const wave = (value) => 0.5 - 0.5 * Math.cos(value);

const stateEnergy = (state, time) => {
  switch (state) {
    case "listening": return 0.4 + 0.32 * wave(time * 17) + 0.18 * wave(time * 8.2 + 3);
    case "speaking": return 0.3 + 0.24 * wave(time * 12.4) + 0.16 * wave(time * 6 + 1.2);
    case "thinking": return 0.24 + 0.2 * wave(time * 4.8);
    case "connecting": return 0.12 + 0.1 * wave(time * 3.2);
    case "error": return 0.2;
    default: return 0;
  }
};
const stateRate = (state) => (state === "idle" || state === "disabled" ? 5 : state === "error" ? 10 : 14);

const createMix = (initial) => {
  const weights = {};
  STATES.forEach((state) => { weights[state] = state === initial ? 1 : 0; });
  return {
    weights,
    update(state, delta) {
      const rate = stateRate(state);
      let total = 0;
      STATES.forEach((key) => {
        const target = key === state ? 1 : 0;
        const next = approach(weights[key], target, rate, delta);
        weights[key] = target === 0 && next < 0.001 ? 0 : next;
        total += weights[key];
      });
      if (total > 0) STATES.forEach((key) => { weights[key] /= total; });
      return weights;
    }
  };
};
const blend = (weights, table) => {
  const output = {};
  STATES.forEach((state) => {
    if (!weights[state]) return;
    const row = table[state];
    Object.keys(row).forEach((property) => { output[property] = (output[property] || 0) + row[property] * weights[state]; });
  });
  return output;
};
const blendEnergy = (weights, time) => {
  let energy = 0;
  STATES.forEach((state) => { if (weights[state] > 0) energy += weights[state] * stateEnergy(state, time); });
  return energy;
};

const TABLE = {
  idle: { speed: 0.3, warp: 0.52, ridge: 0.5, sharp: 0.9, zoom: 0.94, exposure: 0.9, mute: 0.12, glow: 0.12, rim: 0.55, hear: 0, voice: 0, fade: 1 },
  connecting: { speed: 0.5, warp: 0.78, ridge: 0.72, sharp: 0.95, zoom: 0.97, exposure: 0.84, mute: 0.16, glow: 0.22, rim: 0.7, hear: 0, voice: 0, fade: 1 },
  listening: { speed: 0.55, warp: 0.66, ridge: 0.7, sharp: 1, zoom: 1, exposure: 1.04, mute: 0, glow: 0.3, rim: 0.85, hear: 1, voice: 0, fade: 1 },
  thinking: { speed: 1, warp: 1, ridge: 1, sharp: 1, zoom: 1, exposure: 1, mute: 0, glow: 0.28, rim: 0.8, hear: 0, voice: 0, fade: 1 },
  speaking: { speed: 0.78, warp: 0.72, ridge: 0.9, sharp: 1, zoom: 1, exposure: 0.96, mute: 0, glow: 0.34, rim: 0.8, hear: 0, voice: 1, fade: 1 },
  error: { speed: 0.5, warp: 0.7, ridge: 0.8, sharp: 1, zoom: 0.98, exposure: 0.94, mute: 0, glow: 0.3, rim: 0.8, hear: 0, voice: 0, fade: 1 },
  disabled: { speed: 0, warp: 0.42, ridge: 0.36, sharp: 0.88, zoom: 0.93, exposure: 0.42, mute: 0.92, glow: 0, rim: 0.35, hear: 0, voice: 0, fade: 0.62 }
};

const rotateHue = (rgb, degrees) => {
  const angle = degrees * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle), third = 1 / 3, root = Math.sqrt(third);
  const m0 = cosine + (1 - cosine) * third;
  const m1 = third * (1 - cosine) - root * sine;
  const m2 = third * (1 - cosine) + root * sine;
  const clamp255 = (value) => Math.min(255, Math.max(0, value));
  return [clamp255(rgb[0] * m0 + rgb[1] * m1 + rgb[2] * m2), clamp255(rgb[0] * m2 + rgb[1] * m0 + rgb[2] * m1), clamp255(rgb[0] * m1 + rgb[1] * m2 + rgb[2] * m0)];
};
const muteRgb = (rgb, amount) => { const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; return mixRgb(rgb, [luma, luma, luma], amount); };
const unit = (rgb) => [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
const palette = (from, to, mute, extra) => {
  const colorA = muteRgb(from, mute);
  const colorB = muteRgb(to, mute);
  const colorC = muteRgb(extra ? extra[0] : rotateHue(mixRgb(from, to, 0.35), -38), mute);
  const colorD = muteRgb(extra ? extra[1] : rotateHue(mixRgb(from, to, 0.65), 42), mute);
  const middle = mixRgb(colorA, colorB, 0.5);
  return { a: unit(colorA), b: unit(colorB), c: unit(colorC), d: unit(colorD), hi: unit(mixRgb(middle, WHITE, 0.82)), cool: unit(mixRgb(colorA, WHITE, 0.15)), warm: unit(mixRgb(colorD, WHITE, 0.1)), glow: unit(middle) };
};

const VERT = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}";

const NOISE = [
  "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
  "float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}",
  "float fbm(vec2 p){float s=0.0;float a=0.5;for(int i=0;i<4;i++){s+=a*noise(p);p=mat2(0.8,0.6,-0.6,0.8)*p*2.03;a*=0.5;}return s/0.9375;}"
].join("\n");

// shader d'origine ; seule la composition finale change pour un fond clair
const FRAG = [
  "precision highp float;",
  "uniform float uSize,uPhase,uLevel,uWarp,uRidge,uSharp,uZoom,uExposure,uGlow,uRim,uHear,uFade;",
  "uniform vec3 uColA,uColB,uColC,uColD,uHi,uCool,uWarm,uGlowCol;",
  "uniform vec2 uLook;",
  "const float RAD=0.86;const float SOFT=0.005;",
  NOISE,
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
  "vec3 fcol;if(prof>0.002){float split=0.12*prof;fcol=vec3(sheet(rp-uLook-n*split,t).r,sheet(rp-uLook,t).g,sheet(rp-uLook+n*split,t).b);}else{fcol=sheet(p-uLook,t);}",
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
  "light=mix(light,iri,0.45*ring);light=mix(light,vec3(1.0),0.35*(1.0-smoothstep(0.0,0.75,pd))*(1.0-inten));",
  "light=clamp(light,0.0,1.0);",
  "float ballA=1.0-smoothstep(0.99-SOFT,1.01+SOFT,pd);float outside=smoothstep(rad-SOFT,rad+SOFT,r);",
  "float h=clamp(glowAmt*exp(-max(r-rad,0.0)*11.0)*(1.0-smoothstep(rad,0.995,r))*outside*2.2,0.0,1.0);",
  "vec3 outc=light*ballA+glowCol*h*(1.0-ballA);float a=clamp(max(ballA,h),0.0,1.0);gl_FragColor=vec4(outc,a)*uFade;}"
].join("\n");

// style "glass" : une bille de verre bleu-violet (nuages lents à l'intérieur, liseré lavande en haut, lumière cyan en bas, halo bleu dessous) ;
// sa sphère est plus petite que le canevas (GLASS_SPHERE) pour laisser la place au halo ; uActive : 0 au repos, 1 quand elle parle, écoute ou réfléchit
const GLASS_FRAG = [
  "precision highp float;",
  "uniform float uSize,uPhase,uLevel,uActive;",
  "uniform vec2 uLook;",
  "const float R=0.74;const vec2 C=vec2(0.0,0.06);",
  NOISE,
  "void main(){vec2 uv=(gl_FragCoord.xy*2.0-uSize)/uSize;vec2 p=(uv-C)/R;float d=length(p);float aa=3.0/(uSize*R);",
  "vec2 g=(uv-vec2(0.0,C.y-R*0.92))/vec2(R*0.9,R*0.3);float halo=exp(-dot(g,g)*1.4)*(0.4+0.3*uLevel+0.1*uActive);",
  "float ring=exp(-max(d-1.0,0.0)*R*14.0)*(0.2+0.25*uLevel)*step(1.0,d);vec3 haloCol=vec3(0.36,0.6,1.0);",
  "float glowA=clamp(halo*0.6+ring,0.0,1.0);float ball=1.0-smoothstep(1.0-aa,1.0+aa,d);",
  "if(ball<=0.0){gl_FragColor=vec4(haloCol*glowA,glowA);return;}",
  "float z=sqrt(max(1.0-d*d,0.0));float t=uPhase;vec2 q=p*(1.15-0.3*z)-uLook*0.5;",
  "float c1=fbm(q*1.5+vec2(t*0.12,-t*0.08));float c2=fbm(q*2.6+vec2(-t*0.07,t*0.1)+c1*1.3);",
  "vec3 deep=vec3(0.19,0.11,0.88);vec3 mid=vec3(0.31,0.2,1.0);vec3 violet=vec3(0.52,0.4,1.0);vec3 cyan=vec3(0.45,0.8,1.0);",
  "vec3 col=mix(deep,mid,smoothstep(0.2,0.8,c1));col=mix(col,violet,smoothstep(0.5,0.9,c2)*(0.2+0.2*smoothstep(-0.6,0.9,p.y)));",
  "col=mix(col,violet,smoothstep(0.0,1.0,p.y)*0.45);",
  "float low=pow(1.0-z,1.6)*smoothstep(0.1,-0.95,p.y);col=mix(col,cyan,clamp(low*1.5,0.0,1.0));",
  "col+=cyan*0.25*exp(-pow((p.y+0.85)*3.0,2.0))*(0.6+0.6*uLevel);",
  "float fres=pow(1.0-z,3.0);vec2 dir=p/max(d,0.0001);float tl=smoothstep(-0.3,1.0,dot(dir,vec2(-0.5,0.85)));",
  "col=mix(col,vec3(0.9,0.88,1.0),clamp(fres*(0.3+0.85*tl),0.0,1.0));vec2 s=p-vec2(-0.32,0.45);col+=vec3(0.9,0.9,1.0)*exp(-dot(s,s)*7.0)*0.16;",
  "col=clamp(col*(1.0+0.2*uLevel+0.05*uActive),0.0,1.0);",
  "gl_FragColor=vec4(col*ball+haloCol*glowA*(1.0-ball),ball+glowA*(1.0-ball));}"
].join("\n");
const GLASS_UNIFORMS = ["uSize", "uPhase", "uLevel", "uActive", "uLook"];
// la sphère dans le canevas, en part de sa taille : rayon et décalage vertical du centre (négatif : vers le haut) ; orb-face.js y pose les yeux
const SHEET_SPHERE = { radius: 0.43, offsetY: 0 };
const GLASS_SPHERE = { radius: 0.37, offsetY: -0.03 };

const UNIFORMS = ["uLook", "uSize", "uPhase", "uLevel", "uWarp", "uRidge", "uSharp", "uZoom", "uExposure", "uGlow", "uRim", "uHear", "uFade", "uColA", "uColB", "uColC", "uColD", "uHi", "uCool", "uWarm", "uGlowCol"];

// Sphère animée (WebGL, avec un secours en CSS si WebGL est indisponible).
export class Orb {
  constructor(host, options = {}) {
    this.host = host;
    this.el = host;
    this.size = options.size || 168;
    this.speed = options.speed == null ? 1 : options.speed;
    this.colorFrom = options.colorFrom || "#34e0f2";
    this.colorTo = options.colorTo || "#ff7a59";
    this.extraColors = options.colorFrom ? null : [hexToRgb("#ff8fb8"), hexToRgb("#ffb23f")];   // rose et ambre
    this.state = options.state || "idle";
    this.levelFunction = null;
    this.reducedMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.mix = createMix(this.state);
    this.frame = { weights: this.mix.weights, level: 0, phase: 0 };
    this.sheetPhase = 1.7;
    this.lastPhase = 0;
    this.animationFrame = 0;
    this.lastTime = null;
    this.visible = true;
    this.look = { x: 0, y: 0 };      // direction du regard (orb-face.js), -1..1 ; y vers le haut
    this.glass = options.style === "glass";
    this.sphere = this.glass ? GLASS_SPHERE : SHEET_SPHERE;

    host.classList.add("orb");
    host.style.width = host.style.height = `${this.size}px`;
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", options.label || "Assistant pédagogique");
    host.dataset.state = this.state;

    this.canvas = document.createElement("canvas");
    this.canvas.style.width = this.canvas.style.height = `${this.size}px`;
    host.appendChild(this.canvas);
    let context = null;
    try { context = this.canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" }); } catch (error) { context = null; }
    this.gl = context;
    this.draw = context ? this.setupGl() : null;
    if (!this.draw) this.showFallback();

    this.tick = this.tick.bind(this);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting && document.visibilityState === "visible";
        if (this.visible) this.wake();
      }).observe(host);
    }
    document.addEventListener("visibilitychange", () => {
      this.visible = document.visibilityState === "visible";
      if (this.visible) this.wake();
    });
    this.wake();
  }

  showFallback() {
    this.canvas.remove();
    const fallback = document.createElement("div");
    fallback.className = "orb-fallback";
    fallback.style.cssText = this.glass ? "position:absolute;inset:13% 13% 19%;border-radius:50%;background:radial-gradient(circle at 50% 85%,#6be0ff 0%,transparent 45%),radial-gradient(circle at 35% 30%,#8a6dff,#3b22e0 70%);box-shadow:0 14px 26px -10px rgba(80,140,255,.7)" : `position:absolute;inset:7%;border-radius:50%;background:radial-gradient(ellipse 70% 16% at 50% 50%,${this.colorFrom} 0%,transparent 70%),radial-gradient(ellipse 85% 34% at 50% 52%,${this.colorTo}55 0%,transparent 70%),radial-gradient(circle at 34% 28%,#fff,transparent 40%),#f4f5fa;box-shadow:inset 0 0 0 1.5px ${this.colorTo}55;transform:scaleY(calc(1 + var(--orb-level,0) * .06))`;
    this.host.appendChild(fallback);
  }

  setupGl() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertexShader = compile(gl.VERTEX_SHADER, VERT);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, this.glass ? GLASS_FRAG : FRAG);
    const program = gl.createProgram();
    if (!vertexShader || !fragmentShader) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = Math.max(1, Math.round(this.size * pixelRatio));
    this.canvas.width = this.canvas.height = pixels;
    gl.viewport(0, 0, pixels, pixels);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    const locations = {};
    (this.glass ? GLASS_UNIFORMS : UNIFORMS).forEach((name) => { locations[name] = gl.getUniformLocation(program, name); });
    gl.uniform1f(locations.uSize, pixels);
    if (this.glass) {
      return (frame, sheet) => {
        const { weights } = frame;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(locations.uPhase, frame.phase * 0.35 + sheet * 0.5);      // les nuages dérivent toujours un peu, plus vite quand elle parle
        gl.uniform1f(locations.uLevel, clamp01(frame.level) * (1 - weights.disabled));
        gl.uniform1f(locations.uActive, 1 - weights.idle - weights.disabled);
        gl.uniform2f(locations.uLook, this.look.x, this.look.y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
    }
    const setVec3 = (name, value) => gl.uniform3f(locations[name], value[0], value[1], value[2]);
    const errorFrom = hexToRgb(ERROR_FROM);
    const errorTo = hexToRgb(ERROR_TO);
    return (frame, sheet) => {
      const params = blend(frame.weights, TABLE);
      const level = clamp01(frame.level);
      const voice = params.voice * level;
      const from = mixRgb(hexToRgb(this.colorFrom), errorFrom, frame.weights.error);
      const to = mixRgb(hexToRgb(this.colorTo), errorTo, frame.weights.error);
      const colors = palette(from, to, clamp01(params.mute), this.extraColors && frame.weights.error < 0.5 ? this.extraColors : null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(locations.uLook, this.look.x * 0.3, this.look.y * 0.3);     // le contenu tourne avec le regard du visage (orb-face.js)
      gl.uniform1f(locations.uPhase, sheet);
      gl.uniform1f(locations.uLevel, level);
      gl.uniform1f(locations.uWarp, params.warp * 3.2 + 0.85 * voice);
      gl.uniform1f(locations.uRidge, params.ridge + 0.35 * voice + 0.25 * params.hear * level);
      gl.uniform1f(locations.uSharp, params.sharp * 0.75);
      gl.uniform1f(locations.uZoom, params.zoom);
      gl.uniform1f(locations.uExposure, params.exposure * 1.9 * (1 + 0.12 * voice + 0.1 * params.hear * level));
      gl.uniform1f(locations.uGlow, 0.0);                 // pas de halo autour de la sphère
      gl.uniform1f(locations.uRim, params.rim);
      gl.uniform1f(locations.uHear, params.hear);
      gl.uniform1f(locations.uFade, params.fade);
      setVec3("uColA", colors.a); setVec3("uColB", colors.b); setVec3("uColC", colors.c); setVec3("uColD", colors.d);
      setVec3("uHi", colors.hi); setVec3("uCool", colors.cool); setVec3("uWarm", colors.warm); setVec3("uGlowCol", colors.glow);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
  }

  // boucle d'animation : suspendue hors écran ou onglet masqué
  tick(now) {
    this.animationFrame = 0;
    const delta = this.lastTime === null ? 0 : Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.mix.update(this.state, delta);
    this.frame.phase += this.reducedMotion ? 0 : delta * this.speed;
    const live = this.levelFunction ? this.levelFunction() : -1;
    const target = this.reducedMotion ? 0 : live >= 0 ? live : blendEnergy(this.mix.weights, this.frame.phase);
    this.frame.level = approach(this.frame.level, target, target > this.frame.level ? 14 : 4, delta);
    const params = blend(this.mix.weights, TABLE);
    this.sheetPhase += Math.max(0, this.frame.phase - this.lastPhase) * params.speed * (1 + 0.7 * params.voice * clamp01(this.frame.level));
    this.lastPhase = this.frame.phase;
    this.host.style.setProperty("--orb-level", this.frame.level.toFixed(3));
    if (this.draw) this.draw(this.frame, this.sheetPhase);
    if (this.visible && !(this.reducedMotion && this.mix.weights[this.state] > 0.999)) this.animationFrame = requestAnimationFrame(this.tick);
    else this.lastTime = null;
  }

  wake() { if (!this.animationFrame && this.visible) this.animationFrame = requestAnimationFrame(this.tick); }

  setState(state) {
    if (!STATES.includes(state) || state === this.state) return;
    this.state = state;
    this.host.dataset.state = state;
    this.wake();
  }

  getState() { return this.state; }

  setLevel(levelFunction) { this.levelFunction = levelFunction; this.wake(); }
}
