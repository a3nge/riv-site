// Lancer :  node interface.test.mjs
// Teste les modules « sans écran » : textes, recherche d'arrêts, règles du transport à la demande, mémoire.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { heure, duree, dateLongue, jourEnToutesLettres, texteAlerte, texteAbsence } from "./textes.js";
import { construireIndex, rechercher, principaux, PRINCIPAUX, normaliser } from "./lieux.js";
import { limiteReservation, tadPossible } from "./tad.js";
import { creerMemoire } from "./memoire.js";

const sp = (s) => s.replace(/\u00a0/g, " ");
const data = JSON.parse(readFileSync(new URL("./riv.json", import.meta.url)));
let ok = 0;
const test = (nom, f) => { try { f(); ok++; console.log("  ✓", nom); } catch (e) { console.error("  ✗", nom, "\n   ", e.message); process.exitCode = 1; } };

console.log("Textes");
test("Heures", () => { assert.equal(heure(27720), "7h42"); assert.equal(heure(43500), "12h05"); assert.equal(heure(0), "0h00"); });
test("Durées", () => { assert.equal(sp(duree(2940)), "49 min"); assert.equal(sp(duree(5340)), "1 h 29"); assert.equal(sp(duree(7200)), "2 h"); });
test("Dates", () => {
  assert.equal(dateLongue("2026-11-18", "2026-11-18"), "aujourd’hui");
  assert.equal(dateLongue("2026-11-19", "2026-11-18"), "demain");
  assert.equal(dateLongue("2026-11-23", "2026-11-18"), "lundi 23 novembre");
  assert.equal(dateLongue("2027-01-04", "2026-11-18"), "lundi 4 janvier 2027");
  assert.equal(jourEnToutesLettres("2026-11-21"), "samedi 21 novembre");
});
test("Alertes et absences", () => {
  assert.match(sp(texteAlerte({ code: "marche_longue", extremite: "depart", marcheSec: 840, limiteSec: 300 })), /Marche de 14 min au départ \(votre limite : 5 min\)/);
  assert.match(sp(texteAlerte({ code: "correspondance_courte", attenteSec: 360 })), /6 min/);
  assert.equal(texteAbsence("dimanche", "2026-11-22", "2026-11-22", "2026-11-23"), "Pas de bus le dimanche. Prochain service : demain.");
  assert.match(texteAbsence("jour_ferie", "2026-11-18", "2026-12-25", "2026-12-26"), /jour férié.*samedi 26 décembre/);
});

console.log("Recherche d'arrêts");
const index = construireIndex(data);
const ids = (t) => rechercher(index, t).map((x) => x.id);
test("Accents et casse ignorés", () => { assert.equal(normaliser("  TRÉGADORET "), "tregadoret"); assert.equal(ids("tregadoret")[0], "loyat-tregadoret"); });
test("Commune + nom", () => { assert.equal(ids("mairie loyat")[0], "loyat-mairie"); assert.equal(ids("loyat mairie")[0], "loyat-mairie"); });
test("Nom de commune seul : ses arrêts", () => { const r = ids("josselin"); assert.ok(r.length >= 4 && r.every((i) => i.startsWith("josselin"))); });
test("Orthographe de la rue de Châteaubriant", () => assert.equal(ids("chateaubriant")[0], "ploermel-rue-de-chateaubriant"));
test("« Mairie » propose toutes les communes", () => assert.ok(new Set(rechercher(index, "mairie", 20).map((x) => x.commune)).size >= 5));
test("Rien ne correspond", () => assert.deepEqual(ids("zzzz"), []));
test("Les lieux principaux existent tous", () => assert.equal(principaux(index).length, PRINCIPAUX.length));

