import type { KeyboardEvent, ReactNode } from "react";
import { Ellipsis, FilePlus2, Pencil, Trash2 } from "lucide-react";
import type { CustomerRecord } from "@shared/po";
import { ListRow, ListSection } from "@/components/kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { firstLine } from "@/lib/format";
import { contactLine, groupByLetter, oneLineAddress } from "./customerUtils";

function Muted({ children = "—" }: { children?: ReactNode }) {
  return <span className="text-muted-foreground/60">{children}</span>;
}

/** Phone layout — like Contacts: one inset group per first letter. Tap a row to edit. */
export function CustomerList({
  customers,
  onSelect,
}: {
  /** Already filtered and sorted A–Z. */
  customers: CustomerRecord[];
  onSelect: (customer: CustomerRecord) => void;
}) {
  return (
    <div className="space-y-6">
      {groupByLetter(customers).map((group) => (
        <ListSection key={group.key} header={<span className="font-semibold normal-case">{group.key}</span>}>
          {group.customers.map((customer) => {
            const details = contactLine(customer) || firstLine(customer.shipTo);
            return (
              <ListRow
                key={customer.id}
                onClick={() => onSelect(customer)}
                title={<span className="font-medium">{customer.name}</span>}
                subtitle={details || <span className="italic text-muted-foreground/70">No details</span>}
              />
            );
          })}
        </ListSection>
      ))}
    </div>
  );
}

/** Desktop layout — a clean, Numbers-like table. Click a row (or press Enter on it) to edit. */
export function CustomerTable({
  customers,
  defaultTerms,
  onEdit,
  onDelete,
  onNewOrder,
}: {
  /** Already filtered and sorted A–Z. */
  customers: CustomerRecord[];
  /** Shown (dimmed) for customers without terms of their own. */
  defaultTerms: string;
  onEdit: (customer: CustomerRecord) => void;
  onDelete: (customer: CustomerRecord) => void;
  onNewOrder: (customer: CustomerRecord) => void;
}) {
  const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, customer: CustomerRecord) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(customer);
    } else if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      onDelete(customer);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const row = e.currentTarget;
      const next = (e.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      next?.focus();
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-card">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[24%]" />
          <col />
          <col className="w-[130px]" />
          <col className="w-[52px]" />
        </colgroup>
        <thead>
          <tr className="h-9 border-b border-border/80 text-xs font-medium text-muted-foreground">
            <th scope="col" className="pl-5 pr-3 font-medium">Customer</th>
            <th scope="col" className="px-3 font-medium">Contact</th>
            <th scope="col" className="px-3 font-medium">Ship To</th>
            <th scope="col" className="px-3 font-medium">Terms</th>
            <th scope="col" className="pr-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => {
            const contact = contactLine(customer);
            const shipTo = oneLineAddress(customer.shipTo);
            return (
              <tr
                key={customer.id}
                tabIndex={0}
                aria-label={`Customer ${customer.name}`}
                onClick={() => onEdit(customer)}
                onKeyDown={(e) => onRowKeyDown(e, customer)}
                className="group h-11 cursor-pointer border-b border-border/70 outline-none transition-colors duration-100 last:border-b-0 hover:bg-accent/60 focus-visible:bg-primary/[0.08] active:bg-accent"
              >
                <td className="truncate pl-5 pr-3 font-medium" title={customer.name}>{customer.name}</td>
                <td className="truncate px-3" title={contact || undefined}>{contact || <Muted />}</td>
                <td className="truncate px-3" title={shipTo || undefined}>{shipTo || <Muted />}</td>
                <td className="truncate px-3">
                  {customer.terms || <Muted>{defaultTerms}</Muted>}
                </td>
                <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <RowMenu customer={customer} onEdit={onEdit} onDelete={onDelete} onNewOrder={onNewOrder} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowMenu({
  customer,
  onEdit,
  onDelete,
  onNewOrder,
}: {
  customer: CustomerRecord;
  onEdit: (customer: CustomerRecord) => void;
  onDelete: (customer: CustomerRecord) => void;
  onNewOrder: (customer: CustomerRecord) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Actions for ${customer.name}`}
        onKeyDown={(e) => e.stopPropagation()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
      >
        <Ellipsis className="h-[18px] w-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem onSelect={() => onNewOrder(customer)}>
          <FilePlus2 />
          New Purchase Order
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(customer)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(customer)}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
