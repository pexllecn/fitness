/**
 * Liquid Glass Tab Bar
 * Based on winaviation/liquid-glass-demo (port of kube.io Liquid Glass)
 *
 * 1. Computes a physics-accurate SVG displacement map (Snell's Law) for the
 *    tab bar background and feeds it to a feDisplacementMap SVG filter.
 *
 * 2. Adds Spring-based bounce to the tab pill on click — same spring physics
 *    as the Interactive Magnifying Glass element in the demo. Position uses
 *    CSS `translate` (animated by CSS transition), scale uses CSS `scale`
 *    (animated by JS spring) — the two compose independently.
 */

(function () {
  "use strict";

  /* ─── Spring physics (from winaviation demo) ───────────────────────── */
  function Spring(value, stiffness, damping) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness || 300;
    this.damping = damping || 20;
  }

  Spring.prototype.setTarget = function (t) { this.target = t; };

  Spring.prototype.update = function (dt) {
    var force = (this.target - this.value) * this.stiffness;
    var damp  = this.velocity * this.damping;
    this.velocity += (force - damp) * dt;
    this.value    += this.velocity * dt;
    return this.value;
  };

  Spring.prototype.isSettled = function () {
    return Math.abs(this.target - this.value) < 0.0005 &&
           Math.abs(this.velocity) < 0.0005;
  };

  /* ─── Snell's Law — 1-D displacement along the bezel ──────────────── */
  function calcDisplacement1D(glassThickness, bezelWidth, surfaceFn, refractiveIndex, samples) {
    samples = samples || 128;
    var eta = 1 / refractiveIndex;

    function refract(nx, ny) {
      var dot = ny, k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) return null;
      var sq = Math.sqrt(k);
      return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
    }

    var result = [];
    for (var i = 0; i < samples; i++) {
      var x = i / samples;
      var y = surfaceFn(x);
      var dx = x < 1 ? 0.0001 : -0.0001;
      var y2 = surfaceFn(Math.max(0, Math.min(1, x + dx)));
      var deriv = (y2 - y) / dx;
      var mag = Math.sqrt(deriv * deriv + 1);
      var normal = [-deriv / mag, -1 / mag];
      var refracted = refract(normal[0], normal[1]);
      if (!refracted) {
        result.push(0);
      } else {
        var remHeight = y * bezelWidth + glassThickness;
        result.push(refracted[0] * (remHeight / refracted[1]));
      }
    }
    return result;
  }

  /* ─── 2-D displacement map (ImageData) ────────────────────────────── */
  function calcDisplacement2D(cW, cH, oW, oH, radius, bezelWidth, maxDisp, precomp) {
    var imgData = new ImageData(cW, cH);
    var d = imgData.data;
    for (var i = 0; i < d.length; i += 4) { d[i] = 128; d[i+1] = 128; d[i+2] = 0; d[i+3] = 255; }

    var r2  = radius * radius;
    var r1sq = (radius + 1) * (radius + 1);
    var rbsq = Math.max(0, (radius - bezelWidth) * (radius - bezelWidth));
    var wB = oW - radius * 2, hB = oH - radius * 2;
    var ox = (cW - oW) / 2, oy = (cH - oH) / 2;

    for (var y1 = 0; y1 < oH; y1++) {
      for (var x1 = 0; x1 < oW; x1++) {
        var idx = ((oy + y1) * cW + ox + x1) * 4;
        var isL = x1 < radius, isR = x1 >= oW - radius;
        var isT = y1 < radius, isB = y1 >= oH - radius;
        var cx = isL ? x1 - radius : isR ? x1 - radius - wB : 0;
        var cy = isT ? y1 - radius : isB ? y1 - radius - hB : 0;
        var dist2 = cx * cx + cy * cy;
        if (dist2 <= r1sq && dist2 >= rbsq) {
          var dist = Math.sqrt(dist2);
          var opacity = dist2 < r2 ? 1 : 1 - (dist - Math.sqrt(r2)) / (Math.sqrt(r1sq) - Math.sqrt(r2));
          var cosA = dist > 0 ? cx / dist : 0;
          var sinA = dist > 0 ? cy / dist : 0;
          var ratio = Math.max(0, Math.min(1, (radius - dist) / bezelWidth));
          var bi = Math.floor(ratio * precomp.length);
          var dd = precomp[Math.max(0, Math.min(bi, precomp.length - 1))] || 0;
          var dX = maxDisp > 0 ? (-cosA * dd) / maxDisp : 0;
          var dY = maxDisp > 0 ? (-sinA * dd) / maxDisp : 0;
          d[idx]   = Math.max(0, Math.min(255, 128 + dX * 127 * opacity));
          d[idx+1] = Math.max(0, Math.min(255, 128 + dY * 127 * opacity));
          d[idx+2] = 0;
          d[idx+3] = 255;
        }
      }
    }
    return imgData;
  }

  /* ─── Specular highlight (ImageData) ──────────────────────────────── */
  function calcSpecular(oW, oH, radius, bezelWidth) {
    var imgData = new ImageData(oW, oH);
    var d = imgData.data;
    var sv = [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)];
    var st = 1.5;
    var r2  = radius * radius;
    var r1sq = (radius + 1) * (radius + 1);
    var rstsq = Math.max(0, (radius - st) * (radius - st));
    var wB = oW - radius * 2, hB = oH - radius * 2;

    for (var y1 = 0; y1 < oH; y1++) {
      for (var x1 = 0; x1 < oW; x1++) {
        var idx = (y1 * oW + x1) * 4;
        var isL = x1 < radius, isR = x1 >= oW - radius;
        var isT = y1 < radius, isB = y1 >= oH - radius;
        var cx = isL ? x1 - radius : isR ? x1 - radius - wB : 0;
        var cy = isT ? y1 - radius : isB ? y1 - radius - hB : 0;
        var dist2 = cx * cx + cy * cy;
        if (dist2 <= r1sq && dist2 >= rstsq) {
          var dist = Math.sqrt(dist2);
          var opacity = dist2 < r2 ? 1 : 1 - (dist - Math.sqrt(r2)) / (Math.sqrt(r1sq) - Math.sqrt(r2));
          var cosA = dist > 0 ? cx / dist : 0;
          var sinA = dist > 0 ? -cy / dist : 0;
          var dot = Math.abs(cosA * sv[0] + sinA * sv[1]);
          var edgeRatio = Math.max(0, Math.min(1, (radius - dist) / st));
          var falloff = Math.sqrt(1 - (1 - edgeRatio) * (1 - edgeRatio));
          var coeff = dot * falloff;
          var color = Math.min(255, 255 * coeff);
          var alpha = Math.min(255, color * coeff * opacity);
          d[idx] = d[idx+1] = d[idx+2] = color;
          d[idx+3] = alpha;
        }
      }
    }
    return imgData;
  }

  /* ─── ImageData → data URL ─────────────────────────────────────────── */
  function toDataURL(imgData) {
    var c = document.createElement("canvas");
    c.width = imgData.width; c.height = imgData.height;
    c.getContext("2d").putImageData(imgData, 0, 0);
    return c.toDataURL();
  }

  /* ─── Chrome backdrop-filter + SVG support detection ──────────────── */
  function supportsBackdropFilterSVG() {
    if (!window.chrome) return false;
    var el = document.createElement("div");
    el.style.backdropFilter = "url(#x)";
    return el.style.backdropFilter.indexOf("url") !== -1;
  }

  /* ─── Pill spring bounce ────────────────────────────────────────────
   *
   * Uses the same Spring class as the Interactive Magnifying Glass demo.
   * Position (translate) is animated by CSS transition — bouncy scale is
   * animated independently via CSS `scale` property so they don't fight.
   */
  var pillScaleSpring = new Spring(1, 520, 26);
  var pillAnimId = null;

  function animatePill() {
    var dt = 1 / 60;
    pillScaleSpring.update(dt);
    var pill = document.getElementById("tabPill");
    if (pill) pill.style.scale = pillScaleSpring.value.toFixed(4);
    if (!pillScaleSpring.isSettled()) {
      pillAnimId = requestAnimationFrame(animatePill);
    } else {
      pillAnimId = null;
      if (pill) pill.style.scale = "";
    }
  }

  function startPillAnim() {
    if (!pillAnimId) pillAnimId = requestAnimationFrame(animatePill);
  }

  /* ─── SVG filter + tab bar glass init ──────────────────────────────── */
  function initTabbarGlass() {
    var tabbar = document.querySelector(".tabbar");
    if (!tabbar) return;

    /* Tab bar is a pill: 400 × 66, radius 33 */
    var W = 400, H = 66, R = 33;
    var bezelWidth      = 22;
    var glassThickness  = 90;
    var refractiveIndex = 1.5;
    var refractionScale = 1.3;
    var surfaceFn = function (x) { return Math.pow(1 - Math.pow(1 - x, 4), 0.25); }; // convex_squircle

    var precomp  = calcDisplacement1D(glassThickness, bezelWidth, surfaceFn, refractiveIndex);
    var maxDisp  = Math.max.apply(null, precomp.map(Math.abs));

    var dispData = calcDisplacement2D(W, H, W, H, R, bezelWidth, maxDisp || 1, precomp);
    var specData = calcSpecular(W, H, R, bezelWidth);

    var dispImg = document.getElementById("tgDisplacementImage");
    var specImg = document.getElementById("tgSpecularImage");
    var dispMap = document.getElementById("tgDisplacementMap");

    if (dispImg) dispImg.setAttribute("href", toDataURL(dispData));
    if (specImg) specImg.setAttribute("href", toDataURL(specData));
    if (dispMap) dispMap.setAttribute("scale", (maxDisp * refractionScale).toFixed(2));

    /* Apply class that activates the right CSS mode */
    tabbar.classList.add(supportsBackdropFilterSVG() ? "lg-backdrop" : "lg-fallback");

    /* ── Pill bounce: capture tab clicks before showView fires ──────── */
    tabbar.addEventListener("pointerdown", function (e) {
      var tab = e.target.closest("[data-v]");
      if (!tab) return;
      /* Instant compress, then spring back — same feel as the glass demo's
         scale spring (stiffness 400, damping 25) on drag-start */
      pillScaleSpring.value    = 0.86;
      pillScaleSpring.velocity = 0;
      pillScaleSpring.target   = 1.0;
      startPillAnim();
    }, true); /* capture so it fires before the click/showView handler */
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTabbarGlass);
  } else {
    initTabbarGlass();
  }
})();
