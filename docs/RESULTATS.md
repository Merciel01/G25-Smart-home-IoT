# Résultats et critères d’acceptation

Dernière consolidation : 24 octobre 2026, Africa/Kinshasa. Le prototype local est vérifié. Il ne satisfait pas encore l’accessibilité publique exigée par le PDF officiel. Aucune URL publique, vérification de contrat Sepolia ou disponibilité d’hébergement n’est attestée.

## Vérifications exécutées

| Vérification                      | Résultat conservé                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation depuis le verrou npm | `npm ci` exécuté ; versions dans package-lock.json                                                                                            |
| Compilation Solidity              | solc-js 0.8.30, optimisation 200, EVM Cancun ; deux contrats compilés                                                                         |
| Contrôle TypeScript               | `npm run typecheck`, sans erreur lors du dernier contrôle                                                                                     |
| Tests locaux                      | `npm test`, 16 scénarios réussis : 7 contrats, 6 protocole/fixtures, 1 SIWE, 2 indexeur ; `tests-locaux.txt`                                  |
| Interface                         | `npm run test:e2e`, 30 essais réussis sur bureau 1320 × 1010 et mobile 390 × 900 ; `interface-tests.json` et `.txt`                           |
| Parcours MQTT réel                | `npm run demo`, transaction/permission/commande/accusé/ancrage et refus ; `preuve-parcours-local.json`                                        |
| Micrologiciels réels locaux       | `npm run demo:firmware`, installation saine, refus invité/rejeu/hash/rollback et conservation de version ; `preuve-micrologiciels-local.json` |
| Broker TLS et ACL                 | `npm run test:transport`, résultats dans `preuve-transport-local.json` script exécuté avec succès                                             |
| Build React                       | `npm run build` ; résultat dans `build.txt`                                                                                                   |
| Slither 0.11.6                    | Analyse aboutie, 16 contrats dont dépendances, 102 détecteurs ; 12 résultats justifiés ; `security/slither.json` et `.txt`                    |
| Audit dépendances serveur         | 0 avis signalé dans `security/npm-runtime-audit.json`                                                                                         |
| Audit npm complet                 | 3 avis élevés liés à l’outillage Hardhat/zod transitoire, toujours présents ; `security/npm-audit.json`                                       |

Les tests du moteur utilisent des dépendances contrôlées pour provoquer des erreurs précises. Les scripts de démonstration traversent de vrais services locaux. Playwright émule le fournisseur de portefeuille, tout en produisant de vraies signatures et transactions sur Hardhat. Aucun de ces essais ne prouve une interaction manuelle MetaMask/Sepolia ou un accès extérieur.

Le test de reconstruction d’indexeur vérifie la détection d’un hash remplacé, la suspension, la reconstruction et l’archivage d’une demande orpheline avec dépendances contrôlées. Un essai de réorganisation sur un fournisseur externe et une panne longue restent nécessaires. PostgreSQL est implémenté mais n’a pas été exécuté contre une instance disponible ici.

## Critères du dossier

| Nº  | Critère                                                             | État                                                                                                                                                  |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | URL publique et fonctionnement sans PC local                        | Non validé : hébergements et dépôt distant manquants                                                                                                  |
| 2   | Deux contrats Sepolia vérifiés                                      | Non réalisé ; scripts et standard JSON préparés                                                                                                       |
| 3   | Trois identités et signers distincts                                | Vérifié localement par seed et parcours                                                                                                               |
| 4   | Invité sans droit refusé, y compris API                             | Vérifié par contrats, SIWE et refus d’installation HTTP                                                                                               |
| 5   | Permission temporaire et commande atteignant l’objet                | Vérifié sur la serrure via MQTT TLS                                                                                                                   |
| 6   | Exécution confirmée par accusé authentifié et preuve                | Vérifié localement, jusqu’à finalisation sur chaîne                                                                                                   |
| 7   | Révocation et invalidation de la file                               | Vérifié par contrat et test de contrôle final d’indexeur                                                                                              |
| 8   | Objet révoqué inutilisable                                          | Contrat et moteur testés ; effet des messages en vol documenté                                                                                        |
| 9   | Mise à jour saine acceptée, altération et fausse signature refusées | Transport réel local pour sain/hash, tests du moteur et contrats pour signatures                                                                      |
| 10  | Mauvais modèle, rollback et invité refusés                          | Tests du moteur ; rollback et invité également par services locaux                                                                                    |
| 11  | Journal, réseau et confidentialité                                  | Implémentés et interface testée ; aucun secret dans la configuration publique                                                                         |
| 12  | Tests et analyse présents avec résultats vrais                      | Présents ; alertes Slither et npm conservées, aucun audit indépendant revendiqué                                                                      |
| 13  | 18 interfaces et états bureau/mobile                                | Routes testées ; commande, permission, publication et installation testées par l’interface ; pas de conformité pixel par pixel des 40 cadres annoncée |
| 14  | Références et données de démonstration                              | Documentées dans REFERENCES.md et le rapport                                                                                                          |

