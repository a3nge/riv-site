// Lancer :  node engine.test.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  preparer, chercher, accesDepuisArret, accesDepuisPoint, versSecondes as t, hhmm,
  coursesDuJour, absenceDeService, CONFIG,
} from "./engine.js";

const data = preparer(JSON.parse(readFileSync(new URL("./riv.json", import.meta.url))));
const arret = (id) => accesDepuisArret(data, id);
let ok = 0;
const test = (nom, f) => { try { f(); ok++; console.log("  ✓", nom); } catch (e) { console.error("  ✗", nom, "\n   ", e.message); process.exitCode = 1; } };

const MARDI = "2026-11-17";

// ---------- recoupement avec le feuillet horaire (pages 15 à 23)
function premier(res) { assert.equal(res.statut, "ok"); return res.proposes[0]; }
function bus(tr, i = 0) { return tr.etapes.filter((e) => e.type === "bus")[i]; }

console.log("Recoupement avec le feuillet");
test("Ligne 1 : Réhumpol 07:41 -> Mauron rond-point du stade 08:18", () => {
  const r = chercher(data, { origine: arret("ploermel-gare-routiere-de-rehumpol"), destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("07:30") });
  const b = bus(premier(r));
  assert.equal(hhmm(b.depart.heure), "07:41"); assert.equal(hhmm(b.arrivee.heure), "08:18");
});
test("Ligne 1 : Mauron mairie 07:36 -> Réhumpol 08:14 (le bus arrive à 07:34 et repart à 07:36)", () => {
  const r = chercher(data, { origine: arret("mauron-mairie-restaurant-scolaire"), destination: arret("ploermel-gare-routiere-de-rehumpol"), date: MARDI, heure: t("07:30") });
  const b = bus(premier(r));
  assert.equal(hhmm(b.depart.heure), "07:36"); assert.equal(hhmm(b.arrivee.heure), "08:14");
});
test("Ligne 2 : Réhumpol 10:22 -> Mauron rond-point du stade 11:05", () => {
  const r = chercher(data, { origine: arret("ploermel-gare-routiere-de-rehumpol"), destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("10:00") });
  const tous = r.tous.map((x) => bus(x)).filter((b) => b.ligne === "2");
  assert.ok(tous.some((b) => hhmm(b.depart.heure) === "10:22" && hhmm(b.arrivee.heure) === "11:05"));
});
test("Ligne 3 : Réhumpol 08:30 -> Campénéac mairie 08:42", () => {
  const r = chercher(data, { origine: arret("ploermel-gare-routiere-de-rehumpol"), destination: arret("campeneac-mairie"), date: MARDI, heure: t("08:00") });
  const b = bus(premier(r));
  assert.equal(hhmm(b.depart.heure), "08:30"); assert.equal(hhmm(b.arrivee.heure), "08:42");
});
test("Ligne 4 : Réhumpol 09:07 -> Josselin PEM Saint-Jacques 09:54", () => {
  const r = chercher(data, { origine: arret("ploermel-gare-routiere-de-rehumpol"), destination: arret("josselin-pem-saint-jacques"), date: MARDI, heure: t("09:00") });
  const b = r.tous.map((x) => bus(x)).find((b) => b.ligne === "4" && hhmm(b.depart.heure) === "09:07");
  assert.ok(b); assert.equal(hhmm(b.arrivee.heure), "09:54");
});
test("Ligne 5 : Réhumpol 07:26 -> Josselin PEM Saint-Jacques 07:53", () => {
  const r = chercher(data, { origine: arret("ploermel-gare-routiere-de-rehumpol"), destination: arret("josselin-pem-saint-jacques"), date: MARDI, heure: t("07:00") });
  const b = bus(premier(r));
  assert.equal(b.ligne, "5"); assert.equal(hhmm(b.depart.heure), "07:26"); assert.equal(hhmm(b.arrivee.heure), "07:53");
});

console.log("Mode « arriver à »");
test("Arriver à Mauron (stade) avant 09:00 : dernier départ utile 07:41", () => {
  const r = chercher(data, { origine: arret("ploermel-gare-routiere-de-rehumpol"), destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("09:00"), mode: "arriver" });
  assert.equal(r.statut, "ok");
  const dernier = r.apres[r.apres.length - 1];
  assert.equal(hhmm(dernier.departMaison), "07:41"); assert.ok(dernier.arriveeDest <= t("09:00"));
});

