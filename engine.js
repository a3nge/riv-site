// Moteur de calcul d'itinéraires RIV.
// Aucune dépendance. Fonctionne dans le navigateur et sous Node.
// Il ne produit que des données (codes d'alerte, secondes) : les textes
// affichés à l'usager sont rédigés dans l'interface, à un seul endroit.

export const CONFIG = {
  vitesseMarcheKmh: 4,          // vitesse de marche prudente
  detour: 1.3,                  // coefficient appliqué à la distance en ligne droite
  margeArretSec: 0,             // marge ajoutée avant le bus (le feuillet conseille 5 min d'avance)
  correspondanceMinSec: 300,    // temps minimal pour changer de bus
  correspondanceCourteSec: 480, // en dessous : alerte « correspondance courte »
  attenteLongueSec: 3600,       // au-dessus : alerte « longue attente »
  plafondMarcheSec: 2400,       // au-delà de 40 min à pied : arrêt non utilisable
  limiteMarcheSec: 900,         // préférence par défaut (réglable : 5, 10, 15, 20 min)
  nbArretsProches: 6,           // arrêts testés autour d'une adresse
  fenetreSec: 3 * 3600,         // les alternatives sont cherchées dans les 3 h
  nbAlternatives: 3,
};

// ---------------------------------------------------------------- utilitaires

export function hhmm(sec) {
  const m = Math.round(sec / 60);
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

export function versSecondes(texte) { // "07:41" -> 27660
  const [h, m] = texte.split(":").map(Number);
  return h * 3600 + m * 60;
}

export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function margeMarcheSec(distance, cfg = CONFIG) {
  return Math.ceil((distance * cfg.detour) / (cfg.vitesseMarcheKmh / 3.6));
}

function jourSemaine(dateStr) { // 0 = dimanche
  const [a, m, j] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay();
}

export function ajouterJours(dateStr, n) {
  const [a, m, j] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- données

export function preparer(json) {
  const data = { ...json };
  data.joursParService = {};
  for (const [id, dates] of Object.entries(json.services)) data.joursParService[id] = new Set(dates);
  data.liens = new Map(); // quai -> quais accessibles à pied pour un changement
  for (const [a, b] of json.transferts) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!data.liens.has(x)) data.liens.set(x, new Set());
      data.liens.get(x).add(y);
    }
  }
  return data;
}

export function coursesDuJour(data, date) {
  return data.courses.filter((c) => data.joursParService[c.service]?.has(date));
}

// Raison pour laquelle il n'y a pas de service à cette date (ou null s'il y en a).
export function absenceDeService(data, date) {
  if (coursesDuJour(data, date).length) return null;
  if (date < data.valide_du || date > data.valide_au) return "hors_periode";
  if (jourSemaine(date) === 0) return "dimanche";
  return "jour_ferie";
}

export function prochainJourDeService(data, date) {
  for (let i = 1; i <= 400; i++) {
    const d = ajouterJours(date, i);
    if (d > data.valide_au) return null;
    if (coursesDuJour(data, d).length) return d;
  }
  return null;
}

// ---------------------------------------------------------------- points d'accès

// Départ ou arrivée exactement à un arrêt : marche nulle.
export function accesDepuisArret(data, arretId) {
  const a = data.arrets[arretId];
  if (!a) throw new Error("Arrêt inconnu : " + arretId);
  return a.quais.map((quai) => ({ quai, arret: arretId, marcheSec: 0, distance: 0 }));
}

// Départ ou arrivée à une adresse quelconque : arrêts les plus proches (estimation en ligne droite).
export function accesDepuisPoint(data, lat, lon, cfg = CONFIG) {
  const parArret = new Map();
  for (const [quai, q] of Object.entries(data.quais)) {
    const d = distanceM(lat, lon, q.lat, q.lon);
    const cur = parArret.get(q.arret);
    if (!cur || d < cur.d) parArret.set(q.arret, { d });
    const e = parArret.get(q.arret);
    (e.quais ||= []).push({ quai, d });
  }
  const proches = [...parArret.entries()]
    .sort((a, b) => a[1].d - b[1].d)
    .slice(0, cfg.nbArretsProches);
  const acces = [];
  for (const [arret, e] of proches) {
    for (const { quai, d } of e.quais) {
      const marcheSec = margeMarcheSec(d, cfg);
      if (marcheSec <= cfg.plafondMarcheSec) acces.push({ quai, arret, marcheSec, distance: Math.round(d) });
    }
  }
  return acces;
}

