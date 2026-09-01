# Themes — Multi-Theme System (light / dark / brand)

Goal: switch entire look via one attribute, no flash-of-wrong-theme, all colors driven by semantic tokens so effects and gradients stay consistent.

## 1. Token layer (CSS variables)

Define every color as a semantic token. Default `:root` = light. Override per theme with `[data-theme="…"]` and a `.dark` fallback for OS preference. Use the token names emitted by the `ui-ux-pro-max` design-system generator so both skills agree.

```css
:root {
  --color-background: #f8fafc;  --color-foreground: #0f172a;
  --color-card: #ffffff;        --color-card-foreground: #0f172a;
  --color-primary: #6d28d9;     --color-on-primary: #ffffff;
  --color-secondary: #2563eb;   --color-on-secondary: #ffffff;
  --color-accent: #f59e0b;      --color-on-accent: #0f172a;
  --color-muted: #e9eef6;       --color-muted-foreground: #475569;
  --color-border: #e2e8f0;      --color-destructive: #dc2626;
  --radius: 0.75rem;
}

/* OS-driven dark when no explicit choice */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-background:#0b0f1a; --color-foreground:#e5e7eb;
    --color-card:#111827;       --color-card-foreground:#e5e7eb;
    --color-muted:#1f2937;      --color-muted-foreground:#9ca3af;
    --color-border:#1f2937;
  }
}

/* explicit themes win over OS */
[data-theme="light"] { color-scheme: light; }  /* uses :root defaults */
[data-theme="dark"] {
  color-scheme: dark;
  --color-background:#0b0f1a; --color-foreground:#e5e7eb;
  --color-card:#111827;       --color-card-foreground:#e5e7eb;
  --color-muted:#1f2937;      --color-muted-foreground:#9ca3af;
  --color-border:#1f2937;
}
/* extra brand theme — duplicate + swap accents for as many as you want */
[data-theme="neon"] {
  color-scheme: dark;
  --color-background:#05010f; --color-foreground:#e9d5ff;
  --color-card:#120826;       --color-card-foreground:#f5f3ff;
  --color-primary:#d946ef;    --color-on-primary:#05010f;
  --color-accent:#22d3ee;     --color-on-accent:#05010f;
  --color-border:#3b0764;     --color-muted:#1e1035; --color-muted-foreground:#c4b5fd;
}

body { background: var(--color-background); color: var(--color-foreground); }
```

## 2. Tailwind wiring (if using Tailwind)

Map tokens so `bg-background`, `text-primary`, etc. resolve to the variables.

**Tailwind v4** (`@theme` in your CSS):
```css
@theme inline {
  --color-background: var(--color-background);
  --color-foreground: var(--color-foreground);
  --color-primary: var(--color-primary);
  --color-card: var(--color-card);
  /* …one line per token… */
}
```
**Tailwind v3** (`tailwind.config.js`):
```js
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: { extend: { colors: {
    background: "var(--color-background)", foreground: "var(--color-foreground)",
    card: "var(--color-card)", primary: "var(--color-primary)",
    secondary: "var(--color-secondary)", accent: "var(--color-accent)",
    muted: "var(--color-muted)", border: "var(--color-border)",
  }, borderRadius: { DEFAULT: "var(--radius)" } } },
};
```

## 3. No-flash init (run before paint, in `<head>`)

Blocking inline script that sets the attribute before first paint — prevents the theme flicker:
```html
<script>
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (!t) t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
</script>
```

## 4. Toggle / theme picker

Vanilla:
```js
function setTheme(t){ document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("theme", t); } catch(e){} }
// setTheme("dark") | setTheme("light") | setTheme("neon")
```

React hook:
```tsx
"use client";
import { useEffect, useState } from "react";
const THEMES = ["light","dark","neon"] as const;
export function useTheme() {
  const [theme, set] = useState<string>("light");
  useEffect(() => { const t = document.documentElement.getAttribute("data-theme") || "light"; set(t); }, []);
  const apply = (t: string) => { document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch {} set(t); };
  const cycle = () => apply(THEMES[(THEMES.indexOf(theme as any)+1) % THEMES.length]);
  return { theme, setTheme: apply, cycle, THEMES };
}
```

## Rules

- **Never** hardcode hex in components — always `var(--color-*)` / Tailwind token. This is what lets gradients, glass, and glows re-theme for free.
- Add `color-scheme` per theme so native controls (scrollbars, inputs) match.
- Test contrast in **every** theme, not just light. Neon/dark themes fail contrast most often on `muted-foreground` text.
- For smooth switches, add `transition: background-color .3s, color .3s` on `body` — but gate it behind `prefers-reduced-motion`.
