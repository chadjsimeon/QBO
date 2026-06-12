// One-shot codemod: swap the uniform hand-rolled reference-data useQuery blocks
// for the Orval-generated hooks. Leaves mutations and non-uniform queries alone.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = join(import.meta.dirname, "..", "artifacts", "ledgerly", "src", "pages");

const FILES = [
  "estimate-form.tsx",
  "expense-form.tsx",
  "credit-note-form.tsx",
  "po-form.tsx",
  "sales-receipt-form.tsx",
  "vendor-credit-form.tsx",
  "payment-form.tsx",
  "statement.tsx",
  "journal-entry-form.tsx",
  "general-ledger.tsx",
  "bank-account-review.tsx",
];

const SWAPS = [
  ["customers", "useListCustomers"],
  ["vendors", "useListVendors"],
  ["accounts", "useListAccounts"],
  ["tax-rates", "useListTaxRates"],
];

for (const file of FILES) {
  const path = join(PAGES, file);
  let src = readFileSync(path, "utf8");
  const used = [];

  for (const [key, hook] of SWAPS) {
    const re = new RegExp(
      String.raw`const \{ data: (\w+) = \[\] \} = useQuery\(\{\s*` +
        String.raw`queryKey: \["${key}"\],\s*` +
        String.raw`queryFn: \(\) => apiFetch<\w+\[\]>\("/${key}"\),\s*\}\);`,
      "g",
    );
    src = src.replace(re, (_m, varName) => {
      used.push(hook);
      return `const { data: ${varName} = [] } = ${hook}();`;
    });
  }

  if (used.length) {
    const importLine = `import { ${[...new Set(used)].join(", ")} } from "@workspace/api-client-react";\n`;
    // Insert after the last react-query import line (all files have one).
    src = src.replace(/(import .*"@tanstack\/react-query";\n)/, `$1${importLine}`);
    writeFileSync(path, src);
    console.log(`${file}: ${[...new Set(used)].join(", ")}`);
  } else {
    console.log(`${file}: NO MATCHES — check manually`);
  }
}
