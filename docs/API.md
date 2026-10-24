# API SmartHome G25

Base locale `http://127.0.0.1:3001`. JSON. Spécification machine : `openapi.json`. Les actions métier d’autorisation passent par les transactions du portefeuille, jamais par une route execute.

Routes publiques : `GET /health`, `GET /public-config`, `GET /infrastructure`, `POST /auth/challenge`, `POST /auth/verify`, `GET /internal/executable/:requestId`. La dernière route ne retourne qu’un booléen public, refuse si la chaîne est indisponible et ne transmet aucune commande. `GET /ipfs/:cid` existe uniquement en mode local pour les fichiers inertes.

La requête challenge contient une adresse publique, avec en-tête `Origin` figurant dans ALLOWED_ORIGINS. Le serveur crée le message SIWE. Le portefeuille le signe, puis `/auth/verify` reçoit `{message, signature}` et retourne `{token, expiresIn:900, address}`. Conserver le token en mémoire, puis envoyer `Authorization: Bearer <token>`. Aucun cookie ou secret de service ne doit être envoyé au frontend. Nonce valable cinq minutes et consommé une fois. Le texte SIWE ne donne aucun droit supplémentaire.

| Méthode et route            | Données / accès                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| POST /auth/logout           | Révoque la session Bearer courante                                                                |
| GET /devices                | Identités et capacités accessibles, fabricant par modèle ; autorisation relue sur chaîne          |
| PATCH /devices/:id/metadata | `{name,room}`, 80 caractères chacun, propriétaire uniquement                                      |
| GET /permissions            | Propriétaire de l’objet ou bénéficiaire de l’entrée                                               |
| GET /commands               | `offset`, `limit` de 1 à 100, demandes du bénéficiaire ou du propriétaire                         |
| GET /commands/:requestId    | Demande filtrée, état de transmission et accusé signé, hash de preuve                             |
| GET /audit                  | `event`, `offset`, `limit`, événements visibles selon le rôle                                     |
| GET /firmware/:modelId      | Publications du modèle, CID, empreinte, signataire, taille et autorisation actuelle               |
| POST /firmware/upload       | `{modelId,bytes}` base64, fabricant autorisé, maximum 1 Mio décodé                                |
| POST /firmware/install      | `{deviceId,version,nonce,expiresAt,signature}`, propriétaire, autorisation EIP-712 à usage unique |
| GET /installations          | Résultats d’installation appartenant à la session, y compris refus signés                         |
| GET /events                 | SSE Bearer, événements refresh, fermeture à expiration de session                                 |

Les listes command/audit acceptent une pagination serveur, bornée à 100 éléments par requête et offset 100000. L’interface explore les cent entrées récentes et exporte uniquement celles déjà visibles. Le catalogue limite à cent publications récentes du modèle pour ce prototype. Les traces API refusées restent hors chaîne, séparées des événements Ethereum, sans requêtes brutes, cookies, clés ou tokens.

## Formats signés

Types et schémas exacts : `packages/shared/src/protocol.ts`. Domaine de commande et accusé : `{name:"G25Home",version:"1",chainId,verifyingContract:SmartHomeRegistry}`. Domaine fabricant : `G25Firmware`, version 1, chainId et adresse de FirmwareRegistry. Les messages sont signés avec `signTypedData` et vérifiés avec `verifyTypedData`/OpenZeppelin EIP712. Aucune signature sur un JSON.stringify non canonique.

Une commande comporte protocolVersion=1, chainId, registry, requestId, deviceId, action, requester, permissionRevision, issuedAt, expiresAt et signature de passerelle. Un accusé comporte requestId, deviceId, action, outcome, stateHash, executedAt, deviceNonce et signature d’objet. Les présences, installations et refus d’installation possèdent des types distincts pour éviter la confusion des signatures.

## Erreurs

