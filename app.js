// Interface : accueil et résultats. La logique de calcul est dans engine.js, les textes dans textes.js.
import { preparer, chercher, accesDepuisArret, absenceDeService, prochainJourDeService } from "./engine.js";
import { T, TAD_LIENS, heure, duree, dateLongue, jourEnToutesLettres, texteAlerte, texteAbsence, dateIsoLocale, secondesDuJour, pluriel } from "./textes.js";
import { construireIndex, rechercher, principaux, normaliser } from "./lieux.js";
import { tadPossible } from "./tad.js";
import { creerMemoire, CHOIX_MARCHE_SEC } from "./memoire.js";

const vue = document.getElementById("vue");
const etat = document.getElementById("etat");
const memoire = creerMemoire();
let data, index, annonce, dejaAffiche = false;
const focaliserTitre = () => { if (dejaAffiche) vue.querySelector("#titre")?.focus({ preventScroll: true }); dejaAffiche = true; };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jourSemaine = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const nomArret = (id) => data.arrets[id].complet;

const ICONES = {
  marche: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.6"/><path d="M12 8 9 10l-1 4M12 8l2 3 3 1M11 12l-2 5-2 3M11 12l2 3 1 5"/></svg>',
  inverser: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16M8 4 4 8M8 4l4 4M16 20V4M16 20l-4-4M16 20l4-4"/></svg>',
  etoile: (plein) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="${plein ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`,
};

// ---------------------------------------------------------------- petits outils

function texteSur(hex) { // noir ou blanc, selon le meilleur contraste
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#000" : "#fff";
}
const pastille = (ligne) => {
  const c = data.lignes[ligne]?.couleur || "888888";
  return `<span class="pastille" style="background:#${c};color:${texteSur(c)}" title="Ligne ${esc(ligne)}"><span class="sr-only">Ligne </span>${esc(ligne)}</span>`;
};

const versSec = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 3600 + m * 60; };
const versHhmm = (sec) => `${String(Math.floor(sec / 3600) % 24).padStart(2, "0")}:${String(Math.floor(sec / 60) % 60).padStart(2, "0")}`;

function annoncer(texte) { etat.textContent = ""; setTimeout(() => (etat.textContent = texte), 50); }

function parametresDepuisUrl() {
  const q = new URLSearchParams(location.search);
  const de = q.get("de"), vers = q.get("vers"), date = q.get("date"), h = q.get("heure"), mode = q.get("mode") || "partir";
  if (!de || !vers || !data.arrets[de] || !data.arrets[vers] || de === vers) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^([01]\d|2[0-3])[0-5]\d$/.test(h || "") || !["partir", "arriver"].includes(mode)) return null;
  return { de, vers, date, heure: +h.slice(0, 2) * 3600 + +h.slice(2) * 60, mode };
}
function urlDepuisParametres(p) {
  const hh = String(Math.floor(p.heure / 3600) % 24).padStart(2, "0"), mm = String(Math.floor(p.heure / 60) % 60).padStart(2, "0");
  return `?de=${p.de}&vers=${p.vers}&date=${p.date}&heure=${hh}${mm}&mode=${p.mode}`;
}
function naviguer(p) { history.pushState(null, "", urlDepuisParametres(p)); router(); }

// ---------------------------------------------------------------- bandeaux communs

function bandeaux(dateIso, { accueil = false } = {}) {
  const out = [];
  if (annonce?.actif && annonce.message) out.push(`<p class="bandeau bandeau-alerte" role="note"><strong>Information :</strong> ${esc(annonce.message)}</p>`);
  const aujourdhui = dateIsoLocale();
  const absence = absenceDeService(data, dateIso);
  if (accueil && (absence === "dimanche" || absence === "jour_ferie"))
    out.push(`<p class="bandeau" role="note">${esc(texteAbsence(absence, aujourdhui, dateIso, prochainJourDeService(data, dateIso)))}</p>`);
  if (!absence && jourSemaine(dateIso) === 6) out.push(`<p class="bandeau bandeau-alerte" role="note">${T.samedi}</p>`);
  return out.join("");
}

