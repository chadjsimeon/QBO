---
name: Ledgerly UI patterns
description: Native select vs shadcn Select, and other component API constraints in the Ledgerly frontend
---

# Ledgerly UI Patterns

## Select component is native HTML `<select>`
`artifacts/ledgerly/src/components/ui/select.tsx` exports only a single `Select` (styled native `<select>`). It does NOT export `SelectContent`, `SelectItem`, `SelectTrigger`, or `SelectValue`. Any code importing those will fail both at typecheck and at runtime.

**Why:** The UI kit was built lean (no Radix UI Select), so the shadcn headless Select API never existed here.

**How to apply:** In form pages, use `<Select value={...} onChange={e => ...}><option>...</option></Select>` pattern instead of the Radix/shadcn compound component pattern.

## AlertDialog is available
`@radix-ui/react-alert-dialog` is installed and `src/components/ui/alert-dialog.tsx` exports the full shadcn API (`AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, etc.).

## Tabs is available  
The Tabs component uses shadcn/Radix pattern with `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.
