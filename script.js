const locEl = document.getElementById("location");
const tempIconEl = document.getElementById("temp-icon");
const tempValueEl = document.getElementById("temp-value");
const unitLabelEl = document.getElementById("unit-label");
const climateEl = document.getElementById("climate");
const feelsEl = document.getElementById("feels-like");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");

const hourlyEl = document.getElementById("hourly-forecast");
const dailyEl = document.getElementById("daily-forecast");
const searchesEl = document.getElementById("latest-searches");

const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-button");
const errorEl = document.getElementById("error-msg");

const navLinks = document.querySelectorAll(".nav-link");
const screens = document.querySelectorAll(".screen");
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");

// ====== CONFIG ======
const API_KEY = "8d098db4d312321253f564daf6010685"; // replace if you want
let units = "metric"; // "metric" or "imperial"
let recent = JSON.parse(localStorage.getItem("recentCities") || "[]").slice(0,6);

// ====== HELPERS ======
function showError(message){
  if(!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.add("show");
}
function clearError(){
  if(!errorEl) return;
  errorEl.textContent = "";
  errorEl.classList.remove("show");
}

const iconForId = (id) => {
  if (id >= 200 && id < 300) return "fa-solid fa-bolt";
  if (id >= 300 && id < 500) return "fa-solid fa-cloud-rain";
  if (id >= 500 && id < 600) return "fa-solid fa-cloud-showers-heavy";
  if (id >= 600 && id < 700) return "fa-solid fa-snowflake";
  if (id >= 700 && id < 800) return "fa-solid fa-smog";
  if (id === 800) return "fa-solid fa-sun";
  if (id > 800) return "fa-solid fa-cloud";
  return "fa-solid fa-cloud";
};

const formatTemp = (t) => {
  if (t === undefined || t === null) return "--";
  return `${Math.round(t)}${units === "metric" ? "°C" : "°F"}`;
};
const windUnit = () => (units === "metric" ? "m/s" : "mph");

function renderChips() {
  if(!searchesEl) return;
  searchesEl.innerHTML = "";
  recent.forEach((c) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = c.name;
    chip.addEventListener("click", () => getByCity(c.name));
    searchesEl.appendChild(chip);
  });
}

function saveRecent(name, lat, lon) {
  recent = [{ name, lat, lon }, ...recent.filter((r) => r.name !== name)].slice(0, 6);
  localStorage.setItem("recentCities", JSON.stringify(recent));
  renderChips();
}

function updateAllLocations(city) {
  document.querySelectorAll(".location-name").forEach(loc => {
    loc.textContent = city;
  });
}

function updateCurrent({ name, weather, main, wind }) {
  updateAllLocations(name || "--");
  climateEl.textContent = weather?.main || "--";
  tempValueEl.textContent = main?.temp !== undefined ? Math.round(main.temp) : "--";
  unitLabelEl.textContent = "°C";

  tempIconEl.className = iconForId(weather?.id ?? 800);

  feelsEl.textContent = `Feels: ${main?.feels_like ?? "--"}°C`;
  humidityEl.textContent = `Humidity: ${main?.humidity ?? "--"}%`;
  windEl.textContent = `Wind: ${wind ? Math.round(wind.speed) : "--"} km/h`;
  rainEl.textContent = `Rain: 20%`;
  uvEl.textContent = `UV Index: 5`;
}

// ====== API CALLS ======
async function getByCity(city) {
  clearError();
  if(!city) { showError("Please type a city name."); return; }

  try {
    // first: current weather (to get coords)
    const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${units}`);
    // If service responded with non-2xx, parse message and show it
    if (!resp.ok) {
      let body;
      try { body = await resp.json(); } catch(e) { body = null; }
      const msg = (body && body.message) ? body.message : `City "${city}" not found`;
      showError(msg);
      return;
    }

    const w = await resp.json();
    // Safety check
    if (!w || !w.coord) { showError("Unexpected response from weather API."); return; }

    const { name, coord, weather, main, wind } = w;
    updateCurrent({ name, weather: weather[0], main, wind });

    // fetch One Call (7-day + hourly). Some plans or keys may block onecall — handle gracefully.
    await getForecast(coord.lat, coord.lon).catch((err) => {
      // don't stop the app if forecast fails; show a message instead
      showError("7-day forecast not available for this key/plan.");
      console.warn("Forecast error:", err);
    });

    // Store recent and map
    saveRecent(name, coord.lat, coord.lon);
    if (typeof updateMap === "function") updateMap(coord.lat, coord.lon, name);

    clearError();
  } catch (err) {
    console.error(err);
    showError("Network or API error. Try again later.");
  }
}

async function getByCoords(lat, lon) {
  clearError();
  try {
    const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${units}`);
    if (!r.ok) {
      const body = await r.json().catch(()=>null);
      showError(body?.message || "Unable to fetch weather for coordinates.");
      return;
    }
    const w = await r.json();
    const { name, coord, weather, main, wind } = w;
    updateCurrent({ name, weather: weather[0], main, wind });
    await getForecast(coord.lat, coord.lon);
    saveRecent(name, coord.lat, coord.lon);
    if (typeof updateMap === "function") updateMap(coord.lat, coord.lon, name);
    clearError();
  } catch (err) {
    console.error(err);
    showError("Unable to fetch weather for coordinates.");
  }
}

