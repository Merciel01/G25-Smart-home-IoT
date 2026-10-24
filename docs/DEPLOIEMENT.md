# Déploiement préparé, accès externes à compléter

Les contrats Sepolia sont déployés ; aucun service applicatif public n’a encore été déployé ou déclaré vérifié. Les adresses dans `deployments/local.json` ne valent que pour l’instance Hardhat correspondante. Elles ne sont pas des adresses Sepolia.

## Prérequis fournis par le groupe

Un dépôt distant ; une URL RPC Sepolia ; un portefeuille de déploiement dédié avec ETH de faucet sans valeur ; les adresses publiques du fabricant et de la passerelle ; les clés techniques distinctes stockées dans les secrets du service ; un broker MQTT TLS avec certificats valides et ACL ; une base PostgreSQL persistante ; un endpoint Kubo authentifié qui épingle les fichiers ; des comptes Render et Vercel. Ne fournir aucun secret dans ce chat ou dans un fichier commité.

Le choix d’une offre qui assure le fonctionnement continu doit être validé par le groupe. Le fichier Render est un modèle ; aucune souscription n’est effectuée. Les restrictions de veille, stockage et expiration des offres doivent être vérifiées dans les comptes retenus. Aucun engagement de gratuité permanente.

## Contrats Sepolia

1. `npm ci && npm run compile` ; configurer uniquement les variables nécessaires au script : `RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `GATEWAY_SIGNER_ADDRESS`, `MANUFACTURER_ADDRESS`.
2. `npm run deploy:sepolia`. Le script refuse tout chainId autre que 11155111. Il déploie les deux contrats et autorise le fabricant pour les trois modèles, sans enregistrer arbitrairement les objets d’un autre propriétaire.
3. Consulter `deployments/sepolia.json` : adresses, transactions, bloc, ABI et compilation. Ne copier aucune adresse d’exemple Figma.
4. Avec `ETHERSCAN_API_KEY`, `GATEWAY_SIGNER_ADDRESS` et `DEPLOYER_ADDRESS` (adresse publique de l’administrateur initial), lancer `npm run verify:sepolia`. Le script soumet le standard JSON et attend la réponse de l’explorateur. Cette étape n’a pas été exercée contre un compte réel ; contrôler les paramètres et le service avant utilisation. `verified` ne passe à true qu’après les deux confirmations de l’API.
5. Reporter les liens exacts de l’explorateur dans le README et vérifier le code affiché publiquement.

## Services

`render.yaml` définit une seule instance Web gratuite exécutant la passerelle et le simulateur dans deux processus. Configurer les groupes `g25-public-config` et `g25-server-secrets` avant de créer le Blueprint. Le lanceur filtre les variables privées selon le processus ; les deux processus partagent toutefois le même conteneur et la même base PostgreSQL. Le simulateur ne reçoit aucune clé de déploiement, de fabricant ou de propriétaire. Le frontend ne reçoit que `VITE_API_BASE_URL` et lit la configuration publique depuis l’API. `deploy/render-separated.yaml` reste une variante à deux services ; ce n’est pas le modèle gratuit retenu.

La migration versionnée est appliquée à l’initialisation du stockage. Utiliser un compte de migration disposant des droits nécessaires, puis prévoir une séparation des rôles SQL avant production. Le document gateway peut contenir des preuves et de la métadonnée fictive ; aucune clé privée. Sauvegarde : `pg_dump --format=custom --file=backup-g25.dump "$DATABASE_URL"`, sans afficher la variable ni publier le dump. Tester la restauration sur une base distincte.

Le broker TCP/TLS doit être fourni séparément : Vercel et l’API HTTP du gateway ne le remplacent pas. Générer les ACL publiques avec `npm run mqtt:acl`, créer les mots de passe par utilisateur hors dépôt et appliquer l’exemple `deploy/mqtt/mosquitto.conf`. Chaque objet lit uniquement son sujet `commands` et écrit uniquement `acks`/`status`. La passerelle lit les accusés/états et écrit les commandes. Le broker local Aedes est réservé au développement, écoute uniquement sur loopback et utilise un certificat local.

Pour IPFS, le endpoint Kubo doit accepter `/api/v0/add?pin=true&cid-version=1` avec authentification Bearer par proxy HTTPS. Tester l’épinglage puis le téléchargement depuis le simulateur hébergé. Le mode local de fichiers ne démontre pas la disponibilité IPFS publique.

Vercel : sélectionner la racine du monorepo, utiliser `vercel.json`, définir `VITE_API_BASE_URL` vers la passerelle HTTPS. Build `npm run build:web`, sortie `apps/web/dist`, réécriture SPA pour les routes. Ne publier aucun fichier `.local` dans un artefact.

## Vérifications avant remise

Depuis un autre appareil et en navigation privée : charger l’URL HTTPS, connecter deux portefeuilles Sepolia distincts, enregistrer trois adresses d’objets provisionnées hors navigateur, tester refus invité puis droit temporaire, commande et lien de preuve, révocation, mise à jour signée puis fichier altéré, mauvais modèle et rollback. Tester un redémarrage du gateway et du simulateur, une panne RPC/broker/IPFS et l’état hors ligne. Confirmer PostgreSQL, ACL TLS, épinglage et téléchargement public. Conserver captures et transactions réelles de ce réseau. Jusqu’à ces essais, les critères d’accessibilité publique ne sont pas satisfaits.

### Provisionnement public pour le premier propriétaire

Configurer `PUBLIC_DEVICE_IDENTITIES_JSON` dans la passerelle (groupe public), sous la forme d’un objet JSON associant `LOCK-01`, `PLUG-01` et `CAM-01` à leurs adresses publiques de signature. Elles doivent correspondre aux clés conservées uniquement dans le simulateur. Les propriétaires connectent leurs propres portefeuilles et signent leurs enregistrements ; aucun propriétaire de démonstration n’est préenregistré par le déploiement Sepolia. L’administrateur du registre des fabricants reste le déployeur et peut gérer les fabricants depuis Comptes et configuration. Les demandes d’accès sont stockées dans PostgreSQL ; leur approbation exige une transaction du propriétaire.

### Automatisation externe EMQX (intégrée, accès réel encore requis)

Le connecteur cible un broker disposant de l’API de gestion EMQX v5 compatible,
avec gestion des utilisateurs et des ACL en base intégrée. Une offre ne donnant
pas accès à ces routes ne convient pas à cet adaptateur. Aucun compte hébergé,
abonnement ou déploiement distant n’a été créé par cette intégration.

1. Préparer un broker MQTT TLS (`mqtts://…:8883`) avec certificat vérifiable et une
   API de gestion HTTPS. Configurer l’authentification intégrée **par username**
   comme seul authentificateur actif, l’autorisation intégrée en première source
   et `no_match=deny`. L’adaptateur contrôle ces prérequis et refuse de modifier
   une configuration incompatible. Configurer aussi le refus des connexions
   anonymes et un paquet maximal compatible avec les enveloppes du projet.
