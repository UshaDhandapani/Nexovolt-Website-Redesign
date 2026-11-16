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
  const links = document.querySelector(".site-links");
  if (!button || !links) return;
  button.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "×" : "☰";
  });
  links.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    links.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    button.textContent = "☰";
  }));
}

function setupReveals() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("show"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach((item) => observer.observe(item));
}

function setupEstimator() {
  const form = document.querySelector("[data-estimator]");
  if (!form) return;
  const output = document.querySelector("#estimate-result");
  const detail = document.querySelector("#estimate-detail");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = (id) => Number(document.querySelector(id).value);
    const kw = value("#kw");
    const hours = value("#hours");
    const oldPf = Math.min(1, Math.max(0.1, value("#old-pf")));
    const targetPf = Math.min(1, Math.max(0.1, value("#target-pf")));
    const tariff = value("#tariff");
    if (!kw || !hours || !tariff || targetPf < oldPf) {
      output.textContent = "Check inputs";
      detail.textContent = "Use positive load, hours and tariff values. Your target power factor must be at least the existing value.";
      return;
    }
    const oldKvar = kw * Math.tan(Math.acos(oldPf));
    const targetKvar = kw * Math.tan(Math.acos(targetPf));
    const correction = Math.max(0, oldKvar - targetKvar);
    const illustrative = kw * hours * 12 * tariff * (targetPf - oldPf) * 0.08;
    output.textContent = correction.toFixed(1) + " kVAr";
    detail.textContent = "Illustrative correction requirement. A simplified savings indicator is about ₹" +
      Math.round(illustrative).toLocaleString("en-IN") +
      " / year. A site study and the applicable tariff are needed for a dependable savings figure.";
  });
}

function setupContactForm() {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;
  const message = form.querySelector(".form-message");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.textContent = "This preview form is ready for an approved CRM or lead database connection. Do not publish until routing, acknowledgement and response ownership have been tested.";
  });
}

// Theme management: 3 modes (auto: internet sunrise/sunset, system: OS default theme, manual: user dark/light choice)
// Manual toggle button appears only when in manual mode.
// Prevents browsers from auto-forcing unwanted color schemes.
const THEME_STORAGE_KEY = "nexovolt_theme";
const THEME_MODE_KEY = "nexovolt_theme_mode";
const SUN_CACHE_KEY = "nexovolt_sun_times";
let solarTimerId = null;
let systemMediaListenerAttached = false;

