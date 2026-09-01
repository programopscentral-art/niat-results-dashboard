# Libraries & 21st.dev / Magic MCP

## Install commands (surface to the user; let them run)

```bash
# core animation
npm i framer-motion
npm i gsap                 # scroll-driven / timeline-heavy motion
npm i canvas-confetti      # celebrations
# 3D / shaders (heavy — only for real 3D)
npm i three @react-three/fiber @react-three/drei
# motion component primitives (open-source, unstyled)
npm i motion              # 'motion/react' — successor package to framer-motion
```

Tailwind is assumed for the recipes. If not present:
```bash
npm i -D tailwindcss @tailwindcss/postcss postcss
```

## 21st.dev — what it is

21st.dev is a **web catalog** of animated React + Tailwind components (buttons, backgrounds, cards, hero sections, effects) with live previews and copy-paste code. The `/community/bookmarks` page is a curated saved-set on that site. There is **no downloadable "skill" file** — you use it two ways:

1. **Browse & copy** — open a component on 21st.dev, copy its code + Tailwind classes into your project. Many are the same patterns captured in `effects.md`.
2. **Magic MCP** — an MCP server from 21st.dev that generates 21st.dev-style components on demand from a natural-language prompt. This is the closest thing to "installing" 21st.dev into this environment.

## Magic MCP setup (optional, needs a free API key)

1. Get an API key from the 21st.dev Magic console (the user must sign in and create one — I cannot create accounts or enter credentials).
2. Add the server. In **Claude Code**, either run:
   ```bash
   claude mcp add magic -- npx -y @21st-dev/magic@latest API_KEY=YOUR_KEY
   ```
   …or add it to a project `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "magic": {
         "command": "npx",
         "args": ["-y", "@21st-dev/magic@latest"],
         "env": { "API_KEY": "YOUR_KEY" }
       }
     }
   }
   ```
3. Restart the session so the MCP tools load. Then ask for a component (e.g. "a glassmorphism pricing card with an animated gradient border") and the Magic tools return ready-to-paste code.

Notes:
- `@21st-dev/magic` runs via `npx`, which downloads and executes a remote package — in a locked-down session that may be blocked; the user runs the install/add step themselves.
- Keep the API key out of committed files; prefer `claude mcp add` or an untracked `.mcp.json`.
- Without the key, everything still works via the copy-paste recipes in `effects.md` — the MCP is a convenience, not a dependency.

## Choosing a tool

| Need | Reach for |
|------|-----------|
| Enter/exit, layout, gestures, most UI motion | Framer Motion / `motion` |
| Scroll-scrubbed timelines, pinning, complex sequencing | GSAP + ScrollTrigger |
| Simple loops, hovers, gradients, shimmer | Plain CSS (cheapest) |
| Real 3D, shaders, particles-in-depth | three + react-three-fiber |
| On-demand generated components in this style | 21st.dev Magic MCP |
| Coherent palette / style / fonts to build on | the `ui-ux-pro-max` skill generator |
