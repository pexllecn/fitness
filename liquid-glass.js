/**
 * Liquid Glass — Tab Bar (track) + Drag Dock Pill
 *
 * Tab bar track: Interactive Magnifying Glass settings from winaviation/liquid-glass-demo
 *   bezelWidth=30, glassThickness=150, n=1.5, refractionScale=1.5, blur=0.5
 *
 * Pill: Drag Dock (Pebble & Void) settings
 *   bezelWidth=26, glassThickness=120, n=2.0, blur=0.8
 *   Springs: x(450/26), sx(500/24), sy(500/24), sc(400/20)
 *   Velocity squish: st=|vx|/1200; sx=1+st; sy=max(0.6,1-st*0.3)
 *   Scale boost on grab: sc->1.25, release: sc->1
 */

(function () {
  "use strict";

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
    /* Exclude iOS — all iOS browsers use WebKit which blocks backdrop-filter
       on children of overflow:hidden elements, breaking the SVG refraction */
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) return false;
    /* Feature-detect SVG backdrop-filter support (Chrome + Safari 15.4+) */
    var el = document.createElement("div");
    el.style.cssText = "-webkit-backdrop-filter:url(#x);backdrop-filter:url(#x)";
    return el.style.backdropFilter.indexOf("url") !== -1 ||
           el.style.webkitBackdropFilter.indexOf("url") !== -1;
  }

  var squircle = function (x) { return Math.pow(1 - Math.pow(1 - x, 4), 0.25); };

  var MG_TB = { bezelWidth: 30, glassThickness: 150, n: 1.5, refractionScale: 1.5, specularOpacity: 1.0, blur: 1.0 };
  var TB = { W: 400, H: 66, R: 33 };
  var DC = { W: 70, H: 54, R: 27, bw: 26, gt: 120, n: 2.0, blur: 0.8 };

  var sp = {
    x:  new Spring(0, 450, 26),
    sx: new Spring(1, 500, 24),
    sy: new Spring(1, 500, 24),
    sc: new Spring(1, 400, 20)
  };
  var tabRefractSpring = new Spring(0.8, 300, 18);

  var tbMaxDisp = 0, plMaxDisp = 0;
  var animId = null;
  var isDragging = false;
  var activeIdx = 0;
  var itemWidth = 0;

  function animate() {
    var dt = 1 / 60;
    sp.x.update(dt);
    sp.sx.update(dt);
    sp.sy.update(dt);
    sp.sc.update(dt);
    tabRefractSpring.update(dt);

    var pill = document.getElementById("tabPill");
    if (pill) {
      var cx = sp.x.value;
      var sxv = sp.sx.value * sp.sc.value;
      var syv = sp.sy.value * sp.sc.value;
      pill.style.transform = "translateX(" + cx.toFixed(2) + "px) scale(" + sxv.toFixed(4) + "," + syv.toFixed(4) + ")";

      if (isDragging) {
        var vx = Math.abs(sp.x.velocity);
        var st = vx / 1200;
        sp.sx.setTarget(1 + st);
        sp.sy.setTarget(Math.max(0.6, 1 - st * 0.3));
      }

      var plMap = document.getElementById("tgPillDisplacementMap");
      if (plMap) plMap.setAttribute("scale", (plMaxDisp * sp.sx.value * 1.5).toFixed(2));
    }

    var tbMap = document.getElementById("tgDisplacementMap");
    if (tbMap) tbMap.setAttribute("scale",
      (tbMaxDisp * MG_TB.refractionScale * tabRefractSpring.value).toFixed(2));

    var settled = sp.x.isSettled() && sp.sx.isSettled() && sp.sy.isSettled() &&
                  sp.sc.isSettled() && tabRefractSpring.isSettled();
    if (!settled) {
      animId = requestAnimationFrame(animate);
    } else {
      animId = null;
    }
  }

  function startAnim() { if (!animId) animId = requestAnimationFrame(animate); }

  function snapToIndex(idx) {
    activeIdx = idx;
    if (!itemWidth) return;
    sp.x.setTarget(idx * itemWidth);
  }

  function initTabbarGlass() {
    var tabbar = document.querySelector(".tabbar");
    if (!tabbar) return;

    var tbPre  = calc1D(MG_TB.glassThickness, MG_TB.bezelWidth, squircle, MG_TB.n);
    tbMaxDisp  = Math.max.apply(null, tbPre.map(Math.abs));
    var tbDisp = calc2D(TB.W, TB.H, TB.W, TB.H, TB.R, MG_TB.bezelWidth, tbMaxDisp||1, tbPre);
    var tbSpec = calcSpec(TB.W, TB.H, TB.R, MG_TB.bezelWidth);

    document.getElementById("tgDisplacementImage").setAttribute("href", toURL(tbDisp));
    document.getElementById("tgSpecularImage").setAttribute("href", toURL(tbSpec));
    document.getElementById("tgSpecularAlpha").setAttribute("slope", MG_TB.specularOpacity);
    document.getElementById("tgFilterBlur").setAttribute("stdDeviation", MG_TB.blur);
    document.getElementById("tgDisplacementMap").setAttribute("scale",
      (tbMaxDisp * MG_TB.refractionScale * 0.8).toFixed(2));

    var plPre  = calc1D(DC.gt, DC.bw, squircle, DC.n);
    plMaxDisp  = Math.max.apply(null, plPre.map(Math.abs));
    var plDisp = calc2D(DC.W, DC.H, DC.W, DC.H, DC.R, DC.bw, plMaxDisp||1, plPre);
    var plSpec = calcSpec(DC.W, DC.H, DC.R, DC.bw);

    document.getElementById("tgPillDisplacementImage").setAttribute("href", toURL(plDisp));
    document.getElementById("tgPillSpecularImage").setAttribute("href", toURL(plSpec));
    document.getElementById("tgPillSpecularAlpha").setAttribute("slope", "0.8");
    document.getElementById("tgPillBlur").setAttribute("stdDeviation", DC.blur);
    document.getElementById("tgPillDisplacementMap").setAttribute("scale",
      (plMaxDisp * 1.5).toFixed(2));

    tabbar.classList.add(supportsBackdropSVG() ? "lg-backdrop" : "lg-fallback");

    var pill = document.getElementById("tabPill");
    var tabs = tabbar.querySelectorAll(".tab");

    function initPillSize() {
      if (!tabs.length || !tabs[0].offsetWidth) return;
      var tabW = tabs[0].offsetWidth;
      itemWidth = tabW + 4; /* tab width + gap */
      pill.style.width  = tabW + "px"; /* match tab width exactly */
      pill.style.height = DC.H + "px";
      activeIdx = 0;
      for (var i = 0; i < tabs.length; i++) if (tabs[i].classList.contains("active")) { activeIdx = i; break; }
      sp.x.value = sp.x.target = activeIdx * itemWidth;
      sp.x.velocity = 0;
      pill.style.transform = "translateX(" + sp.x.value.toFixed(2) + "px) scale(1,1)";
    }

    requestAnimationFrame(function() { requestAnimationFrame(initPillSize); });

    window._dockSnap = function() {
      for (var i = 0; i < tabs.length; i++) if (tabs[i].classList.contains("active")) { activeIdx = i; break; }
      snapToIndex(activeIdx);
      startAnim();
    };

    var startX = 0, startPillX = 0, pointerId = null, hasDragged = false;

    tabbar.addEventListener("pointerdown", function (e) {
      if (!e.target.closest("[data-v]") && !e.target.closest("#tabPill")) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startPillX = sp.x.value;
      isDragging = true;
      hasDragged = false;

      sp.sc.setTarget(1.25);
      tabRefractSpring.setTarget(1.0);

      var target = e.target.closest("[data-v]");
      if (target) {
        for (var i = 0; i < tabs.length; i++) {
          if (tabs[i] === target) { activeIdx = i; break; }
        }
        sp.x.setTarget(activeIdx * itemWidth);
      }

      try { tabbar.setPointerCapture(e.pointerId); } catch(ex) {}
      startAnim();
    }, true);

    tabbar.addEventListener("pointermove", function (e) {
      if (!isDragging || e.pointerId !== pointerId) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 6) hasDragged = true;
      var raw = startPillX + dx;
      var maxX = (tabs.length - 1) * itemWidth;
      sp.x.value = Math.max(0, Math.min(maxX, raw));
      sp.x.velocity = (e.movementX || 0) * 60;
      sp.x.target   = sp.x.value;
      startAnim();
    });

    tabbar.addEventListener("pointerup", function (e) {
      if (e.pointerId !== pointerId) return;
      isDragging = false;
      pointerId  = null;

      /* For a simple tap, use activeIdx (set on pointerdown to tapped tab).
         setPointerCapture redirects click events to tabbar so we can't rely
         on the document click handler finding data-v — use nearest only when
         the user actually dragged. */
      var nearest;
      if (hasDragged && itemWidth > 0) {
        nearest = Math.round(sp.x.value / itemWidth);
        nearest = Math.max(0, Math.min(tabs.length - 1, nearest));
      } else {
        nearest = activeIdx;
      }
      snapToIndex(nearest);

      var activating = tabs[nearest];
      if (activating) {
        var v = activating.getAttribute("data-v");
        if (v && window.showView) window.showView(v);
      }

      sp.sx.setTarget(1);
      sp.sy.setTarget(1);
      sp.sc.setTarget(1);
      tabRefractSpring.setTarget(0.8);
      startAnim();
    });

    tabbar.addEventListener("pointercancel", function () {
      if (!isDragging) return;
      isDragging = false;
      pointerId  = null;
      snapToIndex(activeIdx);
      sp.sx.setTarget(1);
      sp.sy.setTarget(1);
      sp.sc.setTarget(1);
      tabRefractSpring.setTarget(0.8);
      startAnim();
    });

    window.addEventListener("resize", initPillSize);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTabbarGlass);
  } else {
    initTabbarGlass();
  }
})();