## Livrables et limites de remise

Le rapport PDF, sa source Markdown, le code, les scripts, migrations, configurations, captures et rapports sont présents. Le support de soutenance comporte douze diapositives en source Markdown. Le PPTX n’a pas été produit : le moteur `@oai/artifact-tool` et `load_workspace_dependencies` requis par la compétence Présentations ne sont pas disponibles. Le motif exact et le lien de la compétence figurent dans SOUTENANCE.md. Aucun PowerPoint vérifié n’est annoncé.

Les comptes Render/Vercel, RPC Sepolia, broker TLS public, PostgreSQL, IPFS épinglé et portefeuille de déploiement doivent être configurés en dehors du dépôt. Les essais sur un autre appareil, en navigation privée et sans services locaux restent à faire. Ne pas soumettre le projet comme publiquement déployé avant ces preuves.

## Gas mesuré

Le tableau ci-dessous est généré à partir des fichiers de preuves par `scripts/results.ts`. Les mesures se rapportent uniquement à Hardhat local 31337, compiler 0.8.30, optimisation 200, EVM Cancun, et à l’état précis de ces exécutions. Elles ne donnent aucun coût fiat ni estimation garantie pour Sepolia.

<!-- GAS_START -->

| Opération locale                                                               | Gas utilisé | Transaction                                                          |
| ------------------------------------------------------------------------------ | ----------: | -------------------------------------------------------------------- |
| transaction → indexeur → MQTT TLS → serrure → accusé signé → preuve sur chaîne |      110166 | `0xf3ed649e221ed63f2c5daf7caf6f44e2489eb1a30ab6c1cc8c88a3495be2da76` |
| PLUG-01 ON via MQTT TLS                                                        |       89891 | `0xe560a8d3e82ebc1af2da1995621ec71814c1501c9d7e1682ee5cf0f99cd03e8a` |
| PLUG-01 OFF via MQTT TLS                                                       |       89891 | `0x2b14d288e94ee158a3246fcf83d7ce966bcc7d38b22c50f7a7d6609e8113f352` |
| CAM-01 ACTIVATE via MQTT TLS                                                   |       89914 | `0x1f1cfc510b8c6c9a1e09dd5fffd08d3114b6ea6ea0093aa0f7b609011d3609a3` |
| CAM-01 DEACTIVATE via MQTT TLS                                                 |       89914 | `0xcd807c6a0d6cfb6340b8a915d8c1e13695d76ef2488c2c915c367acc7202f3b6` |
| Publication micrologiciel 10800                                                |      328860 | `0xd50b7ed1e6c1a3fc66752efe7b75cf4de32431c042acbcb5fc10e30b0d24d7c4` |

<!-- GAS_END -->

## Correction du formulaire d’enregistrement

Le modèle est présélectionné pour les identifiants connus. Un modèle incompatible, un identifiant déjà enregistré et une adresse d’objet déjà utilisée reçoivent des messages explicites avant la transaction. Deux tests supplémentaires (bureau et mobile) confirment ces refus et l’absence d’envoi de transaction. Contrôle TypeScript et build réussis. Aucun droit ni aucune donnée utilisateur n’a été réinitialisé.

### Parcours multi-comptes ajouté

