/* ============================================================
   KAPITTEL A — DATA, STATE & STORAGE
   ------------------------------------------------------------
   Formål: All grunnstate, lagring og datastrukturer for appen.
   Dette er 100% UI-fritt, ren logikk.
   ============================================================ */

// -----------------------------
// 1. KONSTANTER
// -----------------------------
const HG_VERSION = "2.0";
const MAX_NEARBY_DISTANCE = 500;   // meter
const MAP_ZOOM = 16;
const MAP_OPTIONS = {
  zoomControl: false,
  attributionControl: false
};

// -----------------------------
// 2. GLOBAL STATE
// -----------------------------
let PLACES = [];
let PEOPLE = [];
let BADGES = {};
let ROUTES = [];

let userPos = null;       // { lat, lon }
let liveMode = true;      // Om GPS følger brukeren
let map = null;           // Leaflet map
let markers = [];         // Alle stedsmarkører

// -----------------------------
// 3. LOCALSTORAGE HJELPERE
// -----------------------------
function loadLS(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// -----------------------------
// 4. PROGRESJONSDATA
// -----------------------------
let VISITED_PLACES = loadLS("visited_places", {});  // { placeId: timestamp }
let COMPLETED_QUIZZES = loadLS("completed_quizzes", {}); // { quizId: true }
let MERITS = loadLS("merits", {}); // { categoryId: score }
let COLLECTED_PEOPLE = loadLS("collected_people", {}); // { personId: true }

// -----------------------------
// 5. LAGRE PROGRESJON
// -----------------------------
function saveVisited(placeId) {
  if (!VISITED_PLACES[placeId]) {
    VISITED_PLACES[placeId] = Date.now();
    saveLS("visited_places", VISITED_PLACES);
    window.dispatchEvent(new Event("updateProfile"));
  }
}

function saveQuizCompleted(quizId) {
  if (!COMPLETED_QUIZZES[quizId]) {
    COMPLETED_QUIZZES[quizId] = true;
    saveLS("completed_quizzes", COMPLETED_QUIZZES);
    window.dispatchEvent(new Event("updateProfile"));
  }
}

function saveMerits(categoryId, value) {
  MERITS[categoryId] = (MERITS[categoryId] || 0) + value;
  saveLS("merits", MERITS);
  window.dispatchEvent(new Event("updateProfile"));
}

function savePersonCollected(personId) {
  if (!COLLECTED_PEOPLE[personId]) {
    COLLECTED_PEOPLE[personId] = true;
    saveLS("collected_people", COLLECTED_PEOPLE);
    window.dispatchEvent(new Event("updateProfile"));
  }
}

// -----------------------------
// 6. GENERIC TOAST (brukes i hele appen)
// -----------------------------
window.showToast = function(msg) {
  let t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);

  setTimeout(() => t.classList.add("visible"), 10);
  setTimeout(() => {
    t.classList.remove("visible");
    setTimeout(() => t.remove(), 300);
  }, 2000);
};



/* ============================================================
   KAPITTEL B — DOM-CACHE & KATEGORIER
   ------------------------------------------------------------
   Formål: Samle alle DOM-elementer ett sted, og definere
   alle funksjoner som håndterer kategorier, farger og tags.
   ============================================================ */

// -----------------------------
// 1. DOM-CACHE
// -----------------------------
const el = {
  map:              document.getElementById("map"),
  nearbyList:       document.getElementById("nearbyList"),
  seeMoreBtn:       document.getElementById("seeMoreNearby"),
  miniProfile:      document.getElementById("miniProfile"),
  profileLink:      document.getElementById("openProfile"),
  collectionGrid:   document.getElementById("collectionGrid"),
  galleryGrid:      document.getElementById("galleryGrid"),
  testToggle:       document.getElementById("testToggle")
};

// -----------------------------
// 2. KATEGORI-FARGER
// -----------------------------
const CATEGORY_COLORS = {
  historie:       "#FFCC00",
  vitenskap:      "#4FC3F7",
  kunst:          "#E57373",
  musikk:         "#BA68C8",
  natur:          "#81C784",
  sport:          "#FFD54F",
  by:             "#90A4AE",
  politikk:       "#FF8A65",
  populaerkultur: "#F06292",
  subkultur:      "#A1887F",
  litteratur:     "#7986CB",
  naeringsliv:    "#4DB6AC"
};

// -----------------------------
// farge → hex
// -----------------------------
function catColor(catId) {
  return CATEGORY_COLORS[catId] || "#999";
}

// -----------------------------
// kategori → CSS-klasse
// -----------------------------
function catClass(catId) {
  return `cat-${catId}`;
}

// -----------------------------
// 3. KONVERTERING AV TAGS → KATEGORI
// -----------------------------
function tagToCat(tags) {
  if (!tags || !tags.length) return "ukjent";

  // Regler: 
  // − hvis første tag matcher kategori → bruk den
  // − hvis ikke, fall tilbake på 'ukjent'
  const t = tags[0].toLowerCase();
  return CATEGORY_COLORS[t] ? t : "ukjent";
}

// -----------------------------
// 4. KONVERTER DISPLAYNAVN → CAT-ID
// -----------------------------
function catIdFromDisplay(display) {
  if (!display) return "";
  display = display.toLowerCase().trim();

  const map = {
    "historie": "historie",
    "vitenskap": "vitenskap",
    "kunst": "kunst",
    "musikk": "musikk",
    "natur": "natur",
    "sport": "sport",
    "by": "by",
    "politikk": "politikk",
    "populærkultur": "populaerkultur",
    "subkultur": "subkultur",
    "litteratur": "litteratur",
    "næringsliv": "naeringsliv"
  };

  return map[display] || "";
}

