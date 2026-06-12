import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatCents } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LineItemsEditorProps<T> {
  title?: string;
  lines: T[];
  addLine: () => void;
  removeLine: (i: number) => void;
  subtotalCents: number;
  /** Renders the field cells for one row inside a 12-column grid; the editor
   *  adds the trailing remove-button cell (col-span-1) itself. */
  renderRow: (line: T, i: number) => ReactNode;
}

// Shared chrome for the document forms' line-item tables: add-line header,
// per-row remove button, and subtotal footer. Field layout stays per-form.
export function LineItemsEditor<T>({
  title = "Line items",
  lines,
  addLine,
  removeLine,
  subtotalCents,
  renderRow,
}: LineItemsEditorProps<T>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" /> Add line
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-start">
            {renderRow(line, i)}
            <div className="col-span-1 flex items-center justify-center">
              {lines.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>
        ))}
        <div className="flex justify-end pt-2 text-sm">
          <span className="text-muted-foreground mr-4">Subtotal:</span>
          <span className="tabular-nums font-medium">{formatCents(subtotalCents)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