console.log("Calendrier");
test("Dimanche : pas de service, prochain jour = lundi", () => {
  const r = chercher(data, { origine: arret("ploermel-centre"), destination: arret("mauron-rond-point-du-stade"), date: "2026-11-22", heure: t("08:00") });
  assert.equal(r.statut, "pas_de_service"); assert.equal(r.raison, "dimanche"); assert.equal(r.prochainJour, "2026-11-23");
});
test("Jours fériés : pas de service", () => {
  for (const d of ["2026-12-25", "2027-01-01", "2027-03-29", "2027-05-06", "2027-07-14"]) {
    assert.equal(absenceDeService(data, d), "jour_ferie", d);
  }
});
test("Hors période de validité", () => {
  assert.equal(absenceDeService(data, "2027-09-02"), "hors_periode");
});
test("Après le dernier bus : propose le jour suivant", () => {
  const r = chercher(data, { origine: arret("ploermel-gare-routiere-de-rehumpol"), destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("21:00") });
  assert.equal(r.statut, "aucun_trajet"); assert.equal(r.jourSuivant.date, "2026-11-18"); assert.ok(r.jourSuivant.proposes.length);
});

console.log("Marche");
test("Adresse à ~400 m d'un arrêt : marche estimée entre 6 et 10 min", () => {
  const q = data.quais["RIV:56800019A"]; // Loyat mairie
  const acces = accesDepuisPoint(data, q.lat + 0.0036, q.lon);
  const a = acces.find((x) => x.arret === "loyat-mairie");
  assert.ok(a.marcheSec >= 360 && a.marcheSec <= 600, "marche " + a.marcheSec);
});
test("Départ de chez soi = heure du bus moins la marche", () => {
  const q = data.quais["RIV:56800019A"];
  const o = accesDepuisPoint(data, q.lat + 0.0036, q.lon);
  const r = chercher(data, { origine: o, destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("07:00") });
  const tr = r.proposes[0]; const b = bus(tr);
  assert.ok(tr.departMaison <= b.depart.heure - tr.marcheDepartSec + 59);
  assert.ok(tr.departMaison > b.depart.heure - tr.marcheDepartSec - 60);
  assert.equal(tr.departDepuisArret, false);
});
test("Marche au-delà du plafond : arrêt écarté", () => {
  assert.equal(accesDepuisPoint(data, 48.30, -2.10).length, 0);
  const r = chercher(data, { origine: accesDepuisPoint(data, 48.30, -2.10), destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("08:00") });
  assert.equal(r.statut, "hors_portee");
});
test("Limite de marche dépassée : le trajet reste affiché avec une alerte", () => {
  const q = data.quais["RIV:56800019A"];
  const o = accesDepuisPoint(data, q.lat + 0.0072, q.lon); // ~800 m
  const r = chercher(data, { origine: o, destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("07:00"), limiteMarcheSec: 300 });
  assert.equal(r.statut, "ok");
  assert.ok(r.proposes[0].alertes.some((a) => a.code === "marche_longue"));
});

console.log("Correspondances");
test("Guilliers -> Josselin : un changement à Ploërmel, avec attente >= 5 min", () => {
  const r = chercher(data, { origine: arret("guilliers-mairie-place-des-anciens-combattants"), destination: arret("josselin-pem-saint-jacques"), date: MARDI, heure: t("07:00") });
  assert.equal(r.statut, "ok");
  for (const tr of r.tous) { assert.equal(tr.nbCorrespondances, 1); assert.ok(tr.attenteSec >= CONFIG.correspondanceMinSec); }
});
test("Aucun trajet ne propose de changer pour la même ligne", () => {
  const r = chercher(data, { origine: arret("taupont-mairie"), destination: arret("josselin-la-belle-alouette"), date: MARDI, heure: t("06:00") });
  for (const tr of r.tous) { const l = tr.etapes.filter((e) => e.type === "bus").map((e) => e.ligne); assert.equal(new Set(l).size, l.length); }
});
test("Correspondance courte : alerte", () => {
  let vu = false;
  for (const [a, b] of [["ploermel-gare-routiere-de-rehumpol", "josselin-pem-saint-jacques"], ["campeneac-mairie", "josselin-pem-saint-jacques"], ["campeneac-mairie", "mauron-mairie-restaurant-scolaire"], ["taupont-mairie", "val-d-oust-quily-eglise"]]) {
    const r = chercher(data, { origine: arret(a), destination: arret(b), date: MARDI, heure: t("05:00") });
    if (r.tous) for (const tr of r.tous) if (tr.alertes.some((x) => x.code === "correspondance_courte")) vu = true;
  }
  console.log("     (alerte « correspondance courte » rencontrée :", vu, ")");
});