L’écran « Comptes et configuration » identifie le compte connecté, les propriétaires
sur chaîne et l’administrateur des fabricants. Les objets disponibles sont
préremplis depuis leur provisionnement public ; les objets existants ne sont pas
réenregistrés. L’invité soumet une demande d’accès limitée à une heure dans
l’interface ; le propriétaire approuve avec une véritable transaction ou refuse.
La création d’une demande ne confère aucun droit. Les demandes sont persistées
hors chaîne et visibles uniquement à leurs deux participants. L’administrateur
peut autoriser et révoquer un fabricant par signature de transaction.

Le démarrage manuel pour les premiers propriétaires est documenté. Il exige une
installation neuve explicite ; la démonstration actuelle reste intacte. L’aide
opérateur `local:access` est limitée à Hardhat et au propriétaire technique actif.
Les trois appareils simulés restent les seuls appareils provisionnés de cette
installation. L’ajout d’un appareil physique, la preuve de sa possession et la
récupération d’un portefeuille ne sont pas automatisés par ce prototype.

Validation multi-comptes : 30 scénarios navigateur réussis sur bureau et mobile, compilation de production et vérification TypeScript réussies ; les 16 tests contrats/protocole/session/indexeur passent également. Les transactions des tests concernent exclusivement Hardhat local.

Contrôle final après redémarrage : les 8 scénarios ciblés multi-comptes passent, y compris approbation, refus sans octroi et révocation (bureau et mobile) ; voir `comptes-tests.txt`. La commande `npm run test:accounts` vérifie aussi l’octroi local, l’isolation serrure/prise et la révocation ; preuve publique dans `preuve-comptes-local.json`. Aucun accès n’a été octroyé au compte personnel de l’utilisateur pendant ces tests.

### Démonstration attribuée au compte MetaMask utilisateur

Les trois objets `LOCK-01`, `PLUG-01`, `CAM-01` appartiennent désormais à
`0xd8A13256ce817d55a0939b2f6d28B3824A51d10C` sur le registre local indiqué dans
`propriete-demo-local.json`. L’ancien contrat ne proposait aucun transfert : un
nouveau registre a été déployé, les mêmes identités publiques d’objets ont été
conservées et les fichiers antérieurs archivés sous `.local/archive/owner-*`.
La chaîne précédente étant en mémoire et arrêtée avec les services, son historique
n’est pas présent sur la chaîne redémarrée ; les anciennes preuves documentaires
concernent le déploiement antérieur.

Le bootstrap utilise explicitement l’impersonation Hardhat pour les transactions
initiales, puis désactive cette impersonation. Aucune clé privée du compte
MetaMask ni signature MetaMask utilisateur n’a été utilisée. Cette technique
est réservée à Hardhat 31337, jamais à Sepolia. Les opérations suivantes sont
signées normalement dans MetaMask. Le compte dispose de fonds fictifs locaux.

Vérifications : propriétaire des trois objets et permission propriétaire lus
sur chaîne ; RPC, indexeur et MQTT opérationnels ; simulateur connecté ;
TypeScript sans erreur. La suite navigateur historique suppose le propriétaire
technique de préparation ; elle n’a pas été réexécutée sur cette configuration
personnalisée et doit être adaptée avant une nouvelle exécution.

### Représentation visuelle des appareils

Les cartes du tableau de bord, la liste des objets et la fiche de chaque appareil
intègrent maintenant un visuel SVG : cadenas fermé/ouvert, prise avec lampe
virtuelle allumée/éteinte, caméra active/inactive sans vidéo. Le rendu utilise
exclusivement l’état retourné par la passerelle ; cliquer sur une commande ne
change pas directement le dessin. Un modèle incompatible, un état absent, un
appareil révoqué ou une présence périmée (45 s) ne produit aucun affichage actif
confirmé. L’heure de dernière présence signée est affichée, distincte d’une preuve
physique. La lampe est une illustration de l’alimentation de PLUG-01, pas un
nouvel objet enregistré.

Validation dédiée : `npx playwright test tests/browser/device-visuals.spec.ts
--reporter=list` sur bureau et mobile. Les réponses API de ce test sont contrôlées
pour vérifier les six états, leur actualisation, la disparition de la lumière
hors ligne et la révocation. Il s’agit de tests d’interface, pas d’une nouvelle
preuve de transport MQTT. Captures `visuels-bureau.png` et `visuels-mobile.png`
avec données de test. La lecture de l’état local réel montre également les états
LOCK, ON et ACTIVATE avec des présences récentes ; aucune commande n’a été envoyée
à la place de l’utilisateur pour cette vérification.

