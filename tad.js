// Règles du transport à la demande (TàD) du feuillet : service du lundi au samedi de 7h à 18h, sauf jours fériés ;
// réservation au moins 5 h avant le départ ; centrale ouverte de 9h à 17h en semaine et de 9h à 13h le samedi.
import { ajouterJours } from "./engine.js";

export const TAD = {
  debutSec: 7 * 3600, finSec: 18 * 3600, delaiSec: 5 * 3600,
  ouverture: { 1: [9, 17], 2: [9, 17], 3: [9, 17], 4: [9, 17], 5: [9, 17], 6: [9, 13] }, // 0 = dimanche : fermé
};

const jourSemaine = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const debutJour = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const MS_PAR_JOUR = 86400000;

/**
 * Dernier moment où réserver pour partir à `heureSec` le jour `iso`.
 * Retourne { date, heureSec } ou null.
 */
export function limiteReservation(iso, heureSec) {
  const cible = debutJour(iso) + (heureSec - TAD.delaiSec) * 1000;
  const jourCible = new Date(cible).toISOString().slice(0, 10);
  for (let k = 0; k < 8; k++) {
    const jour = ajouterJours(jourCible, -k);
    const f = TAD.ouverture[jourSemaine(jour)];
    if (!f) continue;
    const debut = debutJour(jour) + f[0] * 3600000, fin = debutJour(jour) + f[1] * 3600000;
    if (cible >= debut) {
      const instant = Math.min(cible, fin);
      return { date: jour, heureSec: Math.floor((instant - debutJour(jour)) / 60000) * 60 };
    }
  }
  return null;
}

/**
 * Le TàD peut-il servir de repli pour partir à `heureSec` le jour `iso` ?
 * @param serviceActif  le réseau circule ce jour-là (pas de dimanche ni de jour férié)
 * @param maintenant    { date, sec } pour refuser si le délai de réservation est déjà dépassé
 * @returns { ok, raison?, limite? }  raison : "jour_sans_service" | "hors_horaires" | "trop_tard"
 */
export function tadPossible({ date, heureSec, serviceActif, maintenant }) {
  if (!serviceActif) return { ok: false, raison: "jour_sans_service" };
  if (heureSec < TAD.debutSec || heureSec > TAD.finSec) return { ok: false, raison: "hors_horaires" };
  const limite = limiteReservation(date, heureSec);
  if (!limite) return { ok: false, raison: "trop_tard" };
  if (maintenant && (limite.date < maintenant.date || (limite.date === maintenant.date && limite.heureSec < maintenant.sec)))
    return { ok: false, raison: "trop_tard" };
  return { ok: true, limite };
}
