"use client";

import { Plus, FileText, Receipt, CreditCard, Landmark, Users, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from "@/components/ui/dropdown";

export function CreateMenu() {
  return (
    <Dropdown
      align="end"
      trigger={
        <Button size="sm">
          <Plus className="h-4 w-4" /> Create
        </Button>
      }
    >
      <DropdownLabel>Customers</DropdownLabel>
      <DropdownItem href="/invoices/new">
        <FileText className="h-4 w-4 text-muted-foreground" /> Invoice
      </DropdownItem>
      <DropdownItem href="/payments/new">
        <CreditCard className="h-4 w-4 text-muted-foreground" /> Receive payment
      </DropdownItem>
      <DropdownItem href="/customers/new">
        <Users className="h-4 w-4 text-muted-foreground" /> Customer
      </DropdownItem>
      <DropdownSeparator />
      <DropdownLabel>Vendors</DropdownLabel>
      <DropdownItem href="/bills/new">
        <Receipt className="h-4 w-4 text-muted-foreground" /> Bill / expense
      </DropdownItem>
      <DropdownItem href="/vendors/new">
        <Building2 className="h-4 w-4 text-muted-foreground" /> Vendor
      </DropdownItem>
      <DropdownSeparator />
      <DropdownLabel>Banking</DropdownLabel>
      <DropdownItem href="/banking">
        <Landmark className="h-4 w-4 text-muted-foreground" /> Bank deposit / cheque
      </DropdownItem>
    </Dropdown>
  );
}
