/* ============================================================
   POPUP-UTILS.JS — UNIVERSAL POPUP MOTOR FOR HISTORY GO
   ------------------------------------------------------------
   Dette er den ENESTE filen som håndterer popup-visning.
   app.js kaller kun logiske funksjoner — alt grafisk gjøres her.
   ============================================================ */


/* ------------------------------------------------------------
   1. UNIVERSAL POPUP WRAPPER
   ------------------------------------------------------------ */

function createPopup(html) {
  // Overlay
  const wrapper = document.createElement("div");
  wrapper.className = "hg-popup";
  wrapper.innerHTML = `
    <div class="hg-popup-inner">
      ${html}
      <button class="hg-popup-close">✕</button>
    </div>
  `;

  document.body.appendChild(wrapper);

  // Fade-in
  setTimeout(() => wrapper.classList.add("visible"), 10);

  // Close events
  wrapper.querySelector(".hg-popup-close").onclick = () => wrapper.remove();
  wrapper.onclick = e => {
    if (e.target.classList.contains("hg-popup")) {
      wrapper.remove();
    }
  };

  return wrapper;
}



/* ============================================================
   2. PERSON-POPUP
   ------------------------------------------------------------
   Kalles fra:
   - showPersonPopup(person)
   - steds-popup når man klikker på person
   - reward-popup kan også trigge person-popup
   ============================================================ */

window.showPersonPopup = function(person) {
  if (!person) return;

  const face    = `bilder/people/${person.id}_face.PNG`;
  const cardImg = person.image || `bilder/kort/people/${person.id}.PNG`;
  const wiki    = person.wiki || "";
  const works   = person.works || [];

  const places = PLACES.filter(p => p.people?.includes(person.id));

  const html = `
    <div class="hg-person">

      <img src="${face}" class="hg-popup-face">

      <h2 class="hg-popup-name">${person.name}</h2>
      <img src="${cardImg}" class="hg-popup-cardimg">

      <div class="hg-section">
        <h3>Verk</h3>
        ${
          works.length
           ? `<ul class="hg-works">${works.map(w => `<li>${w}</li>`).join("")}</ul>`
           : `<p class="hg-muted">Ingen registrerte verk.</p>`
        }
      </div>

      <div class="hg-section">
        <h3>Biografi</h3>
        <p>${wiki}</p>
      </div>

      <div class="hg-section">
        <h3>Steder</h3>
        ${
          places.length
            ? places.map(p => `
                <button class="hg-place-chip" data-place="${p.id}">
                  📍 ${p.name}
                </button>
              `).join("")
            : `<p class="hg-muted">Ingen registrerte steder.</p>`
        }
      </div>

      <button class="hg-quiz-btn" data-quiz="${person.id}">
        Ta quiz
      </button>
    </div>
  `;

  const popup = createPopup(html);

  // Klikk på steder inne i person-popup
  popup.querySelectorAll("[data-place]").forEach(btn => {
    btn.onclick = () => {
      const pl = PLACES.find(p => p.id === btn.dataset.place);
      popup.remove();
      showPlacePopup(pl);
    };
  });
};



/* ============================================================
   3. STEDS-POPUP
   ------------------------------------------------------------
   Kalles fra:
   - kartklikk
   - nærområdeliste (kapittel F)
   - openPlaceCardByPerson()
   ============================================================ */

window.showPlacePopup = function(place) {
  if (!place) return;

  const img = place.image || `bilder/kort/places/${place.id}.PNG`;

  const peopleHere = (place.people || [])
    .map(id => PEOPLE.find(p => p.id === id))
    .filter(Boolean);

  const html = `
    <div class="hg-place">

      <img src="${img}" class="hg-popup-img" alt="${place.name}">

      <h2 class="hg-popup-title">${place.name}</h2>
      <p class="hg-popup-cat">${place.category || ""}</p>
      <p class="hg-popup-desc">${place.desc || ""}</p>

      <button class="hg-quiz-btn" data-quiz="${place.id}">
        Ta quiz
      </button>

      ${
        peopleHere.length
          ? `
            <div class="hg-section">
              <h3>Personer</h3>
              <div class="hg-popup-people">
                ${peopleHere.map(p => `
                  <button class="hg-facechip" data-person="${p.id}">
                    <img src="bilder/people/${p.id}_face.PNG">
                    <span>${p.name}</span>
                  </button>
                `).join("")}
              </div>
            </div>
          `
          : ""
      }
    </div>
  `;

  const popup = createPopup(html);

  // Klikk på person → åpne person-popup
  popup.querySelectorAll("[data-person]").forEach(btn => {
    btn.onclick = () => {
      const pr = PEOPLE.find(p => p.id === btn.dataset.person);
      popup.remove();
      showPersonPopup(pr);
    };
  });
};



/* ============================================================
   4. REWARD-POPUPS
   ------------------------------------------------------------
   Kalles fra Kapittel N i app.js:
   - showRewardPlace(place)
   - showRewardPerson(person)
   ============================================================ */

window.showRewardPlace = function(place) {
  if (!place) return;

  const img = place.image || `bilder/kort/places/${place.id}.PNG`;

  const html = `
    <div class="hg-reward">
      <h2>Sted besøkt!</h2>
      <img src="${img}" class="hg-reward-img">
      <p>${place.name}</p>
    </div>
  `;

  createPopup(html);
};


window.showRewardPerson = function(person) {
  if (!person) return;

  const img = person.image || `bilder/kort/people/${person.id}.PNG`;

  const html = `
    <div class="hg-reward">
      <h2>Ny person funnet!</h2>
      <img src="${img}" class="hg-reward-img">
      <p>${person.name}</p>
    </div>
  `;

  createPopup(html);
};



/* ============================================================
   5. GLOBAL QUIZ-KNAPP HANDLER
   ------------------------------------------------------------
   All quiz-start håndteres her og i Kapittel M
   ============================================================ */

document.addEventListener("click", e => {
  const btn = e.target.closest(".hg-quiz-btn");
  if (!btn) return;

  const id = btn.dataset.quiz;
  if (id && typeof startQuiz === "function") {
    startQuiz(id);
  }
});
