// =====================================================
// HISTORY GO — PROFILE.JS (Full produksjonsversjon)
// Synkronisert 1:1 med profile.html
// =====================================================

// -------------------------------
// 1. LocalStorage-data
// -------------------------------
const VISITED   = JSON.parse(localStorage.getItem("visited_places") || "{}");
const COLLECTED = JSON.parse(localStorage.getItem("people_collected") || "{}");
const QUIZZES   = JSON.parse(localStorage.getItem("completed_quizzes") || "{}");
const MERITS    = JSON.parse(localStorage.getItem("merits_by_category") || "{}");

const PROFILE_NAME = localStorage.getItem("profile_name") || "Utforsker";


// -------------------------------
// 2. Datakilder
// -------------------------------
let PLACES = [];
let PEOPLE = [];
let BADGES = {};

async function loadSources() {
  const [places, people, badges] = await Promise.all([
    fetch("data/places.json").then(r => r.json()),
    fetch("data/people.json").then(r => r.json()),
    fetch("data/badges.json").then(r => r.json())
  ]);

  PLACES = places;
  PEOPLE = people;
  BADGES = badges;
}


// -------------------------------
// 3. Profilkort
// -------------------------------
function renderProfileCard() {
  document.getElementById("profileName").textContent = PROFILE_NAME;

  const visitedCount = Object.keys(VISITED).length;
  const quizCount    = Object.keys(QUIZZES).length;
  const streak       = calculateStreak();

  document.getElementById("statVisited").textContent = visitedCount;
  document.getElementById("statQuizzes").textContent = quizCount;
  document.getElementById("statStreak").textContent  = streak;

  // Totalnivå (basert på SUM av merits)
  document.getElementById("profileLevel").textContent =
    determineTotalLevel(MERITS);
}


// -------------------------------
// 4. Nivå (samlet)
// -------------------------------
function determineTotalLevel(merits) {
  let sum = 0;
  for (const cat in merits) sum += merits[cat] || 0;

  if (sum < 5) return "Utforsker";
  if (sum < 12) return "Lærd";
  if (sum < 20) return "Historiker";
  return "Mesterutforsker";
}


// -------------------------------
// 5. Streak
// -------------------------------
function calculateStreak() {
  const last = localStorage.getItem("last_visit_day");
  if (!last) return 0;

  const today = new Date().toDateString();
  return last === today
    ? parseInt(localStorage.getItem("streak") || "1")
    : 0;
}


// -------------------------------
// 6. Merker (merits)
// -------------------------------
function renderMerits() {
  const grid = document.getElementById("merits");
  grid.innerHTML = "";

  for (const cat in BADGES) {
    const level = MERITS[cat] || 0;
    const badge = BADGES[cat][level] || BADGES[cat][0];

    const el = document.createElement("div");
    el.className = "badge-item";

    el.innerHTML = `
      <img src="${badge.image}" alt="${badge.title}">
      <span>${badge.title}</span>
    `;

    grid.appendChild(el);
  }
}


// -------------------------------
// 7. Personer
// -------------------------------
function renderPeople() {
  const grid = document.getElementById("peopleGrid");
  grid.innerHTML = "";

  const unlocked = PEOPLE.filter(p => COLLECTED[p.id]);

  unlocked.forEach(p => {
    const item = document.createElement("div");
    item.className = "face-item";
    item.innerHTML = `
      <img src="bilder/people/${p.id}_face.PNG" alt="${p.name}">
      <span>${p.name}</span>
    `;
    item.onclick = () => showPersonPopup(p);
    grid.appendChild(item);
  });
}


// -------------------------------
// 8. Steder (collection)
// -------------------------------
function renderCollection() {
  const grid = document.getElementById("collectionGrid");
  grid.innerHTML = "";

  PLACES.filter(pl => VISITED[pl.id]).forEach(pl => {
    const item = document.createElement("div");
    item.className = "place-item";
    item.innerHTML = `
      <img src="${pl.cardImage || pl.image}" alt="${pl.name}">
      <span>${pl.name}</span>
    `;
    item.onclick = () => showPlacePopup(pl);
    grid.appendChild(item);
  });
}


// -------------------------------
// 9. Tidslinje
// -------------------------------
function renderTimeline() {
  const list = document.getElementById("timelineList");
  list.innerHTML = "";

  const combined = [];

  // personer
  PEOPLE.filter(p => COLLECTED[p.id]).forEach(p =>
    combined.push({
      year: p.year || 0,
      name: p.name,
      img: p.image || `bilder/kort/people/${p.id}.PNG`
    })
  );

  // steder
  PLACES.filter(pl => VISITED[pl.id]).forEach(pl =>
    combined.push({
      year: pl.year || 0,
      name: pl.name,
      img: pl.cardImage || pl.image
    })
  );

  // sortering
  combined
    .sort((a, b) => a.year - b.year)
    .forEach(item => {
      const el = document.createElement("div");
      el.className = "timeline-item";

      el.innerHTML = `
        <div class="timeline-year">${item.year}</div>
        <img src="${item.img}">
        <span>${item.name}</span>
      `;

      list.appendChild(el);
    });
}


// -------------------------------
// 10. Eksport
// -------------------------------
document.getElementById("exportProfileBtn").onclick = async () => {
  const card = document.getElementById("profileCard");

  const canvas = await html2canvas(card, {
    scale: 3,
    backgroundColor: "#0a1929"
  });

  const link = document.createElement("a");
  link.download = "history-go-profil.png";
  link.href = canvas.toDataURL();
  link.click();
};


// -------------------------------
// 11. Nullstilling
// -------------------------------
document.getElementById("resetProfileBtn").onclick = () => {
  if (!confirm("Er du sikker? Alt slettes permanent.")) return;
  localStorage.clear();
  location.reload();
};


// -------------------------------
// 12. Init
// -------------------------------
async function initProfile() {
  await loadSources();

  renderProfileCard();
  renderMerits();
  renderPeople();
  renderCollection();
  renderTimeline();
}

initProfile();
