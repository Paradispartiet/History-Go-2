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
