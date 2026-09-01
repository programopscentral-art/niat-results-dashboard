# Effects — Copy-Paste Recipes

Primary stack: **React + Tailwind + Framer Motion** (`npm i framer-motion`). GSAP noted where it wins (`npm i gsap`). A **plain HTML/CSS** variant is at the bottom for static pages (e.g. report exports).

Assumes the theme tokens from `themes.md` exist (`--color-primary`, etc.). All animations must honor `prefers-reduced-motion` — helpers at the end.

---

## Backgrounds

### 1. Aurora / animated gradient (CSS only — cheapest, works everywhere)
```css
.aurora {
  position: relative; overflow: hidden; isolation: isolate;
  background: var(--color-background);
}
.aurora::before {
  content: ""; position: absolute; inset: -30%; z-index: -1;
  background:
    radial-gradient(40% 40% at 20% 30%, hsl(265 90% 60% / .45), transparent 60%),
    radial-gradient(35% 35% at 80% 20%, hsl(190 90% 55% / .40), transparent 60%),
    radial-gradient(45% 45% at 60% 80%, hsl(330 90% 60% / .40), transparent 60%);
  filter: blur(60px);
  animation: aurora 18s ease-in-out infinite alternate;
}
@keyframes aurora {
  0%   { transform: translate3d(0,0,0) rotate(0deg)   scale(1); }
  100% { transform: translate3d(3%, -4%, 0) rotate(12deg) scale(1.15); }
}
@media (prefers-reduced-motion: reduce){ .aurora::before{ animation: none; } }
```

### 2. Particle / starfield (canvas, framework-agnostic)
```js
// mount: attach to a <canvas> that fills its parent
function starfield(canvas){
  const ctx = canvas.getContext("2d");
  let w, h, stars, raf;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resize = () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight;
    stars = Array.from({length: Math.min(140, (w*h)/9000)}, () => ({
      x: Math.random()*w, y: Math.random()*h, z: Math.random()*0.8+0.2 })); };
  const tick = () => { ctx.clearRect(0,0,w,h); ctx.fillStyle = "rgba(255,255,255,.8)";
    for(const s of stars){ s.y += s.z*0.4; if(s.y>h) s.y=0;
      ctx.globalAlpha = s.z; ctx.beginPath(); ctx.arc(s.x,s.y,s.z*1.6,0,7); ctx.fill(); }
    raf = requestAnimationFrame(tick); };
  resize(); addEventListener("resize", resize);
  if(!reduce) tick(); else { /* draw one static frame */ ctx.fillStyle="rgba(255,255,255,.6)"; stars.forEach(s=>ctx.fillRect(s.x,s.y,1,1)); }
  return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
}
```
Grid variant: replace the CSS `background` with `linear-gradient(...)` grid lines + a radial mask (`mask-image: radial-gradient(circle, black, transparent 70%)`).

---

## Borders

### 3. Animated conic gradient border (React)
```tsx
export function GradientBorder({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl p-[2px] overflow-hidden">
      <span className="absolute inset-[-200%] animate-[spin_6s_linear_infinite]
        bg-[conic-gradient(from_0deg,transparent,var(--color-primary),transparent_30%)]
        motion-reduce:animate-none" />
      <div className="relative rounded-2xl bg-[var(--color-card)] p-6">{children}</div>
    </div>
  );
}
```

### 4. Animated beam (SVG path draw — for "how it works" diagrams)
```tsx
import { motion } from "framer-motion";
export const Beam = () => (
  <svg viewBox="0 0 400 100" className="w-full">
    <motion.path d="M10,50 C120,10 280,90 390,50" fill="none"
      stroke="var(--color-primary)" strokeWidth="2"
      initial={{ pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true }} transition={{ duration: 1.4, ease: "easeInOut" }} />
  </svg>
);
```

---

## Surfaces

### 5. Glassmorphism panel
```css
.glass {
  background: color-mix(in srgb, var(--color-card) 55%, transparent);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  border: 1px solid color-mix(in srgb, var(--color-foreground) 12%, transparent);
  box-shadow: 0 8px 32px rgb(0 0 0 / .18);
}
```
Keep text on glass at full-opacity token color; test contrast against the busiest background behind it.

