// Tous les textes de l'interface sont ici (pour ajouter une langue plus tard, il suffira de traduire ce fichier),
// ainsi que les petites fonctions de mise en forme (heures, durées, dates).
import { ajouterJours } from "./engine.js";

export const T = {
  titreSite: "Horaires et trajets RIV",
  sousTitreSite: "Ploërmel Communauté",
  titreAccueil: "Où allez-vous ?",
  depart: "Départ",
  arrivee: "Arrivée",
  placeholderArret: "Un arrêt ou une commune",
  inverser: "Inverser le départ et l’arrivée",
  quand: "Quand ?",
  maintenant: "Maintenant",
  aujourdhui: "Aujourd’hui",
  autreDate: "Autre date",
  partirA: "Partir à",
  arriverA: "Arriver à",
  date: "Date",
  heureChamp: "Heure",
  rechercher: "Rechercher",
  principauxLieux: "Lieux principaux",
  aucunArret: "Aucun arrêt ne correspond. Essayez avec le nom de la commune.",
  erreurDepart: "Choisissez un arrêt de départ dans la liste.",
  erreurArrivee: "Choisissez un arrêt d’arrivée dans la liste.",
  erreurMemeArret: "Le départ et l’arrivée sont le même arrêt.",
  erreurHeure: "Indiquez une heure.",
  erreurDate: "Indiquez une date.",
  trajetsRecents: "Vos trajets",
  epingler: "Garder ce trajet en favori",
  desepingler: "Retirer ce trajet des favoris",
  favori: "Favori",
  prefs: "Mes préférences",
  prefsTitre: "Mes préférences",
  prefsMarche: "Je veux marcher au maximum…",
  prefsExplication: "Ce réglage sert à classer les trajets. Aucun trajet n’est jamais caché : ceux qui dépassent votre limite sont signalés.",
  prefsReinit: "Revenir aux réglages d’origine",
  fermer: "Fermer",
  tad: "Transport à la demande",
  modifier: "Modifier",
  inverserCourt: "Inverser",
  trajetPlusTot: "Trajets plus tôt",
  trajetPlusTard: "Trajets plus tard",
  voirDetail: "Voir le détail",
  masquerDetail: "Masquer le détail",
  chargement: "Chargement des horaires…",
  erreurChargement: "Impossible de charger les horaires. Vérifiez votre connexion puis rechargez la page.",
  horairesTheoriques: "Horaires théoriques, sans suivi en temps réel. Ils peuvent être modifiés en cas de perturbation.",
  departDeChezVous: "Départ de chez vous",
  departDeLArret: "Départ de l’arrêt",
  arriveeLibelle: "Arrivée",
  badges: { plus_rapide: "Le plus rapide", moins_de_marche: "Le moins de marche", plus_simple: "Le plus simple" },
  sansChangement: "Sans changement",
  ticket: "Ticket 1,50 € (0,75 € en tarif réduit), à acheter dans le bus, valable 2 heures.",
  consigneArret: "Soyez à l’arrêt 5 minutes avant le bus, faites signe au conducteur et montez par l’avant.",
  consigneVelo: "Vélo à bord (2 places) : réservation la veille avant 15 h au 06 38 27 79 96.",
  samedi: "Le samedi, certains arrêts peuvent ne pas être desservis (marché) : les trajets peuvent être perturbés.",
  horsPeriode: "Les horaires ne sont pas encore disponibles pour cette date.",
  aucunTrajet: "Aucun bus ne correspond à cette heure.",
  aucunTrajetAvant: "Aucun bus ne correspond à cette heure.",
  voirLeJour: (jour) => `Voir les trajets ${jour}`,
  plusDAutreTrajet: "Il n’y a plus d’autre trajet ce jour-là.",
  horsPortee: "Ce trajet n’est pas possible avec le réseau RIV.",
  tadTitre: "Autre option : transport à la demande",
  tadTexte: "Un véhicule vous prend en charge sur réservation, du lundi au samedi de 7h à 18h (sauf jours fériés), à l’intérieur de votre zone.",
  tadZone: "Le départ et l’arrivée doivent se trouver dans la même zone : vérifiez la carte des zones.",
  tadPremiere: "Première réservation : inscription préalable sur le site de Ploërmel Communauté.",
  tadReserver: "Réserver en ligne",
  tadAppeler: "Appeler le 02 97 67 63 70",
  tadZones: "Voir la carte des zones",
  tadRaison: {
    aucun_bus: "Affiché car aucun bus ne correspond à votre horaire.",
    marche_longue: "Affiché car la marche dépasse votre limite.",
    attente_longue: "Affiché car l’attente est longue.",
  },
  piedDePage: "Horaires fournis par Ploërmel Communauté (RIV).",
  carteBientot: "",
};

export const TAD_LIENS = {
  reservation: "https://rivtad.transport-a-la-demande.fr",
  inscription: "https://ploermelcommunaute.bzh/transport-a-la-demande",
  telephone: "tel:+33297676370",
};

// ---------------------------------------------------------------- mise en forme

/** 27720 -> « 7h42 » */
export function heure(sec) {
  const m = Math.floor(sec / 60) % 1440;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** 2940 -> « 49 min » ; 5340 -> « 1 h 29 » ; 7200 -> « 2 h » */
export function duree(sec) {
  const m = Math.round(sec / 60); // espaces insécables : « 1 h 29 » ne se coupe jamais en fin de ligne
  if (m < 60) return `${m}\u00a0min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h}\u00a0h` : `${h}\u00a0h\u00a0${String(r).padStart(2, "0")}`;
}

const fmtJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fmtJourAn = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const midi = (iso) => new Date(iso + "T12:00:00Z");

/** « aujourd’hui », « demain » ou « mardi 17 novembre » (avec l'année si elle diffère de celle d'aujourd'hui). */
export function dateLongue(iso, aujourdhui) {
  if (iso === aujourdhui) return "aujourd’hui";
  if (iso === ajouterJours(aujourdhui, 1)) return "demain";
  return (iso.slice(0, 4) === aujourdhui.slice(0, 4) ? fmtJour : fmtJourAn).format(midi(iso));
}

/** « mardi 17 novembre », toujours en toutes lettres (pour les messages de réservation). */
export function jourEnToutesLettres(iso) { return fmtJour.format(midi(iso)); }

export function pluriel(n, un, plusieurs) { return n <= 1 ? un : plusieurs; }

export function texteAlerte(a) {
  switch (a.code) {
    case "marche_longue":
      return `Marche de ${duree(a.marcheSec)} ${a.extremite === "depart" ? "au départ" : "à l’arrivée"} (votre limite : ${duree(a.limiteSec)})`;
    case "correspondance_courte":
      return `Correspondance courte : ${duree(a.attenteSec)}. Le bus pourrait être en retard.`;
    case "attente_longue":
      return `Longue attente au changement : ${duree(a.attenteSec)}`;
    default:
      return "";
  }
}

export function texteAbsence(raison, aujourdhui, date, prochainJour) {
  const quand = date === aujourdhui ? "aujourd’hui" : "ce jour-là";
  const suite = prochainJour ? ` Prochain service : ${dateLongue(prochainJour, aujourdhui)}.` : "";
  if (raison === "dimanche") return `Pas de bus le dimanche.${suite}`;
  if (raison === "jour_ferie") return `Pas de bus ${quand} (jour férié).${suite}`;
  return T.horsPeriode;
}

/** Date locale de l'appareil au format ISO (sans passer par UTC). */
export function dateIsoLocale(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const secondesDuJour = (d = new Date()) => d.getHours() * 3600 + d.getMinutes() * 60;