console.log("Transport à la demande");
test("Lundi 9h : réserver avant samedi 13h (exemple du feuillet)", () => assert.deepEqual(limiteReservation("2026-11-23", 9 * 3600), { date: "2026-11-21", heureSec: 13 * 3600 }));
test("Mardi 8h : avant lundi 17h", () => assert.deepEqual(limiteReservation("2026-11-24", 8 * 3600), { date: "2026-11-23", heureSec: 17 * 3600 }));
test("Mercredi 14h : avant mercredi 9h", () => assert.deepEqual(limiteReservation("2026-11-25", 14 * 3600), { date: "2026-11-25", heureSec: 9 * 3600 }));
test("Mercredi 16h : avant mercredi 11h", () => assert.deepEqual(limiteReservation("2026-11-25", 16 * 3600), { date: "2026-11-25", heureSec: 11 * 3600 }));
test("Samedi 10h : avant vendredi 17h", () => assert.deepEqual(limiteReservation("2026-11-28", 10 * 3600), { date: "2026-11-27", heureSec: 17 * 3600 }));
test("Lundi 18h : avant lundi 13h", () => assert.deepEqual(limiteReservation("2026-11-23", 18 * 3600), { date: "2026-11-23", heureSec: 13 * 3600 }));
test("Refus : dimanche / férié, hors horaires, trop tard", () => {
  assert.equal(tadPossible({ date: "2026-11-22", heureSec: 36000, serviceActif: false }).raison, "jour_sans_service");
  assert.equal(tadPossible({ date: "2026-11-24", heureSec: 6 * 3600, serviceActif: true }).raison, "hors_horaires");
  assert.equal(tadPossible({ date: "2026-11-24", heureSec: 19 * 3600, serviceActif: true }).raison, "hors_horaires");
  assert.equal(tadPossible({ date: "2026-11-24", heureSec: 10 * 3600, serviceActif: true, maintenant: { date: "2026-11-24", sec: 9 * 3600 } }).raison, "trop_tard");
});
test("Accepté si le délai est tenu", () => {
  const r = tadPossible({ date: "2026-11-24", heureSec: 14 * 3600, serviceActif: true, maintenant: { date: "2026-11-23", sec: 10 * 3600 } });
  assert.ok(r.ok); assert.deepEqual(r.limite, { date: "2026-11-24", heureSec: 9 * 3600 });
});

console.log("Mémoire sur l'appareil");
const faux = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
test("Valeurs par défaut", () => { const m = creerMemoire(faux()); assert.equal(m.prefs().marcheMaxSec, 900); assert.deepEqual(m.trajets(), []); });
test("Réglage de marche conservé, valeur invalide refusée, réinitialisation", () => {
  const m = creerMemoire(faux());
  m.changerMarche(300); assert.equal(m.prefs().marcheMaxSec, 300);
  m.changerMarche(123); assert.equal(m.prefs().marcheMaxSec, 300);
  m.reinitialiserPrefs(); assert.equal(m.prefs().marcheMaxSec, 900);
});
test("Trajets récents : doublons fusionnés, 5 maximum, le plus récent en premier", () => {
  const m = creerMemoire(faux());
  for (let i = 0; i < 8; i++) m.ajouterTrajet("a" + i, "b");
  assert.equal(m.trajets().length, 5); assert.equal(m.trajets()[0].de, "a7");
  m.ajouterTrajet("a5", "b"); assert.equal(m.trajets()[0].de, "a5"); assert.equal(m.trajets().length, 5);
});
test("Favoris : épinglés en tête et conservés", () => {
  const m = creerMemoire(faux());
  m.ajouterTrajet("x", "y"); m.ajouterTrajet("c", "d"); m.ajouterTrajet("e", "f");
  assert.ok(m.basculerFavori("x", "y")); assert.equal(m.trajets()[0].de, "x");
  for (let i = 0; i < 8; i++) m.ajouterTrajet("r" + i, "s");
  assert.ok(m.trajets().some((t) => t.de === "x" && t.epingle));
  m.basculerFavori("x", "y"); assert.ok(!m.trajets().find((t) => t.de === "x")?.epingle);
});
test("Stockage indisponible ou corrompu : le site fonctionne", () => {
  const casse = { getItem() { throw new Error("interdit"); }, setItem() { throw new Error("interdit"); } };
  const m = creerMemoire(casse); m.ajouterTrajet("a", "b"); assert.equal(m.prefs().marcheMaxSec, 900);
  assert.equal(creerMemoire(null).trajets().length, 0);
  const corrompu = { getItem: () => "{pas du json", setItem() {} };
  assert.equal(creerMemoire(corrompu).prefs().marcheMaxSec, 900);
});

console.log(`\n${ok} tests réussis`);