### Webcam de l’ordinateur sur la fiche caméra

Une caméra simulée active et une présence récente permettent de demander un
aperçu webcam local, avec autorisation explicite du navigateur. Vidéo seule,
sans microphone, MediaRecorder, WebRTC distant, transfert au serveur ou MQTT.
Le flux s’arrête à la fermeture de l’aperçu, à la désactivation confirmée, au
changement de fiche/compte, à la perte d’accès et à l’expiration de la présence
signée (45 secondes), y compris si l’API ne retourne plus de nouvelles données.
Les pistes d’une autorisation devenue obsolète pendant l’attente sont également
fermées. Le flux local ne prouve pas l’état d’une caméra Raspberry Pi distante.

Tests dédiés avec le périphérique vidéo fictif de Chromium : lecture réelle d’un
MediaStream sans audio, désactivation et pistes terminées, refus d’autorisation,
réouverture puis nettoyage à la navigation. Réponses API contrôlées : ces tests
ne représentent pas une validation d’un matériel webcam réel ni un nouveau test
MQTT. TypeScript et compilation de production vérifiés. Les tests du matériel
webcam de l’utilisateur nécessitent son autorisation dans son navigateur.

### Provisionnement dynamique par compte — validation locale

Le parcours **Préparer cet appareil → Enregistrer sur chaîne** crée plusieurs
exemplaires des modèles serrure, prise et caméra. Le nom est libre ; l’identifiant
technique est unique. Une identité privée et des credentials MQTT distincts sont
persistés en fichier atomique 0600, sans exposition au navigateur. Le broker local
et le simulateur découvrent les appareils sans redémarrage, avec les mêmes topics
et contrôles de signatures, permissions, révocation et modèle que les objets
initiaux. Le rendu et les actions utilisent le modèle, non un identifiant fixe.
Les réserves non enregistrées sont filtrées par le compte de session. Les objets
enregistrés restent soumis à la propriété et aux permissions du contrat.

Validation : 2 scénarios navigateur réels réussis (bureau/mobile), chacun créant
3 appareils et exécutant les 6 actions avec MetaMask simulé par le signataire de
test côté Node, contrats réels, MQTT TLS réel, accusés et ancrages réels. Au total,
12 commandes dynamiques confirmées. Un second compte ne voit pas les réserves du
premier. Les ACL d’un appareil dynamique refusent un topic d’un autre appareil.
Les trois propriétaires initiaux du compte utilisateur sont inchangés. Preuves :
`preuve-provisionnement-local.json`, `preuve-transport-dynamique-local.json`,
`provisionnement-tests.txt`. La correction d’horloge empêche toute exécution avant
un horodatage compatible avec l’enregistrement Hardhat ; un test vérifie absence
d’effet, absence d’accusé puis reprise unique. Les 17 tests techniques passent
(7 contrats, 7 protocole, 1 SIWE, 2 indexeur). Les 4 tests visuels/webcam passent
également sur bureau et mobile, TypeScript et build de production réussis.

Limites : trois modèles connus, quota de 100 appareils préparés par compte et
registre, automatisation du provisionnement local uniquement. L’intégration au
broker externe et à son provisionneur reste à réaliser avant d’activer cette
fonction sur Sepolia. La réservation est hors chaîne et ne remplace pas une
preuve de possession physique ou une autorisation de premier enregistrement dans
le contrat. Aucun reset des appareils existants ni déploiement externe effectué.

### Connecteur de provisionnement externe EMQX

L’adaptateur HTTPS de gestion EMQX v5 compatible est intégré : contrôles des
sources d’authentification/autorisation, refus par défaut, ACL par identité avant
activation des credentials, relecture des résultats, reprise de la même identité
après une panne partielle. Les identités non confirmées restent `pending` et ne
sont pas chargées par le simulateur. Les secrets sont chiffrés dans PostgreSQL
avec AES-256-GCM et une clé commune aux deux services serveur, jamais au frontend.
L’identité de passerelle dispose de sa commande de préparation distincte.
L’interface propose la reprise d’une préparation échouée. Aucun objet local
existant n’a été réinitialisé ou attribué à un autre compte.