/* ============================================================
   KAPITTEL C — GEO & KARTMOTOR
   ------------------------------------------------------------
   Formål: Alt som gjelder kart, posisjon, markører og ruter.
   ============================================================ */


// ------------------------------------------------------------
// 1. DISTANSE – HAVERSINE (meter)
// ------------------------------------------------------------
function distMeters(a, b) {
  if (!a || !b) return Infinity;

  const R = 6371000; // meter
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;

  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}


// ------------------------------------------------------------
// 2. KARTSTATE
// ------------------------------------------------------------
let mapInstance = null;
let userMarker = null;
let placeMarkers = {};   // { placeId: leafletMarker }


// ------------------------------------------------------------
// 3. INITIER KARTET (Leaflet)
// ------------------------------------------------------------
function initMap() {
  if (mapInstance) return;

  mapInstance = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    minZoom: 12,
    maxZoom: 18
  }).setView([59.9139, 10.7522], 14);

  // Lys bakgrunn – stabil og vakker
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { maxZoom: 19 }
  ).addTo(mapInstance);
}


// ------------------------------------------------------------
// 4. SETT BRUKERPOSISJON PÅ KARTET
// ------------------------------------------------------------
function setUser(lat, lon) {
  userPos = { lat, lon };

  if (!userMarker) {
    userMarker = L.circleMarker([lat, lon], {
      radius: 7,
      color: "#FFD600",
      fillColor: "#FFD600",
      fillOpacity: 1,
      weight: 2
    }).addTo(mapInstance);
  } else {
    userMarker.setLatLng([lat, lon]);
  }

  maybeDrawMarkers();   // oppdater markør-lysning
}