// ---------------------------------------------------------------- champ de recherche d'arrêt

function combobox(idBase, libelle, valeurInitiale) {
  const racine = document.createElement("div");
  racine.className = "champ";
  racine.innerHTML = `
    <label for="${idBase}">${libelle}</label>
    <input id="${idBase}" type="text" role="combobox" autocomplete="off" autocapitalize="off" spellcheck="false"
      aria-autocomplete="list" aria-expanded="false" aria-controls="${idBase}-liste" aria-describedby="${idBase}-erreur" placeholder="${T.placeholderArret}">
    <ul class="liste" id="${idBase}-liste" role="listbox" aria-label="${libelle}" hidden></ul>
    <p class="erreur" id="${idBase}-erreur"></p>`;
  const input = racine.querySelector("input"), liste = racine.querySelector("ul"), erreur = racine.querySelector(".erreur");
  let options = [], actif = -1, choisi = null;

  const fermer = () => { liste.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); actif = -1; };
  const marquer = (i) => {
    actif = i;
    liste.querySelectorAll("[role=option]").forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    if (i >= 0) { input.setAttribute("aria-activedescendant", `${idBase}-opt-${i}`); liste.children[i + (liste.querySelector(".liste-titre") ? 1 : 0)]?.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  };
  const afficher = () => {
    const texte = input.value.trim();
    const avecTitre = !texte;
    options = texte ? rechercher(index, texte) : principaux(index);
    let html = avecTitre ? `<li class="liste-titre" role="presentation">${T.principauxLieux}</li>` : "";
    if (!options.length) html = `<li class="vide" role="presentation">${T.aucunArret}</li>`;
    html += options.map((a, i) => `<li class="option" role="option" id="${idBase}-opt-${i}" data-i="${i}" aria-selected="false">
      <span>${esc(a.nom)}<small>${esc(a.commune)}</small></span><span aria-hidden="true">${a.lignes.map(pastille).join(" ")}</span></li>`).join("");
    liste.innerHTML = html;
    liste.hidden = false;
    input.setAttribute("aria-expanded", "true");
    actif = -1;
  };
  const choisir = (a) => {
    choisi = a.id; input.value = a.complet; input.removeAttribute("aria-invalid"); erreur.textContent = ""; fermer();
  };
  const definir = (id) => { if (id && data.arrets[id]) { choisi = id; input.value = nomArret(id); } else { choisi = null; input.value = ""; } };

  input.addEventListener("input", () => { choisi = null; input.removeAttribute("aria-invalid"); erreur.textContent = ""; afficher(); });
  input.addEventListener("focus", () => { if (!choisi) afficher(); });
  input.addEventListener("blur", () => setTimeout(fermer, 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (liste.hidden) afficher(); if (options.length) marquer((actif + 1) % options.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (options.length) marquer((actif - 1 + options.length) % options.length); }
    else if (e.key === "Enter" && !liste.hidden && actif >= 0) { e.preventDefault(); choisir(options[actif]); }
    else if (e.key === "Escape") fermer();
  });
  liste.addEventListener("pointerdown", (e) => {
    const li = e.target.closest("[role=option]");
    if (li) { e.preventDefault(); choisir(options[+li.dataset.i]); }
  });
  definir(valeurInitiale);

  return {
    racine, input,
    get id() { return choisi; },
    definir,
    // Si la personne a tapé un nom exact (ou qu'un seul arrêt correspond) sans cliquer dans la liste, on le prend.
    resoudre() {
      if (choisi || !input.value.trim()) return choisi;
      const r = rechercher(index, input.value.trim());
      const exact = r.find((a) => normaliser(a.complet) === normaliser(input.value));
      if (exact) choisir(exact); else if (r.length === 1) choisir(r[0]);
      return choisi;
    },
    erreur(message) { erreur.textContent = message; input.setAttribute("aria-invalid", "true"); },
  };
}

// ---------------------------------------------------------------- accueil

