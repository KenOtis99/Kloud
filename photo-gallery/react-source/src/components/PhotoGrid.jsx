import { useMemo } from "react";
import Tile from "./Tile.jsx";

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "long",
  day: "numeric",
});
const yearFormatter = new Intl.DateTimeFormat(undefined, { year: "numeric" });

function dayKey(iso) {
  return iso.slice(0, 10);
}

function groupByDay(items) {
  const groups = [];
  let current = null;
  for (const item of items) {
    const key = dayKey(item.date);
    if (!current || current.key !== key) {
      current = { key, date: item.date, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

export default function PhotoGrid({ items, onOpenPhoto }) {
  const groups = useMemo(() => groupByDay(items), [items]);

  return (
    <div className="content">
      {groups.map((group) => {
        const d = new Date(group.date);
        return (
          <div className="day-group" key={group.key} data-date={group.date}>
            <div className="day-header">
              {dayFormatter.format(d)}
              <span className="day-sub">{yearFormatter.format(d)}</span>
            </div>
            <div className="tile-grid">
              {group.items.map((item) => (
                <Tile key={item.hash} item={item} onOpen={onOpenPhoto} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