const sunIconSvg = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const moonIconSvg = `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

function getThemeMode() {
  try {
    const val = localStorage.getItem(THEME_MODE_KEY);
    if (val === "auto" || val === "system" || val === "manual") return val;
    // Check legacy key if present
    const legacyAuto = localStorage.getItem("nexovolt_auto_theme");
    if (legacyAuto === "false") return "manual";
  } catch (e) {}
  return "auto";
}

function getSystemTheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function updateThemeUI(theme, mode) {
  const isDark = theme === "dark";

  // Update theme toggle button icon & title (only visible in manual mode)
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    btn.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
    btn.innerHTML = `<span class="theme-toggle-icon" aria-hidden="true">${isDark ? sunIconSvg : moonIconSvg}</span>`;
  });

  // Toggle container class for manual button visibility
  document.querySelectorAll(".theme-controls").forEach((wrapper) => {
    if (mode === "manual") {
      wrapper.classList.add("manual-active");
    } else {
      wrapper.classList.remove("manual-active");
    }
  });

  // Update mode selector button
  document.querySelectorAll(".theme-mode-btn").forEach((btn) => {
    btn.classList.toggle("active-auto", mode === "auto");
    btn.classList.toggle("active-system", mode === "system");
    btn.setAttribute("aria-pressed", String(mode !== "manual"));

    let label = "Auto";
    let title = "Mode: Auto (Sunrise/Sunset). Click to switch to System OS mode.";
    if (mode === "system") {
      label = "System";
      title = "Mode: System (OS default theme). Click to switch to Manual mode.";
    } else if (mode === "manual") {
      label = "Manual";
      title = "Mode: Manual. Click to switch to Auto mode.";
    }

    btn.setAttribute("title", title);
    btn.innerHTML = `<span class="theme-mode-indicator" aria-hidden="true"></span><span class="theme-mode-label">${label}</span>`;
  });
}

function applyTheme(theme, saveManual = false) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", selectedTheme);
  document.body.setAttribute("data-theme", selectedTheme);
  if (saveManual) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
    } catch (e) {}
  }
  updateThemeUI(selectedTheme, getThemeMode());
}

// Default solar times fallback: sunrise at 06:00, sunset at 18:30 local time
function getFallbackSolarTimes(date = new Date()) {
  const sunrise = new Date(date);
  sunrise.setHours(6, 0, 0, 0);
  const sunset = new Date(date);
  sunset.setHours(18, 30, 0, 0);
  return {
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString()
  };
}

function getCachedSolarTimes() {
  try {
    const cached = JSON.parse(localStorage.getItem(SUN_CACHE_KEY));
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt) {
      return cached;
    }
  } catch (e) {}
  return null;
}

function saveCachedSolarTimes(sunriseIso, sunsetIso) {
  try {
    const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    localStorage.setItem(SUN_CACHE_KEY, JSON.stringify({
      sunrise: sunriseIso,
      sunset: sunsetIso,
      expiresAt
    }));
  } catch (e) {}
}

async function fetchSolarTimesFromInternet(lat, lng) {
  const latitude = typeof lat === "number" ? lat : 12.9249;
  const longitude = typeof lng === "number" ? lng : 80.1265;

  try {
    const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&formatted=0`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === "OK" && data.results && data.results.sunrise && data.results.sunset) {
        saveCachedSolarTimes(data.results.sunrise, data.results.sunset);
        return { sunrise: data.results.sunrise, sunset: data.results.sunset };
      }
    }
  } catch (err) {}

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=sunrise,sunset&timezone=auto`);
    if (res.ok) {
      const data = await res.json();
      if (data.daily && data.daily.sunrise && data.daily.sunset) {
        const sunrise = new Date(data.daily.sunrise[0]).toISOString();
        const sunset = new Date(data.daily.sunset[0]).toISOString();
        saveCachedSolarTimes(sunrise, sunset);
        return { sunrise, sunset };
      }
    }
  } catch (err) {}

  return null;
}

function calculateSolarTheme(solarTimes) {
  const now = Date.now();
  const sunriseTime = new Date(solarTimes.sunrise).getTime();
  const sunsetTime = new Date(solarTimes.sunset).getTime();

  if (now >= sunriseTime && now < sunsetTime) {
    return "light";
  }
  return "dark";
}

function scheduleNextSolarSwitch(solarTimes) {
  if (solarTimerId) clearTimeout(solarTimerId);

  const now = Date.now();
  const sunriseTime = new Date(solarTimes.sunrise).getTime();
  const sunsetTime = new Date(solarTimes.sunset).getTime();

  let nextSwitchTime = null;
  if (now < sunriseTime) {
    nextSwitchTime = sunriseTime;
  } else if (now < sunsetTime) {
    nextSwitchTime = sunsetTime;
  } else {
    nextSwitchTime = sunriseTime + 24 * 60 * 60 * 1000;
  }

  const msUntil = Math.max(1000, nextSwitchTime - now);
  solarTimerId = setTimeout(() => {
    if (getThemeMode() === "auto") {
      const nextTheme = calculateSolarTheme(solarTimes);
      applyTheme(nextTheme, false);
    }
    syncSolarTheme();
  }, msUntil + 2000);
}

async function syncSolarTheme() {
  const mode = getThemeMode();
  if (mode !== "auto") return;

  let solarTimes = getCachedSolarTimes();

  if (solarTimes) {
    const theme = calculateSolarTheme(solarTimes);
    applyTheme(theme, false);
    scheduleNextSolarSwitch(solarTimes);
  }

  const updateTimes = async (lat, lng) => {
    const fetched = await fetchSolarTimesFromInternet(lat, lng);
    const times = fetched || solarTimes || getFallbackSolarTimes();
    if (getThemeMode() === "auto") {
      const theme = calculateSolarTheme(times);
      applyTheme(theme, false);
    }
    scheduleNextSolarSwitch(times);
  };

  if ("geolocation" in navigator && navigator.permissions) {
    navigator.permissions.query({ name: "geolocation" }).then((perm) => {
      if (perm.state === "granted") {
        navigator.geolocation.getCurrentPosition(
          (pos) => updateTimes(pos.coords.latitude, pos.coords.longitude),
          () => updateTimes()
        );
      } else {
        updateTimes();
      }
    }).catch(() => updateTimes());
  } else {
    updateTimes();
  }
}

function setupSystemThemeListener() {
  if (systemMediaListenerAttached || !window.matchMedia) return;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const handler = (e) => {
    if (getThemeMode() === "system") {
      applyTheme(e.matches ? "light" : "dark", false);
    }
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

  if (mode === "system") {
    applyTheme(getSystemTheme(), false);
  } else if (mode === "manual") {
    try {
      const manualTheme = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
      applyTheme(manualTheme, false);
    } catch (e) {
      applyTheme("dark", false);
    }
  } else {
    // Auto mode
    const cached = getCachedSolarTimes() || getFallbackSolarTimes();
    applyTheme(calculateSolarTheme(cached), false);
    syncSolarTheme();
  }

  setupSystemThemeListener();

  // Mode cycle: Auto -> System -> Manual -> Auto
  document.querySelectorAll(".theme-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const currentMode = getThemeMode();
      let nextMode = "auto";
      if (currentMode === "auto") nextMode = "system";
      else if (currentMode === "system") nextMode = "manual";
      else nextMode = "auto";

      try {
        localStorage.setItem(THEME_MODE_KEY, nextMode);
      } catch (e) {}

      if (nextMode === "system") {
        applyTheme(getSystemTheme(), false);
      } else if (nextMode === "manual") {
        const activeTheme = document.body.getAttribute("data-theme") || "dark";
        applyTheme(activeTheme, true);
      } else {
        // Auto
        const times = getCachedSolarTimes() || getFallbackSolarTimes();
        applyTheme(calculateSolarTheme(times), false);
        syncSolarTheme();
      }
    });
  });

  // Manual toggle click handler (Dark <-> Light, visible only in Manual mode)
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (getThemeMode() !== "manual") return;
      const active = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
      const next = active === "dark" ? "light" : "dark";
      applyTheme(next, true);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setActiveNavigation();
  setupMenu();
  setupReveals();
  setupEstimator();
  setupContactForm();
  document.querySelectorAll("[data-year]").forEach((element) => { element.textContent = new Date().getFullYear(); });
});