---

## Cards

### 6. Spotlight-follow card (pointer-tracked radial highlight)
```tsx
"use client";
import { useRef } from "react";
export function SpotlightCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.MouseEvent) => {
    const el = ref.current!, r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={move}
      className="group relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "radial-gradient(240px circle at var(--x) var(--y), color-mix(in srgb, var(--color-primary) 25%, transparent), transparent 70%)" }} />
      <div className="relative">{children}</div>
    </div>
  );
}
```

### 7. 3D tilt card (Framer Motion)
```tsx
"use client";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
export function TiltCard({ children }: { children: React.ReactNode }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-.5,.5], [10,-10]), { stiffness: 200, damping: 15 });
  const ry = useSpring(useTransform(x, [-.5,.5], [-10,10]), { stiffness: 200, damping: 15 });
  return (
    <motion.div style={{ rotateX: rx, rotateY: ry, transformPerspective: 800 }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - .5); y.set((e.clientY - r.top) / r.height - .5); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      className="rounded-2xl bg-[var(--color-card)] p-6 shadow-xl will-change-transform">
      {children}
    </motion.div>
  );
}
```

---

## Buttons

### 8. Magnetic button (pointer attraction)
```tsx
"use client";
import { motion, useMotionValue, useSpring } from "framer-motion";
export function MagneticButton({ children }: { children: React.ReactNode }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 }), sy = useSpring(y, { stiffness: 300, damping: 20 });
  return (
    <motion.button style={{ x: sx, y: sy }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width/2) * .4); y.set((e.clientY - r.top - r.height/2) * .4); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      className="rounded-full bg-[var(--color-primary)] px-6 py-3 font-medium text-[var(--color-on-primary)]">
      {children}
    </motion.button>
  );
}
```

### 9. Shimmer / shine sweep (CSS)
```css
.shimmer { position: relative; overflow: hidden; }
.shimmer::after {
  content:""; position:absolute; inset:0;
  background: linear-gradient(110deg, transparent 30%, rgb(255 255 255 / .35) 50%, transparent 70%);
  transform: translateX(-100%); animation: shine 2.6s infinite;
}
@keyframes shine { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce){ .shimmer::after{ animation:none; } }
```

---

## Text

### 10. Gradient text + animated underline
```css
.grad-text {
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent), var(--color-secondary));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  background-size: 200% auto; animation: grad 5s linear infinite;
}
@keyframes grad { to { background-position: 200% center; } }
.underline-grow { position: relative; }
.underline-grow::after { content:""; position:absolute; left:0; bottom:-2px; height:2px; width:100%;
  background: var(--color-primary); transform: scaleX(0); transform-origin: left; transition: transform .3s; }
.underline-grow:hover::after { transform: scaleX(1); }
@media (prefers-reduced-motion: reduce){ .grad-text{ animation:none; } }
```

### 11. Word/line staggered reveal (Framer Motion)
```tsx
import { motion } from "framer-motion";
export const RevealHeading = ({ text }: { text: string }) => (
  <motion.h1 className="text-5xl font-bold" initial="hidden" whileInView="show" viewport={{ once: true }}
    variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
    {text.split(" ").map((w, i) => (
      <motion.span key={i} className="inline-block mr-2"
        variants={{ hidden: { y: "100%", opacity: 0 }, show: { y: 0, opacity: 1 } }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>{w}</motion.span>
    ))}
  </motion.h1>
);
```

### 12. Count-up number (KPI/stats)
```tsx
"use client";
import { useEffect, useRef } from "react";
import { animate, useInView } from "framer-motion";
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => { if (!inView || !ref.current) return;
    const ctrl = animate(0, to, { duration: 1.2, ease: "easeOut",
      onUpdate: (v) => { if (ref.current) ref.current.textContent = Math.round(v).toLocaleString() + suffix; } });
    return () => ctrl.stop(); }, [inView, to, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}
```

---

## Scroll