function afficherAccueil(prefill = {}) {
  document.title = "Horaires et trajets RIV – Ploërmel Communauté";
  const aujourdhui = dateIsoLocale();
  const maintenant = new Date();
  const hDefaut = versHhmm(prefill.heure ?? secondesDuJour(maintenant));
  const quandInitial = prefill.date ? (prefill.date === aujourdhui ? "aujourdhui" : "autre") : "maintenant";

  vue.innerHTML = `
    <h1 id="titre" tabindex="-1">${T.titreAccueil}</h1>
    ${bandeaux(aujourdhui, { accueil: true })}
    <form id="form" novalidate>
      <div class="ligne-arrets"><div class="champs" id="arrets"></div><button type="button" class="inverser" aria-label="${T.inverser}">${ICONES.inverser}</button></div>
      <fieldset class="quand">
        <legend>${T.quand}</legend>
        <div class="segments">
          ${[["maintenant", T.maintenant], ["aujourdhui", T.aujourdhui], ["autre", T.autreDate]].map(([v, l]) =>
            `<label><input type="radio" name="quand" value="${v}" ${v === quandInitial ? "checked" : ""}><span>${l}</span></label>`).join("")}
        </div>
        <div class="precision" id="precision" hidden>
          <div id="bloc-date" hidden><label for="date">${T.date}</label>
            <input type="date" id="date" value="${prefill.date ?? aujourdhui}" min="${data.valide_du}" max="${data.valide_au}"></div>
          <div><label for="heure">${T.heureChamp}</label><input type="time" id="heure" value="${hDefaut}"></div>
          <fieldset class="quand"><legend class="sr-only">Partir ou arriver</legend>
            <div class="segments" style="grid-template-columns:1fr 1fr">
              <label><input type="radio" name="mode" value="partir" ${prefill.mode !== "arriver" ? "checked" : ""}><span>${T.partirA}</span></label>
              <label><input type="radio" name="mode" value="arriver" ${prefill.mode === "arriver" ? "checked" : ""}><span>${T.arriverA}</span></label>
            </div></div>
          </fieldset>
        </div>
      </fieldset>
      <p class="erreur" id="err-quand" role="alert"></p>
      <button class="principal" type="submit">${T.rechercher}</button>
    </form>
    <section class="recents" id="recents"></section>`;

  const de = combobox("de", T.depart, prefill.de), vers = combobox("vers", T.arrivee, prefill.vers);
  const zone = vue.querySelector("#arrets");
  zone.prepend(de.racine); zone.append(vers.racine);
  const btnInverser = vue.querySelector(".inverser");
  btnInverser.addEventListener("click", () => { const a = de.id, b = vers.id; const ta = de.input.value, tb = vers.input.value;
    de.definir(b); vers.definir(a); if (!b) de.input.value = tb; if (!a) vers.input.value = ta; });

  const precision = vue.querySelector("#precision"), blocDate = vue.querySelector("#bloc-date");
  const majQuand = () => {
    const v = vue.querySelector("input[name=quand]:checked").value;
    precision.hidden = v === "maintenant"; blocDate.hidden = v !== "autre";
  };
  vue.querySelectorAll("input[name=quand]").forEach((r) => r.addEventListener("change", majQuand));
  majQuand();

  vue.querySelector("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const idDe = de.resoudre(), idVers = vers.resoudre();
    let ok = true;
    if (!idDe) { de.erreur(T.erreurDepart); ok = false; }
    if (!idVers) { vers.erreur(T.erreurArrivee); ok = false; }
    if (idDe && idVers && idDe === idVers) { vers.erreur(T.erreurMemeArret); ok = false; }
    const quand = vue.querySelector("input[name=quand]:checked").value;
    const err = vue.querySelector("#err-quand"); err.textContent = "";
    const p = { de: idDe, vers: idVers, mode: "partir", date: aujourdhui, heure: secondesDuJour() };
    if (quand !== "maintenant") {
      const h = vue.querySelector("#heure").value, d = vue.querySelector("#date").value;
      if (!h) { err.textContent = T.erreurHeure; ok = false; } else p.heure = versSec(h);
      if (quand === "autre") { if (!d) { err.textContent = T.erreurDate; ok = false; } else p.date = d; }
      p.mode = vue.querySelector("input[name=mode]:checked").value;
    }
    if (!ok) { (!idDe ? de : !idVers || idDe === idVers ? vers : de).input.focus(); annoncer("Le formulaire contient des erreurs."); return; }
    memoire.ajouterTrajet(idDe, idVers);
    naviguer(p);
  });

  afficherRecents();
  focaliserTitre();
}

