import type { Account, AccountType } from "@prisma/client";

export interface AccountNode extends Account {
  children: AccountNode[];
  depth: number;
}

/**
 * Build the chart-of-accounts forest from a flat list, ordered by sortOrder
 * within each parent. Used by the accounts page and every nested report.
 */
export function buildAccountTree(accounts: Account[]): AccountNode[] {
  const byId = new Map<string, AccountNode>();
  for (const a of accounts) {
    byId.set(a.id, { ...a, children: [], depth: 0 });
  }
  const roots: AccountNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: AccountNode[], depth: number) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);
  return roots;
}

/** Flatten a tree depth-first (parents before children), preserving order. */
export function flattenTree(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

export const TYPE_ORDER: AccountType[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
];