2. Créer des identifiants de gestion dédiés ayant accès aux routes d’authentification
   et d’autorisation. Renseigner **sur la passerelle seulement**
   `BROKER_PROVISIONING_DRIVER=emqx`, `BROKER_API_URL` (origine HTTPS, sans `/api/v5`),
   `BROKER_API_KEY`, `BROKER_API_SECRET`, ainsi que `MQTT_PREFIX` propre à cette
   installation. Les secrets ne vont ni dans le frontend ni dans le dépôt.
3. Exécuter `npm run broker:check` : lecture seule des prérequis de l’API.
   Puis préparer un compte passerelle dédié avec `MQTT_USERNAME` et
   `MQTT_PASSWORD` (au moins 32 caractères aléatoires) et exécuter
   `npm run broker:gateway`. Cette dernière commande écrit l’utilisateur et ses
   ACL ; utiliser un nom dédié au projet, jamais un compte existant d’un autre
   service. Elle refuse un utilisateur superuser préexistant.
4. Exécuter `npm run broker:key` une fois. La clé AES-256 est créée dans
   `.local/external/provisioning-key.secret` (0600), jamais affichée. Copier sa
   valeur dans `PROVISIONING_ENCRYPTION_KEY` des secrets serveur de la passerelle
   **et** du simulateur. Conserver la clé en sauvegarde privée ; changer sa valeur
   sans migration rendrait les identités existantes illisibles. Même
   `DATABASE_URL` PostgreSQL côté passerelle et simulateur. Seul le provisionneur
   écrit le scope `provisioning` ; les secrets d’appareils y sont chiffrés avec
   authentification AES-GCM, liés au registre, identifiant, compte et modèle.
5. Après déploiement des contrats de test et configuration des adresses serveur,
   démarrer les deux services en mode Sepolia. Pour une installation vide,
   `DEVICE_KEYS_JSON={}` et `DEVICE_MQTT_CREDENTIALS_JSON={}` côté simulateur
   suffisent : les nouveaux appareils proviennent du scope PostgreSQL chiffré.
   Le navigateur prépare une identité, le provisionneur pose ses ACL avant
   d’activer ses credentials, puis vérifie utilisateur et règles par relecture.
   Une réussite active la découverte du simulateur ; le compte utilisateur signe
   ensuite son enregistrement sur chaîne.
