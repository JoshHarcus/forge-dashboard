// Forge Cockpit · time slider + freshness opacity recalculation
(function () {
  const Forge = (window.Forge = window.Forge || {});

  const slider = document.getElementById("time-slider");
  const label = document.getElementById("time-label");
  const marks = document.getElementById("time-marks");

  // Range: 2025-01-01 → today
  const START = new Date("2025-01-01T00:00:00").getTime();
  const END = Date.now();
  const SPAN = END - START;

  // Render month markers (every ~3 months)
  if (marks) {
    const months = ["2025 Q1", "Q2", "Q3", "Q4", "2026 Q1", "Q2"];
    marks.innerHTML = months.map((m) => `<span>${m}</span>`).join("");
  }

  function sliderToTime(value) {
    return START + (Number(value) / 100) * SPAN;
  }

  function freshnessOpacity(lastActivityISO, asOfMs) {
    const last = new Date(lastActivityISO).getTime();
    if (isNaN(last)) return 0.4;
    if (last > asOfMs) return 0.06; // not yet active at this point in time
    const days = (asOfMs - last) / (1000 * 60 * 60 * 24);
    if (days <= 7) return 1.0;
    if (days <= 30) return 0.8;
    if (days <= 60) return 0.6;
    if (days <= 90) return 0.4;
    return 0.2;
  }

  function fmt(ms) {
    const d = new Date(ms);
    const now = Date.now();
    if (Math.abs(now - ms) < 1000 * 60 * 60 * 24) return "Now";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  let currentTime = END;

  function setSlider(value) {
    if (slider) slider.value = String(value);
    currentTime = sliderToTime(value);
    if (label) label.textContent = fmt(currentTime);
    if (Forge.graph && Forge.graph.applyFreshness) Forge.graph.applyFreshness(currentTime);
  }

  if (slider) {
    slider.addEventListener("input", () => setSlider(slider.value));
    setSlider(100);
  }

  Forge.time = { freshnessOpacity, sliderToTime, current: () => currentTime };
})();