Validation effectuée : 22 tests techniques (les 17 précédents et 5 tests de
l’adaptateur/chiffrement) réussis ; les échanges EMQX de ces tests utilisent une
API simulée, pas un serveur EMQX réel. Ils vérifient ordre ACL/utilisateur, reprise
idempotente, échecs partiels, configuration refusée, confidentialité des erreurs,
chiffrement, clé incorrecte, altération et refus du plaintext en production.
Deux scénarios navigateur de reprise passent (bureau/mobile) avec réponses API
contrôlées. Une régression navigateur bureau sur la pile locale réelle confirme
l’ajout des trois modèles, les six commandes MQTT, leurs visuels et l’isolation.
TypeScript et build de production réussis. Logs `broker-externe-tests.txt`,
`broker-reprise-tests.txt`, `broker-regression-locale-tests.txt`.

**Non vérifié et nécessaire avant activation Sepolia** : instance EMQX réelle,
compatibilité de son offre/API, credentials de gestion, MQTT TLS et ACL effectives,
PostgreSQL distant, panne/reprise réelle et commande sur contrats Sepolia. La
commande `broker:check` s’arrête actuellement sur les variables manquantes, sans
appel réseau ni repli vers un broker permissif. Une clé de chiffrement a été
préparée uniquement dans `.local/external/provisioning-key.secret` (0600) ; elle
n’a pas été publiée ni injectée dans un hébergement. Les scripts, variables et la
procédure détaillée sont dans DEPLOIEMENT.md. Aucun service payant, hébergement ou
déploiement Sepolia n’a été créé ou annoncé comme opérationnel.

La sonde `broker:transport` est également préparée pour tester un broker réel
avec une identité MQTT temporaire et nettoyage borné à cette identité. Elle
s’arrête actuellement sur la configuration absente ; elle n’a donc effectué aucun
appel au broker externe. Son transport réel et son nettoyage distant ne sont pas
annoncés comme testés. Les tests de l’adaptateur vérifient la restriction du
nettoyage aux identités de sonde et les deux requêtes DELETE via API simulée.

### flespi : validation réelle et bascule de la démonstration

Le jeton privé fourni dans `.local/external/flespi.env` a été validé en lecture
seule sans affichage de sa valeur. L’adaptateur flespi crée des jetons ACL de type
2, distincts du jeton Maître, avec uniquement les droits MQTT requis et aucun
accès REST supplémentaire. Marqueur stable pour la reprise, relecture des ACL,
refus de droits étendus et suppression limitée aux jetons du marqueur attendu.
Trois nouveaux tests unitaires couvrent ces cas et les erreurs réseau sans secret.
La suite technique totalise 25 scénarios réussis (17 de base, 5 EMQX/chiffrement,
3 flespi). TypeScript et build de production réussis.

Sonde réelle : création de deux jetons temporaires, connexion TLS à
`mqtt.flespi.io:8883`, livraison des témoins autorisés, absence de livraison de
commande croisée, absence de publication croisée au témoin passerelle, reprise
sans duplication et nettoyage des sondes. flespi peut accepter une souscription
sans livrer les messages interdits : le test observe les données effectivement
reçues, pas un SUBACK négatif. Il ne revendique pas le refus retained par le
broker ; le schéma ACL flespi ne propose pas cette contrainte. Les producteurs
émettent sans retained et les contrôles applicatifs de signature/nonce/deadline
et de messages retenus sont conservés.

La démonstration utilise désormais ce broker externe avec les **mêmes contrats
Hardhat 31337**, propriétaires et clés Ethereum. Les anciennes configurations
runtime et provisionnement sont archivées sous `.local/archive/flespi-*`.
Un parcours navigateur bureau réel a créé trois appareils supplémentaires via
l’API flespi et confirmé leurs six actions, accusés signés, ancrages Hardhat,
visuels et isolation d’un autre compte. Preuves `preuve-flespi-parcours.json`,
`preuve-flespi-transport.json`, `flespi-parcours-tests.txt` et
`flespi-tests-techniques.txt`. Les quatorze profils d’appareils créés exclusivement
par les essais ont été archivés, leurs jetons distants supprimés et leurs
réserves retirées de la liste active pour libérer le quota. Avant ce nettoyage,
leur absence de propriété et de permission du compte personnel a été vérifiée ;
les trois appareils personnels restent inchangés. L’historique sur chaîne des
essais et les preuves documentaires sont conservés.