function afficherRecents() {
  const zone = document.getElementById("recents");
  if (!zone) return;
  const trajets = memoire.trajets().filter((t) => data.arrets[t.de] && data.arrets[t.vers]);
  if (!trajets.length) { zone.innerHTML = ""; return; }
  zone.innerHTML = `<h2>${T.trajetsRecents}</h2><ul>${trajets.map((t, i) => `
    <li class="recent">
      <button type="button" class="aller" data-i="${i}">${t.epingle ? `<small>${T.favori}</small>` : ""}${esc(nomArret(t.de))} → ${esc(nomArret(t.vers))}</button>
      <button type="button" class="etoile" data-i="${i}" aria-pressed="${t.epingle}" aria-label="${t.epingle ? T.desepingler : T.epingler}">${ICONES.etoile(t.epingle)}</button>
    </li>`).join("")}</ul>`;
  zone.querySelectorAll(".aller").forEach((b) => b.addEventListener("click", () => {
    const t = trajets[+b.dataset.i];
    memoire.ajouterTrajet(t.de, t.vers);
    naviguer({ de: t.de, vers: t.vers, mode: "partir", date: dateIsoLocale(), heure: secondesDuJour() });
  }));
  zone.querySelectorAll(".etoile").forEach((b) => b.addEventListener("click", () => {
    const t = trajets[+b.dataset.i];
    memoire.basculerFavori(t.de, t.vers);
    afficherRecents();
  }));
}

// ---------------------------------------------------------------- résultats

function resumeRecherche(p, aujourdhui) {
  return `${dateLongue(p.date, aujourdhui)} · ${p.mode === "partir" ? "départ vers" : "arrivée avant"} ${heure(p.heure)}`;
}

