# Maison intelligente : identité des objets et contrôle d’accès décentralisé

## Groupe 25 — UNIKIN

Cours de Blockchain et cryptomonnaies. Master 1, mention Mathématiques, Statistiques et Informatique, Faculté des Sciences et Technologies.

MUMBERE MITHIMBO DIEME ; LUANDA MURAIRI BERNARD ; BAZEBANZEA LIPEKENE ENOC ; MOMBIMBO N’SIESI XAVIER.

Rapport technique du prototype. Version du 24 octobre 2026. Le projet fonctionne localement ; l’accès public, le déploiement Sepolia et les essais depuis un autre appareil restent à valider. Ce document ne constitue pas une attestation de mise en ligne.

## Problème et objectifs

Une maison connectée doit attribuer une identité à chaque objet et limiter les commandes aux personnes autorisées. Un transport MQTT à lui seul ne prouve ni le droit de commander ni l’origine d’une réponse. Une empreinte de fichier seule ne prouve pas l’identité du fabricant.

Le sujet officiel du groupe 25 impose l’identité sur chaîne de la serrure, de la caméra et de la prise ; l’octroi et la révocation d’accès par le propriétaire via contrat ; la vérification d’une empreinte signée du fabricant avant installation ; le journal des commandes ; la révocation d’un objet compromis. Le PDF exige également un déploiement accessible en ligne, des tests et une analyse de sécurité.

Le dossier de réalisation précise les choix du prototype : React, Solidity, ethers, MQTT, Raspberry Pi simulé en Node.js et IPFS. Ces choix détaillés ne sont pas attribués à l’enseignant. Le projet n’émet aucun jeton et ne reçoit aucun paiement. Tokenomics : non applicable. Les comptes et pièces affichés sont des données de démonstration.

## Architecture sur chaîne et hors chaîne

SmartHomeRegistry conserve les identités, propriétaires, signers d’objets, modèles, révocations, permissions, demandes et résultats authentifiés. FirmwareRegistry gère les autorisations de fabricants et les références des versions signées. Les noms d’affichage, dernières présences, états détaillés, sessions et tentatives refusées restent hors chaîne.

Le propriétaire signe dans son portefeuille. Après confirmation, un indexeur HTTP crée un travail durable. La passerelle contrôle le droit courant, signe une enveloppe et la publie sur MQTT TLS. Le simulateur vérifie cette enveloppe, la demande courante et la destination. Il affecte un état, persiste un accusé signé avec la clé de l’objet et l’envoie au gateway. Le relayer ancre cette preuve dans le contrat.

PostgreSQL est l’adaptateur prévu pour l’hébergement. Une migration versionnée crée deux documents JSONB par service avec clé primaire et mutations transactionnelles sous verrou de ligne. Ce choix est proportionné aux trois objets. Le développement utilise une écriture de fichiers atomique, explicitement limitée à un processus par scope. PostgreSQL externe et sa restauration n’ont pas été validés dans cet environnement.

La blockchain sécurise l’autorisation et la preuve déclarative, tandis que la passerelle et le broker restent nécessaires à la disponibilité. Un accusé prouve la déclaration du simulateur, sans observation physique indépendante.

## Contrats et autorisation

Un identifiant bytes32 et un signer unique identifient chaque objet. Les modèles limitent les actions compatibles : LOCK et UNLOCK, ON et OFF, ACTIVATE et DEACTIVATE. Le propriétaire est le compte qui enregistre l’objet. Un invité reçoit un masque d’actions avec expiration. Chaque modification incrémente une révision ; une permission réaccordée ne ressuscite donc aucune ancienne demande.

La demande possède un identifiant déterministe unique lié au réseau, au contrat, au demandeur et à son nonce. La durée proposée est 120 secondes, avec maximum de 600 secondes vérifié par le contrat. Le navigateur ne décide pas du droit : le temps du bloc reste la référence. La révocation d’objet est permanente.

L’accusé EIP-712 lie requestId, deviceId, action, résultat, empreinte d’état, date et nonce d’objet au réseau et au contrat. Le contrat vérifie la signature et interdit la double finalisation. Un accusé authentique tardif peut documenter une action passée après révocation, sans autoriser une nouvelle action.

Les contrats utilisent OpenZeppelin Ownable, EIP712 et ECDSA. Ils n’ont ni proxy, ni réception de fonds, ni appel arbitraire. Compilation reproductible : Solidity 0.8.30, optimisation 200 passages, EVM Cancun. Les ABI et références de compilation accompagnent les déploiements locaux.

