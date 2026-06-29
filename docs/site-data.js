window.PRODUCT_SITE = {
  name: "md-reader",
  mark: "MD",
  kicker: "Free desktop app for AI-era Markdown",
  headline: "Read AI-written Markdown while it is still being written.",
  subhead: "Open a Markdown file once, keep it beside your AI tool, and watch it re-render live. When the output needs a human touch, switch into smart edit without leaving the app.",
  repoUrl: "https://github.com/kumaradarsh1993/md-reader",
  scene: "markdown",
  theme: {
    bg: "#f7f4ef",
    ink: "#111318",
    accent: "#2558d8",
    accent2: "#0f8b7a",
    accent3: "#c24f5a"
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
      note: "Advanced releases",
      href: "https://github.com/kumaradarsh1993/md-reader/releases"
    }
  ],
  secondary: [
    { label: "View source", href: "https://github.com/kumaradarsh1993/md-reader" },
    { label: "All releases", href: "https://github.com/kumaradarsh1993/md-reader/releases" }
  ],
  stage: {
    title: "Live document cockpit",
    status: "Stable download ready",
    rail: [["Live", "Auto-refresh"], ["Edit", "Smart polish"], ["Keep", "Plain files"]],
    surfaceTitle: "Markdown preview",
    tiles: ["frontmatter", "heading", "list", "code", "quote", "table", "image", "checklist"],
    note: "Built for the moment when AI output is good, but the raw Markdown is painful to read."
  },
  storyTitle: "A cleaner way to read AI output",
  storyIntro: "No workspace ceremony. No import step. It opens the file you already have and keeps up while your assistant writes.",
  chapters: [
    {
      title: "Open the file once",
      body: "Point md-reader at a Markdown file and keep it on a second monitor or beside your browser. It follows changes as they land."
    },
    {
      title: "Watch the render settle",
      body: "Long AI answers become readable immediately: headings, lists, code blocks, tables, links, and images stay organized while the file changes."
    },
    {
      title: "Fix without syntax wrestling",
      body: "Use smart edit for the small human pass: tighten wording, clean structure, and save back to the same plain Markdown file."
    }
  ],
  downloadTitle: "Start with the stable build",
  downloadIntro: "The first button is the safest path for most people. Beta builds are for testing newer features before they are promoted.",
  panels: [
    {
      title: "Stable",
      body: "Use this if you just want the app to work. It is the recommended build for daily Markdown reading and editing."
    },
    {
      title: "Beta",
      body: "Use beta releases when you want the newest fixes and can tolerate a little roughness. They are labeled separately on GitHub."
    },
    {
      title: "Open source",
      body: "The code, issue tracker, and release history are public, so the download path is inspectable and repeatable."
    }
  ],
  setupTitle: "Three-minute setup",
  setupIntro: "Install it, open your Markdown file, and let the app follow the edits as your AI tool writes.",
  setup: [
    { title: "Install the app", body: "Use the stable installer for your operating system." },
    { title: "Open a Markdown file", body: "Pick the file your AI tool is writing or the document you want to clean up." },
    { title: "Leave it beside your workflow", body: "The preview updates as the file changes, so the reading surface stays calm." }
  ],
  footer: "Open-source Markdown reader and editor for AI-heavy writing workflows."
};