function carteTrajet(t, i) {
  const bus = t.etapes.filter((e) => e.type === "bus");
  const premier = bus[0];
  const quaiTxt = (quai) => { const q = data.quais[quai]; return [q.quai, q.precision].filter(Boolean).join(", "); };
  const avecParenthese = (quai) => (quaiTxt(quai) ? ` (${esc(quaiTxt(quai))})` : "");

  let k = 0;
  const frise = t.etapes.map((e) => {
    if (e.type === "marche") return `<li class="marche">${ICONES.marche}<span>${duree(e.secondes)}</span></li>`;
    if (e.type === "bus") { k++; return `<li>${pastille(e.ligne)}</li>`; }
    const b1 = bus[k - 1], b2 = bus[k];
    const court = (id) => data.arrets[id].nom;
    const lieu = b1.arrivee.arret === b2.depart.arret ? `à ${court(b1.arrivee.arret)}` : `vers ${court(b2.depart.arret)}`;
    return `<li class="changement">Changement ${esc(lieu)} · ${duree(e.attenteSec)}</li>`;
  }).join("");

  let n = 0;
  const etapes = t.etapes.map((e) => {
    if (e.type === "marche" && e.vers) return `Marchez ${duree(e.secondes)} jusqu’à l’arrêt ${esc(e.vers)}.`;
    if (e.type === "marche") return `Marchez ${duree(e.secondes)} jusqu’à votre destination.`;
    if (e.type === "bus") {
      return `Prenez la <strong>ligne ${esc(e.ligne)}</strong> à <strong>${heure(e.depart.heure)}</strong>, arrêt ${esc(e.depart.nom)}${avecParenthese(e.depart.quai)}. `
        + `Descendez à <strong>${heure(e.arrivee.heure)}</strong>, arrêt ${esc(e.arrivee.nom)}${avecParenthese(e.arrivee.quai)}, après ${e.nbArrets} ${pluriel(e.nbArrets, "arrêt", "arrêts")}.`;
    }
    const b1 = bus[n++], b2 = bus[n];
    const attenteFin = `Attente de ${duree(e.attenteSec)}.`;
    if (e.memeQuai) return `Changement : restez sur le même quai. ${attenteFin}`;
    if (e.memeArret) return `Changement : même arrêt, changez de quai${quaiTxt(b1.arrivee.quai) && quaiTxt(b2.depart.quai) ? ` (${esc(quaiTxt(b1.arrivee.quai))} → ${esc(quaiTxt(b2.depart.quai))})` : ""}. ${attenteFin}`;
    return `Changement : rejoignez à pied l’arrêt ${esc(e.vers)}. ${attenteFin}`;
  });

  const badges = t.badges.map((b) => `<span class="badge">${T.badges[b]}</span>`).join("");
  const alertes = t.alertes.map(texteAlerte).filter(Boolean);
  const id = `trajet-${i}`;
  const marche = t.marcheTotaleSec ? ` · ${duree(t.marcheTotaleSec)} à pied` : "";
  const changements = t.nbCorrespondances ? `${t.nbCorrespondances} changement` : T.sansChangement.toLowerCase();
  const libelleDepart = t.departDepuisArret ? T.departDeLArret : T.departDeChezVous;
  const aria = `${libelleDepart} à ${heure(t.departMaison)}, arrivée à ${heure(t.arriveeDest)}, ${duree(t.duree)}, ${changements}${marche}.`;

  return `<li class="trajet ${t.depasseLimite ? "hors-limite" : ""}">
    <article aria-label="${esc(aria)}">
      ${badges ? `<div class="badges">${badges}</div>` : ""}
      <div class="heures">
        <div class="bloc"><span class="libelle">${libelleDepart}</span><span class="grand">${heure(t.departMaison)}</span></div>
        <span class="fleche" aria-hidden="true">→</span>
        <div class="bloc"><span class="libelle">${T.arriveeLibelle}</span><span class="grand">${heure(t.arriveeDest)}</span></div>
      </div>
      <p class="sous-ligne">${t.marcheDepartSec > 0 ? `Bus à ${heure(premier.depart.heure)}, arrêt ${esc(premier.depart.nom)}` : `Arrêt : ${esc(premier.depart.nom)}`}</p>
      <p class="meta">${duree(t.duree)} · ${changements}${marche}</p>
      <ul class="frise" aria-hidden="true">${frise}</ul>
      ${alertes.length ? `<ul class="alertes">${alertes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      <button type="button" class="secondaire bascule" aria-expanded="false" aria-controls="${id}">${T.voirDetail}</button>
      <div class="detail" id="${id}" hidden>
        <ol class="etapes">${etapes.map((e) => `<li>${e}</li>`).join("")}</ol>
        <div class="infos"><p>${T.consigneArret}</p><p>${T.ticket}</p><p>${T.consigneVelo}</p></div>
      </div>
    </article></li>`;
}

function limiteTexte(limite, aujourdhui) {
  const h = heure(limite.heureSec);
  if (limite.date === aujourdhui) return `avant ${h} aujourd’hui`;
  return `avant ${dateLongue(limite.date, aujourdhui) === "demain" ? "demain" : jourEnToutesLettres(limite.date)} ${h}`;
}

function carteTad(raison, p, r, aujourdhui, maintenant) {
  const dispo = tadPossible({ date: p.date, heureSec: p.heure, serviceActif: r.statut !== "pas_de_service", maintenant });
  if (!dispo.ok) return "";
  return `<aside class="tad" aria-labelledby="tad-titre">
    <h2 id="tad-titre">${T.tadTitre}</h2>
    <p class="raison">${T.tadRaison[raison]}</p>
    <p>${T.tadTexte}</p>
    <p><strong>À réserver ${limiteTexte(dispo.limite, aujourdhui)}</strong> (au moins 5 heures avant le départ).</p>
    <div class="liens">
      <a class="fort" href="${TAD_LIENS.reservation}" target="_blank" rel="noopener">${T.tadReserver}</a>
      <a class="discret" href="${TAD_LIENS.telephone}">${T.tadAppeler}</a>
    </div>
    <p class="petit">${T.tadZone} <a href="${TAD_LIENS.inscription}" target="_blank" rel="noopener">${T.tadZones}</a></p>
    <p class="petit">${T.tadPremiere}</p>
  </aside>`;
}

function afficherResultats(p) {
  const aujourdhui = dateIsoLocale();
  const maintenant = { date: aujourdhui, sec: secondesDuJour() };
  const prefs = memoire.prefs();
  const r = chercher(data, { origine: accesDepuisArret(data, p.de), destination: accesDepuisArret(data, p.vers),
    date: p.date, heure: p.heure, mode: p.mode, limiteMarcheSec: prefs.marcheMaxSec });

  document.title = `${data.arrets[p.de].nom} → ${data.arrets[p.vers].nom} – Horaires RIV`;
  const entete = `<header class="rappel">
      <h1 id="titre" tabindex="-1">${esc(nomArret(p.de))} → ${esc(nomArret(p.vers))}</h1>
      <p>${resumeRecherche(p, aujourdhui)}</p>
      <div class="boutons">
        <button type="button" class="secondaire" id="modifier">${T.modifier}</button>
        <button type="button" class="secondaire" id="inverser-res">${ICONES.inverser.replace('width="22" height="22"', 'width="18" height="18"')} ${T.inverserCourt}</button>
      </div></header>`;

  let corps = "", message = "";
  const boutonJour = (date, texte) => `<button type="button" class="secondaire pagination" data-jour="${date}">${texte}</button>`;
  const jourSuivant = (date) => prochainJourDeService(data, date);

  if (r.statut === "ok") {
    const deps = r.proposes.map((t) => t.departMaison), arrs = r.proposes.map((t) => t.arriveeDest);
    const plusTot = r.tous.some((t) => t.departMaison < Math.min(...deps));
    const plusTard = r.tous.some((t) => t.departMaison > Math.max(...deps));
    const suivant = jourSuivant(p.date);
    corps += bandeaux(p.date);
    if (plusTot) corps += `<button type="button" class="secondaire pagination" id="plus-tot">${T.trajetPlusTot}</button>`;
    corps += `<ol class="cartes">${r.proposes.map(carteTrajet).join("")}</ol>`;
    if (plusTard) corps += `<button type="button" class="secondaire pagination" id="plus-tard">${T.trajetPlusTard}</button>`;
    else {
      corps += `<p class="note">${T.plusDAutreTrajet}</p>`;
      if (suivant) corps += boutonJour(suivant, T.voirLeJour(dateLongue(suivant, aujourdhui)));
    }
    const raison = r.proposes.some((t) => t.alertes.some((a) => a.code === "marche_longue")) ? "marche_longue"
      : r.proposes.some((t) => t.alertes.some((a) => a.code === "attente_longue")) ? "attente_longue" : null;
    if (raison) corps += carteTad(raison, p, r, aujourdhui, maintenant);
    message = `${r.proposes.length} ${pluriel(r.proposes.length, "trajet proposé", "trajets proposés")}.`;
    r._pagination = { minArr: Math.min(...arrs), maxDep: Math.max(...deps) };
  } else if (r.statut === "pas_de_service") {
    corps += bandeaux(p.date);
    corps += `<p class="bandeau bandeau-alerte" role="status">${esc(texteAbsence(r.raison, aujourdhui, p.date, r.prochainJour))}</p>`;
    if (r.prochainJour) corps += boutonJour(r.prochainJour, T.voirLeJour(dateLongue(r.prochainJour, aujourdhui)));
    message = texteAbsence(r.raison, aujourdhui, p.date, r.prochainJour);
  } else if (r.statut === "aucun_trajet") {
    corps += bandeaux(p.date);
    corps += `<p class="bandeau bandeau-alerte" role="status">${T.aucunTrajet}</p>`;
    corps += carteTad("aucun_bus", p, r, aujourdhui, maintenant);
    if (r.prochainJour) corps += boutonJour(r.prochainJour, T.voirLeJour(dateLongue(r.prochainJour, aujourdhui)));
    message = T.aucunTrajet;
  } else {
    corps += `<p class="bandeau bandeau-alerte" role="status">${T.horsPortee}</p>`;
    message = T.horsPortee;
  }

  vue.innerHTML = entete + corps + `<p class="note">${T.horairesTheoriques}</p>`;

  vue.querySelector("#modifier").addEventListener("click", () => { history.pushState(null, "", location.pathname); afficherAccueil(p); });
  vue.querySelector("#inverser-res").addEventListener("click", () => naviguer({ ...p, de: p.vers, vers: p.de }));
  vue.querySelectorAll("[data-jour]").forEach((b) => b.addEventListener("click", () =>
    naviguer({ ...p, date: b.dataset.jour, heure: p.mode === "partir" ? p.heure : 6 * 3600, mode: "partir" })));
  vue.querySelector("#plus-tard")?.addEventListener("click", () => naviguer({ ...p, mode: "partir", heure: r._pagination.maxDep + 60 }));
  vue.querySelector("#plus-tot")?.addEventListener("click", () => naviguer({ ...p, mode: "arriver", heure: r._pagination.minArr - 60 }));
  vue.querySelectorAll(".bascule").forEach((b) => b.addEventListener("click", () => {
    const d = document.getElementById(b.getAttribute("aria-controls"));
    const ouvert = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!ouvert)); d.hidden = ouvert; b.textContent = ouvert ? T.voirDetail : T.masquerDetail;
  }));
  annoncer(message);
  window.scrollTo(0, 0);
  focaliserTitre();
}

// ---------------------------------------------------------------- préférences

function installerPreferences() {
  const dlg = document.getElementById("prefs");
  document.getElementById("prefs-titre").textContent = T.prefsTitre;
  document.getElementById("prefs-legende").textContent = T.prefsMarche;
  document.getElementById("prefs-aide").textContent = T.prefsExplication;
  document.getElementById("prefs-reinit").textContent = T.prefsReinit;
  document.getElementById("prefs-fermer").textContent = T.fermer;
  const choix = document.getElementById("prefs-choix");
  const dessiner = () => {
    const cour = memoire.prefs().marcheMaxSec;
    choix.innerHTML = CHOIX_MARCHE_SEC.map((s) => `<label><input type="radio" name="marche" value="${s}" ${s === cour ? "checked" : ""}><span>${s / 60} min</span></label>`).join("");
  };
  choix.addEventListener("change", (e) => { memoire.changerMarche(+e.target.value); });
  document.getElementById("prefs-reinit").addEventListener("click", () => { memoire.reinitialiserPrefs(); dessiner(); });
  dlg.addEventListener("close", () => { if (parametresDepuisUrl()) router(); }); // recalcule les résultats avec la nouvelle limite
  document.getElementById("ouvrir-prefs").addEventListener("click", () => { dessiner(); dlg.showModal(); });
}

// ---------------------------------------------------------------- démarrage

function router() {
  try {
    const p = parametresDepuisUrl();
    if (p) afficherResultats(p); else afficherAccueil();
  } catch (e) {
    console.error(e);
    vue.innerHTML = `<p class="bandeau bandeau-alerte">${T.erreurChargement}</p>`;
  }
}

async function init() {
  document.getElementById("ouvrir-prefs").textContent = T.prefs;
  document.getElementById("lien-tad").textContent = T.tad;
  document.getElementById("pied-texte").textContent = T.piedDePage;
  vue.innerHTML = `<p class="chargement" role="status">${T.chargement}</p>`;
  try {
    const [d, a] = await Promise.all([
      fetch("riv.json").then((r) => { if (!r.ok) throw new Error("riv.json"); return r.json(); }),
      fetch("annonce.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    data = preparer(d); annonce = a; index = construireIndex(data);
  } catch (e) {
    console.error(e);
    vue.innerHTML = `<p class="bandeau bandeau-alerte">${T.erreurChargement}</p>`;
    return;
  }
  installerPreferences();
  window.addEventListener("popstate", router);
  router();
}
init();