## Transport MQTT et persistance

Le broker local utilise TLS et des comptes distincts. Un objet lit son sujet de commandes et écrit seulement ses accusés et son état. La passerelle écrit les commandes et lit les accusés et présences. Le navigateur ne possède aucun accès au broker.

L’indexeur déduplique par chainId, hash de transaction et index de log. Il conserve un curseur et le hash du bloc, relit une fenêtre de douze blocs et suspend les nouvelles transmissions pendant une reconstruction après réorganisation. Les demandes orphelines restent archivées ; une ambiguïté de transaction portant le même requestId entraîne un refus prudent.

L’outbox persiste la tentative avant publication. Un RPC indisponible empêche toute nouvelle transmission sensible. Le simulateur persiste l’affectation et l’accusé dans la même mutation. Une retransmission renvoie le même accusé, sans seconde exécution. Les présences sont signées et l’interface cesse de considérer un objet en ligne après 45 secondes sans présence récente.

La fenêtre entre validation et action reste inévitable. Une révocation ne peut annuler un message déjà en vol ou une action passée. Après timeout, le résultat peut être non confirmé plutôt qu’échoué avec certitude. Le système ne promet aucune exécution exactement une fois sur du matériel réel.

## Mises à jour signées

Les micrologiciels sont des fichiers inertes. Le fabricant autorisé choisit un fichier d’au plus 1 Mio. Le navigateur calcule SHA-256, le gateway authentifié téléverse les octets, puis le portefeuille fabricant signe modèle, version, empreinte, hash du CID et taille. Le contrat vérifie cette publication et impose des versions monotones.

Le CID canonique utilise CIDv1 base32 minuscule sans URL, chemin ou requête. Son hash keccak256 des octets UTF-8 est distinct du SHA-256 du fichier et du hash EIP-712. Le simulateur télécharge depuis une passerelle fixe, refuse les redirections, applique un timeout et limite la taille. Il relit le modèle, la signature, l’autorisation actuelle du fabricant et l’état de l’objet avant de persister la nouvelle version.

Le propriétaire signe une autorisation d’installation unique, liée à l’objet, à la version, au nonce et à une expiration. Un invité ou un fabricant ne peut pas forcer une installation. Le résultat de succès ou de refus est signé par l’objet. Le fichier ne passe jamais à un shell ou à eval.

Le parcours réel local a vérifié une installation saine, le refus d’un fichier altéré avec conservation de l’ancienne version, le refus d’un invité, du rejeu et d’un rollback. D’autres cas négatifs automatisés couvrent la fausse signature, le mauvais modèle, le fabricant révoqué, la taille excessive et IPFS indisponible. Le stockage local adressé par CID ne prouve aucun épinglage public.

## Interface et authentification

Le tableau de bord reprend la composition du nœud Figma 3:281 : navigation sombre, cartes blanches, primaire turquoise, indicateurs et activités récentes. Les données affichées proviennent de l’API et des contrats. Les adresses, compteurs et états fictifs de la maquette ne sont pas utilisés comme preuves.

Les 18 routes couvrent connexion, objets, permissions, commandes, micrologiciels, sécurité, journal, infrastructure, invité, fabricant et guide public. Les menus pertinents dépendent des capacités contractuelles. Les confirmations mentionnent l’objet et l’action. Le système distingue signature, transaction, confirmation, transmission, accusé et ancrage. Les formulaires restent accessibles au clavier ; les boutons tactiles atteignent 44 pixels. Une navigation mobile et des cartes fluides évitent le débordement à 390 pixels.

La session repose sur SIWE : nonce de cinq minutes, origine et domaine autorisés, chainId et signature. Le nonce est consommé une fois. Le jeton Bearer opaque dure quinze minutes, reste en mémoire dans le navigateur et n’est conservé que sous forme d’empreinte côté serveur. Les changements de compte ou de réseau invalident l’affichage authentifié. Les opérations d’autorisation restent des transactions signées dans le portefeuille.

Les tests Playwright utilisent un fournisseur de portefeuille émulé, avec de vraies signatures et transactions sur le réseau local. Un essai manuel de MetaMask sur Sepolia demeure nécessaire.

## Tests, sécurité et gas