Les refus incluent `{code,message}` : WALLET_REQUIRED (401), PERMISSION_DENIED (403), INVALID_INPUT / INVALID_NONCE / INVALID_ORIGIN / INVALID_SIGNATURE / DEVICE_REVOKED / COMMAND_EXPIRED / FILE_TOO_LARGE / REPLAY (400), DEPENDENCY_UNAVAILABLE (503). Un refus d’authentification cryptographique peut arriver comme refus générique sans divulguer le détail du parseur. Les résultats d’installation portent les codes HASH_MISMATCH, WRONG_MODEL, ROLLBACK_BLOCKED, IPFS_UNAVAILABLE, INVALID_SIGNATURE, PERMISSION_DENIED ou DEPENDENCY_UNAVAILABLE dans une déclaration signée.

Les statuts sont distincts : confirmée, transmise, accusé authentifié, exécutée/échouée, refusée, résultat non confirmé. Un timeout après transmission ne prouve jamais que l’objet n’a effectué aucune action. Une révocation ne supprime pas un accusé authentique d’une action passée.

### Configuration et demandes d’accès

`GET /onboarding` (session SIWE) retourne uniquement l’adresse du compte,
l’administrateur des fabricants, les identifiants/modèles et les adresses
publiques des trois objets de démonstration. Le propriétaire et la révocation
sont lus sur chaîne. Aucun état physique ni journal d’un objet inaccessible n’est
exposé par cette route. En local, les adresses disponibles sont dérivées du
provisionnement privé ; seules les adresses publiques sortent du serveur.

`POST /access-requests` accepte `{deviceId, hours}` (entier de 1 à 24), associe
le demandeur à sa session et fixe les actions au modèle. Refus des objets absents,
révoqués et des demandes vers son propre objet ; une demande par compte/objet et
au maximum trois demandes non expirées par compte. `GET /access-requests`
retourne uniquement les demandes du demandeur ou du propriétaire concerné. Le
statut accordé est recalculé avec les permissions du contrat. Une demande seule
ne permet jamais d’exécuter une commande. Le propriétaire approuve avec une
transaction `grantPermission` dans son portefeuille ;
`POST /access-requests/:id/dismiss` exige le propriétaire actuel de l’objet.
Les demandes restent des données hors chaîne ; leurs permissions sont sur chaîne.

### Provisionnement local dynamique

`POST /provision` (session SIWE requise) accepte un objet strict
`{model: "G25-LOCK" | "G25-PLUG" | "G25-CAM", name: string}` (1 à 64 caractères).
Réponse 201 : `{id, label, model, signer, name}` publics uniquement. Le propriétaire
prévu provient de la session, jamais d’un champ envoyé par le client. Une réserve
unique est stockée atomiquement dans `.local/provisioning.json` (0600), avec les
clés et credentials privés consommés seulement par les services locaux. Quota de
100 réserves par compte/registre. La route renvoie 409 en mode Sepolia tant qu’un
provisionneur du broker externe n’est pas configuré.

`GET /onboarding` indique `automaticProvisioning` et ne présente les réserves
privées qu’à leur compte créateur. Les appareils effectivement enregistrés sont
visibles via `/devices` selon les droits du contrat ; leur modèle détermine leurs
actions et leurs visuels. Le broker local recharge les credentials pour chaque
vérification et conserve les ACL exactes par topic ; le simulateur découvre les
réserves toutes les deux secondes et ouvre un client MQTT distinct par objet.

### Provisionnement externe et reprise

En mode Sepolia, les réserves utilisent PostgreSQL et chiffrent leurs secrets en
AES-256-GCM (clé serveur commune passerelle/simulateur). `POST /provision` conserve
d’abord une identité `pending`, configure EMQX via HTTPS, vérifie les ACL et
l’utilisateur, puis marque cette identité `ready` avant sa découverte par le
simulateur. En cas d’échec, réponse 503 et même identité conservée.
`POST /provision/:id/retry` exige le compte créateur et le registre courant,
réutilise ces credentials et ne crée pas de nouvelle réserve. Une requête d’un
autre compte renvoie 404. `GET /onboarding` expose `provisioningStatus`, sans
adresse disponible à enregistrer tant que la préparation reste en attente.
Sans paramètres du connecteur, la création externe renvoie 409.