console.log("Propriétés sur tous les couples d'arrêts (vérification indépendante)");
test("Chaque trajet est valide : horaires croissants, course active, ordre des arrêts, changement >= 5 min", () => {
  const ids = Object.keys(data.arrets);
  const parId = Object.fromEntries(data.courses.map((c) => [c.id, c]));
  const actives = new Set(coursesDuJour(data, MARDI).map((c) => c.id));
  let n = 0, couples = 0, sans = 0;
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    couples++;
    const r = chercher(data, { origine: arret(a), destination: arret(b), date: MARDI, heure: 0 });
    if (r.statut !== "ok") { sans++; continue; }
    for (const tr of r.tous) {
      n++;
      let prev = -1;
      const buses = tr.etapes.filter((e) => e.type === "bus");
      assert.ok(buses.length >= 1 && buses.length <= 2);
      buses.forEach((e, idx) => {
        const c = parId[e.course]; assert.ok(actives.has(c.id), "course inactive");
        const ia = c.arrets.findIndex((s) => s[0] === e.depart.quai), ib = c.arrets.findIndex((s) => s[0] === e.arrivee.quai);
        assert.ok(ia >= 0 && ib > ia, "ordre des arrêts");
        assert.equal(c.arrets[ia][2], e.depart.heure); assert.equal(c.arrets[ib][1], e.arrivee.heure);
        assert.ok(e.depart.heure >= prev, "temps qui recule"); prev = e.arrivee.heure;
        if (idx === 1) assert.ok(e.depart.heure - buses[0].arrivee.heure >= CONFIG.correspondanceMinSec, "changement trop court");
      });
      assert.ok(tr.arriveeDest >= tr.departMaison);
      assert.equal(buses[0].depart.arret, a); assert.equal(buses.at(-1).arrivee.arret, b);
    }
  }
  console.log(`     ${couples} couples d'arrêts, ${couples - sans} avec trajet, ${n} trajets vérifiés`);
});

console.log("Qualité de l'affichage");
test("Pas de doublon : deux trajets proposés n'ont jamais les mêmes courses", () => {
  for (const [a, b, h] of [["guilliers-mairie-place-des-anciens-combattants", "josselin-pem-saint-jacques", "07:00"],
                           ["taupont-mairie", "val-d-oust-la-chapelle-caro-mairie", "11:30"],
                           ["mauron-rond-point-du-stade", "ploermel-centre", "06:00"]]) {
    const r = chercher(data, { origine: arret(a), destination: arret(b), date: MARDI, heure: t(h) });
    const cles = r.proposes.map((tr) => tr.etapes.filter((e) => e.type === "bus").map((e) => e.course).join(">"));
    assert.equal(new Set(cles).size, cles.length, a + " -> " + b + " : " + cles.join(" | "));
  }
});
test("Aucun badge quand les trajets proposés sont égaux", () => {
  const q = data.quais["RIV:56800019A"];
  const r = chercher(data, { origine: accesDepuisPoint(data, q.lat + 0.0072, q.lon), destination: arret("mauron-rond-point-du-stade"), date: MARDI, heure: t("07:00") });
  for (const tr of r.proposes) assert.deepEqual(tr.badges, []);
});
test("Au changement, on privilégie le même arrêt (Taupont -> La Chapelle-Caro)", () => {
  const r = chercher(data, { origine: arret("taupont-mairie"), destination: arret("val-d-oust-la-chapelle-caro-mairie"), date: MARDI, heure: t("11:30") });
  const c = r.proposes[0].etapes.find((e) => e.type === "correspondance");
  assert.equal(c.de, c.vers);
});

console.log(`\n${ok} tests réussis`);