// ---------------------------------------------------------------- calcul

function tempsChangement(data, x, y, cfg) {
  if (x === y) return cfg.correspondanceMinSec;
  const qx = data.quais[x], qy = data.quais[y];
  const marche = margeMarcheSec(distanceM(qx.lat, qx.lon, qy.lat, qy.lon), cfg);
  return Math.max(cfg.correspondanceMinSec, marche);
}

function partiesDe(c, quai) { // positions d'un quai dans une course
  const out = [];
  c.arrets.forEach((a, i) => { if (a[0] === quai) out.push(i); });
  return out;
}

function etapeBus(data, c, i, j) {
  const q = (k) => data.quais[c.arrets[k][0]];
  return {
    type: "bus", ligne: c.ligne, course: c.id, sens: c.sens,
    depart: { quai: c.arrets[i][0], arret: q(i).arret, nom: data.arrets[q(i).arret].complet, heure: c.arrets[i][2] },
    arrivee: { quai: c.arrets[j][0], arret: q(j).arret, nom: data.arrets[q(j).arret].complet, heure: c.arrets[j][1] },
    nbArrets: j - i,
    arretsTraverses: c.arrets.slice(i, j + 1).map((a) => data.quais[a[0]].arret),
  };
}

function construire(data, o, d, bus1, bus2, cfg) {
  const etapes = [];
  const dep = bus1.depart.heure, arr = (bus2 || bus1).arrivee.heure;
  if (o.marcheSec > 0) etapes.push({ type: "marche", secondes: o.marcheSec, vers: bus1.depart.nom, distance: o.distance });
  etapes.push(bus1);
  let attente = 0;
  if (bus2) {
    attente = bus2.depart.heure - bus1.arrivee.heure;
    etapes.push({
      type: "correspondance", attenteSec: attente,
      de: bus1.arrivee.nom, vers: bus2.depart.nom,
      memeQuai: bus1.arrivee.quai === bus2.depart.quai,
      memeArret: bus1.arrivee.arret === bus2.depart.arret,
    });
    etapes.push(bus2);
  }
  if (d.marcheSec > 0) etapes.push({ type: "marche", secondes: d.marcheSec, depuis: (bus2 || bus1).arrivee.nom, distance: d.distance });

  const departMaison = Math.floor((dep - o.marcheSec - cfg.margeArretSec) / 60) * 60;
  const arriveeDest = Math.ceil((arr + d.marcheSec) / 60) * 60;
  return {
    departMaison, arriveeDest, duree: arriveeDest - departMaison,
    marcheDepartSec: o.marcheSec, marcheArriveeSec: d.marcheSec,
    marcheTotaleSec: o.marcheSec + d.marcheSec,
    nbCorrespondances: bus2 ? 1 : 0, attenteSec: attente,
    departDepuisArret: o.marcheSec === 0, etapes, badges: [], alertes: [],
    memeArretChangement: bus2 ? bus1.arrivee.arret === bus2.depart.arret : null,
    // Même chaîne de courses, même quai de montée et de descente finale : un seul trajet, quel que soit le point de changement.
    cle: [bus1.course, bus1.depart.quai, bus2?.course, (bus2 || bus1).arrivee.quai].join("|"),
  };
}

