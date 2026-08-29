/**
 * SCRIPT "ANNONCE AUTOMATIQUE — LA TAVERNE DES MEEPLES"
 * ------------------------------------------------------
 * À coller dans Extensions > Apps Script, depuis la feuille Google Sheet
 * liée au formulaire (Réponses du formulaire).
 *
 * AVANT DE LANCER : renseigner les 3 constantes ci-dessous.
 */

const GITHUB_TOKEN   = 'COLLER_ICI_VOTRE_TOKEN_GITHUB';   // voir étape "Créer le jeton GitHub"
const GITHUB_REPO    = 'Lereikim/taverne-des-meeples';    // ne pas changer sauf si le dépôt change de nom
const GITHUB_BRANCH  = 'main';

// Liste blanche : seules ces adresses peuvent déclencher une publication.
// À adapter avec les vraies adresses Google des membres du bureau.
const EMAILS_AUTORISES = [
  'membre1@gmail.com',
  'membre2@gmail.com',
  'membre3@gmail.com'
];

/**
 * Fonction déclenchée automatiquement à chaque réponse au formulaire.
 * (le déclencheur "À la soumission du formulaire" est à créer une seule fois,
 * voir les instructions).
 */
function surNouvelleReponse(e) {
  const reponses = e.namedValues;
  const email = (reponses['Adresse e-mail'] || [''])[0].trim().toLowerCase();

  if (!EMAILS_AUTORISES.map(x => x.toLowerCase()).includes(email)) {
    console.log('Soumission refusée, email non autorisé : ' + email);
    return; // on s'arrête là : rien n'est publié, rien n'est envoyé
  }

  const titre = (reponses['Titre'] || [''])[0];
  const texte = (reponses['Texte'] || [''])[0];
  const date  = (reponses['Date (optionnel)'] || [''])[0];
  const email = (reponses['Adresse e-mail'] || [''])[0];
  const fichiers = (reponses['Photos'] || [''])[0]; // Google Forms renvoie les URLs Drive séparées par une virgule

  const photoUrls = [];
  if (fichiers) {
    const urls = fichiers.split(',').map(s => s.trim()).filter(Boolean);
    urls.forEach((driveUrl, i) => {
      const fileId = extraireIdDrive(driveUrl);
      if (!fileId) return;
      const blob = DriveApp.getFileById(fileId).getBlob();
      const nomFichier = 'images/' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyyMMdd-HHmmss') + '-' + i + '.jpg';
      const cheminGitHub = pousserFichierGitHub(nomFichier, blob);
      if (cheminGitHub) photoUrls.push(cheminGitHub);
    });
  }

  mettreAJourAnnonces({ titre, texte, date, photos: photoUrls });

  if (email) {
    envoyerTexteAColler(email, titre, texte, date);
  }
}

/** Envoie un fichier (image) dans le dossier images/ du dépôt GitHub. */
function pousserFichierGitHub(chemin, blob) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${chemin}`;
  const payload = {
    message: 'Ajout photo : ' + chemin,
    content: Utilities.base64Encode(blob.getBytes()),
    branch: GITHUB_BRANCH
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: 'token ' + GITHUB_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    console.error('Erreur upload photo : ' + res.getContentText());
    return null;
  }
  return chemin; // ex: images/20260901-140233-0.jpg
}

/** Récupère annonces.json, ajoute la nouvelle annonce en tête, et le renvoie sur GitHub. */
function mettreAJourAnnonces(nouvelleAnnonce) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/annonces.json`;
  const getRes = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'token ' + GITHUB_TOKEN },
    muteHttpExceptions: true
  });
  let sha = null;
  let annonces = [];
  if (getRes.getResponseCode() === 200) {
    const data = JSON.parse(getRes.getContentText());
    sha = data.sha;
    annonces = JSON.parse(Utilities.newBlob(Utilities.base64Decode(data.content)).getDataAsString());
  }

  annonces.unshift(nouvelleAnnonce);
  annonces = annonces.slice(0, 6); // on ne garde que les 6 plus récentes sur le site

  const payload = {
    message: 'Nouvelle annonce : ' + nouvelleAnnonce.titre,
    content: Utilities.base64Encode(JSON.stringify(annonces, null, 2)),
    branch: GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: 'token ' + GITHUB_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (putRes.getResponseCode() >= 300) {
    console.error('Erreur mise à jour annonces.json : ' + putRes.getContentText());
  }
}

/** Envoie un e-mail avec le texte prêt à coller sur les réseaux. */
function envoyerTexteAColler(email, titre, texte, date) {
  const bloc = `${titre}\n\n${texte}${date ? '\n\n📅 ' + date : ''}\n\n— La Taverne des Meeples`;
  MailApp.sendEmail({
    to: email,
    subject: '📋 Texte prêt à coller : ' + titre,
    body: 'Le site a été mis à jour automatiquement. Voici le texte à copier-coller sur Facebook, Instagram, Discord et WhatsApp :\n\n' +
          '-----------------------------\n' + bloc + '\n-----------------------------\n\n' +
          '(les photos ont déjà été ajoutées au site, inutile de les rechercher)'
  });
}

/** Extrait l'identifiant de fichier depuis une URL Google Drive. */
function extraireIdDrive(url) {
  const m = url.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}
