# Support de soutenance — 12 diapositives

Source éditable préparée pour le groupe 25. Le fichier PowerPoint n’est pas généré dans cet environnement : la compétence [Présentations](/home/merciel-mithimbo/.codex/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations/SKILL.md) impose « Use JavaScript ES modules with `@oai/artifact-tool` » et son runtime `load_workspace_dependencies` ; ni le moteur ni ce tool ne sont disponibles. Son guide interdit l’installation de substituts. Ce document fournit le contenu à exporter ultérieurement, sans prétendre livrer un PPTX vérifié.

## 1. Maison intelligente

Identité des objets et contrôle d’accès décentralisé.
Groupe 25, Master 1 UNIKIN. Blockchain et cryptomonnaies.
Prototype local vérifié. Déploiement public à compléter.

Notes : présenter les quatre membres du rapport et la référence du sujet officiel page 9.

## 2. Problème

Une commande réseau ne suffit pas à prouver un droit.
Le propriétaire doit pouvoir accorder puis retirer une action.
Un fichier doit porter la preuve de son fabricant avant installation.

Notes : PDF officiel, pages 1 et 9. Aucun paiement ni jeton.

## 3. Objets et rôles

Serrure LOCK-01 : verrouiller, déverrouiller.
Prise PLUG-01 : allumer, éteindre.
Caméra CAM-01 : activer, désactiver, sans vidéo.
Le propriétaire accorde les permissions. L’invité les utilise. Le fabricant publie pour ses modèles autorisés.

Notes : chaque objet possède une clé distincte. L’administrateur autorise les fabricants sans obtenir de droits sur les objets.

## 4. Autorisation sur chaîne

SmartHomeRegistry gère identités, permissions et commandes.
Chaque accès temporaire porte un masque d’actions, une expiration et une révision.
Une révocation suivie d’un nouvel accès ne réactive aucune ancienne demande.

Notes : montrer un test de contrat et la borne temporelle exacte. Source : packages/contracts/contracts.

## 5. Parcours d’une serrure

Le portefeuille crée une demande par transaction.
Après confirmation, la passerelle publie l’enveloppe signée sur MQTT TLS.
Le simulateur applique l’action et signe son accusé.
Le contrat enregistre la preuve du résultat.

Notes : ouvrir docs/preuve-parcours-local.json. Montrer les identifiants réels de cette exécution, pas une valeur Figma.

## 6. Révocation et pannes

La chaîne bloque les nouvelles demandes non autorisées.
Le contrôle final invalide les travaux encore en attente.
Un message en vol et une action passée ne peuvent pas être annulés.
Un timeout peut laisser un résultat non confirmé.

Notes : démontrer le refus invité après révocation et rappeler la frontière de confiance de la passerelle.

## 7. Mise à jour authentifiée

Le fabricant signe le modèle, la version, SHA-256, la référence IPFS et la taille.
Le propriétaire autorise une installation unique.
Le simulateur télécharge, contrôle les octets et la signature, puis persiste une version strictement supérieure.

Notes : aucun fichier n’est exécuté. Source : docs/preuve-micrologiciels-local.json et packages/shared/src/protocol.ts.

## 8. Refus vérifiés

Fichier altéré : HASH_MISMATCH, ancienne version conservée.
Invité et rejeu : refus par l’API.
Ancienne version : ROLLBACK_BLOCKED.
Les tests couvrent aussi faux signer, mauvais modèle et fabricant révoqué.

Notes : distinguer les preuves de transport local des tests de moteur à dépendances contrôlées.

## 9. Tableau de bord

Insérer docs/captures/tableau-de-bord-bureau.png en conservant ses proportions.
Données réelles des services locaux, signature de session et rôles contractuels.
18 routes adaptatives. Largeur mobile testée : 390 pixels.

Notes : source visuelle Figma 3:281, Simple Design System. Le fournisseur de portefeuille est émulé dans Playwright. Essai manuel Sepolia encore nécessaire.

## 10. Tests et sécurité

16 scénarios locaux, comportant plusieurs assertions chacun.
20 essais navigateur sur bureau et mobile lors de la dernière suite complète.
Slither : 12 alertes justifiées, rapport brut conservé.
Audit npm serveur : aucun avis signalé. Outillage : 3 alertes élevées résiduelles.

Notes : consulter les sorties actuelles dans docs. Aucune certification ou audit indépendant. Chiffres à actualiser après toute modification.

## 11. Gas et limites

Les reçus réels du réseau Hardhat local donnent les mesures de gas.
Compiler 0.8.30, optimisation 200, EVM Cancun.
Aucun prix fiat ou coût Sepolia extrapolé.
Le broker, le gateway, le RPC, PostgreSQL et IPFS restent nécessaires.

Notes : afficher les mesures de RESULTATS.md et le hash correspondant. Tokenomics non applicable.

## 12. Avant la remise

Déployer et vérifier les deux contrats Sepolia.
Configurer le broker TLS, PostgreSQL persistant, IPFS et les hébergements.
Tester depuis un autre appareil et compléter les URL publiques.
Faire confirmer la date de défense incohérente du PDF.

Notes : aucune URL publique n’est attestée aujourd’hui. Les configurations sont prêtes, sans souscription ni email automatique.
