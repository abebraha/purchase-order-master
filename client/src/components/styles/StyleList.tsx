import type { StyleRecord } from "@shared/po";
import { ListRow, ListSection } from "@/components/kit";
import { formatNumber } from "@/lib/format";
import { groupByLetter, sortLabel, styleDetails, type StyleSort } from "./styleUtils";

/**
 * Phone layout — like Contacts: A–Z sort shows one inset group per first character,
 * other sorts show a single group. Tap a row to edit.
 */
export function StyleList({
  styles,
  sort,
  onSelect,
}: {
  /** Already filtered, sorted and limited. */
  styles: StyleRecord[];
  sort: StyleSort;
  onSelect: (style: StyleRecord) => void;
}) {
  if (sort === "az") {
    return (
      <div className="space-y-6">
        {groupByLetter(styles).map((group) => (
          <ListSection key={group.key} header={<span className="font-semibold normal-case">{group.key}</span>}>
            {group.styles.map((style) => (
              <StyleListRow key={style.id} style={style} onSelect={onSelect} />
            ))}
          </ListSection>
        ))}
      </div>
    );
  }
  return (
    <ListSection header={sortLabel(sort)}>
      {styles.map((style) => (
        <StyleListRow key={style.id} style={style} onSelect={onSelect} />
      ))}
    </ListSection>
  );
}

function StyleListRow({ style, onSelect }: { style: StyleRecord; onSelect: (style: StyleRecord) => void }) {
  const details = styleDetails(style);
  return (
    <ListRow
      onClick={() => onSelect(style)}
      title={<span className="font-medium">{style.styleNumber}</span>}
      subtitle={details || <span className="italic text-muted-foreground/70">No details</span>}
      value={
        style.usageCount > 0 ? (
          <span className="text-[15px] md:text-[13px]">Used {formatNumber(style.usageCount)}×</span>
        ) : undefined
      }
    />
  );
}
