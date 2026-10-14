# 🚀 Revolut Business - Registre Intelligence & Sales Engine (FR & CH)

Application web et moteur de scraping quotidien dédiée aux équipes commerciales (BDR / SDR) de **Revolut Business** pour détecter, enrichir et cartographier les **nouvelles entreprises créées chaque jour en France et en Suisse**.

---

## 🌟 Fonctionnalités Clés

1. **Scraping Quotidien Automatique (FR & CH)** :
   * **France** : Interrogation en direct des avis de création du **BODACC A** (Bulletin Officiel des Annonces Civiles et Commerciales) et enrichissement par l'**API Recherche d'Entreprises / RNE (INPI & Sirene)**.
   * **Suisse** : Connexion en temps réel à la **FOSC / SHAB** (Feuille Officielle Suisse du Commerce) sur la rubrique `HR01` (nouvelles inscriptions au registre du commerce).
   * **Cron quotidien** : Synchronisation automatique programmée chaque matin à 05:00 + bouton d'actualisation manuelle immédiate.

2. **Enrichissement des Contacts & Décideurs** :
   * **Dirigeants légaux** : Nom, prénom, rôle juridique (Président, Gérant, Administrateur).
   * **Directeur Financier / CFO** : Détection ou déduction automatique du principal décideur financier.
   * **Email Nominatif & Professionnel** : Modèles nominatifs d'entreprises (`prenom.nom@domaine`, `initialenom@domaine`, `contact@domaine`) avec score de confiance.
   * **Téléphone direct** : Formaté et accessible en 1 clic (+33 / +41).
   * **Site Web** : Détection et lien direct d'ouverture.
   * **Raccourcis LinkedIn 1-Clic** : Recherche directe du profil du dirigeant et de la page entreprise sur LinkedIn.

3. **🗺️ Cartographie des Sociétés Liées (Réseau & Actionnariat)** :
   * Graphe interactif SVG montrant les liens entre la **société cible**, ses **dirigeants/associés**, et les **autres sociétés qu'ils possèdent ou dirigent**.
   * Identification immédiate des opportunités de **comptes multi-entités Revolut Business** (offre groupée de trésorerie).

4. **💼 Suivi Commercial & Statut CRM Intégré** :
   * Marquez en 1 clic l'état d'avancement d'un prospect :
     * 🔵 *Nouveau*
     * 🟡 *À contacter*
     * 🟣 *Contacté par Email*
     * 📞 *Contacté par Téléphone*
     * 🟢 *Déjà dans le CRM (HubSpot / Salesforce)*
     * 🏆 *Converti (Compte Revolut Business Ouvert)*
     * ⚪ *Non qualifié*
   * Attribution à un commercial et saisie de notes d'appel / historique.
   * **Export CSV standard** : Exportez vos leads filtrés en 1 clic pour import direct dans votre CRM ou séquenceur d'emails (HubSpot, Salesforce, Lemlist).

---

## 🛠️ Démarrage Rapide

Dans le dossier du projet :

```bash
# Démarrer le serveur et l'application (accessible sur http://localhost:3001)
npm start
```

Ouvrez ensuite votre navigateur sur : **[http://localhost:3001](http://localhost:3001)**

---

## 🏗️ Architecture Technique

* **Serveur / Backend** (`server/`) :
  * `server/index.js` : API Express REST (Endpoints `/api/companies`, `/api/stats`, `/api/sync`, `/api/export/csv`, etc.).
  * `server/scrapers/france.js` : Connecteur officiel BODACC & data.gouv.
  * `server/scrapers/switzerland.js` : Connecteur officiel FOSC / SHAB.
  * `server/services/enricher.js` : Moteur de détection de sites, emails et téléphones.
  * `server/services/network.js` : Générateur du graphe relationnel des sociétés liées.
  * `server/cron.js` : Planificateur de scraping quotidien.
  * `server/data/db.json` : Base de données locale persistante.

* **Client / Frontend** (`client/`) :
  * React, Tailwind CSS, Lucide Icons, et moteur SVG interactif de graphe relationnel.
