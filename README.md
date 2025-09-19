# Compatify – Baseline Tooling Hackathon Project

**Repo-wide Web Compatibility Analysis for Modern Teams**

Compatify helps web development teams **see the big picture of browser compatibility** across their projects.  
Instead of only warning individual developers in their editor, Compatify scans the entire repository and generates a **Baseline Compatibility Report** — ensuring teams catch issues before they hit production.

---

## 🎯 Problem

Web developers often adopt new features without realizing they’re not universally supported.  
Existing tools (like VS Code tips or ESLint rules) catch issues locally, but **teams lack a project-wide view of compatibility**.  
This leads to:

- Bugs in production  
- Wasted debugging time  
- Inconsistent user experiences  

---

## 💡 Solution

A **Next.js dashboard** that integrates with Git repositories (GitHub/GitLab) and automatically generates a **Baseline Compatibility Report** for the whole codebase.

---

## ⚙ How It Works

### 1. Repo Integration
- Connect GitHub/GitLab repo via OAuth  
- Dashboard pulls codebase for analysis  

### 2. Baseline Analysis Engine
- Scans **HTML, CSS, JS** (with React/Vue support planned)  
- Uses **[web-features npm package](https://www.npmjs.com/package/web-features)** + **Web Platform Dashboard** data  
- Detects features with limited or no cross-browser support  

### 3. Report Generation
- ✅ Features safe everywhere  
- ⚠ Features with limited support (with browser breakdowns)  
- ❌ Unsafe features → with file + line numbers  
- Suggests fallbacks, polyfills, or alternatives  

### 4. CI/CD Integration
- GitHub Action or GitLab pipeline integration  
- PRs automatically get comments summarizing new compatibility issues  

### 5. Visualization
- **Compatibility score** (e.g., 87% Baseline compliant)  
- **Trends over time** → track if the repo is becoming more/less compatible  
- **Targeted filters** (e.g., "What if we must support Safari 15+?")  

---

## 🌟 Key Features

- 📊 **Repo-level insights** → not just per-dev hints  
- ⚙️ **Configurable target browsers** → tailored for each team  
- 🗂 **Precise code mapping** → exact file + line flagged  
- 🔓 **Open-source** → MIT/Apache 2.0 licensed  
- ☁️ **Hosted dashboard** → easy team adoption  

---

## 🛠 Tech Stack

- **Frontend & Dashboard:** Next.js, TailwindCSS  
- **Backend / Analysis Engine:** Node.js (AST parsers: Babel, PostCSS, ESLint)  
- **Data Sources:** web-features npm package, Web Platform Dashboard  
- **Database:** Firestore  
- **Auth & Repo Linking:** GitHub/GitLab OAuth, webhooks for PR triggers

---

## 🔑 Why Compatify?

Existing tools → help **individual developers**.  
Compatify → helps **entire teams** by:  
- Providing a **holistic view** of compatibility across repos  
- Tracking **historical trends**  
- Integrating with **PR workflows**  

⚡ This makes Compatify **unique, practical, and extensible** — more than just another linter.

---

## 🚀 Getting Started (Dev Setup)

```bash
# Clone repo
git clone https://github.com/1-kabir/compatify.git
cd compatify

# Install dependencies
npm install

# Run locally
npm run dev
```