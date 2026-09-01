---
name: crazy-ui
description: "Bold, animated, effect-heavy web UI: aurora/gradient/particle backgrounds, glassmorphism, spotlight & 3D-tilt cards, magnetic/shimmer buttons, animated borders & beams, marquees, scroll & text reveals, bento grids, confetti, and multi-theme (light/dark/brand) systems. Use this skill when the user asks for 'crazy', 'wow', 'flashy', 'animated', 'modern', or 'premium' UI, or wants motion, effects, transitions, or theme switching — for React/Next + Tailwind + Framer Motion/GSAP, or plain HTML/CSS. Pairs with the ui-ux-pro-max skill (run its generator first for palette/style/fonts). Also documents 21st.dev components and the Magic MCP."
---

# Crazy UI — High-Impact Animations, Effects & Themes

Production-ready recipes for visually striking interfaces: motion, backgrounds, hover effects, and multi-theme systems that stay accessible and performant.

## When to Apply

Use this skill when the request is about how the UI **looks, moves, or feels**: "make it crazy / flashy / wow / premium / modern", animated hero, fancy buttons/cards, background effects, page/scroll transitions, theme switching (dark/light/brand), or micro-interactions. Skip it for pure backend, data, or non-visual work.

## Workflow (do these in order)

1. **Set the foundation first.** Run the `ui-ux-pro-max` skill's generator to lock a coherent palette, style, and font pairing before adding effects — effects on an inconsistent base look worse, not better:
   ```bash
   python "./.claude/skills/ui-ux-pro-max/scripts/search.py" "<product> <keywords>" --design-system --variance 9 --motion 9 -p "Project"
   ```
   Also query motion specifically: `--domain ux` with terms like `"reduced motion parallax"` and `--stack <your-stack>`.
2. **Detect the stack** (`package.json`, etc.). Default recipes below are **React + Tailwind + Framer Motion**; a **plain HTML/CSS** variant is in `references/effects.md` for non-React targets (e.g. static report pages).
3. **Pick effects from the catalog** (below) — combine at most 2–3 hero effects per screen. More than that reads as noise, not craft.
4. **Wire the theme system** from `references/themes.md` (CSS variables + `.dark`/`[data-theme]`, one toggle, persisted).
5. **Respect the non-negotiables** (see Guardrails) — every animation ships with `prefers-reduced-motion`, keyboard focus, and contrast intact.

## Effect Catalog

Full copy-paste code for each is in **`references/effects.md`**. Read it on demand.

| # | Effect | Best for | Cost | File section |
|---|--------|----------|------|--------------|
| 1 | Aurora / animated gradient background | Hero, landing | low | Backgrounds |
| 2 | Particle / starfield / grid background | Hero, empty states | med | Backgrounds |
| 3 | Animated conic/gradient border | Cards, CTAs, badges | low | Borders |
| 4 | Animated beam / connecting line | Feature graphs, "how it works" | med | Borders |
| 5 | Glassmorphism panel | Navbars, modals, cards | low | Surfaces |
| 6 | Spotlight-follow card | Pricing, feature cards | low | Cards |
| 7 | 3D tilt (pointer parallax) card | Product shots, hero cards | med | Cards |
| 8 | Magnetic button | Primary CTAs | low | Buttons |
| 9 | Shimmer / shine sweep button | CTAs, badges | low | Buttons |
| 10 | Gradient text + animated underline | Headings, links | low | Text |
| 11 | Word/line staggered reveal | Hero headline, sections | low | Text |
| 12 | Number count-up / ticker | Stats, KPI dashboards | low | Text |
| 13 | Scroll-reveal on view | Any section | low | Scroll |
| 14 | Sticky scroll / scrollytelling | Feature walkthrough | med | Scroll |
| 15 | Marquee / infinite logo strip | Social proof | low | Motion |
| 16 | Bento grid layout | Feature overview, dashboards | low | Layout |
| 17 | Page / route transition | SPA navigation | med | Motion |
| 18 | Confetti / success burst | Completion, celebration | low | Feedback |
| 19 | Skeleton shimmer loaders | Data loading | low | Feedback |
| 20 | Cursor glow / trailing dot | Whole-page flourish | med | Motion |

## Theme System

`references/themes.md` gives a drop-in multi-theme setup: semantic CSS variables, `light`/`dark`/custom brand themes via `[data-theme]`, a persisted toggle (no flash-of-wrong-theme), and Tailwind wiring. Always drive colors through tokens (`--color-primary`), never raw hex in components — this is what makes theme-switching and "crazy" gradients maintainable.

## Libraries & 21st.dev / Magic MCP

`references/libraries.md` covers install commands and the **21st.dev** ecosystem:
- Component sources: 21st.dev, plus the open patterns behind it (Framer Motion, GSAP, motion-primitives, react-three-fiber for 3D/shaders).
- **Magic MCP** (`@21st-dev/magic`) — an MCP server that generates 21st.dev-style components on demand. Requires a free API key; setup steps and the `.mcp.json` snippet are in that file. This is the closest thing to "installing" 21st.dev.

## Guardrails (do not skip)

- **Reduced motion:** wrap every non-essential animation so it is disabled/short under `@media (prefers-reduced-motion: reduce)` and present a static final state.
- **Performance:** animate only `transform` and `opacity` (GPU-friendly). Never animate `width`, `height`, `top`, `left`, or box-shadow spread in a loop. Add `will-change` sparingly; remove after.
- **Accessibility:** keep text contrast ≥ 4.5:1 over animated/gradient backgrounds (add an overlay if needed), keep visible focus rings, and ensure all interactive effects are keyboard-operable.
- **Restraint:** 2–3 hero effects max per view; effects support the content, they are not the content.

This skill provides UI recipes only. It does not install packages or change system settings on its own — surface install commands to the user and let them run them.
