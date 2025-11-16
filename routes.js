// =====================================================
// HISTORY GO – ROUTES.JS (NY VERSJON)
// Tematiske ruter (vitenskap, kunst, industri osv.)
// Bruker: PLACES, mapInstance, catColor, catIdFromDisplay, showToast
// =====================================================

let ROUTES = [];

// ------------------------------
// 1. Last ruter fra /data/routes.json
// ------------------------------
async function loadRoutes() {
  try {
    const res = await fetch("data/routes.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    ROUTES = await res.json();
    console.log("Ruter lastet:", ROUTES.length);
  } catch (err) {
    console.warn("Kunne ikke laste ruter:", err);
    ROUTES = [];
  }
}

// ------------------------------
// 2. Overlay med liste over ruter
// ------------------------------
function showRouteOverlay() {
  // Fjern gammel hvis den finnes
  const existing = document.querySelector(".hg-popup.route-overlay");
  if (existing) existing.remove();

  if (!ROUTES.length) {
    showToast("Ingen temaruter er tilgjengelige ennå.");
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "hg-popup route-overlay visible";

  const inner = document.createElement("div");
  inner.className = "hg-popup-inner";

  inner.innerHTML = `
    <button class="hg-popup-close" type="button">✕</button>
    <h2 class="hg-popup-title">Temaruter</h2>
    <p class="hg-popup-desc">
      Velg en rute for å se stoppene og tegne den opp på kartet.
    </p>
    <div class="hg-section">
      ${ROUTES.map(r => {
        const catId = typeof catIdFromDisplay === "function"
          ? (catIdFromDisplay(r.category || r.categoryId || "") || "historie")
          : (r.categoryId || "historie");

        return `
          <div class="hg-place-chip" data-route-id="${r.id}">
            <strong>${r.name}</strong><br>
            <span class="hg-muted">${r.desc || ""}</span><br>
            <span class="hg-muted">Kategori: ${catId}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;

  wrap.appendChild(inner);
  document.body.appendChild(wrap);

  // Lukkeknapp
  inner.querySelector(".hg-popup-close").onclick = () => wrap.remove();

  // Klikk på bakgrunn → lukk
  wrap.addEventListener("click", e => {
    if (e.target === wrap) wrap.remove();
  });

  // Klikk på rute
  inner.addEventListener("click", e => {
    const btn = e.target.closest("[data-route-id]");
    if (!btn) return;
    const id = btn.dataset.routeId;
    focusRouteOnMap(id);
  });
}

// ------------------------------
// 3. Åpne sted direkte fra rute
// ------------------------------
function openPlaceById(id) {
  if (!window.PLACES || !Array.isArray(PLACES)) return;
  const p = PLACES.find(x => x.id === id);
  if (p && typeof openPlaceCard === "function") {
    openPlaceCard(p);
  }
}

// ------------------------------
// 4. Tegn rute på kartet (fotrute hvis mulig)
// ------------------------------
function focusRouteOnMap(routeId) {
  if (!window.PLACES || !Array.isArray(PLACES)) return;
  if (typeof showToast !== "function") return;

  const route = ROUTES.find(r => r.id === routeId);
  if (!route) {
    showToast("Fant ikke ruten.");
    return;
  }

  if (!window.mapInstance || !window.L) {
    showToast("Kartet er ikke klart ennå.");
    return;
  }

  // Farge ut fra kategori (bruker display-tekst via catIdFromDisplay)
  const catId = typeof catIdFromDisplay === "function"
    ? (catIdFromDisplay(route.category || route.categoryId || "") || "historie")
    : (route.categoryId || "historie");

  const color = typeof catColor === "function"
    ? catColor(catId)
    : "#FFD600";

  // Hent koordinater fra stedene
  const coords = route.stops
    .map(s => {
      const plc = PLACES.find(p => p.id === s.placeId);
      return plc ? [plc.lat, plc.lon] : null;
    })
    .filter(Boolean);

  if (!coords.length) {
    showToast("Ingen gyldige stopp i denne ruten.");
    return;
  }

  // Fjern tidligere rute hvis den finnes
  if (window.routeControl) {
    try {
      window.mapInstance.removeControl(window.routeControl);
    } catch (e) {
      console.warn("Kunne ikke fjerne tidligere rute:", e);
    }
    window.routeControl = null;
  }

  // Prøv fotrute (Leaflet Routing Machine), fallback til rett linje
  try {
    if (L.Routing && typeof L.Routing.control === "function") {
      window.routeControl = L.Routing.control({
        waypoints: coords.map(c => L.latLng(c[0], c[1])),
        lineOptions: {
          styles: [{ color, weight: 4 }],
          addWaypoints: false
        },
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
        createMarker: () => null
      }).addTo(window.mapInstance);
    } else {
      throw new Error("Routing ikke tilgjengelig");
    }
  } catch (e) {
    console.warn("Fotrute-feil:", e);
    showToast("Kunne ikke hente fotrute – viser enkel linje.");

    const line = L.polyline(coords, { color, weight: 4 }).addTo(window.mapInstance);
    window.mapInstance.fitBounds(line.getBounds(), { padding: [60, 60] });
  }

  // Zoom inn på ruten
  if (!window.routeControl) {
    const line = L.polyline(coords, { color, weight: 4 }).addTo(window.mapInstance);
    window.mapInstance.fitBounds(line.getBounds(), { padding: [60, 60] });
  }
}

// ------------------------------
// 5. Eksportér til global scope
// ------------------------------
window.loadRoutes = loadRoutes;
window.showRouteOverlay = showRouteOverlay;
window.focusRouteOnMap = focusRouteOnMap;
window.openPlaceById = openPlaceById;
