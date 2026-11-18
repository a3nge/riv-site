// Mémoire sur l'appareil (préférences, trajets récents et favoris). Aucun compte, rien n'est envoyé.
// Tout est protégé : si le stockage est indisponible (navigation privée, par exemple), le site fonctionne
// quand même, avec les réglages par défaut.
const CLE = "riv:v1";
export const CHOIX_MARCHE_SEC = [300, 600, 900, 1200];
export const PREFS_DEFAUT = { marcheMaxSec: 900 };
const MAX_RECENTS = 5, MAX_FAVORIS = 6;

function stockageParDefaut() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function creerMemoire(storage = stockageParDefaut()) {
  const lire = () => {
    try {
      const brut = storage ? JSON.parse(storage.getItem(CLE) || "null") : null;
      const prefs = { ...PREFS_DEFAUT };
      if (brut && CHOIX_MARCHE_SEC.includes(brut.prefs?.marcheMaxSec)) prefs.marcheMaxSec = brut.prefs.marcheMaxSec;
      const trajets = Array.isArray(brut?.trajets)
        ? brut.trajets.filter((t) => t && typeof t.de === "string" && typeof t.vers === "string")
            .map((t) => ({ de: t.de, vers: t.vers, epingle: t.epingle === true }))
        : [];
      return { prefs, trajets };
    } catch { return { prefs: { ...PREFS_DEFAUT }, trajets: [] }; }
  };
  const ecrire = (etat) => { try { storage?.setItem(CLE, JSON.stringify(etat)); } catch { /* ignoré */ } };
  const memes = (t, de, vers) => t.de === de && t.vers === vers;

  return {
    prefs: () => lire().prefs,
    changerMarche(sec) { const e = lire(); if (CHOIX_MARCHE_SEC.includes(sec)) e.prefs.marcheMaxSec = sec; ecrire(e); return e.prefs; },
    reinitialiserPrefs() { const e = lire(); e.prefs = { ...PREFS_DEFAUT }; ecrire(e); return e.prefs; },
    trajets: () => { const t = lire().trajets; return [...t.filter((x) => x.epingle), ...t.filter((x) => !x.epingle)]; },
    ajouterTrajet(de, vers) {
      const e = lire();
      const existant = e.trajets.find((t) => memes(t, de, vers));
      const reste = e.trajets.filter((t) => !memes(t, de, vers));
      const epingles = reste.filter((t) => t.epingle);
      const recents = reste.filter((t) => !t.epingle);
      const nouveau = { de, vers, epingle: existant?.epingle === true };
      e.trajets = nouveau.epingle ? [nouveau, ...epingles, ...recents.slice(0, MAX_RECENTS)]
                                  : [...epingles, nouveau, ...recents.slice(0, MAX_RECENTS - 1)];
      ecrire(e);
    },
    basculerFavori(de, vers) {
      const e = lire();
      const t = e.trajets.find((x) => memes(x, de, vers));
      if (!t) return false;
      if (!t.epingle && e.trajets.filter((x) => x.epingle).length >= MAX_FAVORIS) return false;
      t.epingle = !t.epingle;
      ecrire(e);
      return true;
    },
  };
}
