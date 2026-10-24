import fs from "node:fs/promises";
const proof = JSON.parse(
  await fs.readFile("docs/preuve-parcours-local.json", "utf8"),
);
const firmware = JSON.parse(
  await fs.readFile("docs/preuve-micrologiciels-local.json", "utf8"),
);
const rows = [];
for (const p of proof.observations)
  if (p.gasUsed) rows.push([p.test, p.gasUsed, p.txHash]);
for (const p of firmware.proofs)
  if (p.publication)
    rows.push([
      "Publication micrologiciel " + p.version,
      p.publication.gasUsed,
      p.publication.txHash,
    ]);
const table =
  "| Opération locale | Gas utilisé | Transaction |\n|---|---:|---|\n" +
  rows.map((r) => `| ${r[0]} | ${r[1]} | \`${r[2]}\` |`).join("\n");
const report = await fs.readFile("docs/RESULTATS.md", "utf8");
await fs.writeFile(
  "docs/RESULTATS.md",
  report.replace(
    /<!-- GAS_START -->[\s\S]*<!-- GAS_END -->/,
    "<!-- GAS_START -->\n" + table + "\n<!-- GAS_END -->",
  ),
);
console.log("Mesures de gas reportées depuis les reçus réels locaux.");
