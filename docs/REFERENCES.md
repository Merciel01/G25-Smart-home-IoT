# Sources et dépendances

## Sources du projet

PDF officiel « PROJETS DE BLOCKCHAIN ET CRYPTOMONNAIE » fourni par le groupe : page 1 (exigences), page 9 (groupe 25), page 11 (remise). Le dossier SmartHome_G25_INSTRUCTIONS_CODEX.md (23 octobre 2026, version 1.0) précise les décisions de conception. Les pièces originales restent hors dépôt.

[Figma SmartHome, 3:281](https://www.figma.com/design/qL1MeNPZDy0sQXPR9KT4id?node-id=3-281) : contexte de conception et capture obtenus avec le connecteur. Aucun actif statique image/SVG n’était nécessaire sur ce tableau de bord. Référence de composants : Simple Design System, Button et Input Field. Les styles sont réimplémentés en CSS fluide ; les données et états de sécurité priment sur la fiction de la maquette.

## Documentation officielle consultée

- [Hardhat](https://hardhat.org/docs) : réseau de développement et configuration.
- [Vite](https://vite.dev/guide/) : environnement Node et build.
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/) : Ownable, ECDSA et EIP712.
- [ethers v6](https://docs.ethers.org/v6/) : portefeuilles, contrats et signatures structurées.
- [EIP-712](https://eips.ethereum.org/EIPS/eip-712) et [EIP-4361 SIWE](https://eips.ethereum.org/EIPS/eip-4361).
- [MQTT.js](https://github.com/mqttjs/MQTT.js) et [Aedes](https://github.com/moscajs/aedes) : transport et broker de développement.
- [IPFS, CID](https://docs.ipfs.tech/concepts/content-addressing/) : distinctions entre CID et empreinte de fichier.
- [Slither](https://github.com/crytic/slither/wiki/Usage) : analyse et format des rapports.
- [Render Blueprint](https://render.com/docs/blueprint-spec) et [Vercel configuration](https://vercel.com/docs/project-configuration) : préparation des fichiers d’hébergement, sans essai de déploiement public.

Les versions exactes sont dans package.json et package-lock.json. Réutilisations : React, React DOM et React Router pour l’interface ; Vite et TypeScript ; ethers ; OpenZeppelin ; solc-js et Hardhat ; Express, CORS, express-rate-limit ; MQTT.js ; Aedes pour les tests locaux ; node-postgres ; SIWE ; zod ; dotenv ; Playwright ; Prettier. Police Inter distribuée localement via @fontsource/inter, licence SIL Open Font License. Les licences de chaque dépendance sont conservées dans leurs distributions npm. Les surcharges de dépendances transitoires sont déclarées dans package.json et expliquées dans SECURITE.md.

Aucun modèle d’IA, code de contrat tiers non cité, photo personnelle ou vidéo réelle n’est utilisé.
