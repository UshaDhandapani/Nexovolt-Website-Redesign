(function () {
  try {
    var mode = localStorage.getItem("nexovolt_theme_mode");
    if (mode !== "auto" && mode !== "system" && mode !== "manual") {
      mode = localStorage.getItem("nexovolt_auto_theme") === "false" ? "manual" : "auto";
    }
    var theme = null;
    if (mode === "system") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } else if (mode === "manual") {
      theme = localStorage.getItem("nexovolt_theme") === "light" ? "light" : "dark";
    } else {
      var hour = new Date().getHours();
      theme = hour >= 6 && hour < 18 ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {}
}());
