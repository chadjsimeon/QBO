// Follow-up pass: delete local interfaces obsoleted by the generated client
// (exact set reported unused by eslint) and drop unused useQuery imports.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = join(import.meta.dirname, "..", "artifacts", "ledgerly", "src", "pages");

const REMOVALS = {
  "credit-note-form.tsx": ["Customer", "Account", "TaxRate"],
  "estimate-form.tsx": ["Customer", "Account", "TaxRate"],
  "expense-form.tsx": ["Vendor", "TaxRate"],
  "journal-entry-form.tsx": ["Account"],
  "payment-form.tsx": ["Customer", "Vendor"],
  "po-form.tsx": ["Vendor", "Account", "TaxRate"],
  "sales-receipt-form.tsx": ["Customer", "TaxRate"],
  "statement.tsx": ["Customer"],
  "vendor-credit-form.tsx": ["Vendor", "Account", "TaxRate"],
};

for (const [file, names] of Object.entries(REMOVALS)) {
  const path = join(PAGES, file);
  let src = readFileSync(path, "utf8");
  for (const name of names) {
    src = src.replace(new RegExp(String.raw`interface ${name} \{[^}]*\}\n`), "");
  }
  // Drop useQuery from the react-query import when no longer referenced.
  if (!/useQuery\(/.test(src)) {
    src = src.replace(
      /import \{ useQuery, (.*) \} from "@tanstack\/react-query";/,
      'import { $1 } from "@tanstack/react-query";',
    );
  }
  writeFileSync(path, src);
  console.log(`${file}: removed ${names.join(", ")}`);
}
