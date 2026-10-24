#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import solc from "solc";
if (process.argv.includes("--version")) {
  console.log(
    "solc, the solidity compiler commandline interface\nVersion: " +
      solc.version(),
  );
} else {
  const input = fs.readFileSync(0, "utf8");
  const output = solc.compile(input, {
    import: (p) => {
      try {
        return {
          contents: fs.readFileSync(
            fs.existsSync(p) ? p : path.join("node_modules", p),
            "utf8",
          ),
        };
      } catch {
        return { error: "Import absent " + p };
      }
    },
  });
  fs.writeFileSync(1, output);
}