async function getForecast(lat, lon) {
  // One Call: daily + hourly
  const r = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&appid=${API_KEY}&units=${units}`);
  if (!r.ok) {
    const body = await r.json().catch(()=>null);
    throw new Error(body?.message || "Forecast API failed");
  }
  const data = await r.json();

  // Hourly: next 6
  hourlyEl.innerHTML = "";
  if (data.hourly && data.hourly.length) {
    data.hourly.slice(0, 6).forEach((h) => {
      const d = new Date(h.dt * 1000);
      const el = document.createElement("div");
      el.className = "mini";
      el.innerHTML = `
        <div class="time">${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <i class="${iconForId(h.weather[0].id)}"></i>
        <div class="tempv">${formatTemp(h.temp)}</div>
      `;
      hourlyEl.appendChild(el);
    });
  } else {
    hourlyEl.innerHTML = `<div class="mini">No hourly data</div>`;
  }

  // Daily: 7 days
  dailyEl.innerHTML = "";
  if (data.daily && data.daily.length) {
    data.daily.slice(0, 7).forEach((d) => {
      const el = document.createElement("div");
      el.className = "mini";
      el.innerHTML = `
        <div class="time">${new Date(d.dt * 1000).toLocaleDateString([], { weekday: "short" })}</div>
        <i class="${iconForId(d.weather[0].id)}"></i>
        <div class="tempv">${formatTemp(d.temp.max)}<br><span style="color:#a8b3c7">${formatTemp(d.temp.min)}</span></div>
      `;
      dailyEl.appendChild(el);
    });
  } else {
    dailyEl.innerHTML = `<div class="mini">7-day forecast not available</div>`;
  }
}

// ====== UI UPDATERS ======
// function updateCurrent({ name, weather, main, wind }) {
//   locEl.textContent = name || "--";
//   climateEl.textContent = weather?.main || "--";
//   tempValueEl.textContent = (main && main.temp !== undefined) ? Math.round(main.temp) : "--";
//   unitLabelEl.textContent = units === "metric" ? "°C" : "°F";

//   // set icon using class (FontAwesome)
//   tempIconEl.className = iconForId(weather?.id ?? 800);

//   feelsEl.textContent = `Feels: ${formatTemp(main?.feels_like)}`;
//   humidityEl.textContent = `Humidity: ${main?.humidity ?? "--"}%`;
//   windEl.textContent = `Wind: ${wind ? Math.round(wind.speed) : "--"} ${windUnit()}`;
// }

// ====== EVENTS ======
searchBtn?.addEventListener("click", (ev) => {
  ev.preventDefault();
  const q = searchInput.value.trim();
  if (!q) { showError("Please enter a city name."); return; }
  getByCity(q);
  searchInput.value = "";
});

searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchBtn.click();
  }
});

// Sidebar nav (if present)
navLinks.forEach((btn) => {
  btn.addEventListener("click", () => {
    navLinks.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const id = btn.getAttribute("data-screen");
    screens.forEach(s => s.classList.toggle("active", s.id === id));
  });
});

// Mobile menu toggle
menuBtn?.addEventListener("click", () => {
  sidebar.style.display = (sidebar.style.display === "block") ? "none" : "block";
});

// Settings handlers (if present)
const segC = document.getElementById("unit-c");
const segF = document.getElementById("unit-f");
const compactToggle = document.getElementById("compactToggle");
if(segC && segF){
  segC.addEventListener("click", () => setUnits("metric"));
  segF.addEventListener("click", () => setUnits("imperial"));
}
if(compactToggle){
  compactToggle.addEventListener("change", (e) => document.body.classList.toggle("compact", e.target.checked));
}

function setUnits(u){
  units = u;
  if(segC && segF){
    segC.classList.toggle("active", u === "metric");
    segF.classList.toggle("active", u === "imperial");
  }
  // refresh last searched city to update units
  if (recent && recent.length) getByCity(recent[0].name);
}

// ====== MAP SETUP ======
let map;
let markers = [];
function initMap(){
  try {
    map = L.map("map", { zoomControl: true }).setView([20, 78], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  } catch (e) {
    console.warn("Leaflet init failed:", e);
  }
}

function updateMap(lat, lon, name){
  if(!map) return;
  map.setView([lat, lon], 9);
  const m = L.marker([lat, lon]).addTo(map).bindPopup(`<b>${name}</b>`);
  m.on("click", () => getByCoords(lat, lon));
  markers.push(m);
  if(markers.length > 12){ // keep markers manageable
    const old = markers.shift();
    if (map && old) map.removeLayer(old);
  }
}

// ====== INIT ======
renderChips();
initMap();

// try geolocation; fallback to a default city (London) if denied
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => getByCoords(pos.coords.latitude, pos.coords.longitude),
    () => getByCity("London")
  );
} else {
  getByCity("London");
}
