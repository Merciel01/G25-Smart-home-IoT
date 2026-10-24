# Architecture et frontières de confiance

Le propriétaire signe `requestCommand` avec son portefeuille. SmartHomeRegistry vérifie identité, modèle, action, permission, révision et expiration avec le temps du bloc. Le propriétaire n’a pas besoin de se déléguer des permissions. Les fabricants sont autorisés par modèle par l’administrateur de FirmwareRegistry ; ce droit ne leur donne aucun contrôle sur les objets.

L’indexeur HTTP relit les journaux à partir du bloc de déploiement, après le nombre de confirmations configuré. Les événements sont identifiés par `chainId/txHash/logIndex`. Une fenêtre de douze blocs est relue à chaque progression. Le hash du dernier bloc indexé est vérifié. En cas de remplacement, le relayage est suspendu et les projections sont reconstruites depuis le déploiement. Les demandes orphelines sont archivées ; un requestId réapparu avec une autre transaction est refusé par prudence. Une action déjà effectuée ne peut pas être annulée par la réorganisation.

Une outbox durable contient les commandes confirmées. Juste avant publication, `isCommandExecutable` est relu. RPC indisponible : aucune nouvelle transmission. MQTT utilise TLS, des comptes distincts et des ACL. Les messages de commande ne sont pas retained. La passerelle signe une enveloppe EIP-712 ; le simulateur vérifie le sujet, sa destination, le domaine, la signature, l’expiration, les champs de la demande et son autorisation courante. Il consulte l’API et la chaîne. Ces consultations ne suppriment pas la fenêtre entre validation et affectation d’état.

Chaque objet signe son accusé avec sa propre clé. L’état et la déduplication sont persistés atomiquement ensemble avant l’envoi de l’accusé. Un doublon renvoie le même accusé sans nouvelle affectation. Les actions sont des affectations idempotentes, jamais un basculement. Le relayer soumet l’accusé au contrat. « Exécutée » signifie ici qu’un accusé valide avec outcome=1 a été ancré sur chaîne. L’accusé atteste une déclaration du simulateur, sans observation indépendante du monde physique.

Les présences sont signées avec un type EIP-712 distinct, liées au domaine du contrat, et expirent dans l’interface après 45 secondes. Un état absent ou trop ancien est inconnu/hors ligne. Le statut initial d’un objet ne prétend pas connaître la position d’une serrure physique.

## Stockage

Production : PostgreSQL, migration `001_service_state.sql`. Pour cette maison de trois objets, deux documents JSONB possèdent une clé primaire `scope` (`gateway`, `simulator`). Les mutations sont sérialisées avec `SELECT FOR UPDATE` et une transaction. Les clés des maps d’événements, commandes et nonces assurent l’unicité à l’intérieur de ces transactions. Un verrou consultatif PostgreSQL impose une seule passerelle/relayer par base. Ce choix compact évite une fausse seconde source d’autorisation. Une évolution vers des tables normalisées et des index sera nécessaire à grande échelle.

Développement : fichiers JSON avec écriture temporaire, fsync et renommage. Un seul processus par scope. Ce mode ne prétend pas valider PostgreSQL ou la résistance aux pannes d’un hébergement. Les clés privées restent dans les variables de service ; elles ne sont stockées ni dans les documents JSONB ni dans les réponses API.

## Micrologiciels

Le CID accepté est CIDv1 en base32 minuscule sans chemin, requête, espace ou URL. `cidHash=keccak256(UTF8(CID))`. Ce hash de référence, le SHA-256 des octets du fichier et le hash structuré EIP-712 sont distincts. La signature du fabricant couvre modèle, version, taille, empreinte et CID. Le téléchargement utilise uniquement le CID signé sur une passerelle IPFS fixe ; les redirections sont refusées. Le fichier est borné à 1 Mio, avec timeout, puis vérifié. Il ne passe jamais au shell ou à eval.

Le propriétaire autorise l’installation avec une signature EIP-712 liée au réseau, au contrat, à l’objet, à la version, au nonce et à l’expiration. La passerelle consomme le nonce une fois. Le simulateur persiste le résultat ; une retransmission MQTT retourne ce même résultat sans seconde installation. La version doit strictement augmenter et le fabricant doit encore être autorisé après le téléchargement. Succès et refus disposent de preuves signées différentes.

En local, une passerelle de fichiers adresse les blocs bruts avec des CIDv1 calculés. Elle ne se connecte pas au réseau IPFS et n’atteste aucun épinglage public. En production, `/firmware/upload` utilise une API Kubo authentifiée avec `pin=true` et `cid-version=1`. La disponibilité de ce service reste à éprouver.

## Authentification

SIWE (bibliothèque `siwe`) : origine autorisée, domaine, chainId, nonce unique, expiration de cinq minutes, signature de portefeuille. Le texte SIWE est français sans accents pour respecter sa grammaire ASCII. La session est un jeton opaque aléatoire de 256 bits, conservé uniquement en mémoire dans le navigateur, envoyé en Bearer ; seule son empreinte SHA-256 est persistée côté serveur. Durée 15 minutes, pas de cookie ni de localStorage. Rechargement, changement de compte ou de réseau nécessitent une nouvelle connexion. Le SSE vérifie périodiquement la session. L’interface utilise une interrogation périodique de quatre secondes. Les routes sensibles relisent les contrats.

## Limites

La disponibilité du broker, de la passerelle, du RPC, de PostgreSQL et d’IPFS reste nécessaire. Un administrateur d’hébergement compromis peut dégrader les services ; la chaîne ne décentralise pas la totalité de l’exécution simulée. Des messages en vol peuvent précéder une révocation confirmée. Aucun mécanisme ne promet « exactement une fois » sur du matériel réel. Les contrôles temporels du simulateur supposent une horloge système synchronisée. Sauvegarder la base et tester les redémarrages sur l’hébergement avant la remise.
