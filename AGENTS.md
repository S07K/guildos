# Agent Context: GuildOS (guildos.design)

## Role & Prime Directive
You are an expert AI system architect and full-stack developer. Your task is to build **GuildOS** (`guildos.design`), an automated, multi-tenant design agency platform where a swarm of specialized AI agents acts as a full-service design agency.

**CRITICAL DIRECTIVE ON STACK AND PATTERNS:**
Do not assume or enforce arbitrary tech stacks, frameworks, or rigid code patterns on existing workspaces. Scan, analyze, and strictly conform to the existing repository conventions, architecture, and tech stack already established in the codebase. Build all new capabilities modularly into the current project structure.

---

## 1. System & Functional Architecture

### A. Authentication & Multi-Tenancy
* **SSO & Workspaces:** Support enterprise and social Single Sign-On (SSO) mapped directly to workspaces and role-based access control.
* **Strict Tenant Isolation:** Enforce rigorous multi-tenant data boundaries across all database queries, agent memory, asset storage, and session state. Prevent any possibility of cross-organizational data leakage.

### B. Bring Your Own Key (BYOK) Layer
* **Dual Provisioning:** Allow users to connect via provider SSO/federation or manually paste provider API keys (OpenAI, Anthropic, Google, etc.).
* **Credential Vault:** Encrypt keys immediately at rest; decrypt strictly in-memory at execution time. Provide workspace-level shared keys alongside user-level personal overrides.
* **Telemetry & Cost Dashboard:** Intercept all outbound model requests. Log prompt and completion tokens, calculate exact fractional usage against live pricing tables, and surface consumption breakdowns by project, date, and agent role.

### C. Agent Orchestration Engine
* **Specialist Pool:** Orchestrate distinct agent personas (Creative Director, UX Architect, UI Designer, Copywriter, and QA/Accessibility Critic).
* **Deterministic Critique Loops:** Before exposing drafts to the user, run automated review cycles (contrast checks, token consistency, grid rules) with agent-to-agent feedback loops.
* **Live Streaming Telemetry:** Expose real-time logs, intermediate artifacts, and agent thought streams to the frontend dashboard.

### D. Abstracted Storage & Local Sandboxing
* **Storage Abstraction:** Implement an abstracted storage interface that writes to local disk during development and dynamically switches to cloud storage in production without altering business logic.
* **Tool & MCP Layer:** Provide sandboxed execution environments for agents to interact with external tools and design protocols (e.g., Figma MCP servers).

---

## 2. Marketing Website & UI Implementation Engine

When building the public-facing marketing site (`guildos.design`) and crafting the frontend visual effects, you must eliminate no-code bloat and follow the exact code-first, high-velocity methodology outlined by Dhravya Shah (Supermemory).

### A. Core References & Repositories to Use
You must inspect, pull patterns from, and directly integrate the following repositories:

1. **SVG Animation Rules & Directives:**
   * Reference: `https://github.com/supermemoryai/skills/blob/main/svg-animations/SKILL.md`
   * Requirement: Follow the rules in this skill file to create hand-crafted, high-performance SVG animations directly in code. Avoid embedding heavy GIFs or bloated client-side animation packages where lightweight animated SVGs can accomplish the visual hierarchy.

2. **Visual Effects & Terminal Polish:**
   * Reference: `https://github.com/dhravya/landing-effects`
   * Requirement: Utilize and integrate the modular visual components from this package—specifically the animated ASCII art, pixelation shaders, and lightweight interactive canvas effects—to give the landing page a distinctive, high-craft developer aesthetic without dragging down web vitals.

3. **Context & Continuous Memory Loop:**
   * Reference: `https://github.com/supermemoryai/claude-supermemory`
   * Requirement: Model the platform's memory system after this architecture. Agents must not operate in isolation; project briefs, team feedback, past revision logs, and brand documents must be ingested into a shared vector memory so every generated layout and copy snippet is grounded in business context.

### B. Inspiration & Benchmarks
* **Product Benchmarks:** Study `https://uxmagic.ai/` and `https://uxpilot.ai/` for AI-to-Figma workflows, and `https://pen.dev/` for agentic canvas interactions.
* **Design Systems & MCP Integration:** Follow the governance and token automation patterns documented in `https://www.parallelhq.com/blog/automating-design-systems-with-ai`.
* **Workflow Philosophy:** Adhere to the principles in Dolly Borade's workflow (`https://medium.com/@dollyborade07/i-automated-60-of-my-ui-ux-design-workflow-with-ai-but-100-of-the-thinking-is-still-mine-e067a49e89c0`): automate the 60% repetitive generation tasks while giving the human operator 100% control over strategic direction via the review dashboard.
* **Curation & Layout Repositories:** Reference structures from `mobbin.com`, `pageflows.com`, `supahero.io`, and `Loadmo.re` for production layout and empty-state inspiration.

---

## 3. Development & Execution Instructions
1. **Analyze Codebase First:** Prior to implementing any module, inspect existing configs, directories, and code patterns in the current workspace. Conform strictly to established conventions.
2. **Step-by-Step Delivery:** Implement the security vault and tenant isolation first, followed by the storage abstraction, telemetry interceptors, agent orchestration, and finally the high-polish frontend.
3. **No Placeholders:** Deliver complete, runnable implementations without generic mock blocks or unconfigured dependencies.

---

## Phase 1 Execution: The Waitlist MVP
Before building the core multi-agent orchestration, the immediate priority is to deploy a high-converting waitlist landing page to validate market demand.

* **Objective:** Capture user interest and collect emails through a seamless "Join Waitlist" flow.
* **Core Functionality:** Implement an email input field on the hero section. It must validate the email format, securely store it in a database, and display a polished success state (e.g., "You're on the list").
* **Implementation Rule:** Since this is a brand new project, initialize the repository from scratch using Next.js (App Router) and Tailwind CSS. Set up a lightweight database solution (like Supabase) to handle the waitlist email capture. 
* **Visual Identity:** The waitlist page must act as the primary marketing asset, strictly adhering to the "GuildOS Aesthetic" defined above (high-contrast dark mode, minimal bento-box layouts, and lightweight SVG animations) to pitch the vision of the product beautifully.
