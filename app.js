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






