/**
 * Liquid Glass Tab Bar
 * Based on winaviation/liquid-glass-demo (port of kube.io Liquid Glass)
 *
 * Computes a physics-accurate displacement map via Snell's Law refraction,
 * bakes it into a canvas data URL, and feeds it into an SVG feDisplacementMap
 * filter. Chrome applies this via backdrop-filter; other browsers fall back to
 * a simple blur.
 */

(function () {
  "use strict";

  // ---------- Surface profile equations ----------
  const SurfaceEquations = {
    convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
    convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
    concave: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
  };

  // ---------- Snell's Law — 1-D displacement along the bezel ----------
  function calcDisplacement1D(glassThickness, bezelWidth, surfaceFn, refractiveIndex, samples) {
    samples = samples || 128;
    var eta = 1 / refractiveIndex;

    function refract(nx, ny) {
      var dot = ny;
      var k = 1 - eta * eta * (1 - dot * dot);
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

  // ---------- 2-D displacement map (ImageData) ----------
  function calcDisplacement2D(cW, cH, oW, oH, radius, bezelWidth, maxDisp, precomp) {
    var imgData = new ImageData(cW, cH);
    var d = imgData.data;
    for (var i = 0; i < d.length; i += 4) { d[i] = 128; d[i+1] = 128; d[i+2] = 0; d[i+3] = 255; }

    var r2 = radius * radius;
    var r1sq = (radius + 1) * (radius + 1);
    var rbsq = Math.max(0, (radius - bezelWidth) * (radius - bezelWidth));
    var wBetween = oW - radius * 2;
    var hBetween = oH - radius * 2;
    var ox = (cW - oW) / 2;
    var oy = (cH - oH) / 2;

    for (var y1 = 0; y1 < oH; y1++) {
      for (var x1 = 0; x1 < oW; x1++) {
        var idx = ((oy + y1) * cW + ox + x1) * 4;
        var left = x1 < radius, right = x1 >= oW - radius;
        var top  = y1 < radius, bottom = y1 >= oH - radius;
        var cx = left ? x1 - radius : right  ? x1 - radius - wBetween : 0;
        var cy = top  ? y1 - radius : bottom ? y1 - radius - hBetween : 0;
        var dist2 = cx * cx + cy * cy;
        if (dist2 <= r1sq && dist2 >= rbsq) {
          var dist = Math.sqrt(dist2);
          var fromSide = radius - dist;
          var opacity = dist2 < r2 ? 1 : 1 - (dist - Math.sqrt(r2)) / (Math.sqrt(r1sq) - Math.sqrt(r2));
          var cosA = dist > 0 ? cx / dist : 0;
          var sinA = dist > 0 ? cy / dist : 0;
          var ratio = Math.max(0, Math.min(1, fromSide / bezelWidth));
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

  // ---------- Specular highlight (ImageData) ----------
  function calcSpecular(oW, oH, radius, bezelWidth) {
    var imgData = new ImageData(oW, oH);
    var d = imgData.data;
    var angle = Math.PI / 3;
    var sv = [Math.cos(angle), Math.sin(angle)];
    var st = 1.5;
    var r2 = radius * radius;
    var r1sq = (radius + 1) * (radius + 1);
    var rstsq = Math.max(0, (radius - st) * (radius - st));
    var wBetween = oW - radius * 2;
    var hBetween = oH - radius * 2;

    for (var y1 = 0; y1 < oH; y1++) {
      for (var x1 = 0; x1 < oW; x1++) {
        var idx = (y1 * oW + x1) * 4;
        var left = x1 < radius, right = x1 >= oW - radius;
        var top  = y1 < radius, bottom = y1 >= oH - radius;
        var cx = left ? x1 - radius : right  ? x1 - radius - wBetween : 0;
        var cy = top  ? y1 - radius : bottom ? y1 - radius - hBetween : 0;
        var dist2 = cx * cx + cy * cy;
        if (dist2 <= r1sq && dist2 >= rstsq) {
          var dist = Math.sqrt(dist2);
          var fromSide = radius - dist;
          var opacity = dist2 < r2 ? 1 : 1 - (dist - Math.sqrt(r2)) / (Math.sqrt(r1sq) - Math.sqrt(r2));
          var cosA = dist > 0 ? cx / dist : 0;
          var sinA = dist > 0 ? -cy / dist : 0;
          var dot = Math.abs(cosA * sv[0] + sinA * sv[1]);
          var edgeRatio = Math.max(0, Math.min(1, fromSide / st));
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

  // ---------- ImageData → data URL ----------
  function toDataURL(imgData) {
    var c = document.createElement("canvas");
    c.width = imgData.width; c.height = imgData.height;
    c.getContext("2d").putImageData(imgData, 0, 0);
    return c.toDataURL();
  }

  // ---------- Detect Chrome backdrop-filter+SVG support ----------
  function supportsBackdropFilterSVG() {
    if (!window.chrome) return false;
    var el = document.createElement("div");
    el.style.backdropFilter = "url(#x)";
    return el.style.backdropFilter.indexOf("url") !== -1;
  }

  // ---------- Main init ----------
  function initTabbarGlass() {
    var tabbar = document.querySelector(".tabbar");
    if (!tabbar) return;

    // Tab bar dimensions — pill shape, 400×66, radius 33
    var W = 400, H = 66, R = 33;
    var bezelWidth     = 22;
    var glassThickness = 90;
    var refractiveIndex = 1.5;
    var refractionScale = 1.3;

    var surfaceFn = SurfaceEquations.convex_squircle;
    var precomp   = calcDisplacement1D(glassThickness, bezelWidth, surfaceFn, refractiveIndex);
    var maxDisp   = Math.max.apply(null, precomp.map(Math.abs));

    var dispData = calcDisplacement2D(W, H, W, H, R, bezelWidth, maxDisp || 1, precomp);
    var specData = calcSpecular(W, H, R, bezelWidth);

    var dispImg = document.getElementById("tgDisplacementImage");
    var specImg = document.getElementById("tgSpecularImage");
    var dispMap = document.getElementById("tgDisplacementMap");

    if (dispImg) dispImg.setAttribute("href", toDataURL(dispData));
    if (specImg) specImg.setAttribute("href", toDataURL(specData));
    if (dispMap) dispMap.setAttribute("scale", maxDisp * refractionScale);

    if (supportsBackdropFilterSVG()) {
      tabbar.classList.add("lg-backdrop");
    } else {
      tabbar.classList.add("lg-fallback");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTabbarGlass);
  } else {
    initTabbarGlass();
  }
})();
