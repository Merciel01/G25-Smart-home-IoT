import fs from "node:fs";
import path from "node:path";
import solc from "solc";
const base = "packages/contracts/contracts";
const sources = Object.fromEntries(
  fs
    .readdirSync(base)
    .filter((f) => f.endsWith(".sol"))
    .map((f) => [
      path.join(base, f),
      { content: fs.readFileSync(path.join(base, f), "utf8") },
    ]),
);
const input = {
  language: "Solidity",
  sources,
  settings: {
    remappings: ["@openzeppelin/=node_modules/@openzeppelin/"],
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode", "evm.deployedBytecode"],
        "": ["ast"],
      },
    },
  },
};
const result = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (p) => {
      try {
        return {
          contents: fs.readFileSync(
            fs.existsSync(p) ? p : path.join("node_modules", p),
            "utf8",
          ),
        };
      } catch {
        return { error: "Import absent: " + p };
      }
    },
  }),
);
for (const e of result.errors ?? []) console.error(e.formattedMessage);
if (result.errors?.some((e) => e.severity === "error")) process.exit(1);
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(
  "artifacts/compiler-input.json",
  JSON.stringify(input, null, 2),
);
fs.writeFileSync("artifacts/compiler-output.json", JSON.stringify(result));
for (const [file, contracts] of Object.entries(result.contracts))
  for (const [name, c] of Object.entries(contracts))
    if (file.endsWith("Registry.sol"))
      fs.writeFileSync(
        `artifacts/${name}.json`,
        JSON.stringify(
          { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object },
          null,
          2,
        ),
      );
console.log(
  "Solidity " +
    solc.version() +
    "; optimisation 200; EVM Cancun; contrats compilés.",
);

const verification = {
  ...input,
  sources: Object.fromEntries(
    Object.keys(result.sources).map((p) => [
      p,
      { content: fs.readFileSync(p, "utf8") },
    ]),
  ),
};
fs.writeFileSync(
  "artifacts/verification-input.json",
  JSON.stringify(verification),
);
