window.PRODUCT_SITE = {
  name: "md-reader",
  mark: "MD",
  product: "markdown",
  kicker: "Lightweight Markdown reading for AI-heavy work",
  headline: "A Markdown reader that lets the document use your whole screen.",
  subhead: "md-reader started from a simple annoyance: too many Markdown viewers lock the page into a skinny column. This one opens plain .md files, lets you widen or narrow the reading surface, zoom cleanly, use tabs and a file pane, and optionally highlight what an AI agent changed.",
  insight: "The core job is reading, not ceremony. Open the file, make the text comfortable, keep multiple docs in tabs, and only turn on experimental AI-change theatre when it helps.",
  repoUrl: "https://github.com/kumaradarsh1993/md-reader",
  scene: "markdown",
  theme: {
    bg: "#f7f4ef",
    ink: "#111318",
    accent: "#2558d8",
    accent2: "#0f8b7a",
    accent3: "#c24f5a"
  },
  assets: {
    logo: "images/md-reader-icon.png"
  },
  downloads: [
    {
      label: "Download for Windows",
      note: "Stable v0.3.0 installer",
      href: "https://github.com/kumaradarsh1993/md-reader/releases/download/v0.3.0/md-reader_0.3.0_x64-setup.exe"
    },
    {
      label: "Download for macOS",
      note: "Universal DMG",
      href: "https://github.com/kumaradarsh1993/md-reader/releases/download/v0.3.0/md-reader_0.3.0_universal.dmg"
    },
    {
      label: "Download for Linux",
      note: "AppImage",
      href: "https://github.com/kumaradarsh1993/md-reader/releases/download/v0.3.0/md-reader_0.3.0_amd64.AppImage"
    },
    {
      label: "Beta builds",
      note: "Live Edit Theatre experiments",
      href: "https://github.com/kumaradarsh1993/md-reader/releases"
    }
  ],
  secondary: [
    { label: "View source", href: "https://github.com/kumaradarsh1993/md-reader" },
    { label: "All releases", href: "https://github.com/kumaradarsh1993/md-reader/releases" }
  ],
  proof: [
    "Open plain Markdown files directly",
    "Widen, narrow, zoom, or use full width",
    "Tabs, side file list, and tear-out windows",
    "Optional beta highlights for agent edits"
  ],
  hero: {
    title: "Reading surface",
    status: "Stable reader ready",
    files: ["project-brief.md", "release-notes.md", "agent-plan.md", "meeting-notes.md"],
    tabs: ["brief.md", "notes.md", "diff.md"],
    headings: ["What changed", "Why this exists", "Next steps"],
    widthStates: ["Narrow", "Comfort", "Full width"],
    paragraphs: [
      "Most AI output arrives as Markdown. The reading app should get out of the way and use the space you give it.",
      "Open a file, resize the column, zoom the text, and keep the file browser beside you when you are comparing notes.",
      "When an agent edits the file, beta highlights can show what moved without forcing everyone into a diff tool."
    ]
  },
  storyTitle: "Built around the reading problem",
  storyIntro: "The headline is not live reload for its own sake. It is comfortable Markdown reading while Claude, Codex, Cursor, or another tool keeps writing and editing files nearby.",
  beats: [
    {
      title: "Open the Markdown you already have",
      body: "No vault, import step, or workspace trust prompt. Double-click a .md file or open several into tabs.",
      tag: "Open",
      visual: "open"
    },
    {
      title: "Use the horizontal space properly",
      body: "Switch between narrow, comfortable, and full-window reading widths. Zoom in or out without trapping the document in a fixed center strip.",
      tag: "Width",
      visual: "width"
    },
    {
      title: "Work across files without losing place",
      body: "Keep the file pane and outline on the left, use multiple tabs, and tear a tab into its own native window when comparison needs more room.",
      tag: "Tabs",
      visual: "tabs"
    },
    {
      title: "See agent edits when that helps",
      body: "Beta Live Edit Theatre highlights changed regions and offers a details sidebar. It is a power feature, not the default reason to use the app.",
      tag: "Beta",
      visual: "diff"
    }
  ],
  downloadTitle: "Download the stable reader",
  downloadIntro: "Stable v0.3.0 is the safer daily reader. Beta builds contain the newer edit-highlighting experiments while that experience is still being shaped.",
  panels: [
    {
      title: "Reader first",
      body: "Clean typography, adjustable width, zoom, themes, tabs, find, and a file pane. The boring parts matter because reading is the job."
    },
    {
      title: "AI-aware, not AI-dependent",
      body: "The app works as a normal Markdown reader. Agent-change highlights and summaries are optional beta helpers for people working with AI-written files."
    },
    {
      title: "Plain files stay plain",
      body: "No database lock-in. Edits save back to Markdown that still opens in VS Code, Obsidian, GitHub, or any other Markdown tool."
    }
  ],
  setupTitle: "A short path to a better reader",
  setupIntro: "Install it, open a Markdown file, then tune the page width and zoom until the document fits the screen you actually have.",
  setup: [
    { title: "Install md-reader", body: "Use the stable build for your operating system." },
    { title: "Open one or many .md files", body: "Use tabs and the file pane when you are moving through a folder of AI-generated notes." },
    { title: "Set the width", body: "Choose narrow, comfortable, or full-window reading. This is the point of the app." },
    { title: "Try beta highlights if needed", body: "Use beta builds when you specifically want to test agent-edit tracking and diff summaries." }
  ],
  footer: "Open-source Markdown reading and editing for AI-heavy writing workflows."
};