Limite du prototype : 49 appareils actifs/préparés par installation sur le
broker Free, plus une passerelle, sans compter les consoles ou diagnostics. Le
plafond du compte est global et les quotas et règles d’inactivité restent ceux du
fournisseur. Le jeton Maître n’est pas transmis au navigateur ni à l’environnement
du simulateur par le lanceur local. PostgreSQL hébergé, hébergement public de
l’application et contrats Sepolia restent **non configurés/non vérifiés**.

### Correction : états hors ligne après diagnostic flespi

Cause identifiée : la sonde de transport héritait du `MQTT_PREFIX` de
l’installation. Elle retrouvait alors le jeton de la passerelle active et le
supprimait pendant son nettoyage. Le simulateur restait connecté mais la
passerelle MQTT ne recevait plus ses retours ; la transaction blockchain pouvait
être confirmée tandis que l’exécution et les présences restaient non confirmées.
La vérification publiée avant ce nettoyage ne suffisait donc pas à garantir la
connexion après le diagnostic.

Correction : la sonde utilise toujours un préfixe `g25/probe-` aléatoire isolé,
indépendamment de toute configuration. La suppression d’un jeton de passerelle
est en plus refusée hors de cet espace de sonde. Un quatrième test unitaire
flespi vérifie ces deux protections. Le jeton de la passerelle a été recréé avec
ses ACL, sans changement de registre, de propriétaire ou de clé d’objet.
L’interface affiche désormais un bandeau de connexion MQTT interrompue plutôt
que de laisser les seuls états inconnus expliquer la panne.

Validation : sonde réelle corrigée et nettoyage réussis, puis existence du jeton
passerelle confirmée par l’API de gestion et connexion MQTT toujours active. Un
parcours navigateur réel sur une prise temporaire a confirmé Allumer et Éteindre,
les deux états visuels et les accusés signés via flespi. La prise de test a été
archivée et son jeton retiré ; les trois objets personnels sont conservés. Les
tests visuels de panne/reprise passent sur bureau et mobile (API contrôlée), les
quatre tests unitaires flespi, TypeScript et build passent. Logs
`correction-mqtt-transport.txt`, `correction-mqtt-prise.txt`,
`correction-mqtt-visuels.txt`. Aucun état n’est forcé dans l’interface et aucune
commande expirée n’est déclarée exécutée à partir de sa seule transaction.

### PostgreSQL Neon réel

La connexion directe et TLS avec certificat vérifié ont été confirmés. La
migration `001_service_state.sql` a été appliquée. Le test de stockage réel
confirme huit mutations concurrentes sur deux connexions sans perte, rollback
sans modification, persistance après fermeture/réouverture. Les requêtes de test
utilisent un scope temporaire distinct des scopes applicatifs. Des délais réseau
ETIMEDOUT ont été observés à la reconnexion ; les lectures de test ont des reprises
bornées, sans retry automatique des écritures/commits. La démonstration reste sur
ses fichiers locaux : aucun état ni aucune identité personnelle n’a été basculé
vers Neon. Preuve publique `preuve-postgresql.json` ; URLs et mots de passe privés.

Le contrôle TLS initial fondé sur `pg_stat_ssl` a été corrigé pour mesurer le
socket client chiffré et le certificat autorisé devant le proxy Neon. Les
connexions des services utilisent le même paramétrage sécurisé, avec plafond de
pool et délai de connexion borné. Deux tests vérifient que les options URL ne
désactivent pas TLS et qu’un protocole non PostgreSQL est refusé.

L’hébergement Free est préparé avec une instance et deux processus supervisés,
avec filtrage des secrets par rôle. Les fichiers existent, mais aucun démarrage
Render ni déploiement Sepolia n’est annoncé comme effectué. La démonstration
locale et le broker flespi restent inchangés.

Contrôle final Neon : aucune ligne de sonde restante et aucun scope applicatif migré. La suite technique complète compte 28 scénarios réussis (7 contrats, 7 protocole, 1 SIWE, 2 indexeur, 5 EMQX/chiffrement, 4 flespi, 2 options PostgreSQL). Contrôle TypeScript et build web réussis.