Les sorties réelles sont conservées dans docs. La suite locale comprend sept scénarios de contrats, six du moteur de protocole, un d’authentification et deux d’indexation. Chaque scénario contient plusieurs assertions de refus et de cohérence. Les essais navigateur couvrent vingt cas au total sur bureau et mobile, avec une commande allant jusqu’à l’accusé authentifié.

Les preuves du parcours serrure et des mises à jour comportent transactions, empreintes, signatures et résultats. Les valeurs de gas sont tirées de reçus locaux effectivement exécutés et sont présentées dans RESULTATS.md. Elles ne sont ni un prix fiat, ni une mesure Sepolia, ni une garantie de coût pour un autre état de contrat.

Slither a analysé seize contrats, dépendances comprises, avec 102 détecteurs. Douze résultats subsistent : trois égalités de modèles constants signalées en sévérité moyenne, et neuf alertes faibles liées à l’horodatage ou à sa propagation. Les comparaisons de modèles sont intentionnelles. Les expirations utilisent le temps du bloc conformément au besoin. Les rapports bruts et justifications restent disponibles.

L’audit npm des dépendances d’exécution ne signale pas de vulnérabilité lors de l’exécution conservée. L’audit complet signale trois alertes élevées liées au zod transitoire de l’outillage Hardhat. L’application emploie directement une version zod corrigée ; Hardhat ne doit jamais être exposé publiquement. Ces alertes ne sont pas annoncées comme corrigées. Aucune analyse ici ne remplace un audit indépendant.

## Déploiement, limites et feuille de route

Les scripts de déploiement refusent tout réseau autre que Hardhat local pour le seed ou Sepolia pour l’hébergement. Les fichiers Render, Vercel, MQTT TLS et environnement sont préparés. Aucun compte externe n’a été provisionné, aucune offre payante souscrite et aucune mise en ligne annoncée.

Avant remise, le groupe doit fournir le RPC Sepolia, les portefeuilles de test, les secrets techniques de service, le broker TLS avec ACL, PostgreSQL persistant, l’épinglage IPFS et les comptes d’hébergement. Il doit déployer les deux contrats, vérifier le code sur l’explorateur, tester les services depuis un autre appareil en navigation privée et conserver des preuves Sepolia. Les URL publiques et le dépôt distant restent à compléter.

Les améliorations futures comprennent la normalisation du stockage pour une flotte, la rotation facilitée de l’identité du gateway, des tests de panne longs sur l’hébergement, l’étude de latence et de gas sur Sepolia, puis une installation matérielle conçue séparément avec son modèle de menace. Les vidéos et paiements demeurent hors périmètre de ce prototype.

La remise indiquée par le PDF est avant le 2 novembre 2026 à 23 h 59 pour le numérique, et le même jour avant 17 h pour le physique. Le groupe assure l’envoi à labcoursjk@gmail.com avec l’objet Projet-BC&CRYPTO-25-2026-M1. La mention officielle « samedi 03 novembre 2026 » contredit le calendrier, où le 3 novembre est un mardi ; l’enseignant doit confirmer le rendez-vous. Aucun email n’a été envoyé automatiquement.

## Reproduction et références

Installation : npm ci. Vérifications : npm test, npm run typecheck, npm run build. Démonstration : npm run chain, npm run local:setup, puis local:broker, local:gateway, local:simulator et dev dans des terminaux distincts. npm run demo et npm run demo:firmware produisent les preuves. npm run test:e2e vérifie les routes sur les deux formats. Le README précise le mode de portefeuille manuel sans demander de clé privée.

Sources académiques : PDF officiel fourni, pages 1, 9 et 11 ; dossier SmartHome_G25_INSTRUCTIONS_CODEX.md, version 1.0. Design : fichier Figma qL1MeNPZDy0sQXPR9KT4id, nœud 3:281. Sources techniques : documentations officielles OpenZeppelin, Hardhat, ethers, EIP-712, EIP-4361, MQTT.js, Aedes, IPFS, Slither, Render et Vercel. Toutes les URL figurent dans REFERENCES.md.

Dépendances réutilisées : React, Vite, TypeScript, ethers, OpenZeppelin, Solidity solc-js, Hardhat, Express, CORS, express-rate-limit, MQTT.js, Aedes, node-postgres, SIWE, zod, dotenv, Playwright, Prettier et Inter via Fontsource. Versions et intégrité : package.json et package-lock.json. Aucun jeton, IA, paiement ou donnée personnelle réelle sur chaîne.
