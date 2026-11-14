"use client";

import { useLayoutEffect } from "react";

/**
 * One client runtime for the whole landing page.
 * Spine, headline rise, verb cycle, marquee, menu and diagram share a single
 * rAF pass, matching the locked mockup (layout reads only on resize).
 */
export function LandingRuntime() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-root]");
    if (!root) {
      return;
    }
    return startLanding(root);
  }, []);
  return null;
}

type Pt = [number, number];

type Spine = {
  sig: string;
  path: SVGPathElement;
  len: number;
  k: number;
  tab: [number, number][];
  s0: SVGCircleElement;
  s1: SVGCircleElement;
  w: number;
  band: number;
  last: number;
};

type Conn = {
  wrap: HTMLElement;
  paths: SVGPathElement[];
  drawn: boolean;
  w: number;
  h: number;
  topY: number;
};

function startLanding(root: HTMLElement): () => void {
  const CFG = {
    spine: { w: [32, 16, 8], ring: 2.5, corner: 2, hRun: 120, ringTop: 86, endDy: 150, color: "#00C08B", flipTo: "#F4F6F8" },
    conn: { w: 4, corner: 16 },
    menuHues: ["#0D9488", "#3B82F6", "#7C3AED", "#F59E0B"],
    menuInk: ["#fff", "#fff", "#fff", "#0F172A"],
  };
  const html = document.documentElement;
  const stage = root.querySelector<HTMLElement>("[data-stage]") ?? root;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = mq.matches;
  let alive = true;
  if (reduced) stage.classList.add("rm");

  function $<T extends Element>(sel: string, scope?: ParentNode | null): T | null {
    return (scope || root).querySelector(sel);
  }
  function $$<T extends Element>(sel: string, scope?: ParentNode | null): T[] {
    return Array.prototype.slice.call((scope || root).querySelectorAll(sel)) as T[];
  }

  const state = { menu: false, hidden: document.hidden, ready: false };
  const secs = $$<HTMLElement>("main > section, main > footer");
  const hdr = $<HTMLElement>("[data-hdr]");
  const menu = $<HTMLElement>("[data-menu]");
  const main = $<HTMLElement>("[data-main]");
  const layout = { tops: [] as number[], bottoms: [] as number[], mTop: 0, hdrY: 42 };
  const timeouts = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      if (alive) fn();
    }, ms);
    timeouts.add(id);
    return id;
  };

  function top(el: HTMLElement) {
    return el.getBoundingClientRect().top + window.scrollY;
  }
  function measure() {
    layout.tops = secs.map(top);
    layout.bottoms = secs.map((s, i) => layout.tops[i] + s.offsetHeight);
    const m = $<HTMLElement>("[data-mline]");
    layout.mTop = m ? top(m.closest("h2") || m) : 0;
    layout.hdrY = hdr ? hdr.offsetHeight / 2 : 42;
  }

  const hlines = $$<HTMLElement>("[data-hline]");
  const verbs = $$<HTMLElement>("[data-verb]");
  function markReady() {
    if (state.ready || !alive) return;
    state.ready = true;
    hlines.forEach((el, i) => {
      el.style.transitionDelay = (reduced ? 0 : i * 90) + "ms";
      el.classList.add("in");
    });
    stage.classList.add("ready");
    introSpine();
    if (!reduced) later(startVerbs, 820);
    else stepVerb();
  }
  function loader() {
    if (reduced) {
      showAll();
      markReady();
      return;
    }
    const family = (variable: string, fallback: string) => {
      const stack = getComputedStyle(root).getPropertyValue(variable).trim() || fallback;
      return stack.split(",")[0].trim().replace(/^["']|["']$/g, "");
    };
    const sans = family("--font-plex-sans", "IBM Plex Sans");
    const mono = family("--font-plex-mono", "IBM Plex Mono");
    const serif = family("--font-source-serif", "Source Serif 4");
    const fonts =
      document.fonts?.load
        ? Promise.all([
            document.fonts.load(`600 40px "${sans}"`),
            document.fonts.load(`400 14px "${mono}"`),
            document.fonts.load(`600 40px "${serif}"`),
          ])
        : Promise.resolve();
    const go = () => {
      if (!alive) return;
      requestAnimationFrame(() => {
        if (!alive) return;
        measure();
        setupWall();
        spine = buildSpine();
        requestAnimationFrame(() => {
          if (alive) markReady();
        });
      });
    };
    const t = later(go, 1600);
    fonts.then(
      () => {
        if (!alive) return;
        clearTimeout(t);
        timeouts.delete(t);
        go();
      },
      () => {
        if (!alive) return;
        clearTimeout(t);
        timeouts.delete(t);
        go();
      },
    );
  }

  const reveals = $$<HTMLElement>("[data-reveal]");
  const mlines = $$<HTMLElement>("[data-mline]");
  const clines = $$<HTMLElement>("[data-cline]");
  let revealObserver: IntersectionObserver | null = null;
  function showAll() {
    reveals.concat(hlines, clines, mlines).forEach((e) => e.classList.add("in"));
  }
  function setupReveals() {
    reveals.forEach((el) => {
      const parent = el.parentElement;
      const sibs = parent
        ? (Array.prototype.filter.call(parent.children, (x: Element) => x.hasAttribute("data-reveal")) as Element[])
        : [];
      el.style.transitionDelay = Math.max(0, sibs.indexOf(el)) * 80 + "ms";
    });
    if (reduced || !("IntersectionObserver" in window)) {
      showAll();
      return;
    }
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || !revealObserver) return;
          revealObserver.unobserve(entry.target);
          if (entry.target.hasAttribute("data-cta")) {
            clines.forEach((el, i) => {
              el.style.transitionDelay = i * 110 + "ms";
              el.classList.add("in");
            });
          } else {
            entry.target.classList.add("in");
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0 },
    );
    reveals.forEach((el) => revealObserver?.observe(el));
    if (clines.length) {
      const h = clines[0].closest("h2");
      if (h) {
        h.setAttribute("data-cta", "");
        revealObserver.observe(h);
      }
    }
  }
  let mDone = -1;
  function tickMLines(y: number, vh: number) {
    if (!mlines.length) return;
    const t = layout.mTop - y;
    let n = 0;
    mlines.forEach((_el, i) => {
      if (reduced || t < vh * (0.9 - i * 0.07)) n = i + 1;
    });
    if (n === mDone) return;
    mDone = n;
    mlines.forEach((el, i) => el.classList.toggle("in", i < n));
  }

  let vi = -1;
  let verbTimer = 0;
  function stepVerb() {
    verbs.forEach((v) => v.classList.remove("on"));
    if (!verbs.length) return;
    vi = (vi + 1) % verbs.length;
    verbs[vi].classList.add("on");
  }
  function startVerbs() {
    if (reduced || verbTimer || state.hidden || !state.ready || !verbs.length) return;
    stepVerb();
    verbTimer = window.setInterval(stepVerb, 2500);
  }
  function stopVerbs() {
    window.clearInterval(verbTimer);
    verbTimer = 0;
  }

  let busyMenu = false;
  let hideMenuTimer = 0;
  const mbtn = $<HTMLButtonElement>("[data-mbtn]");
  const logo = hdr ? $<HTMLElement>(".logo", hdr) : null;
  function focusable(): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    if (mbtn) nodes.push(mbtn);
    $$<HTMLElement>("#menu a, #menu button").forEach((el) => {
      if (el.closest("[inert]")) return;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      nodes.push(el);
    });
    return nodes;
  }
  function setMenu(open: boolean) {
    if (!menu || !mbtn) return;
    state.menu = open;
    stage.classList.toggle("menu-open", open);
    menu.inert = false;
    menu.style.visibility = "visible";
    menu.style.transform = open ? "translateY(0)" : "translateY(-100%)";
    if (open) html.style.setProperty("--sbw", innerWidth - html.clientWidth + "px");
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) html.style.removeProperty("--sbw");
    if (main) main.inert = open;
    if (logo) logo.inert = open;
    $$<HTMLElement>("[data-mi]").forEach((el, i) => {
      el.style.setProperty("--d", open && !reduced ? 260 + i * 60 + "ms" : "0ms");
    });
    mbtn.setAttribute("aria-expanded", String(open));
    mbtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.setAttribute("aria-hidden", open ? "false" : "true");
    busyMenu = true;
    later(() => {
      busyMenu = false;
      polarity();
    }, reduced ? 0 : 940);
    polarity(open);
    window.clearTimeout(hideMenuTimer);
    if (!open) {
      hideMenuTimer = later(() => {
        if (!state.menu && menu) {
          menu.style.visibility = "hidden";
          menu.inert = true;
        }
      }, reduced ? 0 : 900);
    }
    if (open) {
      later(() => {
        const first = $<HTMLElement>("[data-mi]");
        first?.focus();
      }, reduced ? 0 : 320);
    }
    syncGone();
  }
  function onMenuButtonClick() {
    setMenu(!state.menu);
  }
  function onKey(e: KeyboardEvent) {
    if (!state.menu) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setMenu(false);
      mbtn?.focus();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = focusable();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !nodes.includes(active as HTMLElement)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }
  const field = $<HTMLElement>("[data-field]");
  const items = $$<HTMLElement>("[data-mi]");
  const list = $<HTMLElement>("[data-mlist]");
  function lit(i: number, it: HTMLElement) {
    if (!field || !mbtn) return;
    field.style.background = CFG.menuHues[i];
    items.forEach((o) => {
      o.style.color = o === it ? "var(--fg)" : "var(--mut)";
    });
    if (field.offsetWidth > 0) {
      mbtn.style.color = CFG.menuInk[i];
      mbtn.style.background = CFG.menuHues[i];
      mbtn.style.setProperty("--plate", CFG.menuHues[i]);
    }
  }
  function clearLit() {
    if (!field || !mbtn) return;
    field.style.background = "";
    items.forEach((o) => {
      o.style.color = "";
    });
    mbtn.style.color = "";
    mbtn.style.background = "";
    mbtn.style.removeProperty("--plate");
  }
  const itemCleanups: Array<() => void> = [];
  items.forEach((it, i) => {
    const enter = () => lit(i, it);
    const leaveFocus = () => clearLit();
    const click = () => later(() => setMenu(false), 60);
    it.addEventListener("mouseenter", enter);
    it.addEventListener("focus", enter);
    it.addEventListener("blur", leaveFocus);
    it.addEventListener("click", click);
    itemCleanups.push(() => {
      it.removeEventListener("mouseenter", enter);
      it.removeEventListener("focus", enter);
      it.removeEventListener("blur", leaveFocus);
      it.removeEventListener("click", click);
    });
  });
  const onListLeave = () => clearLit();
  list?.addEventListener("mouseleave", onListLeave);

  function polarity(forceOpen?: boolean) {
    if (!hdr || !menu) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : state.menu;
    let tone = "L";
    if (open) tone = menu.getAttribute("data-tone") || "D";
    else {
      const py = layout.hdrY + window.scrollY;
      for (let i = 0; i < secs.length; i++) {
        if (layout.tops[i] <= py && layout.bottoms[i] >= py) {
          tone = secs[i].getAttribute("data-tone") || "L";
          break;
        }
      }
    }
    if (hdr.getAttribute("data-tone") !== tone) hdr.setAttribute("data-tone", tone);
  }

  const rows = $$<HTMLElement>("[data-marquee]");
  const off = [0, 0];
  let mw = [1, 1];
  let wallOn = false;
  let vel = 0;
  let lastY = window.scrollY;
  let lastT = 0;
  let wallObserver: IntersectionObserver | null = null;
  function setupWall() {
    mw = rows.map((r) => r.scrollWidth / 2 || 1);
    off[0] = off[0] % (mw[0] || 1);
    off[1] = -mw[1] + ((off[1] + mw[1]) % (mw[1] || 1));
    if (!("IntersectionObserver" in window)) {
      wallOn = true;
      return;
    }
    if (!wallObserver) {
      const wall = $<HTMLElement>('[data-s="wall"]');
      wallObserver = new IntersectionObserver(
        (entries) => {
          wallOn = entries[0]?.isIntersecting ?? false;
        },
        { rootMargin: "120px" },
      );
      if (wall) wallObserver.observe(wall);
    }
  }
  function tickMarquee(dt: number) {
    if (reduced || rows.length !== 2 || !wallOn) return;
    const sp = (0.028 + Math.min(0.5, vel * 0.16)) * dt;
    off[0] -= sp;
    if (off[0] <= -mw[0]) off[0] += mw[0];
    off[1] += sp;
    if (off[1] >= 0) off[1] -= mw[1];
    rows[0].style.transform = "translate3d(" + off[0].toFixed(2) + "px,0,0)";
    rows[1].style.transform = "translate3d(" + off[1].toFixed(2) + "px,0,0)";
  }

  function route(p: Pt[], R: number) {
    let d = "M " + p[0][0] + " " + p[0][1];
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1];
      const c = p[i];
      const n = p[i + 1];
      const ix = Math.sign(c[0] - a[0]);
      const iy = Math.sign(c[1] - a[1]);
      const ox = Math.sign(n[0] - c[0]);
      const oy = Math.sign(n[1] - c[1]);
      const ri = Math.abs(c[0] - a[0]) + Math.abs(c[1] - a[1]);
      const ro = Math.abs(n[0] - c[0]) + Math.abs(n[1] - c[1]);
      const r = Math.min(R, ri / 2, ro / 2);
      if (r < 0.5) {
        d += " L " + c[0] + " " + c[1];
        continue;
      }
      d += " L " + (c[0] - ix * r) + " " + (c[1] - iy * r) + " Q " + c[0] + " " + c[1] + " " + (c[0] + ox * r) + " " + (c[1] + oy * r);
    }
    const l = p[p.length - 1];
    return d + " L " + l[0] + " " + l[1];
  }
  function bgOf(el: HTMLElement) {
    return getComputedStyle(el).getPropertyValue("--bg").trim() || "#F4F6F8";
  }

  let spine: Spine | null = null;
  function buildSpine(): Spine | null {
    const svg = $<SVGSVGElement>("[data-spine]");
    const W = root.clientWidth;
    if (!svg || !W) return null;
    svg.setAttribute("shape-rendering", "geometricPrecision");
    const band = W > 1024 ? 0 : W > 640 ? 1 : 2;
    const w = CFG.spine.w[band];
    const ringR = CFG.spine.ring * w;
    const S: Record<string, HTMLElement> = {};
    secs.forEach((s) => {
      const key = s.getAttribute("data-s");
      if (key) S[key] = s;
    });
    const wrap = S.hero ? $<HTMLElement>(".wrap", S.hero) : null;
    if (!wrap || !S.cta) return null;
    const wr = wrap.getBoundingClientRect();
    const cs0 = getComputedStyle(wrap);
    const pl = parseFloat(cs0.paddingLeft);
    const pr = parseFloat(cs0.paddingRight);
    const cl = wr.left + pl;
    const cr = wr.right - pr;
    const cw = cr - cl;
    const rr = Math.max(0, W - cr);
    let h1r = cl;
    $$<HTMLElement>("[data-hline]", S.hero).forEach((el) => {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const b = rg.getBoundingClientRect();
      if (b.right > h1r) h1r = b.right;
      rg.detach();
    });
    const R = CFG.spine.corner * w;
    const H = CFG.spine.hRun;
    const moveOff = (s: HTMLElement) => Math.min(70, parseFloat(getComputedStyle(s).paddingTop) * 0.45);
    let pts: Pt[] = [];
    const y0 = CFG.spine.ringTop + ringR + w / 2;
    if (band === 0) {
      let hx = Math.min((h1r + cr) / 2, cr - ringR - w / 2 - 4);
      hx = Math.max(hx, h1r + w / 2 + 40);
      const L: Record<string, number> = {
        hero: hx,
        wall: cl + 0.28 * cw,
        who: cl + 0.28 * cw,
        prob: cr + rr / 2,
        how: cr + rr / 2,
        why: cl + 0.62 * cw,
        for: cl + 0.28 * cw,
        proof: cl + 0.72 * cw,
        cta: cl + 0.72 * cw,
      };
      const order = ["hero", "wall", "who", "prob", "how", "why", "for", "proof", "cta"];
      pts.push([L.hero, y0 + ringR]);
      for (let i = 1; i < order.length; i++) {
        const nx = L[order[i]];
        const px = pts[pts.length - 1][0];
        if (Math.abs(nx - px) < 1 || !S[order[i]]) continue;
        const my = top(S[order[i]]) + moveOff(S[order[i]]);
        pts.push([px, my]);
        pts.push([nx, my]);
      }
      pts.push([L.cta, top(S.cta) + CFG.spine.endDy]);
    } else {
      const lane = W - Math.max(w / 2 + 4, (W - cr) / 2);
      const hx2 = W - (ringR + w / 2 + 10);
      const y1 = S.wall ? top(S.wall) + 40 : y0 + 200;
      pts.push([hx2, y0 + ringR]);
      pts.push([hx2, y1]);
      pts.push([lane, y1]);
      pts.push([lane, top(S.cta) + CFG.spine.endDy * 0.6]);
    }
    pts = pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
    const q: Pt[] = [pts[0]];
    for (let j = 1; j < pts.length; j++) {
      const a = q[q.length - 1];
      if (Math.abs(a[0] - pts[j][0]) < 0.5 && Math.abs(a[1] - pts[j][1]) < 0.5) continue;
      q.push(pts[j]);
    }
    const out: Pt[] = [q[0]];
    for (let k = 1; k < q.length - 1; k++) {
      const p0 = out[out.length - 1];
      const p1 = q[k];
      const p2 = q[k + 1];
      const col =
        (Math.abs(p0[0] - p1[0]) < 0.5 && Math.abs(p1[0] - p2[0]) < 0.5) ||
        (Math.abs(p0[1] - p1[1]) < 0.5 && Math.abs(p1[1] - p2[1]) < 0.5);
      if (!col) out.push(p1);
    }
    out.push(q[q.length - 1]);
    pts = out;
    const d = route(pts, R);
    const ctaTop = top(S.cta);
    const DOCH = Math.max(root.scrollHeight, ctaTop + 800);
    const sig = d + "|" + W + "|" + DOCH;
    if (spine && spine.sig === sig) return spine;
    svg.setAttribute("viewBox", "0 0 " + W + " " + DOCH);
    svg.style.height = DOCH + "px";
    svg.setAttribute("width", String(W));
    const started = state.ready || reduced;
    const heroBg = S.hero ? bgOf(S.hero) : "#F4F6F8";
    const ctaBg = bgOf(S.cta);
    const flip = CFG.spine.flipTo;
    const col0 = CFG.spine.color;
    let m = '<defs><linearGradient id="sg" gradientUnits="userSpaceOnUse" x1="0" y1="' + (ctaTop - 1) + '" x2="0" y2="' + ctaTop + '"><stop offset="0" style="stop-color:' + col0 + '"/><stop offset="1" style="stop-color:' + flip + '"/></linearGradient></defs>';
    m += '<path data-sp d="' + d + '" fill="none" stroke="url(#sg)" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
    const sx = pts[0][0];
    const sy = pts[0][1] - ringR;
    const ex = pts[pts.length - 1][0];
    const ey = pts[pts.length - 1][1];
    m += '<circle data-s0 cx="' + sx + '" cy="' + sy + '" r="' + ringR + '" fill="' + heroBg + '" stroke="' + col0 + '" stroke-width="' + w + '" style="transform-box:fill-box;transform-origin:center;transition:transform 600ms var(--ease),opacity 400ms linear;' + (started ? "" : "transform:scale(.2);opacity:0") + '"/>';
    m += '<circle data-s1 cx="' + ex + '" cy="' + ey + '" r="' + ringR + '" fill="' + ctaBg + '" stroke="' + flip + '" stroke-width="' + w + '" opacity="0"/>';
    svg.innerHTML = m;
    const path = $<SVGPathElement>("[data-sp]", svg);
    const s0 = $<SVGCircleElement>("[data-s0]", svg);
    const s1 = $<SVGCircleElement>("[data-s1]", svg);
    if (!path || !s0 || !s1) return null;
    const len = path.getTotalLength();
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(started ? 0 : len);
    const tab: [number, number][] = [];
    let L2 = 0;
    let tot = 0;
    const segs: { A: Pt; B: Pt; hz: boolean; len: number }[] = [];
    for (let s = 0; s < pts.length - 1; s++) {
      const A = pts[s];
      const B = pts[s + 1];
      const hz = Math.abs(A[1] - B[1]) < 0.5;
      const ln = Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]);
      segs.push({ A, B, hz, len: ln });
      tot += ln;
    }
    const kk = len / (tot || 1);
    for (let s2 = 0; s2 < segs.length; s2++) {
      const sg = segs[s2];
      if (sg.hz) {
        tab.push([sg.A[1] - H / 2, L2]);
        L2 += sg.len;
        tab.push([sg.A[1] + H / 2, L2]);
      } else {
        const ph = s2 > 0 && segs[s2 - 1].hz;
        const nh = s2 < segs.length - 1 && segs[s2 + 1].hz;
        const a2 = sg.A[1] + (ph ? H / 2 : 0);
        let b2 = sg.B[1] - (nh ? H / 2 : 0);
        if (b2 < a2) b2 = a2;
        tab.push([a2, L2]);
        L2 += sg.len;
        tab.push([b2, L2]);
      }
    }
    return { sig, path, len, k: kk, tab, s0, s1, w: W, band, last: -1 };
  }
  function lenAt(S: Spine, y: number) {
    const t = S.tab;
    if (!t.length) return 0;
    if (y <= t[0][0]) return 0;
    if (y >= t[t.length - 1][0]) return t[t.length - 1][1] * S.k;
    let lo = 0;
    let hi = t.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid][0] <= y) lo = mid;
      else hi = mid;
    }
    const a = t[lo];
    const b = t[hi];
    const f = b[0] === a[0] ? 1 : (y - a[0]) / (b[0] - a[0]);
    return (a[1] + (b[1] - a[1]) * f) * S.k;
  }
  function introSpine() {
    if (!spine) return;
    const S = spine;
    if (reduced) {
      S.path.style.strokeDashoffset = "0";
      return;
    }
    S.s0.style.transform = "scale(1)";
    S.s0.style.opacity = "1";
    S.path.style.transition = "stroke-dashoffset 1100ms var(--ease) 250ms";
    S.last = -1;
    tickSpine(window.scrollY, window.innerHeight);
    later(() => {
      if (spine?.path) spine.path.style.transition = "";
    }, 1500);
  }
  function tickSpine(y: number, vh: number) {
    const S = spine;
    if (!S) return;
    const L = Math.min(S.len, lenAt(S, y + vh * 0.62));
    if (!reduced && state.ready && Math.abs(L - S.last) > 0.4) {
      S.last = L;
      S.path.style.strokeDashoffset = (S.len - L).toFixed(1);
    }
    S.s1.setAttribute("opacity", reduced || L >= S.len - 1 ? "1" : "0");
  }

  let conn: Conn | null = null;
  const mobileMQ = window.matchMedia("(max-width: 640px)");
  function buildConn(): Conn | null {
    const wrap = $<HTMLElement>("[data-conn]");
    if (!wrap) return null;
    const svg = $<SVGSVGElement>("[data-cs]", wrap);
    if (!svg) return null;
    const box = wrap.getBoundingClientRect();
    if (!box.width) return null;
    function rel(el: HTMLElement) {
      const r = el.getBoundingClientRect();
      return {
        l: r.left - box.left,
        r: r.right - box.left,
        t: r.top - box.top,
        b: r.bottom - box.top,
        cx: r.left + r.width / 2 - box.left,
        cy: r.top + r.height / 2 - box.top,
      };
    }
    const src = $<HTMLElement>('[data-node="source"]', wrap);
    const hub = $<HTMLElement>('[data-node="hub"]', wrap);
    const tg = [0, 1, 2, 3].map((i) => $<HTMLElement>('[data-node="t' + i + '"]', wrap));
    if (!src || !hub || tg.some((n) => !n)) return null;
    const source = rel(src);
    const Hh = rel(hub);
    const R = CFG.conn.corner;
    const sw = CFG.conn.w;
    const boxes = tg.map((n) => rel(n as HTMLElement));
    const hues = ["var(--h0)", "var(--h1)", "var(--h2)", "var(--h3)"];
    const segs: { d: string; c: string }[] = [];
    if (mobileMQ.matches) {
      segs.push({ d: route([[source.cx, source.b], [Hh.cx, Hh.t]], R), c: "currentColor" });
      segs.push({ d: route([[Hh.cx, Hh.b], [Hh.cx, boxes[3].cy - 30]], R), c: "currentColor" });
      boxes.forEach((T, i) => {
        segs.push({ d: route([[Hh.cx, T.cy - 30], [Hh.cx, T.cy], [T.l, T.cy]], R), c: hues[i] });
      });
    } else {
      const trunkX = source.r + Math.max(16, (Hh.l - source.r) / 2);
      segs.push({ d: route([[source.r, source.cy], [trunkX, source.cy], [trunkX, Hh.cy], [Hh.l, Hh.cy]], R), c: "currentColor" });
      const bx = Hh.r + Math.max(20, (Math.min(...boxes.map((t) => t.l)) - Hh.r) / 2);
      boxes.forEach((T, i) => {
        segs.push({ d: route([[Hh.r, Hh.cy], [bx, Hh.cy], [bx, T.cy], [T.l, T.cy]], R), c: hues[i] });
      });
    }
    svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
    svg.innerHTML = segs
      .map((s) => '<path d="' + s.d + '" fill="none" stroke="' + s.c + '" stroke-width="' + sw + '" stroke-linecap="round" data-cp/>')
      .join("");
    const list = $$<SVGPathElement>("[data-cp]", svg);
    const drawn = conn ? conn.drawn : false;
    list.forEach((p) => {
      const l = p.getTotalLength();
      p.style.strokeDasharray = String(l);
      p.style.strokeDashoffset = String(reduced || drawn ? 0 : l);
      p.style.transition = drawn ? "none" : "stroke-dashoffset 900ms var(--ease)";
    });
    return { wrap, paths: list, drawn, w: box.width, h: box.height, topY: top(wrap) };
  }
  function tickConn(y: number, vh: number) {
    if (!conn) conn = buildConn();
    if (!conn) return;
    if (!conn.drawn && conn.topY - y < vh * 0.82) {
      conn.drawn = true;
      conn.paths.forEach((p, i) => {
        p.style.transitionDelay = i * 110 + "ms";
        p.style.strokeDashoffset = "0";
      });
    }
  }

  let pending = false;
  let raf = 0;
  function onScroll() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(scrollWork);
    }
  }
  let gone = false;
  function scrollWork() {
    pending = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    tickSpine(y, vh);
    tickMLines(y, vh);
    tickConn(y, vh);
    if (!busyMenu) polarity();
    syncGone();
  }
  function syncGone() {
    const g = !state.menu && window.scrollY > 100;
    if (g !== gone && hdr) {
      gone = g;
      hdr.classList.toggle("gone", g);
    }
  }
  function frame(t: number) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(60, t - (lastT || t));
    lastT = t;
    const y = window.scrollY;
    const tv = Math.abs(y - lastY) / Math.max(1, dt);
    vel += (tv - vel) * 0.12;
    lastY = y;
    tickMarquee(dt);
  }
  function start() {
    if (raf || state.hidden) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
    startVerbs();
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    stopVerbs();
  }
  function onVis() {
    state.hidden = document.hidden;
    if (state.hidden) stop();
    else start();
  }

  function relayout() {
    if (!alive) return;
    measure();
    setupWall();
    spine = buildSpine();
    if (conn) {
      const d = conn.drawn;
      conn = null;
      const c = buildConn();
      if (c) {
        c.drawn = d;
        if (d) {
          c.paths.forEach((p) => {
            p.style.strokeDashoffset = "0";
            p.style.transition = "none";
          });
        }
      }
      conn = c;
    }
    scrollWork();
  }
  let rt = 0;
  function schedule() {
    window.clearTimeout(rt);
    rt = later(relayout, 120);
  }
  function onMq() {
    reduced = mq.matches;
    stage.classList.toggle("rm", reduced);
    if (reduced) {
      showAll();
      stopVerbs();
    }
    schedule();
  }

  const copyBtn = $<HTMLButtonElement>("[data-copy]");
  let copyTimer = 0;
  function onCopy() {
    if (!copyBtn) return;
    const label = $<HTMLElement>("[data-copy-l]", copyBtn);
    if (!label) return;
    const text = label.textContent || "";
    const done = () => {
      label.textContent = "Copied";
      window.clearTimeout(copyTimer);
      copyTimer = later(() => {
        label.textContent = text;
      }, 1600);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
    else done();
  }
  const backBtn = $<HTMLButtonElement>("[data-btt]");
  function onBack() {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  let ro: ResizeObserver | null = null;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVis);
  mbtn?.addEventListener("click", onMenuButtonClick);
  copyBtn?.addEventListener("click", onCopy);
  backBtn?.addEventListener("click", onBack);
  mq.addEventListener("change", onMq);
  if (window.ResizeObserver) {
    ro = new ResizeObserver(schedule);
    ro.observe(root);
  }
  if (document.fonts?.ready) document.fonts.ready.then(() => {
    if (alive) schedule();
  });

  if (menu) menu.inert = true;
  measure();
  setupReveals();
  setupWall();
  if (reduced) spine = buildSpine();
  scrollWork();
  start();
  loader();

  return () => {
    alive = false;
    stop();
    timeouts.forEach((id) => clearTimeout(id));
    window.clearTimeout(hideMenuTimer);
    window.clearTimeout(copyTimer);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVis);
    mbtn?.removeEventListener("click", onMenuButtonClick);
    copyBtn?.removeEventListener("click", onCopy);
    backBtn?.removeEventListener("click", onBack);
    list?.removeEventListener("mouseleave", onListLeave);
    itemCleanups.forEach((fn) => fn());
    mq.removeEventListener("change", onMq);
    ro?.disconnect();
    wallObserver?.disconnect();
    revealObserver?.disconnect();
    document.body.style.overflow = "";
    html.style.removeProperty("--sbw");
    stage.classList.remove("ready", "menu-open", "rm");
    if (main) main.inert = false;
    if (logo) logo.inert = false;
    if (menu) {
      menu.inert = true;
      menu.style.visibility = "";
      menu.style.transform = "";
    }
  };
}
