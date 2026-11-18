// Affiche quelques trajets types pour relecture.  Lancer :  node exemples.mjs
import { readFileSync } from "node:fs";
import { preparer, chercher, accesDepuisArret, accesDepuisPoint, versSecondes as t, hhmm } from "./engine.js";
const data = preparer(JSON.parse(readFileSync(new URL("./riv.json", import.meta.url))));
const min = (s) => Math.round(s / 60) + " min";
function afficher(titre, r) {
  console.log("\n=== " + titre);
  if (r.statut !== "ok") { console.log("  statut :", r.statut, r.raison ?? "", r.prochainJour ? "(prochain service " + r.prochainJour + ")" : ""); return; }
  for (const tr of r.proposes) {
    console.log(`  Départ de chez soi ${hhmm(tr.departMaison)} -> arrivée ${hhmm(tr.arriveeDest)}  (${min(tr.duree)}, ${tr.nbCorrespondances} changement, marche ${min(tr.marcheTotaleSec)})  ${tr.badges.join(", ")}`);
    for (const e of tr.etapes) {
      if (e.type === "marche") console.log(`     marche ${min(e.secondes)} ${e.vers ? "vers " + e.vers : "depuis " + e.depuis}`);
      if (e.type === "bus") console.log(`     ligne ${e.ligne} ${hhmm(e.depart.heure)} ${e.depart.nom} -> ${hhmm(e.arrivee.heure)} ${e.arrivee.nom}`);
      if (e.type === "correspondance") console.log(`     changement : ${min(e.attenteSec)} d'attente${e.memeQuai ? "" : " (autre quai)"}`);
    }
    if (tr.alertes.length) console.log("     alertes :", tr.alertes.map((a) => a.code).join(", "));
  }
}
const arret = (id) => accesDepuisArret(data, id);
afficher("Guilliers (mairie) -> Josselin (PEM), mardi, partir vers 7h",
  chercher(data, { origine: arret("guilliers-mairie-place-des-anciens-combattants"), destination: arret("josselin-pem-saint-jacques"), date: "2026-11-17", heure: t("07:00") }));
afficher("Taupont (mairie) -> Val d'Oust (La Chapelle-Caro mairie), mardi, partir vers 11h30",
  chercher(data, { origine: arret("taupont-mairie"), destination: arret("val-d-oust-la-chapelle-caro-mairie"), date: "2026-11-17", heure: t("11:30") }));
const q = data.quais["RIV:56800019A"];
afficher("Adresse à ~800 m de la mairie de Loyat -> Mauron (stade), limite de marche 5 min",
  chercher(data, { origine: accesDepuisPoint(data, q.lat + 0.0072, q.lon), destination: arret("mauron-rond-point-du-stade"), date: "2026-11-17", heure: t("07:00"), limiteMarcheSec: 300 }));
afficher("Ploërmel (centre) -> Mauron (stade), arriver avant 9h",
  chercher(data, { origine: arret("ploermel-centre"), destination: arret("mauron-rond-point-du-stade"), date: "2026-11-17", heure: t("09:00"), mode: "arriver" }));
afficher("Jour férié (25 décembre)", chercher(data, { origine: arret("ploermel-centre"), destination: arret("mauron-rond-point-du-stade"), date: "2026-12-25", heure: t("08:00") }));
