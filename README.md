# SmartHome G25

Maison intelligente : identité des objets et contrôle d’accès décentralisé. Projet du groupe 25, Blockchain et cryptomonnaies, Master 1, UNIKIN. Produit et documentation en français. Aucun paiement, jeton, NFT ou fonds réel.

**État : prototype local vérifié et contrats déployés sur Sepolia ; application publique non encore hébergée.** Le parcours serrure et les mises à jour inertes traversent les vrais contrats Hardhat, un broker MQTT TLS authentifié et le simulateur Node. Les preuves sont dans [docs/preuve-parcours-local.json](docs/preuve-parcours-local.json) et [docs/preuve-micrologiciels-local.json](docs/preuve-micrologiciels-local.json). Les adresses locales ne sont pas valides sur Sepolia. L’exigence académique d’accès public reste à satisfaire.

Membres : MUMBERE MITHIMBO DIEME, LUANDA MURAIRI BERNARD, BAZEBANZEA LIPEKENE ENOC, MOMBIMBO N’SIESI XAVIER.

## Contrats Sepolia

Déploiement du 24 octobre 2026, confirmé par RPC :

- [SmartHomeRegistry](https://sepolia.etherscan.io/address/0x67FC7dE3eAf196c2C526Fd8f5c13886B5129676c)
- [FirmwareRegistry](https://sepolia.etherscan.io/address/0x971C66172841f71D49936cc38b17d031dC175415)

Présence du code, signataire de passerelle, administrateur et autorisations fabricant des trois modèles contrôlés. Voir [la preuve](docs/preuve-deploiement-sepolia.json) et [les adresses et ABI](deployments/sepolia.json). Le code source n’est pas encore vérifié sur l’explorateur. Aucun parcours applicatif de bout en bout sur Sepolia ni hébergement public n’est encore validé. Les objets locaux ne sont pas automatiquement enregistrés sur ce réseau.

## Installation et démarrage en une commande

```bash
npm run install:local   # dépendances npm, Chromium, Slither et génération PDF
npm run local:start     # chaîne, MQTT TLS, passerelle, simulateur et interface
```

Ouvrir ensuite **http://127.0.0.1:5173**. La commande de démarrage conserve les services déjà actifs. Si la chaîne locale est vide, elle prépare les contrats et les identités de démonstration en archivant l’état précédent. Elle ne remplace pas un service inconnu sur les ports utilisés. `Ctrl+C` arrête uniquement les processus lancés par cette commande. Les journaux restent dans `.local/logs/`, ignoré par Git.

L’outillage Python est installé dans `.local/tools-venv`, sans modifier Python système. Pour reconstruire le rapport : `.local/tools-venv/bin/python scripts/build-report.py`. Pour Slither, utiliser ce même environnement et la commande de [SECURITE.md](docs/SECURITE.md), avec `VIRTUAL_ENV="$PWD/.local/tools-venv"`.

Le serveur utilise le stockage atomique local par défaut : PostgreSQL externe et IPFS public ne sont pas nécessaires à cette démonstration. Les comptes d’hébergement, le portefeuille personnel et les accès Sepolia demeurent distincts de l’installation locale.

## Démarrage Ubuntu sans Docker

Node 22.22.1 et npm, OpenSSL. `npm ci` installe les versions verrouillées. Il n’est pas nécessaire d’installer un nœud Ethereum complet. Tous les services locaux écoutent sur les ports indiqués ; ne pas exposer Hardhat sur Internet.

```bash
npm ci
npm test                 # réseau de test éphémère sur 18545, fermé à la fin
npm run typecheck
npm run build
```

Pour la démonstration, utiliser des terminaux distincts dans la racine du dépôt :

```bash
# Terminal 1
npm run chain            # Hardhat loopback : 8545
# Terminal 2, attendre que le réseau soit prêt
npm run local:setup      # compilation, TLS local, identités fictives, contrats, 3 objets
# Terminal 3
npm run local:broker     # MQTT TLS authentifié : 8883
# Terminal 4
npm run local:gateway    # API : 3001
# Terminal 5
npm run local:simulator  # Raspberry Pi et trois identités distinctes ; santé : 3002
# Terminal 6
npm run dev              # http://localhost:5173
# Terminal 7, après démarrage des services
npm run demo             # invité refusé, autorisation, serrure, accusé, ancrage, révocation
npm run demo:firmware    # installation saine, fichier altéré, invité, rejeu, rollback
npm run test:transport   # refus anonyme et isolation des sujets MQTT
npx playwright install chromium
npm run test:e2e         # bureau 1320 px et mobile 390 px
```

`local:setup` réinitialise les identités de démonstration : arrêter les services avant de le relancer. Il archive l’état précédent sous `.local/archive/`. Ne pas conserver le même état après un nouveau déploiement ou un redémarrage à vide de Hardhat. `.local/` contient des secrets de développement : ne jamais le publier, le joindre au rapport ou le copier dans un frontend. Les scripts n’affichent pas ces clés.

Les scripts automatiques utilisent des portefeuilles synthétiques de test, distincts pour les rôles. Les essais Playwright émulent le fournisseur de portefeuille tout en signant réellement les messages et transactions localement. Ils ne prouvent pas un fonctionnement manuel de MetaMask sur Sepolia.

## Essai manuel avec votre propre portefeuille

Pour que votre portefeuille soit propriétaire, arrêter les services et préparer une maison sans enregistrement automatique : `LOCAL_MANUAL=1 npm run local:setup`, puis relancer broker, passerelle et simulateur. Ajouter dans le portefeuille le réseau local `http://127.0.0.1:8545`, chainId 31337, monnaie de test ETH. Attribuer un solde fictif à son **adresse publique** : `npm run local:fund -- 0xVotreAdresse`. Ne jamais fournir sa clé privée ou sa phrase de récupération.

`npm run local:identities` affiche uniquement les identifiants et adresses publiques des objets provisionnés. Connecter le portefeuille dans l’application, puis utiliser « Enregistrer un objet » pour LOCK-01/G25-LOCK, PLUG-01/G25-PLUG et CAM-01/G25-CAM avec leurs adresses publiques respectives. Le propriétaire signe lui-même les transactions. Les clés d’objets restent dans le simulateur. Le guide `/demo` reste accessible sans portefeuille. Les scénarios automatiques supposent le seed automatique, pas ce mode manuel.

## Projet

`packages/contracts` contient SmartHomeRegistry, FirmwareRegistry et les tests. `packages/shared` définit les schémas, domaines EIP-712 et le stockage. `apps/gateway` porte SIWE, API, indexation et outbox MQTT. `apps/simulator` émule les trois objets et les mises à jour sans exécuter les fichiers. `apps/web` contient l’interface React adaptative. Les actions sont LOCK/UNLOCK, ON/OFF et ACTIVATE/DEACTIVATE. La caméra ne produit aucune vidéo.

Le tableau de bord reprend [Figma, nœud 3:281](https://www.figma.com/design/qL1MeNPZDy0sQXPR9KT4id?node-id=3-281), avec états et compteurs issus des services. Les valeurs fictives de Figma ne sont pas des preuves. Les écrans secondaires suivent les règles du dossier ; aucune conformité pixel par pixel des 40 cadres n’est annoncée. Les composants Button et Input Field de Simple Design System servent de référence visuelle, sans package React supposé disponible.

## Vérifications et documentation

- [Architecture et limites](docs/ARCHITECTURE.md)
- [API](docs/API.md) et [OpenAPI](docs/openapi.json)
- [Sécurité et alertes analysées](docs/SECURITE.md)
- [Résultats et critères d’acceptation](docs/RESULTATS.md)
- [Déploiement Sepolia, Render, Vercel, MQTT et IPFS](docs/DEPLOIEMENT.md)
- [Rapport académique PDF](output/pdf/Rapport_SmartHome_G25.pdf), [source](docs/RAPPORT.md) et [support de soutenance](docs/SOUTENANCE.md)
- [Références et dépendances](docs/REFERENCES.md)

Les journaux de tests, rapports Slither/npm et captures authentiques sont dans `docs/`. Les preuves en gas concernent uniquement les reçus locaux effectivement exécutés, avec compilation 0.8.30, EVM Cancun et optimisation 200 passages. Aucun prix fiat extrapolé. Tokenomics : non applicable.

## Remise

Le PDF officiel exige une URL publique fonctionnelle, un dépôt distant et les liens des contrats vérifiés. Ils ne sont pas encore disponibles. Configurations prêtes : `.env.example`, `render.yaml`, `vercel.json`, ACL MQTT et CI sans déploiement automatique. Aucun achat ni publication n’a été effectué.

Remise numérique indiquée : avant le 2 novembre 2026 à 23 h 59 ; version physique le même jour avant 17 h. Adresse : labcoursjk@gmail.com ; objet adapté au groupe : Projet-BC&CRYPTO-25-2026-M1. Aucun email n’est envoyé automatiquement. Le PDF annonce « samedi 03 novembre 2026 » alors que le 3 novembre 2026 est un mardi : faire confirmer cette incohérence par l’enseignant.

### Plusieurs comptes : démarrage et accès

Dans **Comptes et configuration**, chaque compte authentifié voit son adresse,
les propriétaires des trois identités de démonstration et l’administrateur des
fabricants. Ces adresses viennent des contrats ; aucune sélection de rôle ne
confère de droit. Les données d’activité restent filtrées par les permissions.

Pour les objets préenregistrés, l’opérateur local peut donner un accès explicite :

```bash
npm run local:access -- 0xADRESSE_PUBLIQUE_COMPLETE LOCK-01 1
```

Remplacer l’adresse par celle du bénéficiaire. La durée est en heures, au maximum 24. Cette commande remplace les permissions de cet utilisateur pour cet objet,
accorde les actions du modèle et complète un solde local trop faible avec des
fonds fictifs. Elle exige Hardhat 31337 et le véritable propriétaire de préparation.
Elle refuse les objets révoqués ou appartenant à un autre compte. Elle n’existe
pas sur Sepolia. Le bénéficiaire reconnecte son compte et retrouve l’objet ; le
propriétaire peut révoquer l’accès dans **Permissions**.

Pour une installation neuve dont les utilisateurs seront propriétaires, arrêter
les services applicatifs avant `LOCAL_MANUAL=1 npm run local:setup`, puis relancer
`npm run local:start`. Cette opération archive la configuration précédente et
déploie de nouveaux contrats : ne pas l’utiliser pour résoudre un simple refus
d’accès. Chaque utilisateur connecte ensuite son compte, reçoit des fonds fictifs
via `npm run local:fund -- 0xADRESSE`, puis choisit un objet disponible dans
**Enregistrer un objet**. Son identifiant, son modèle et son adresse publique sont
préremplis. Le compte signe sa propre transaction et devient propriétaire de cet
objet. D’autres comptes peuvent enregistrer les autres objets disponibles.

Sur Sepolia, les objets sont enregistrés par leurs propriétaires réels et les
identités publiques sont fournies lors du provisionnement des appareils ; les
clés privées restent côté simulateur. Le premier enregistrement n’est pas une
preuve de possession physique : ce prototype suppose un provisionnement de
confiance. Les ETH de test proviennent d’un faucet, jamais d’un achat requis.
L’administrateur connecté peut autoriser ou révoquer un fabricant dans **Comptes
et configuration** ; ces transactions restent contrôlées par le contrat.

Un invité peut aussi cliquer **Demander les actions de LOCK-01 pour une heure**
dans **Comptes et configuration**. Le véritable propriétaire voit la demande sur
la même page et clique **Approuver la demande** (transaction dans son portefeuille)
ou **Refuser la demande**. L’approbation accorde les actions du modèle pour la
durée restante de la demande ; les permissions peuvent être modifiées et
révoquées dans **Permissions**. Les demandes et leurs statuts sont privés au
demandeur et au propriétaire. Après expiration, une nouvelle demande est possible.
Pour le propriétaire technique préconfiguré, la commande locale ci-dessus reste
le moyen explicite d’accorder l’accès sans exposer sa clé privée.

### Aperçu webcam local

Sur la fiche de `CAM-01`, envoyer **Activer**, confirmer la transaction et attendre
l’état actif confirmé par le simulateur. Cliquer ensuite sur **Ouvrir la webcam**
et autoriser la caméra dans le navigateur. Un contexte sécurisé est requis :
`http://127.0.0.1`, `http://localhost` ou HTTPS. La vidéo provient de l’ordinateur
qui ouvre la page, pas d’une caméra distante connectée au Raspberry Pi.

L’aperçu utilise `getUserMedia({video:true,audio:false})` et reste dans le navigateur :
aucun enregistrement, envoi au serveur, transfert MQTT ou stockage sur chaîne.
**Arrêter l’aperçu** libère la webcam sans modifier l’état simulé de CAM-01.
**Désactiver** modifie cet état après confirmation du simulateur et ferme l’aperçu.
Le flux est aussi libéré en quittant la fiche, en changeant de compte, après
révocation/perte d’accès ou lorsque la présence signée dépasse 45 secondes.

En cas de refus, autoriser la caméra dans les paramètres du site et réessayer.
Une webcam absente ou occupée produit un message explicite. Le démarrage nécessite
un clic : une commande d’activation ne donne pas automatiquement accès à la webcam.

### Ajouter plusieurs objets à son compte — simulateur local

Dans **Objets connectés → Enregistrer un objet**, renseigner le **Nom de mon
appareil**, choisir serrure (`G25-LOCK`), prise (`G25-PLUG`) ou caméra (`G25-CAM`),
puis cliquer **Préparer cet appareil**. Le serveur réserve une identité unique au
compte authentifié, génère sa clé privée et ses identifiants MQTT distincts dans
le stockage privé local. Seuls l’identifiant et l’adresse publique sont envoyés
au navigateur. Le broker et le simulateur prennent en charge l’appareil sans
redémarrage. Cliquer ensuite **Enregistrer sur chaîne** et confirmer dans
MetaMask : le contrat désigne le signataire comme propriétaire.

Un identifiant technique aléatoire évite les collisions entre comptes ; le nom
est libre et peut être modifié dans la fiche. Une annulation de transaction
conserve l’identité disponible dans la liste des objets provisionnés. Les objets
préparés par les autres comptes ne sont pas proposés. Les permissions sur chaîne
restent nécessaires pour leurs commandes et le partage. L’apparence, les actions,
les mises à jour compatibles et la webcam locale dépendent du modèle, jamais du
numéro de l’objet. Le stockage persiste au redémarrage ; les réservations sont
liées au registre. Limite actuelle du prototype : 100 objets préparés par compte
et par registre, trois modèles pris en charge.

L’automatisation du provisionnement utilise le stockage privé partagé entre les
services locaux. En mode Sepolia, elle nécessite le connecteur EMQX, ses accès de gestion HTTPS, PostgreSQL et la clé de chiffrement partagée. Sans ces paramètres, elle reste désactivée. La validation sur un broker externe réel reste nécessaire avant une utilisation hébergée. La réservation locale n’est pas une preuve de
possession physique ni une protection contractuelle contre un enregistrement
adverse ; le contrat actuel conserve son mécanisme de premier enregistrement.

### Broker externe : connecteur EMQX

L’automatisation dispose d’un connecteur pour l’API de gestion EMQX v5 compatible.
Voir la procédure [broker externe](docs/DEPLOIEMENT.md#automatisation-externe-emqx-intégrée-accès-réel-encore-requis)
pour les prérequis, les secrets serveur et les vérifications de transport.
`npm run broker:check` contrôle la configuration distante en lecture seule ;
`broker:gateway` prépare l’identité technique de la passerelle ; `broker:key`
génère une clé privée de chiffrement sans l’afficher ; `broker:retry` reprend les
identités en attente. Les contrôles de compte et l’enregistrement MetaMask sont
conservés. Le simulateur découvre les appareils prêts via PostgreSQL chiffré.
Aucun accès réel EMQX/PostgreSQL n’est encore configuré ou validé dans ce dépôt.

### flespi Free

Le transport MQTT de la démonstration est maintenant configuré sur **flespi réel**,
avec les contrats sur **Hardhat local**, les trois propriétaires et leurs clés
inchangés. Aucun déploiement Sepolia n’est encore effectué. Les jetons flespi
sont exclusivement dans les fichiers privés `.local/` ; ne pas partager ces fichiers.
Voir [la procédure flespi](docs/DEPLOIEMENT.md#alternative-flespi-free--transport-externe-validé)
pour le contrôle, la bascule, les limites et le retour au broker local.

### PostgreSQL et hébergement : état de préparation

Neon est joignable avec vérification TLS et le schéma SmartHome est installé.
`npm run db:check`, `db:migrate` et `db:test` utilisent le fichier privé
`.local/external/postgres.env`. Les données locales ne sont pas migrées.
Le modèle Render gratuit utilise une instance pour la passerelle et le simulateur
(`hosted:start`), avec mise en veille possible : voir DEPLOIEMENT.md.
L’application publique et Sepolia restent à configurer et vérifier.
