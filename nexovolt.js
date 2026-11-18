function setActiveNavigation() {
  const page = document.body.dataset.page;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === page) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
}

function setupMenu() {
  const button = document.querySelector(".nav-toggle");
  const links = document.querySelector("#site-links");
  if (!button || !links) return;

  const nav = button.closest("nav");
  const setOpen = (open) => {
    links.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    button.textContent = open ? "×" : "☰";
  };

  button.addEventListener("click", () => setOpen(!links.classList.contains("open")));
  links.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && links.classList.contains("open")) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (links.classList.contains("open") && nav && !nav.contains(event.target)) setOpen(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) setOpen(false);
  });
}

function setupReveals() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length || !("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  try {
    items.forEach((item) => observer.observe(item));
    items.forEach((item) => item.classList.add("reveal-ready"));
  } catch (error) {
    observer.disconnect();
    items.forEach((item) => item.classList.remove("reveal-ready"));
  }
}

const THEME_STORAGE_KEY = "nexovolt_theme";
const THEME_MODE_KEY = "nexovolt_theme_mode";
let activeThemeMode = "auto";
let automaticThemeTimer = null;
let systemMediaListenerAttached = false;

const sunIconSvg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
const moonIconSvg = '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

function getThemeMode() {
  try {
    const value = localStorage.getItem(THEME_MODE_KEY);
    if (value === "auto" || value === "system" || value === "manual") return value;
    if (localStorage.getItem("nexovolt_auto_theme") === "false") return "manual";
  } catch (error) {}
  return activeThemeMode;
}

function saveThemeMode(mode) {
  activeThemeMode = mode;
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch (error) {}
}

function getSystemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function getAutomaticTheme() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "light" : "dark";
}

function updateThemeUI(theme, mode) {
  const isDark = theme === "dark";

  document.querySelectorAll(".theme-toggle").forEach((button) => {
    button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    button.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
    button.innerHTML = '<span class="theme-toggle-icon" aria-hidden="true">' +
      (isDark ? sunIconSvg : moonIconSvg) + "</span>";
  });

  document.querySelectorAll(".theme-controls").forEach((wrapper) => {
    wrapper.classList.toggle("manual-active", mode === "manual");
  });

  const labels = { auto: "Auto", system: "System", manual: "Manual" };
  const nextModes = { auto: "System", system: "Manual", manual: "Auto" };
  const currentMode = labels[mode] ? mode : "auto";
  const description = "Theme mode: " + labels[currentMode] +
    (currentMode === "auto" ? " (local time)" : "") +
    ". Activate to switch to " + nextModes[currentMode] + ".";

  document.querySelectorAll(".theme-mode-btn").forEach((button) => {
    button.classList.toggle("active-auto", currentMode === "auto");
    button.classList.toggle("active-system", currentMode === "system");
    button.removeAttribute("aria-pressed");
    button.setAttribute("aria-label", description);
    button.setAttribute("title", description);
    button.innerHTML = '<span class="theme-mode-indicator" aria-hidden="true"></span>' +
      '<span class="theme-mode-label">' + labels[currentMode] + "</span>";
  });
}

function applyTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", selectedTheme);
  if (document.body) document.body.setAttribute("data-theme", selectedTheme);
  updateThemeUI(selectedTheme, getThemeMode());
}

function scheduleAutomaticThemeUpdate() {
  if (automaticThemeTimer) clearTimeout(automaticThemeTimer);
  const now = new Date();
  const next = new Date(now);

  if (now.getHours() < 6) {
    next.setHours(6, 0, 0, 0);
  } else if (now.getHours() < 18) {
    next.setHours(18, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 0, 0);
  }

  automaticThemeTimer = setTimeout(() => {
    if (getThemeMode() === "auto") {
      applyTheme(getAutomaticTheme());
      scheduleAutomaticThemeUpdate();
    }
  }, Math.max(1000, next.getTime() - now.getTime()));
}

function setupSystemThemeListener() {
  if (systemMediaListenerAttached || !window.matchMedia) return;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const handler = (event) => {
    if (getThemeMode() === "system") applyTheme(event.matches ? "light" : "dark");
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", handler);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(handler);
  }
  systemMediaListenerAttached = true;
}

function setupTheme() {
  const mode = getThemeMode();
  activeThemeMode = mode;

  if (mode === "system") {
    applyTheme(getSystemTheme());
  } else if (mode === "manual") {
    let manualTheme = "dark";
    try {
      manualTheme = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
    } catch (error) {}
    applyTheme(manualTheme);
  } else {
    applyTheme(getAutomaticTheme());
    scheduleAutomaticThemeUpdate();
  }

  setupSystemThemeListener();

  document.querySelectorAll(".theme-mode-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const currentMode = getThemeMode();
      const nextMode = currentMode === "auto" ? "system" : currentMode === "system" ? "manual" : "auto";
      saveThemeMode(nextMode);

      if (nextMode === "system") {
        if (automaticThemeTimer) clearTimeout(automaticThemeTimer);
        applyTheme(getSystemTheme());
      } else if (nextMode === "manual") {
        if (automaticThemeTimer) clearTimeout(automaticThemeTimer);
        const theme = document.body.getAttribute("data-theme") || "dark";
        try {
          localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (error) {}
        applyTheme(theme);
      } else {
        applyTheme(getAutomaticTheme());
        scheduleAutomaticThemeUpdate();
      }
    });
  });

  document.querySelectorAll(".theme-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      if (getThemeMode() !== "manual") return;
      const currentTheme = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (error) {}
      applyTheme(nextTheme);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setActiveNavigation();
  setupMenu();
  setupReveals();
  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
});