6. Si une API échoue, l’identité reste `pending`, chiffrée, et n’est pas chargée
   par le simulateur. Le bouton de reprise réutilise la même identité avec un
   contrôle de compte ; `npm run broker:retry` permet une reprise opérateur des
   réserves en attente du registre configuré. Les écritures par identité sont
   idempotentes ; aucun identifiant n’est publié avant confirmation.

La passerelle ne peut publier que les commandes du préfixe et lire les accusés
et statuts ; chaque objet ne lit que son topic de commandes et ne publie que ses
accusés/statuts, sans retained. Les autres topics sont refusés. Les subscriptions
utilisent le comparateur exact `eq`, en plus du refus par défaut.

**Validation externe encore nécessaire** : TLS réel, connexion anonyme refusée,
credentials appareil valides, refus de lecture/écriture croisée, retained refusé,
reprise après coupure du broker, persistance PostgreSQL après redémarrage et une
commande Sepolia réelle avec accusé ancré. Les tests d’API simulée ne remplacent
pas ces vérifications. `broker:check` seul ne prouve pas ces propriétés de transport.

Références primaires : [API utilisateurs EMQX](https://docs.emqx.com/en/emqx/latest/guides/access-control/authn/user_management.html),
[ACL en base intégrée](https://docs.emqx.com/en/emqx/latest/guides/access-control/authz/mnesia.html),
[schémas REST compatibles EMQX Dedicated](https://docs.emqx.com/en/cloud/latest/api/dedicated.html).

`npm run broker:transport` prépare une identité de sonde temporaire, teste TLS,
le refus anonyme, la souscription propre et le refus de lecture croisée, puis
supprime son utilisateur et ses ACL. Cette commande écrit donc une identité de
test sur le broker configuré, sans clé Ethereum ni transaction blockchain. Une
panne réseau n’est pas traitée comme une preuve de refus d’accès. Un nettoyage
non confirmé signale le nom public de la sonde pour vérification opérateur.
Ce contrôle n’atteste pas les refus de publication croisée ou retained : ceux-ci
restent dans les vérifications externes requises avant Sepolia.

### Alternative flespi Free — transport externe validé

L’adaptateur `BROKER_PROVISIONING_DRIVER=flespi` est disponible. Le jeton Maître
`FLESPI_TOKEN` reste privé côté passerelle ; il crée des jetons ACL distincts pour
la passerelle MQTT et chaque objet. Les clients MQTT utilisent leur propre jeton
comme username et un password vide. URL : `mqtts://mqtt.flespi.io:8883`, CA système,
aucun contournement TLS. Le préfixe propre à cette installation est conservé dans
la configuration privée. Les clés Ethereum ne sont jamais envoyées à flespi.

- `npm run flespi:check` : lecture seule de la validité et des droits du jeton
  dans `.local/external/flespi.env`.
- `npm run flespi:transport` : crée deux jetons de sonde restreints sous un préfixe
  aléatoire isolé, vérifie les échanges réels et la non-livraison croisée, puis
  supprime uniquement ces sondes.
- `npm run flespi:connect-local` : services applicatifs arrêtés, archive runtime
  et provisionnement, prépare les jetons ACL de la passerelle et des objets
  existants puis configure le transport flespi. Ne redéploie aucun contrat et ne
  change aucun propriétaire. Relancer `npm run local:start` ensuite.

Les identités flespi sont retrouvées par un marqueur stable et leurs ACL sont
relues avant activation ; un jeton ayant des droits plus larges est refusé. En
cas de reprise après panne, le même marqueur évite une nouvelle identité. Les
jetons ACL restent privés et sont chiffrés dans PostgreSQL en mode Sepolia. La
passerelle persiste les credentials réellement retournés par flespi avant de
marquer la réserve prête. Le simulateur n’a pas besoin du jeton Maître ; le
lanceur local le retire de son environnement.

L’offre Free documente 50 sessions MQTT au total. Le prototype limite donc la
préparation à 49 appareils par installation, en comptant aussi les trois objets
initiaux éventuels. La passerelle prend une session ; les consoles MQTT et sondes
prennent des sessions supplémentaires. Fermer ces connexions ou garder une marge
avant d’atteindre le plafond. Les quotas, conditions d’inactivité et durée des
jetons restent applicables : ni gratuité ni disponibilité perpétuelles garanties.
Le TTL des jetons générés est de 30 jours depuis leur dernière utilisation ; le
jeton de gestion doit également rester valide ou être renouvelé.

Différences de transport : flespi peut accepter une souscription sans livrer les
messages non autorisés. Les tests vérifient donc les messages effectivement
reçus, avec témoins positifs, au lieu d’exiger un SUBACK négatif. Son schéma ACL
ne permet pas le filtre `retain:false` d’EMQX. Les producteurs du projet envoient
sans retained, les consommateurs refusent les messages retenus et conservent les
contrôles de signature/nonce/deadline. Le refus de retained au niveau broker
n’est pas revendiqué pour flespi.

Retour au broker local : arrêter les services applicatifs, restaurer runtime.json
et provisioning.json depuis l’archive privée `.local/archive/flespi-*` précédant
la bascule (permissions 0600), puis relancer la pile. Les fichiers de preuve
restent liés au transport indiqué dans chaque rapport.

Pour Sepolia, configurer le même driver, le préfixe et les jetons privés dans les
secrets d’hébergement, PostgreSQL partagé et la clé AES commune, puis déployer et
vérifier les contrats de test. Le succès du broker externe ne constitue pas un
déploiement Sepolia ni une preuve de disponibilité publique de l’application.
Références : [broker flespi](https://flespi.com/mqtt-broker),
[jetons](https://flespi.com/kb/tokens-access-keys-to-flespi-platform),
[schéma officiel de l’API](https://flespi.io/platform/api.json),
[quotas](https://flespi.com/en/docs/restrictions).

### PostgreSQL Neon — connexion préparée

Le secret est fourni dans `.local/external/postgres.env` (0600). `npm run db:check`
vérifie une connexion **directe**, le chiffrement du socket client et son
certificat. La vue SQL `pg_stat_ssl` peut indiquer une liaison différente derrière
le proxy ; elle ne sert plus à conclure à l’absence de TLS sur la connexion
cliente. `npm run db:migrate` applique la migration transactionnelle idempotente.
`npm run db:test` utilise une seule ligne à identifiant aléatoire, vérifie huit
mutations concurrentes, rollback et persistance après réouverture, puis supprime
la sonde. Les erreurs sont limitées aux étapes/codes, jamais aux URLs ou mots de
passe. Les paramètres URL ne peuvent désactiver la vérification du certificat.
Les reconnexions de lecture du test tolèrent deux reprises bornées après timeout ;
les écritures de l’application ne sont pas répétées automatiquement en cas de
commit incertain.

Les tables existent et le stockage réel a été testé ; aucun état gateway,
simulator ou provisioning de la démonstration locale n’est transféré. La base
servira à l’installation Sepolia, liée à ses propres adresses de contrats. Les
états locaux et leurs clés restent dans `.local` pour éviter tout mélange de
réseaux. La disponibilité continue n’est pas garantie par le quota gratuit Neon.

### Modèle Render gratuit révisé

Le `render.yaml` par défaut prépare **une instance web Free** pour deux processus,
lancée par `npm run hosted:start`. Cela évite de prévoir deux instances continues
sur le quota mensuel partagé de 750 heures. Le public n’accède qu’au port de la
passerelle ; le simulateur utilise son port interne et appelle la passerelle en
loopback. Le lanceur retire les clés d’objets de l’environnement de la passerelle,
et les clés de gestion flespi/signature/relais de celui du simulateur ; ce n’est
pas une isolation OS entre deux conteneurs. Les clés AES et PostgreSQL nécessaires
restent partagées. Les clés de déploiement et de vérification ne sont transmises
à aucun processus. Si un processus s’arrête, le superviseur arrête l’autre pour
que l’hébergeur puisse redémarrer l’ensemble. Aucun ping artificiel n’empêche la
veille.

Le groupe `g25-public-config` contient les adresses de contrats, bloc de départ,
MQTT_URL/PREFIX, origines HTTPS et URL publique IPFS. Le groupe privé
`g25-server-secrets` contient DATABASE_URL, RPC_URL si authentifiée, FLESPI_TOKEN,
MQTT_USERNAME (jeton ACL passerelle), GATEWAY_SIGNING_KEY, GATEWAY_RELAYER_KEY,
PROVISIONING_ENCRYPTION_KEY et IPFS_API_URL/TOKEN. Ne pas utiliser une clé
Hardhat publiée ou un portefeuille détenant des fonds réels.

L’ancien modèle à deux services est conservé dans `deploy/render-separated.yaml`
comme variante ; ses noms de groupes de secrets diffèrent. Il n’est pas le modèle
Free choisi par défaut. Une instance Free peut dormir après 15 minutes sans
activité entrante et redémarre à l’ouverture de l’application. Pendant la veille,
les simulateurs sont hors ligne et aucune exécution immédiate n’est garantie.
Les quotas Neon et Render peuvent limiter l’usage prolongé : cette configuration
vise une démonstration gratuite à la demande, pas une maison disponible 24/7.

Le lanceur hébergé n’a pas été exécuté sur Render : seuls sa syntaxe et son refus
du mode local ont été vérifiés. Le démarrage public, le redémarrage simultané,
les secrets d’hébergement et les transactions Sepolia doivent encore être testés.
Références : [limites Render Free](https://render.com/docs/free),
[quota Neon Free](https://neon.com/blog/neon-free-plan-1-gb-per-project).