### 13. Scroll-reveal on view (reusable wrapper)
```tsx
import { motion } from "framer-motion";
export const Reveal = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay, ease: "easeOut" }}>
    {children}
  </motion.div>
);
```

### 14. Sticky scrollytelling — use GSAP ScrollTrigger
```js
import gsap from "gsap"; import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
gsap.to(".panel", { xPercent: -100 * 2, ease: "none",
  scrollTrigger: { trigger: ".track", pin: true, scrub: 1, end: "+=2000" } });
// Gate behind: if (!matchMedia("(prefers-reduced-motion: reduce)").matches) { ...register... }
```

---

## Motion

### 15. Marquee (CSS, pauses on hover)
```css
.marquee { overflow: hidden; }
.marquee__track { display: inline-flex; gap: 3rem; animation: marquee 22s linear infinite; }
.marquee:hover .marquee__track { animation-play-state: paused; }
@keyframes marquee { to { transform: translateX(-50%); } } /* duplicate children once for seamless loop */
@media (prefers-reduced-motion: reduce){ .marquee__track{ animation:none; } }
```

### 17. Page/route transition (Framer Motion `AnimatePresence`)
```tsx
import { AnimatePresence, motion } from "framer-motion";
// wrap route content, keyed by pathname
<AnimatePresence mode="wait">
  <motion.main key={pathname}
    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
    transition={{ duration: 0.25 }}>{children}</motion.main>
</AnimatePresence>
```

### 20. Cursor glow (fixed radial that follows pointer)
```tsx
"use client";
import { useEffect } from "react";
export function CursorGlow(){
  useEffect(()=>{ if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el=document.createElement("div");
    el.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:9999;transition:background .1s";
    document.body.appendChild(el);
    const m=(e:PointerEvent)=>{ el.style.background=
      `radial-gradient(200px circle at ${e.clientX}px ${e.clientY}px, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 70%)`; };
    addEventListener("pointermove",m); return()=>{ removeEventListener("pointermove",m); el.remove(); }; },[]);
  return null;
}
```

---

## Feedback

### 18. Confetti — `npm i canvas-confetti`
```ts
import confetti from "canvas-confetti";
export const celebrate = () => { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } }); };
```

### 19. Skeleton shimmer
```css
.skeleton { background: linear-gradient(90deg, var(--color-muted) 25%, color-mix(in srgb,var(--color-muted) 60%, #fff) 37%, var(--color-muted) 63%);
  background-size: 400% 100%; animation: skel 1.4s ease infinite; border-radius:.5rem; }
@keyframes skel { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
@media (prefers-reduced-motion: reduce){ .skeleton{ animation:none; } }
```

---

## Layout

### 16. Bento grid
```html
<div class="grid grid-cols-4 auto-rows-[minmax(0,1fr)] gap-4">
  <div class="col-span-2 row-span-2 rounded-3xl ...">A (big)</div>
  <div class="col-span-2 rounded-3xl ...">B</div>
  <div class="rounded-3xl ...">C</div>
  <div class="rounded-3xl ...">D</div>
</div>
```
Collapse to `grid-cols-1` on mobile; vary `col-span`/`row-span` so tiles feel intentional, not uniform.

---

## Reduced-motion helpers

React hook:
```tsx
import { useEffect, useState } from "react";
export const usePrefersReducedMotion = () => {
  const [r, setR] = useState(false);
  useEffect(() => { const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setR(mq.matches); const h = () => setR(mq.matches); mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h); }, []);
  return r;
};
```
Global CSS kill-switch (catch-all safety net):
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important;
    transition-duration: .001ms !important; scroll-behavior: auto !important; }
}
```

---

## Plain HTML/CSS variant (no React — for static report pages)

Use the CSS-only recipes above (aurora #1, glass #5, shimmer #9, gradient text #10, marquee #15, skeleton #19). For scroll-reveal without a framework:
```html
<div class="reveal">…</div>
<style>.reveal{opacity:0;transform:translateY(24px);transition:.6s ease} .reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}</style>
<script>
const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add("in")),{threshold:.15});
document.querySelectorAll(".reveal").forEach(el=>io.observe(el));
</script>
```