// ------------------------------------------------------------
// 5. TEGN ALLE STEDSMARKØRER (én gang)
// ------------------------------------------------------------
function drawPlaceMarkers() {
  if (!mapInstance || placeMarkers.__drawn) return;
  placeMarkers = {}; // reset

  PLACES.forEach(place => {
    const icon = L.divIcon({
      className: `hg-marker ${catClass(place.category)}`,
      html: `<div class="dot"></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([place.lat, place.lon], { icon })
      .on("click", () => {
        // popup-system i utils tar seg av visning
        if (window.showPlacePopup) window.showPlacePopup(place);
      })
      .addTo(mapInstance);

    placeMarkers[place.id] = marker;
  });

  placeMarkers.__drawn = true;
}


// ------------------------------------------------------------
// 6. DYNAMISK OPPDATERING – LYS OPP MARKØRER I RADIUS
// ------------------------------------------------------------
function maybeDrawMarkers() {
  if (!userPos) return;
  if (!placeMarkers.__drawn) drawPlaceMarkers();

  for (const p of PLACES) {
    const marker = placeMarkers[p.id];
    if (!marker) continue;

    const dist = distMeters(userPos, { lat: p.lat, lon: p.lon });

    if (dist <= (p.r || 150)) {
      lightenMarker(marker, true);
    } else {
      lightenMarker(marker, false);
    }
  }
}


// ------------------------------------------------------------
// 7. LIGHTEN – visuell effekt
// ------------------------------------------------------------
function lightenMarker(marker, active) {
  const el = marker.getElement();
  if (!el) return;

  if (active) el.classList.add("active-marker");
  else el.classList.remove("active-marker");
}


// ------------------------------------------------------------
// 8. ROUTING (Leaflet Routing Machine)
// ------------------------------------------------------------
function showRouteTo(place) {
  if (!userPos) return showToast("📍 Ingen posisjon enda");

  L.Routing.control({
    waypoints: [
      L.latLng(userPos.lat, userPos.lon),
      L.latLng(place.lat, place.lon)
    ],
    lineOptions: {
      addWaypoints: false,
      extendToWaypoints: false
    },
    routeWhileDragging: false,
    createMarker: () => null
  }).addTo(mapInstance);
}



/* ============================================================
   KAPITTEL D — POSISJON & GLOBALE EVENTS
   ------------------------------------------------------------
   Formål:
   - Hente og følge brukerens posisjon
   - Håndtere test-modus (simulert posisjon)
   - Fyrer "updateNearby" hver gang posisjon endres
   ============================================================ */

// ------------------------------------------------------------
// 1. GEO-STATE
// ------------------------------------------------------------
let geoWatchId = null;   // id fra geolocation.watchPosition


// ------------------------------------------------------------
// 2. HJELPER: HÅNDTER NY POSISJON
// ------------------------------------------------------------
function handleNewPosition(lat, lon) {
  if (!mapInstance) initMap();
  setUser(lat, lon);

  // Global event: nærområdelister + annet kan lytte på dette
  window.dispatchEvent(new CustomEvent("updateNearby", {
    detail: { lat, lon }
  }));
}


// ------------------------------------------------------------
// 3. STANDARD GEOLOKASJON (ENKELT KALL)
// ------------------------------------------------------------
function requestLocation() {
  if (!navigator.geolocation) {
    showToast("📍 Posisjon støttes ikke på denne enheten.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      handleNewPosition(latitude, longitude);
    },
    err => {
      console.warn("Geolokasjonsfeil:", err);
      showToast("📍 Klarte ikke hente posisjon.");
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 10000
    }
  );
}


// ------------------------------------------------------------
// 4. LIVE-OPPDATERING (watchPosition)
// ------------------------------------------------------------
function enableLivePositionUpdates() {
  if (!navigator.geolocation) return;

  // Rydd opp gammel watcher
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }

  if (!liveMode) return; // hvis vi er i test-modus

  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      handleNewPosition(latitude, longitude);
    },
    err => {
      console.warn("Live geolokasjonsfeil:", err);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000
    }
  );
}


// ------------------------------------------------------------
// 5. TEST-MODUS (SIMULERT POSISJON)
// ------------------------------------------------------------
// Brukes når du vil teste appen hjemmefra uten å gå ut.
// Når testToggle er på: bruker en fast posisjon i Oslo sentrum.

if (el.testToggle) {
  el.testToggle.addEventListener("change", e => {
    const on = e.target.checked;

    if (on) {
      // Slå av live geolokasjon
      liveMode = false;
      if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
      }

      // Fast test-posisjon (Oslo sentrum)
      const fakeLat = 59.9139;
      const fakeLon = 10.7522;

      handleNewPosition(fakeLat, fakeLon);
      showToast("🧪 Testmodus: posisjon låst til Oslo sentrum.");
    } else {
      // Tilbake til ekte posisjon
      liveMode = true;
      showToast("📍 Testmodus av: bruker ekte posisjon.");
      requestLocation();
      enableLivePositionUpdates();
    }
  });
}



/* ============================================================
   KAPITTEL E — STED- OG PERSONKORT (REN LOGIKK)
   ------------------------------------------------------------
   Viktig:
   - ALL visning skjer i popup-utils.js
   - Dette kapittelet inneholder KUN logikk:
       • pulseMarker(placeId)
       • openPlaceCard(place)  → showPlacePopup(place)
       • openPlaceCardByPerson(person)
       • googleUrl(place)
       • pcClose() (fallback hvis nødvendig)
   ============================================================ */


// ------------------------------------------------------------
// 1. GOOGLE MAPS-LENKE (ren util)
// ------------------------------------------------------------
function googleUrl(place) {
  if (!place) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
}


// ------------------------------------------------------------
// 2. PULSE-EFFEKT PÅ MARKØR (kun visuell markør-feedback)
// ------------------------------------------------------------
function pulseMarker(placeId) {
  const marker = placeMarkers[placeId];
  if (!marker) return;

  const el = marker.getElement();
  if (!el) return;

  el.classList.add("pulse-once");
  setTimeout(() => el.classList.remove("pulse-once"), 600);
}


// ------------------------------------------------------------
// 3. ÅPNE STEDSKORT (via popup-utils.js)
// ------------------------------------------------------------
function openPlaceCard(place) {
  if (!place) return;

  pulseMarker(place.id);

  // Den visuelle popupen er flyttet til popup-utils.js
  if (window.showPlacePopup) {
    window.showPlacePopup(place);
  } else {
    console.warn("showPlacePopup ikke lastet.");
  }
}


// ------------------------------------------------------------
// 4. ÅPNE STED VIA PERSON → FINN FØRSTE TILKNYTTEDE STED
// ------------------------------------------------------------
function openPlaceCardByPerson(person) {
  if (!person) return;

  let placeId = null;

  // 1) direkte mapping i person.placeId
  if (person.placeId) {
    placeId = person.placeId;
  }
  // 2) eller via person.places-listen
  else if (Array.isArray(person.places) && person.places.length > 0) {
    placeId = person.places[0];
  }

  if (!placeId) {
    console.warn("Person mangler stedstilknytning:", person);
    return;
  }

  const place = PLACES.find(p => p.id === placeId);
  if (!place) {
    console.warn("Fant ikke sted:", placeId);
    return;
  }

  openPlaceCard(place);
}


// ------------------------------------------------------------
// 5. LUKK-KORT — kun fallback (popup-utils håndterer alt)
// ------------------------------------------------------------
function pcClose() {
  // I den nye popup-arkitekturen brukes .remove() i popup-utils.
  // Denne funksjonen er kun for bakoverkompatibilitet.
  const legacy = document.getElementById("placeCard");
  if (legacy) {
    legacy.setAttribute("aria-hidden", "true");
  }
}




/* ============================================================
   KAPITTEL F — LISTEVISNINGER (NÆROMRÅDE + SE MER)
   ------------------------------------------------------------
   Formål:
   • Vise steder i nærheten (basert på posisjon)
   • Lage “Se mer”-liste (full liste uten radius)
   • Koble liste → openPlaceCard(place)
   • Oppdatere visning ved "updateNearby"-event
   ============================================================ */


// ------------------------------------------------------------
// 1. SORTER STEDER ETTER DISTANSE
// ------------------------------------------------------------
function sortPlacesByDistance(lat, lon) {
  return PLACES
    .map(p => ({
      place: p,
      dist: distMeters({ lat, lon }, { lat: p.lat, lon: p.lon })
    }))
    .sort((a, b) => a.dist - b.dist);
}


// ------------------------------------------------------------
// 2. RENDER ENKELT PLACECARD-RAD I NÆROMRÅDELISTE
// ------------------------------------------------------------
function renderPlaceRow(p, dist) {
  return `
    <div class="nearby-item" data-place="${p.id}">
      <div class="nearby-left">
        <div class="nearby-dot ${catClass(p.category)}"></div>
        <div class="nearby-name">${p.name}</div>
      </div>
      <div class="nearby-dist">${Math.round(dist)} m</div>
    </div>
  `;
}


// ------------------------------------------------------------
// 3. RENDER NÆRLIGGENDE STEDER
// ------------------------------------------------------------
function renderNearbyPlaces(lat, lon) {
  if (!el.nearbyList) return;

  const sorted = sortPlacesByDistance(lat, lon);
  const nearby = sorted.filter(x => x.dist <= (x.place.r || 150));

  if (nearby.length === 0) {
    el.nearbyList.innerHTML = `
      <div class="nearby-empty">
        Ingen steder i nærheten akkurat nå.
      </div>`;
    return;
  }

  el.nearbyList.innerHTML = nearby
    .map(x => renderPlaceRow(x.place, x.dist))
    .join("");

  // Klikk på listeelement → åpne steds-popup
  el.nearbyList.querySelectorAll("[data-place]").forEach(btn => {
    btn.onclick = () => {
      const p = PLACES.find(z => z.id === btn.dataset.place);
      if (p) openPlaceCard(p);
    };
  });
}


// ------------------------------------------------------------
// 4. BYGG "SE MER"-LISTE (full liste sortert etter distanse)
// ------------------------------------------------------------
function buildSeeMoreNearby(lat, lon) {
  const sorted = sortPlacesByDistance(lat, lon);
  return sorted
    .map(x => renderPlaceRow(x.place, x.dist))
    .join("");
}


// ------------------------------------------------------------
// 5. GLOBAL HANDLER FOR “SE MER”-VISNING
// ------------------------------------------------------------
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-see-more]");
  if (!btn) return;

  if (!userPos) {
    showToast("📍 Ingen posisjon enda");
    return;
  }

  const html = buildSeeMoreNearby(userPos.lat, userPos.lon);

  // Bruk sheet-systemet i utils
  if (window.openSheet) {
    openSheet("sheet-seemore", html);
  }
});


// ------------------------------------------------------------
// 6. LYTTER PÅ POSISJONSENDRING → OPPDATER NÆROMRÅDELISTE
// ------------------------------------------------------------
window.addEventListener("updateNearby", e => {
  const { lat, lon } = e.detail;
  renderNearbyPlaces(lat, lon);
});



/* ============================================================
   KAPITTEL H — MERKER & NIVÅER
   ------------------------------------------------------------
   Ansvar:
   • Laste inn badge-definisjoner (badges.json)
   • Oppdatere nivå basert på poeng i quiz_progress
   • Pulse-effekt når nivå øker
   • Knyttet direkte til Kapittel M (quiz) og profile.js
   ------------------------------------------------------------
   Strukturer:
   localStorage.quiz_progress = {
     [kategori]: {
        completed: [quizId, ...],
        points: number
     }
   }

   global BADGES = {
     kategori: {
       levels: [ { name, threshold, icon }, ... ]
     }
   }
   ============================================================ */


// ------------------------------------------------------------
// 1. LAST INN BADGES (fra data/badges.json)
// ------------------------------------------------------------
async function ensureBadgesLoaded() {
  if (Object.keys(BADGES).length > 0) return;

  try {
    const res = await fetch("data/badges.json");
    if (!res.ok) throw new Error("Kunne ikke laste badges.json");
    const data = await res.json();
    BADGES = data || {};
  } catch (err) {
    console.error("Feil ved lasting av badges:", err);
    BADGES = {};
  }
}


// ------------------------------------------------------------
// 2. PULSE BADGE (animation used in profile/miniprofil)
// ------------------------------------------------------------
function pulseBadge(categoryId) {
  const el = document.querySelector(`[data-badge="${categoryId}"]`);
  if (!el) return;
  el.classList.add("badge-pulse");
  setTimeout(() => el.classList.remove("badge-pulse"), 600);
}


// ------------------------------------------------------------
// 3. BEREGN NIVÅ BASERT PÅ POENG
// ------------------------------------------------------------
function getCategoryLevel(categoryId) {
  if (!BADGES[categoryId]) return null;

  let progress = {};
  try {
    progress = JSON.parse(localStorage.getItem("quiz_progress") || "{}");
  } catch {
    progress = {};
  }

  const catProgress = progress[categoryId] || { points: 0 };
  const points = catProgress.points || 0;

  const levels = BADGES[categoryId].levels || [];
  let current = null;

  for (let lvl of levels) {
    if (points >= lvl.threshold) {
      current = lvl;
    }
  }
  return current;
}


// ------------------------------------------------------------
// 4. OPPDATER NIVÅ ETTER FULLFØRT QUIZ
// ------------------------------------------------------------
function updateMeritLevel(categoryId) {
  const level = getCategoryLevel(categoryId);
  if (!level) return;

  // Pulse the badge if UI-visible
  pulseBadge(categoryId);

  // Profiloppdatering
  window.dispatchEvent(new Event("updateProfile"));
}


// ------------------------------------------------------------
// 5. HOVEDFUNKSJON: POENG + NIVÅ
// ------------------------------------------------------------
function addCompletedQuizAndMaybePoint(quizId, categoryId) {
  if (!quizId || !categoryId) return;

  let progress = {};
  try {
    progress = JSON.parse(localStorage.getItem("quiz_progress") || "{}");
  } catch {
    progress = {};
  }

  const catObj = progress[categoryId] || { completed: [], points: 0 };

  // Registrer quiz
  if (!catObj.completed.includes(quizId)) {
    catObj.completed.push(quizId);
    catObj.points = (catObj.points || 0) + 1;
  }

  progress[categoryId] = catObj;
  localStorage.setItem("quiz_progress", JSON.stringify(progress));

  // Oppdater nivå visuelt
  updateMeritLevel(categoryId);
}
















/* ============================================================
   KAPITTEL I — KLIKK-DELEGASJON & SHEETS
   ------------------------------------------------------------
   Formål:
   • Global click handler for hele appen
   • Støtte for data-close (lukking)
   • Badge-klikk → profil-sheet (håndteres via utils)
   • ESC-tast lukker popup/sheet
   ------------------------------------------------------------
   Viktig:
   • Ingen HTML-generering her
   • Ingen popup-UI her
   • Alle visuelle komponenter ligger i popup-utils.js
   ============================================================ */


// ------------------------------------------------------------
// 1. GLOBAL CLICK-DELEGASJON
// ------------------------------------------------------------
document.addEventListener("click", e => {

  // Lukk popup/sheet (data-close)
  const closeBtn = e.target.closest("[data-close]");
  if (closeBtn && window.closePopup) {
    closePopup();
    return;
  }

  // LUKK via overlay-klikk (utils håndterer logikken)
  if (e.target.classList.contains("hg-overlay") && window.closePopup) {
    closePopup();
    return;
  }

  // Badge-klikk → åpne badge-sheet via utils
  const badge = e.target.closest("[data-badge]");
  if (badge && window.openBadgeSheet) {
    const cat = badge.dataset.badge;
    openBadgeSheet(cat);
    return;
  }

  // Åpne profile-sheet (mini-profil i app)
  const profileBtn = e.target.closest("[data-open-profile]");
  if (profileBtn && window.openProfileSheet) {
    openProfileSheet();
    return;
  }

  // Sheet-linker
  const sheetLink = e.target.closest("[data-sheet-target]");
  if (sheetLink && window.openSheet) {
    const target = sheetLink.dataset.sheetTarget;
    openSheet(target);
    return;
  }
});


// ------------------------------------------------------------
// 2. ESC-TAST → LUKK ALLE POPUPS/SHEETS
// ------------------------------------------------------------
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && window.closePopup) {
    closePopup();
  }
});


// ------------------------------------------------------------
// 3. EKSPORTERT API (app.js → utils)
// ------------------------------------------------------------
// Disse defineres KUN hvis utils ikke allerede har implementert dem.
// Dette gjør app.js robust hvis utils lastes senere.

if (!window.openSheet) {
  window.openSheet = function(sheetId, html) {
    console.warn("openSheet() mangler i utils:", sheetId, html);
  };
}

if (!window.closePopup) {
  window.closePopup = function() {
    console.warn("closePopup() mangler i utils");
  };
}

if (!window.openBadgeSheet) {
  window.openBadgeSheet = function(catId) {
    console.warn("openBadgeSheet() mangler i utils:", catId);
  };
}

if (!window.openProfileSheet) {
  window.openProfileSheet = function() {
    console.warn("openProfileSheet() mangler i utils");
  };
}









/* ============================================================
   KAPITTEL J — MINI-PROFIL & PROFILHJELPERE
   ------------------------------------------------------------
   Formål:
   • Vise en liten profilboks på kartet (ikon, farge, stats)
   • Koble miniprofilen til full profilside
   • Vise quizhistorikk i popup (via utils)
   ------------------------------------------------------------
   Viktig:
   • Ingen HTML-generering utover utfylling av forhåndslagde elementer
   • All visning av sheets/popup gjøres i utils
   ============================================================ */



// ------------------------------------------------------------
// 1. INITIALISER MINI-PROFILEN
// ------------------------------------------------------------
function initMiniProfile() {
  if (!el.miniProfile) return;

  const totalVisited = Object.keys(VISITED_PLACES).length;
  const totalQuizzes = Object.keys(COMPLETED_QUIZZES).length;

  el.miniProfile.innerHTML = `
    <div class="mini-profile-inner" data-open-profile>
      <div class="mini-p-avatar"></div>
      <div class="mini-p-stats">
        <div class="mini-p-line">Steder: ${totalVisited}</div>
        <div class="mini-p-line">Quiz: ${totalQuizzes}</div>
      </div>
    </div>
  `;
}



// ------------------------------------------------------------
// 2. VIS QUIZHISTORIKK (brukes i utils → åpner popup)
// ------------------------------------------------------------
function showQuizHistory() {
  const quizList = Object.keys(COMPLETED_QUIZZES || {});
  if (!quizList.length) return "Ingen quizer fullført enda.";

  return quizList
    .map(id => `<div class="quiz-history-item">${id}</div>`)
    .join("");
}



// ------------------------------------------------------------
// 3. KOBLE MINI-PROFILEN TIL PROFILSIDE
// ------------------------------------------------------------
function wireMiniProfileLinks() {
  if (!el.miniProfile) return;

  el.miniProfile.addEventListener("click", () => {
    // I ny versjon åpnes full profilside direkte:
    window.location.href = "profile.html";
  });
}


// ------------------------------------------------------------
// 4. LYTTPÅ OPPDATERINGER – OPPDATER MINI-PROFIL AUTOMATISK
// ------------------------------------------------------------
window.addEventListener("updateProfile", () => {
  initMiniProfile();
});








/* ============================================================
   KAPITTEL K — BOOT
   ------------------------------------------------------------
   Dette er hjertet i History Go 2.
   Starter kartet, laster data, kobler personer ↔ steder,
   starter posisjonssystemet, initierer miniprofil og
   gjør appen klar for bruk.t
   ============================================================ */


// ------------------------------------------------------------
// 1. HJELPER: LAST EN JSON-FIL OG RETURNER PARSET DATA
// ------------------------------------------------------------
async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(path + " kunne ikke lastes");
    return await res.json();
  } catch (err) {
    console.error("JSON-load-feil:", path, err);
    return [];
  }
}


// ------------------------------------------------------------
// 2. LAST PLACES, PEOPLE, ROUTES, BADGES  (OPPDATERT)
// ------------------------------------------------------------
async function loadAllData() {

  // --- STEDER ---
  PLACES = await loadJSON("data/places.json");

  // --- PERSONER ---
  const peopleFiles = [
    "data/people.json",
    "data/people_litteratur.json",
    "data/people_vitenskap.json"
  ];

  let allPeople = [];
  for (const file of peopleFiles) {
    const data = await loadJSON(file);
    if (Array.isArray(data)) allPeople = allPeople.concat(data);
  }
  PEOPLE = allPeople;

  // --- RUTER ---
  ROUTES = await loadJSON("data/routes.json");

  // --- BADGES ---
  await ensureBadgesLoaded();
}


// ------------------------------------------------------------
// 3. LINK PERSONER ↔ STEDER
// ------------------------------------------------------------
function linkPeopleToPlaces() {
  // nullstill
  for (const p of PLACES) p.people = [];

  PEOPLE.forEach(person => {
    if (Array.isArray(person.places)) {
      person.places.forEach(placeId => {
        const place = PLACES.find(p => p.id === placeId);
        if (place) place.people.push(person.id);
      });
    }
  });
}



// ------------------------------------------------------------
// 4. HOVEDFUNKSJON – BOOT
// ------------------------------------------------------------
async function boot() {

  try {
    console.log("🚀 History Go 2 – starter boot-prosessen …");

    // 1. Start kart
    initMap();

    // 2. Last datafiler
    await loadAllData();

    // 3. Link personer ↔ steder
    linkPeopleToPlaces();

    // 4. Tegn markører
    drawPlaceMarkers();

    // 5. Posisjon
    requestLocation();
    enableLivePositionUpdates();

    // 6. Init mini-profil
    initMiniProfile();
    wireMiniProfileLinks();

    // 7. Første rendering av nærområdeliste hvis posisjon finnes
    if (userPos) {
      renderNearbyPlaces(userPos.lat, userPos.lon);
    }

    console.log("✅ History Go 2 – boot fullført.");

  } catch (err) {
    console.error("BOOT-FEIL:", err);
    showToast("❌ Klarte ikke starte appen.");
  }
}


// ------------------------------------------------------------
// 5. START VED DOMContentLoaded
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  boot();
});








/* ============================================================
   KAPITTEL M — QUIZ
   ------------------------------------------------------------
   Håndterer:
   • Laster quiz-filer per kategori
   • Starter quiz for et sted eller en person
   • Viser spørsmål og alternativer i et enkelt quiz-UI
   • Lagrer progresjon i localStorage ("quiz_progress")
   • Kaller addCompletedQuizAndMaybePoint() fra Kapittel H
   • Triggere updateProfile-event når quiz er ferdig
   ------------------------------------------------------------
   Avhenger av:
   • PLACES, PEOPLE (Kapittel A/C)
   • showToast() (Kapittel A)
   • tagToCat() (Kapittel B)
   • addCompletedQuizAndMaybePoint() (Kapittel H)
   • window.TEST_MODE (valgfritt/definert i Kapittel D)
   • popup-utils.js → kaller startQuiz(targetId)
   ============================================================ */


// -------------------------------
// 1. Hvilke filer hører til hvilke kategorier
// -------------------------------
const QUIZ_FILE_MAP = {
  historie:       "data/quiz_historie.json",
  vitenskap:      "data/quiz_vitenskap.json",
  kunst:          "data/quiz_kunst.json",
  musikk:         "data/quiz_musikk.json",
  natur:          "data/quiz_natur.json",
  sport:          "data/quiz_sport.json",
  by:             "data/quiz_by.json",
  politikk:       "data/quiz_politikk.json",
  populaerkultur: "data/quiz_populaerkultur.json",
  subkultur:      "data/quiz_subkultur.json"
};


// Cache: { [categoryId]: [questions...] }
const QUIZ_CACHE = {};

// Nåværende quiz i minnet
let CURRENT_QUIZ = null;
// Struktur:
// CURRENT_QUIZ = {
//   id: quizId,
//   categoryId,
//   questions: [...],
//   index: 0,
//   correct: 0,
//   context: { place, person }
// };


// ------------------------------------------------------------
// 2. HJELPER: LAST QUIZ-FIL FOR KATEGORI (med cache)
// ------------------------------------------------------------
async function loadQuizForCategory(categoryId) {
  if (!categoryId) return [];

  if (QUIZ_CACHE[categoryId]) {
    return QUIZ_CACHE[categoryId];
  }

  const path = QUIZ_FILE_MAP[categoryId];
  if (!path) {
    console.warn("Ingen quiz-fil for kategori:", categoryId);
    return [];
  }

  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error("Kunne ikke laste " + path);
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.warn("Quiz-data ikke array for kategori:", categoryId);
      QUIZ_CACHE[categoryId] = [];
      return [];
    }
    QUIZ_CACHE[categoryId] = data;
    return data;
  } catch (err) {
    console.error("Feil ved lasting av quiz for", categoryId, err);
    QUIZ_CACHE[categoryId] = [];
    return [];
  }
}


// ------------------------------------------------------------
// 3. QUIZ-UI – sørg for at overlay finnes
// ------------------------------------------------------------
function ensureQuizUI() {
  if (el.quizContainer && el.quizInner) return;

  const container = document.createElement("div");
  container.id = "quizContainer";
  container.className = "quiz-overlay";
  container.setAttribute("aria-hidden", "true");

  const inner = document.createElement("div");
  inner.id = "quizInner";
  inner.className = "quiz-modal";

  container.appendChild(inner);
  document.body.appendChild(container);

  // Legg inn i DOM-cache
  el.quizContainer = container;
  el.quizInner = inner;
}


// ------------------------------------------------------------
// 4. ÅPNE / LUKKE QUIZ
// ------------------------------------------------------------
function openQuiz() {
  ensureQuizUI();
  if (!el.quizContainer) return;
  el.quizContainer.setAttribute("aria-hidden", "false");
  el.quizContainer.classList.add("visible");
}

function closeQuiz() {
  if (!el.quizContainer) return;
  el.quizContainer.setAttribute("aria-hidden", "true");
  el.quizContainer.classList.remove("visible");
  CURRENT_QUIZ = null;
}


// ------------------------------------------------------------
// 5. START QUIZ (kalles fra popup-utils via data-quiz)
// ------------------------------------------------------------
async function startQuiz(targetId) {
  if (!targetId) return;

  ensureQuizUI();

  // 1) Prøv stedet
  let place = PLACES.find(p => p.id === targetId);
  let person = null;
  let categoryId = null;
  let quizId = targetId;

  // 2) Hvis ikke sted → prøv person
  if (!place) {
    person = PEOPLE.find(p => p.id === targetId);
    if (!person) {
      showToast("Fant ingen quiz for dette.");
      return;
    }
  }

  // 3) Fysisk besøkskrav (for steder og personer)
  try {
    const visited = JSON.parse(localStorage.getItem("visited_places") || "{}");
    const testMode = window.TEST_MODE === true;

    if (place && !visited[place.id] && !testMode) {
      return showToast("📍 Du må besøke stedet først for å ta denne quizen.");
    }

    if (person && person.placeId && !visited[person.placeId] && !testMode) {
      return showToast("📍 Du må besøke stedet først for å ta denne quizen.");
    }
  } catch {
    // Hvis noe er korrupt, lar vi brukeren ta quiz, men loggfører
    console.warn("visited_places kunne ikke leses som JSON.");
  }

  // 4) Finn kategori
  if (place) {
    categoryId = place.category || null;
  } else if (person) {
    // Prøv tagToCat først, fallback til stedets kategori
    const tag = Array.isArray(person.tags) ? person.tags[0] : person.tags;
    categoryId = tagToCat(tag);
    if (!categoryId && person.placeId) {
      const pl = PLACES.find(p => p.id === person.placeId);
      categoryId = pl?.category || null;
    }
  }

  if (!categoryId) {
    showToast("Ingen kategori for denne quizen.");
    return;
  }

  // 5) Last spørsmål for kategorien
  const allQuestions = await loadQuizForCategory(categoryId);
  if (!allQuestions.length) {
    showToast("Ingen spørsmål registrert ennå.");
    return;
  }

  // 6) Filtrer spørsmål på placeId/personId hvis mulig
  let relevant = allQuestions;
  if (place) {
    relevant = allQuestions.filter(q => q.placeId === place.id || q.quizId === quizId);
  } else if (person) {
    relevant = allQuestions.filter(q => q.personId === person.id || q.quizId === quizId);
  }
  if (!relevant.length) {
    relevant = allQuestions; // fallback: hele kategorien
  }

  // 7) Sett opp CURRENT_QUIZ
  CURRENT_QUIZ = {
    id: quizId,
    categoryId,
    questions: relevant,
    index: 0,
    correct: 0,
    context: { place, person }
  };

  // 8) Start flyten
  openQuiz();
  renderQuizQuestion();
}


// ------------------------------------------------------------
// 6. RENDER NÅVÆRENDE SPØRSMÅL
// ------------------------------------------------------------
function renderQuizQuestion() {
  if (!CURRENT_QUIZ || !el.quizInner) return;

  const { questions, index } = CURRENT_QUIZ;

  // Ferdig?
  if (index >= questions.length) {
    return finishQuiz();
  }

  const q = questions[index];

  const options = Array.isArray(q.options) ? q.options : [];
  const total = questions.length;
  const nr = index + 1;

  el.quizInner.innerHTML = `
    <div class="quiz-header">
      <div class="quiz-counter">Spørsmål ${nr} av ${total}</div>
      <button class="quiz-close" data-quiz-close>✕</button>
    </div>

    <div class="quiz-question">
      ${q.question || "Uten tekst"}
    </div>

    <div class="quiz-options">
      ${
        options.map((opt, i) => `
          <button class="quiz-option" data-opt="${i}">
            ${opt}
          </button>
        `).join("")
      }
    </div>
  `;
}


// ------------------------------------------------------------
// 7. HÅNDTER SVAR (delegasjon på quizInner)
// ------------------------------------------------------------
document.addEventListener("click", e => {
  // Lukkeknapp
  if (e.target.closest("[data-quiz-close]")) {
    closeQuiz();
    return;
  }

  const btn = e.target.closest(".quiz-option");
  if (!btn || !CURRENT_QUIZ) return;

  const idx = Number(btn.dataset.opt || "0");
  const q = CURRENT_QUIZ.questions[CURRENT_QUIZ.index];
  const options = Array.isArray(q.options) ? q.options : [];
  const chosen = options[idx];
  const correctAnswer = q.answer;

  if (chosen === correctAnswer) {
    CURRENT_QUIZ.correct++;
    showToast("✅ Riktig!");
  } else {
    showToast("❌ Feil svar.");
  }

  CURRENT_QUIZ.index++;
  renderQuizQuestion();
});


// ------------------------------------------------------------
// 8. AVSLUTT QUIZ
// ------------------------------------------------------------
function finishQuiz() {
  if (!CURRENT_QUIZ || !el.quizInner) return;

  const { id, categoryId, correct, questions, context } = CURRENT_QUIZ;
  const total = questions.length;

  // Lagre progresjon + meritter
  markQuizAsDone(id, categoryId);

  // Enkel oppsummering
  el.quizInner.innerHTML = `
    <div class="quiz-header">
      <div class="quiz-counter">Quiz ferdig</div>
      <button class="quiz-close" data-quiz-close>✕</button>
    </div>

    <div class="quiz-summary">
      <p>Du fikk <strong>${correct}</strong> av <strong>${total}</strong> riktige.</p>
    </div>
  `;

  // Eventuelle rewards (Kapittel N kan utvides)
  if (context.person && typeof showRewardPerson === "function") {
    showRewardPerson(context.person);
  }
  if (context.place && typeof showRewardPlace === "function") {
    showRewardPlace(context.place);
  }

  // Oppdater profil
  window.dispatchEvent(new Event("updateProfile"));
}


// ------------------------------------------------------------
// 9. LAGRE QUIZ-PROGRESJON + MERITTER
// ------------------------------------------------------------
function markQuizAsDone(quizId, categoryId) {
  if (!quizId || !categoryId) return;

  let progress = {};
  try {
    progress = JSON.parse(localStorage.getItem("quiz_progress") || "{}");
  } catch {
    progress = {};
  }

  const catObj = progress[categoryId] || { completed: [], points: 0 };

  if (!Array.isArray(catObj.completed)) {
    catObj.completed = [];
  }
  if (!catObj.completed.includes(quizId)) {
    catObj.completed.push(quizId);
    catObj.points = (catObj.points || 0) + 1;
  }

  progress[categoryId] = catObj;
  localStorage.setItem("quiz_progress", JSON.stringify(progress));

  // Meritter (Kapittel H)
  if (typeof addCompletedQuizAndMaybePoint === "function") {
    addCompletedQuizAndMaybePoint(quizId, categoryId);
  }
}


// ------------------------------------------------------------
// 10. EKSPORTER startQuiz GLOBALT
// ------------------------------------------------------------
window.startQuiz = startQuiz;






















/* ============================================================
   KAPITTEL N — REWARD-POPUPS
   ------------------------------------------------------------
   Ansvar:
   • Gi belønning når:
       - sted besøkes første gang
       - person låses opp
       - quiz fullføres
   • Lagrer i localStorage
   • Kaller popup-utils for visuell popup
   ------------------------------------------------------------
   Dette kapittelet håndterer **kun logikk**, ikke UI.
   UI kommer fra popup-utils.js → showRewardPerson, showRewardPlace
   ============================================================ */


// ------------------------------------------------------------
// 1. REGISTRER BESØKT STED
// ------------------------------------------------------------
function markPlaceVisited(place) {
  if (!place || !place.id) return;

  let visited = {};
  try {
    visited = JSON.parse(localStorage.getItem("visited_places") || "{}");
  } catch {
    visited = {};
  }

  if (!visited[place.id]) {
    visited[place.id] = {
      ts: Date.now()
    };
    localStorage.setItem("visited_places", JSON.stringify(visited));

    // Reward-popup finnes i popup-utils
    if (typeof showRewardPlace === "function") {
      showRewardPlace(place);
    }

    // Oppdater profil
    window.dispatchEvent(new Event("updateProfile"));
  }
}


// ------------------------------------------------------------
// 2. REGISTRER PERSON SOM OPPLÅST
// ------------------------------------------------------------
function markPersonUnlocked(person) {
  if (!person || !person.id) return;

  let collected = {};
  try {
    collected = JSON.parse(localStorage.getItem("people_collected") || "{}");
  } catch {
    collected = {};
  }

  if (!collected[person.id]) {
    collected[person.id] = {
      ts: Date.now()
    };
    localStorage.setItem("people_collected", JSON.stringify(collected));

    // Reward-popup fra popup-utils
    if (typeof showRewardPerson === "function") {
      showRewardPerson(person);
    }

    // Oppdater profil
    window.dispatchEvent(new Event("updateProfile"));
  }
}


// ------------------------------------------------------------
// 3. HOVEDFUNKSJON: KOBLER PERSONER TIL STEDER
// ------------------------------------------------------------
function unlockPeopleAtPlace(place) {
  if (!place) return;
  if (!Array.isArray(place.people)) return;

  place.people.forEach(pid => {
    const person = PEOPLE.find(p => p.id === pid);
    if (person) markPersonUnlocked(person);
  });
}


// ------------------------------------------------------------
// 4. EKSPORTER GLOBALT
// ------------------------------------------------------------
window.markPlaceVisited = markPlaceVisited;
window.markPersonUnlocked = markPersonUnlocked;
window.unlockPeopleAtPlace = unlockPeopleAtPlace;
