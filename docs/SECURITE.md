# Analyse de sécurité du prototype

Cette analyse interne associe tests automatisés, Slither et revue des frontières de confiance. Elle ne constitue pas un audit indépendant ou une certification.

## Contrats

Compiler : solc-js 0.8.30, optimisation 200 passages, EVM Cancun. OpenZeppelin fournit Ownable, EIP712 et ECDSA. Aucun proxy, transfert d’ETH, réception payable ou appel arbitraire n’est introduit. Les preuves d’exécution sont liées au réseau, au contrat et à une demande unique. Les erreurs et événements limitent les données personnelles ; noms et pièces fictives restent hors chaîne.

Le rapport brut Slither est `security/slither.json`, avec sa sortie texte. L’analyse a abouti et signale douze résultats : trois `incorrect-equality` de sévérité moyenne et neuf `timestamp` de sévérité faible. Les égalités concernent les identifiants constants bytes32 des trois modèles ; elles sont intentionnelles, sans comparaison de solde ou de résultat financier. Les alertes timestamp comprennent les expirations requises et des dépendances propagées vers les gardes d’autorisation. L’heure du bloc est précisément la source de vérité voulue ; aucune randomness ou promesse de temps physique exact n’en dépend. Les bornes sont testées. Ces alertes sont conservées, pas masquées pour prétendre un scan sans résultat.

Commande : après `npm run compile`, installer Slither dans un environnement Python isolé, puis `VIRTUAL_ENV=/chemin/venv /chemin/venv/bin/slither artifacts/compiler-input.json --compile-force-framework solc-json --solc scripts/solc-local.mjs --filter-paths node_modules --json docs/security/slither.json`. Slither termine avec un code non nul lorsqu’il trouve des alertes ; vérifier le champ `success` et les résultats, pas seulement le code shell. Le wrapper invoque exactement le solc-js verrouillé.

## Menaces et contrôles

| Menace                               | Contrôle                                                                       | Limite                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Invité sans droit / mauvaise action  | Contrat, masque par modèle, expiration et révision                             | Contrôle avant action ; messages en vol possibles                                                |
| Révocation suivie d’un nouvel accès  | Révision stockée dans la demande                                               | Ne défait aucune action passée                                                                   |
| Faux objet ou faux message           | Signatures EIP-712, modèle, sujet, domaine, destinataire et demande relus      | Clé d’objet compromise : révoquer définitivement l’identité                                      |
| Rejeu MQTT / panne après application | Affectation et accusé persistés ensemble, déduplication par requestId          | Persistance simulée ; aucune garantie matérielle exactement une fois                             |
| Fabricant usurpé / fichier modifié   | Autorisation par modèle, signature, SHA-256, CID signé, taille                 | IPFS et la CA TLS restent des dépendances                                                        |
| Installation forcée                  | Signature du propriétaire, nonce, expiration, objet actif                      | Garder ses clés dans le portefeuille                                                             |
| Rejeu de session                     | Nonce SIWE consommé atomiquement ; session courte                              | Vol de jeton possible en cas de XSS ; aucune écriture d’autorisation ne remplace une transaction |
| Fuite d’informations API             | Filtrage propriétaire/invité, export borné, configuration publique limitée     | Une adresse publique demeure visible sur chaîne                                                  |
| Broker hostile ou indisponible       | TLS, ACL, comptes distincts, messages signés, aucun faux succès                | Déni de service possible                                                                         |
| RPC indisponible / réorganisation    | Refus fermé, confirmations, vérification de hash, réindexation avec suspension | Confirmer le comportement sur Sepolia et les pannes longues                                      |
| Contenu arbitraire du micrologiciel  | Fichier inerte, taille et timeout, aucun shell/eval                            | Ne constitue pas un installateur matériel                                                        |

## Dépendances

Les rapports npm bruts sont conservés dans `security/`. Les surcharges `tmp=0.2.7` et `uuid=11.1.1` corrigent des dépendances transitoires de l’outillage. Hardhat 3 reste isolé du serveur de production ; son zod 3 transitoire est signalé par npm pour une vulnérabilité de validation de collections. L’application utilise directement zod 4 corrigé, avec taille HTTP limitée. Ne pas présenter les avis résiduels de développement comme corrigés ; suivre la mise à jour amont et conserver le rapport exact daté. Aucun endpoint public n’expose le nœud Hardhat ou sa validation de configuration.

## Secrets et exploitation

`.env`, `.local`, clés, certificats privés et journaux techniques locaux sont ignorés. Les comptes de développement sont générés aléatoirement et financés exclusivement par `hardhat_setBalance` après vérification du chainId 31337. Ne jamais importer une clé financée en ETH réel, publier le répertoire `.local` ou exposer le RPC Hardhat sur Internet.

Les secrets administrateur de déploiement, enveloppes, relayer, objets, MQTT et IPFS doivent être distincts. PostgreSQL ne conserve pas de clé privée. L’authentification stocke le hash des jetons, pas leur valeur. Le serveur Vite écoute sur loopback et refuse explicitement l’accès aux répertoires de secrets via ses routes de fichiers. Ce refus est testé dans le navigateur. Les rapports de preuves contiennent seulement des données publiques, signatures, identifiants, transactions et états fictifs.

Révocation : depuis le portefeuille propriétaire, révoquer l’objet compromis ; arrêter le processus correspondant, renouveler ses identifiants MQTT, créer une nouvelle clé et un nouvel identifiant. Révoquer un fabricant avec le portefeuille administrateur si sa clé est compromise. La clé d’enveloppe est immuable pour cette version de SmartHomeRegistry : sa rotation impose un nouveau déploiement et une migration explicite. Le relayer peut être remplacé sans pouvoir fabriquer un accusé d’objet. Révoquer les sessions hors chaîne en supprimant leurs entrées, puis redémarrer les services si nécessaire.
