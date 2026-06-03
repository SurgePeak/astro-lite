const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";

type RevealDirection = "down" | "up";

function getPreferredTheme(): string {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

// Reuse the value already set by the inline FOUC-prevention script if available.
let themeValue: string =
  (window as unknown as { __theme?: { value: string } }).__theme?.value ??
  getPreferredTheme();

let revealDirection: RevealDirection = "down";
let isTransitioning = false;
let themeBtnHandler: (() => void) | null = null;

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  document.firstElementChild?.setAttribute("data-theme", themeValue);
  document.querySelector("#theme-btn")?.setAttribute("aria-label", themeValue);

  // Fill <meta name="theme-color"> with the computed background colour so
  // Android's browser chrome matches the page background.
  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

function setThemeBtnDisabled(disabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#theme-btn");
  if (!btn) return;
  btn.disabled = disabled;
  btn.style.pointerEvents = disabled ? "none" : "";
  btn.style.opacity = disabled ? "0.6" : "";
}

function applyTheme(nextTheme: string): void {
  themeValue = nextTheme;
  persist();
}

function toggleTheme(): void {
  if (isTransitioning) return;

  const nextTheme = themeValue === LIGHT ? DARK : LIGHT;
  const direction = revealDirection;
  revealDirection = direction === "down" ? "up" : "down";

  if (!document.startViewTransition) {
    applyTheme(nextTheme);
    return;
  }

  isTransitioning = true;
  setThemeBtnDisabled(true);
  document.documentElement.setAttribute("data-theme-transition", direction);

  const transition = document.startViewTransition(() => applyTheme(nextTheme));

  transition.finished.finally(() => {
    isTransitioning = false;
    setThemeBtnDisabled(false);
    document.documentElement.removeAttribute("data-theme-transition");
  });
}

function setup(): void {
  reflect();

  const btn = document.querySelector<HTMLButtonElement>("#theme-btn");
  if (!btn) return;

  if (themeBtnHandler) {
    btn.removeEventListener("click", themeBtnHandler);
  }

  themeBtnHandler = toggleTheme;
  btn.addEventListener("click", themeBtnHandler);
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", setup);

// Carry the theme-color value across View Transitions to prevent the
// Android navigation bar from flashing during page transitions.
document.addEventListener("astro:before-swap", event => {
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color) {
    (event as { newDocument: Document }).newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});

// Sync with OS-level dark/light preference changes.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", ({ matches }) => {
    if (isTransitioning) return;
    themeValue = matches ? DARK : LIGHT;
    persist();
  });
