/**
 * Liquid Glass — Tab Bar + Pill
 *
 * Settings copied directly from the Interactive Magnifying Glass demo
 * (winaviation/liquid-glass-demo, which ports kube.io/blog/liquid-glass-css-svg):
 *
 *   bezelWidth      = 30
 *   glassThickness  = 150
 *   refractiveIndex = 1.5
 *   refractionScale = 1.5    ← the `scale` on feDisplacementMap = maxDisp * 1.5
 *   specularOpacity = 1.0
 *   blur (SVG)      = 0.5    ← stdDeviation inside the filter, NOT backdrop blur
 *
 * No `blur()` is added to backdrop-filter — that's what makes it refractive
 * rather than frosted. The SVG displacement map provides all the visual distortion.
 *
 * Springs:
 *   - pillScaleSpring    (520/26)  — pill squish on click, same feel as MG drag
 *   - tabRefractSpring   (300/18)  — tab bar refractionBoost, same as MG demo
 *   - pillRefractSpring  (300/18)  — pill refractionBoost, same as MG demo
 */

(function () {
  "use strict";

  /* ─── Spring (from winaviation / kube.io demo) ─────────────────────── */
  function Spring(value, stiffness, damping) {
    this.value    = value;
    this.target   = value;
    this.velocity = 0;
    this.stiffness = stiffness || 300;
    this.damping   = damping   || 20;
  }
  Spring.prototype.setTarget = function (t) { this.target = t; };
  Spring.prototype.update = function (dt) {
    var f = (this.target - this.value) * this.stiffness;
    var d = this.velocity * this.damping;
    this.velocity += (f - d) * dt;
    this.value    += this.velocity * dt;
    return this.value;
  };
  Spring.prototype.isSettled = function () {
    return Math.abs(this.target - this.value) < 0.0005 &&
           Math.abs(this.velocity) < 0.0005;
  };

  /* ─── Snell's Law 1-D displacement ─────────────────────────────────── */
  function calc1D(glassThickness, bezelWidth, surfaceFn, n, samples) {
    samples = samples || 128;
    var eta = 1 / n;
    function refract(nx, ny) {
      var dot = ny, k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) return null;
      var sq = Math.sqrt(k);
      return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
    }
    var out = [];
    for (var i = 0; i < samples; i++) {
      var x = i / samples, y = surfaceFn(x);
      var dx = x < 1 ? 0.0001 : -0.0001;
      var y2 = surfaceFn(Math.max(0, Math.min(1, x + dx)));
      var deriv = (y2 - y) / dx, mag = Math.sqrt(deriv * deriv + 1);
      var r = refract(-deriv / mag, -1 / mag);
      if (!r) { out.push(0); continue; }
      out.push(r[0] * ((y * bezelWidth + glassThickness) / r[1]));
    }
    return out;
  }

  /* ─── 2-D displacement map ──────────────────────────────────────────── */
  function calc2D(cW, cH, oW, oH, R, bw, maxD, pre) {
    var img = new ImageData(cW, cH), d = img.data;
    for (var i = 0; i < d.length; i += 4) { d[i]=128; d[i+1]=128; d[i+2]=0; d[i+3]=255; }
    var r2=R*R, r1sq=(R+1)*(R+1), rbsq=Math.max(0,(R-bw)*(R-bw));
    var wB=oW-R*2, hB=oH-R*2, ox=(cW-oW)/2, oy=(cH-oH)/2;
    for (var y1=0; y1<oH; y1++) {
      for (var x1=0; x1<oW; x1++) {
        var idx=((oy+y1)*cW+ox+x1)*4;
        var cx = x1<R ? x1-R : x1>=oW-R ? x1-R-wB : 0;
        var cy = y1<R ? y1-R : y1>=oH-R ? y1-R-hB : 0;
        var dist2=cx*cx+cy*cy;
        if (dist2<=r1sq && dist2>=rbsq) {
          var dist=Math.sqrt(dist2);
          var op = dist2<r2 ? 1 : 1-(dist-Math.sqrt(r2))/(Math.sqrt(r1sq)-Math.sqrt(r2));
          var ca=dist>0?cx/dist:0, sa=dist>0?cy/dist:0;
          var ratio=Math.max(0,Math.min(1,(R-dist)/bw));
          var bi=Math.floor(ratio*pre.length);
          var dd=pre[Math.max(0,Math.min(bi,pre.length-1))]||0;
          var dX=maxD>0?(-ca*dd)/maxD:0, dY=maxD>0?(-sa*dd)/maxD:0;
          d[idx]  =Math.max(0,Math.min(255,128+dX*127*op));
          d[idx+1]=Math.max(0,Math.min(255,128+dY*127*op));
          d[idx+2]=0; d[idx+3]=255;
        }
      }
    }
    return img;
  }

  /* ─── Specular highlight ────────────────────────────────────────────── */
  function calcSpec(oW, oH, R, bw) {
    var img = new ImageData(oW, oH), d = img.data;
    var sv=[Math.cos(Math.PI/3), Math.sin(Math.PI/3)], st=1.5;
    var r2=R*R, r1sq=(R+1)*(R+1), rstsq=Math.max(0,(R-st)*(R-st));
    var wB=oW-R*2, hB=oH-R*2;
    for (var y1=0; y1<oH; y1++) {
      for (var x1=0; x1<oW; x1++) {
        var idx=(y1*oW+x1)*4;
        var cx=x1<R?x1-R:x1>=oW-R?x1-R-wB:0;
        var cy=y1<R?y1-R:y1>=oH-R?y1-R-hB:0;
        var dist2=cx*cx+cy*cy;
        if (dist2<=r1sq && dist2>=rstsq) {
          var dist=Math.sqrt(dist2);
          var op=dist2<r2?1:1-(dist-Math.sqrt(r2))/(Math.sqrt(r1sq)-Math.sqrt(r2));
          var ca=dist>0?cx/dist:0, sa=dist>0?-cy/dist:0;
          var dot=Math.abs(ca*sv[0]+sa*sv[1]);
          var er=Math.max(0,Math.min(1,(R-dist)/st));
          var ff=Math.sqrt(1-(1-er)*(1-er));
          var c=Math.min(255,255*dot*ff), al=Math.min(255,c*dot*ff*op);
          d[idx]=d[idx+1]=d[idx+2]=c; d[idx+3]=al;
        }
      }
    }
    return img;
  }

  function toURL(img) {
    var c=document.createElement("canvas"); c.width=img.width; c.height=img.height;
    c.getContext("2d").putImageData(img,0,0); return c.toDataURL();
  }

  function supportsBackdropSVG() {
    if (!window.chrome) return false;
    var el=document.createElement("div"); el.style.backdropFilter="url(#x)";
    return el.style.backdropFilter.indexOf("url")!==-1;
  }

  /* ─── Magnifying Glass settings (exact) ────────────────────────────── */
  var MG = {
    bezelWidth:      30,
    glassThickness:  150,
    n:               1.5,
    refractionScale: 1.5,
    specularOpacity: 1.0,
    blur:            0.5   /* stdDeviation inside SVG — NOT backdrop blur */
  };

  /* convex squircle — Apple's preferred surface (from kube.io article) */
  var squircle = function (x) { return Math.pow(1 - Math.pow(1 - x, 4), 0.25); };

  /* Tab bar: 400×66 pill (R=33) */
  var TB = { W: 400, H: 66, R: 33 };

  /* Pill: ~80×54 pill (R=27, cap bezelWidth to R-1=26) */
  var PL = { W: 80, H: 54, R: 27 };
  var PL_BW = Math.min(MG.bezelWidth, PL.R - 1); /* = 26 */

  /* ─── Springs ───────────────────────────────────────────────────────── */
  /* Pill scale bounce — same feel as MG drag-start (instant compress → spring) */
  var pillScaleSpring   = new Spring(1.0, 520, 26);

  /* refractionBoost — from MG animation loop (stiffness=300, damping=18)
     rest=0.8, active=1.0 → scale = maxDisp * refractionScale * boost */
  var tabRefractSpring  = new Spring(0.8, 300, 18);
  var pillRefractSpring = new Spring(0.8, 300, 18);

  var tbMaxDisp = 0, plMaxDisp = 0;
  var animId = null;

  function animate() {
    var dt = 1 / 60;
    pillScaleSpring.update(dt);
    tabRefractSpring.update(dt);
    pillRefractSpring.update(dt);

    /* Pill scale */
    var pill = document.getElementById("tabPill");
    if (pill) pill.style.scale = pillScaleSpring.value.toFixed(4);

    /* Tab bar refractionBoost → update feDisplacementMap scale */
    var tbMap = document.getElementById("tgDisplacementMap");
    if (tbMap) tbMap.setAttribute("scale",
      (tbMaxDisp * MG.refractionScale * tabRefractSpring.value).toFixed(2));

    /* Pill refractionBoost → update feDisplacementMap scale */
    var plMap = document.getElementById("tgPillDisplacementMap");
    if (plMap) plMap.setAttribute("scale",
      (plMaxDisp * MG.refractionScale * pillRefractSpring.value).toFixed(2));

    var settled = pillScaleSpring.isSettled() &&
                  tabRefractSpring.isSettled() &&
                  pillRefractSpring.isSettled();

    if (!settled) {
      animId = requestAnimationFrame(animate);
    } else {
      animId = null;
      if (pill) pill.style.scale = "";
    }
  }

  function startAnim() { if (!animId) animId = requestAnimationFrame(animate); }

  /* ─── Main init ─────────────────────────────────────────────────────── */
  function initTabbarGlass() {
    var tabbar = document.querySelector(".tabbar");
    if (!tabbar) return;

    /* ── Tab bar displacement + specular maps ── */
    var tbPre   = calc1D(MG.glassThickness, MG.bezelWidth, squircle, MG.n);
    tbMaxDisp   = Math.max.apply(null, tbPre.map(Math.abs));
    var tbDisp  = calc2D(TB.W, TB.H, TB.W, TB.H, TB.R, MG.bezelWidth, tbMaxDisp||1, tbPre);
    var tbSpec  = calcSpec(TB.W, TB.H, TB.R, MG.bezelWidth);

    document.getElementById("tgDisplacementImage").setAttribute("href", toURL(tbDisp));
    document.getElementById("tgSpecularImage").setAttribute("href", toURL(tbSpec));
    document.getElementById("tgSpecularAlpha").setAttribute("slope", MG.specularOpacity);
    document.getElementById("tgFilterBlur").setAttribute("stdDeviation", MG.blur);
    document.getElementById("tgDisplacementMap").setAttribute("scale",
      (tbMaxDisp * MG.refractionScale * 0.8).toFixed(2)); /* 0.8 = rest refractionBoost */

    /* ── Pill displacement + specular maps ── */
    var plPre   = calc1D(MG.glassThickness, PL_BW, squircle, MG.n);
    plMaxDisp   = Math.max.apply(null, plPre.map(Math.abs));
    var plDisp  = calc2D(PL.W, PL.H, PL.W, PL.H, PL.R, PL_BW, plMaxDisp||1, plPre);
    var plSpec  = calcSpec(PL.W, PL.H, PL.R, PL_BW);

    document.getElementById("tgPillDisplacementImage").setAttribute("href", toURL(plDisp));
    document.getElementById("tgPillSpecularImage").setAttribute("href", toURL(plSpec));
    document.getElementById("tgPillSpecularAlpha").setAttribute("slope", MG.specularOpacity);
    document.getElementById("tgPillBlur").setAttribute("stdDeviation", MG.blur);
    document.getElementById("tgPillDisplacementMap").setAttribute("scale",
      (plMaxDisp * MG.refractionScale * 0.8).toFixed(2));

    /* ── Chrome vs fallback ── */
    tabbar.classList.add(supportsBackdropSVG() ? "lg-backdrop" : "lg-fallback");

    /* ── Pointer events — same trigger pattern as MG demo drag ── */
    tabbar.addEventListener("pointerdown", function (e) {
      if (!e.target.closest("[data-v]")) return;

      /* Pill: instant compress → spring back (MG drag-start feel) */
      pillScaleSpring.value    = 0.86;
      pillScaleSpring.velocity = 0;
      pillScaleSpring.target   = 1.0;

      /* refractionBoost: boost to 1.0 (MG dragging state) */
      tabRefractSpring.setTarget(1.0);
      pillRefractSpring.setTarget(1.0);

      startAnim();
    }, true);

    /* On release: spring refractionBoost back to 0.8 (MG rest state) */
    tabbar.addEventListener("pointerup", function (e) {
      if (!e.target.closest("[data-v]")) return;
      tabRefractSpring.setTarget(0.8);
      pillRefractSpring.setTarget(0.8);
      startAnim();
    });

    tabbar.addEventListener("pointercancel", function () {
      tabRefractSpring.setTarget(0.8);
      pillRefractSpring.setTarget(0.8);
      startAnim();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTabbarGlass);
  } else {
    initTabbarGlass();
  }
})();