function enumerer(data, courses, origine, destination, cfg) {
  const resultats = new Map();
  // Un même trajet pouvant se faire via plusieurs points de changement : on garde celui qui demande le moins de
  // marche, puis un changement dans le même arrêt, puis la plus courte attente.
  const meilleur = (t, e) => {
    if (t.marcheTotaleSec !== e.marcheTotaleSec) return t.marcheTotaleSec < e.marcheTotaleSec;
    if (t.memeArretChangement !== e.memeArretChangement) return t.memeArretChangement === true;
    return t.attenteSec < e.attenteSec;
  };
  const garder = (t) => {
    const e = resultats.get(t.cle);
    if (!e || meilleur(t, e)) resultats.set(t.cle, t);
  };
  for (const o of origine) {
    for (const c1 of courses) {
      for (const i of partiesDe(c1, o.quai)) {
        // trajet direct
        for (const d of destination) {
          for (const j of partiesDe(c1, d.quai)) {
            if (j > i) garder(construire(data, o, d, etapeBus(data, c1, i, j), null, cfg));
          }
        }
        // un changement
        for (let k = i + 1; k < c1.arrets.length; k++) {
          const x = c1.arrets[k][0];
          const options = [x, ...(data.liens.get(x) || [])];
          const traverses = new Set(c1.arrets.slice(i, k + 1).map((a) => data.quais[a[0]].arret));
          for (const y of options) {
            const tc = tempsChangement(data, x, y, cfg);
            for (const c2 of courses) {
              if (c2.id === c1.id || c2.ligne === c1.ligne) continue;
              for (const m of partiesDe(c2, y)) {
                if (c2.arrets[m][2] < c1.arrets[k][1] + tc) continue;
                for (const d of destination) {
                  if (traverses.has(d.arret)) continue; // on serait déjà passé devant en restant dans le bus
                  for (const n of partiesDe(c2, d.quai)) {
                    if (n > m) garder(construire(data, o, d, etapeBus(data, c1, i, k), etapeBus(data, c2, m, n), cfg));
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return [...resultats.values()];
}

function domine(b, a) { // b est-il au moins aussi bon que a sur tout, et meilleur sur un point ?
  const ge = b.departMaison >= a.departMaison && b.arriveeDest <= a.arriveeDest &&
    b.marcheTotaleSec <= a.marcheTotaleSec && b.nbCorrespondances <= a.nbCorrespondances;
  const gt = b.departMaison > a.departMaison || b.arriveeDest < a.arriveeDest ||
    b.marcheTotaleSec < a.marcheTotaleSec || b.nbCorrespondances < a.nbCorrespondances;
  return ge && gt;
}

function pareto(liste) {
  return liste.filter((a) => !liste.some((b) => b !== a && domine(b, a)));
}

function annoter(t, cfg, limite) {
  for (const [cle, sec] of [["depart", t.marcheDepartSec], ["arrivee", t.marcheArriveeSec]]) {
    if (sec > limite) t.alertes.push({ code: "marche_longue", extremite: cle, marcheSec: sec, limiteSec: limite });
  }
  if (t.nbCorrespondances) {
    if (t.attenteSec < cfg.correspondanceCourteSec) t.alertes.push({ code: "correspondance_courte", attenteSec: t.attenteSec });
    if (t.attenteSec > cfg.attenteLongueSec) t.alertes.push({ code: "attente_longue", attenteSec: t.attenteSec });
  }
  t.depasseLimite = t.alertes.some((a) => a.code === "marche_longue");
  return t;
}

function choisir(fenetre, mode, cfg) {
  const rang = (a, b) => (a.depasseLimite - b.depasseLimite) ||
    (mode === "arriver" ? b.departMaison - a.departMaison : a.arriveeDest - b.arriveeDest) ||
    (a.marcheTotaleSec - b.marcheTotaleSec) || (a.nbCorrespondances - b.nbCorrespondances);
  const tri = [...fenetre].sort(rang);
  const choisis = [];
  const ajouter = (t, badge) => {
    if (!t) return;
    if (!choisis.includes(t)) choisis.push(t);
    if (badge && !t.badges.includes(badge)) t.badges.push(badge);
  };
  const min = (liste, f) => liste.reduce((m, t) => (m === null || f(t) < f(m) ? t : m), null);
  ajouter(tri[0], null);
  ajouter(min(tri, (t) => t.duree), "plus_rapide");
  ajouter(min(tri, (t) => t.marcheTotaleSec), "moins_de_marche");
  ajouter(min(tri, (t) => t.nbCorrespondances * 1e6 + Math.abs(t.attenteSec - 900)), "plus_simple");
  // si les badges ont désigné moins de trajets que prévu, on complète avec les suivants
  for (const t of tri) { if (choisis.length >= cfg.nbAlternatives) break; ajouter(t, null); }
  const final = choisis.slice(0, cfg.nbAlternatives).sort((a, b) => a.departMaison - b.departMaison);
  // Un badge n'a de sens que s'il distingue : on le recalcule sur les trajets réellement proposés
  // et on n'en met aucun quand tous les trajets sont égaux sur ce critère.
  for (const t of final) t.badges = [];
  for (const [badge, f] of [["plus_rapide", (t) => t.duree], ["moins_de_marche", (t) => t.marcheTotaleSec],
                            ["plus_simple", (t) => t.nbCorrespondances * 1e6 + Math.abs(t.attenteSec - 900)]]) {
    const valeurs = final.map(f);
    if (new Set(valeurs).size < 2) continue;
    const m = Math.min(...valeurs);
    final.filter((t) => f(t) === m).forEach((t) => t.badges.push(badge));
  }
  return final;
}

/**
 * requete = {
 *   origine:     [{quai, marcheSec, distance}],   // accesDepuisArret / accesDepuisPoint
 *   destination: [{quai, marcheSec, distance}],
 *   date: "YYYY-MM-DD", heure: secondes depuis minuit,
 *   mode: "partir" | "arriver",
 *   limiteMarcheSec: (optionnel)
 * }
 */
export function chercher(data, requete, options = {}) {
  const cfg = { ...CONFIG, ...options };
  const { origine, destination, date, heure, mode = "partir" } = requete;
  const limite = requete.limiteMarcheSec ?? cfg.limiteMarcheSec;

  if (!origine.length || !destination.length) return { statut: "hors_portee", origineVide: !origine.length, destinationVide: !destination.length };
  const arrets = (l) => new Set(l.map((a) => a.arret ?? data.quais[a.quai].arret));
  const ao = arrets(origine), ad = arrets(destination);
  if ([...ao].some((a) => ad.has(a)) && origine.some((o) => o.marcheSec === 0) && destination.some((d) => d.marcheSec === 0)) {
    const meme = origine.find((o) => destination.some((d) => d.arret === o.arret && o.marcheSec === 0 && d.marcheSec === 0));
    if (meme) return { statut: "meme_endroit" };
  }

  const absence = absenceDeService(data, date);
  if (absence) return { statut: "pas_de_service", raison: absence, prochainJour: prochainJourDeService(data, date) };

  const courses = coursesDuJour(data, date);
  const tous = pareto(enumerer(data, courses, origine, destination, cfg))
    .map((t) => annoter(t, cfg, limite))
    .sort((a, b) => a.departMaison - b.departMaison);

  const apres = mode === "partir" ? tous.filter((t) => t.departMaison >= heure) : tous.filter((t) => t.arriveeDest <= heure);
  const avant = mode === "partir" ? tous.filter((t) => t.departMaison < heure) : tous.filter((t) => t.arriveeDest > heure);

  if (!apres.length) {
    const suivant = prochainJourDeService(data, date);
    const jourSuivant = suivant && mode === "partir"
      ? chercher(data, { ...requete, date: suivant, heure: 0 }, options) : null;
    return { statut: "aucun_trajet", mode, date, trajetsAvant: avant, jourSuivant: jourSuivant?.statut === "ok" ? { date: suivant, ...jourSuivant } : null, prochainJour: suivant };
  }
  const fenetre = (mode === "partir"
    ? apres.filter((t) => t.departMaison <= heure + cfg.fenetreSec)
    : apres.filter((t) => t.arriveeDest >= heure - cfg.fenetreSec));
  const base = fenetre.length ? fenetre : apres.slice(0, cfg.nbAlternatives);
  const proposes = choisir(base, mode, cfg);
  return { statut: "ok", mode, date, heure, limiteMarcheSec: limite, proposes, tous, apres, avant };
}
