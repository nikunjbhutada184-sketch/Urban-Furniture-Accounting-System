import {
  KanbanCard,
  KanbanGrid,
  KanbanThumbnail,
  initialsOf,
} from "@/components/data-table/kanban";
import { Badge } from "@/components/ui/badge";
import { type ContactListRow } from "@/modules/contacts/contact-service";
import { CONTACT_TYPE_LABELS } from "@/modules/contacts/schemas";

/**
 * Contact kanban view: profile image, name, email and mobile per card,
 * opening the form view on click.
 */
export function ContactKanban({ rows }: { rows: ContactListRow[] }) {
  return (
    <KanbanGrid>
      {rows.map((contact) => (
        <KanbanCard
          key={contact.id}
          href={`/contacts/${contact.id}/edit`}
          muted={contact.isArchived}
        >
          <div className="flex items-start gap-3">
            <KanbanThumbnail
              src={contact.profileImage}
              alt={`${contact.name} profile image`}
              fallback={initialsOf(contact.name)}
            />

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-medium">{contact.name}</span>
                {contact.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
              </div>

              <p className="text-muted-foreground truncate text-sm">{contact.email ?? "—"}</p>
              <p className="text-muted-foreground tabular truncate text-sm">
                {contact.mobile ?? "—"}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                <Badge
                  variant={
                    contact.type === "CUSTOMER"
                      ? "default"
                      : contact.type === "VENDOR"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {CONTACT_TYPE_LABELS[contact.type]}
                </Badge>
                {contact.hasPortalUser ? <Badge variant="outline">Portal</Badge> : null}
              </div>
            </div>
          </div>
        </KanbanCard>
      ))}
    </KanbanGrid>
  );
}
