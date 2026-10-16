import { useState } from "react";
import { Calendar } from "lucide-react";

export default function YearNav({ years, activeYear, onJump }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!years.length) return null;

  const handleJump = (year) => {
    onJump(year);
    setSheetOpen(false);
  };

  return (
    <>
      {/* Desktop: slim vertical rail */}
      <nav className="year-rail" aria-label="Jump to year">
        {years.map((y) => (
          <button
            key={y.year}
            className={y.year === activeYear ? "active" : ""}
            onClick={() => handleJump(y.year)}
          >
            {y.year}
          </button>
        ))}
      </nav>

      {/* Mobile: floating button + bottom sheet */}
      <button
        className="year-fab"
        onClick={() => setSheetOpen(true)}
        aria-label="Jump to year"
      >
        <Calendar size={20} />
      </button>

      {sheetOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-grid">
              {years
                .slice()
                .reverse()
                .map((y) => (
                  <button
                    key={y.year}
                    className={y.year === activeYear ? "active" : ""}
                    onClick={() => handleJump(y.year)}
                  >
                    {y.year}
                  </button>
                ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
