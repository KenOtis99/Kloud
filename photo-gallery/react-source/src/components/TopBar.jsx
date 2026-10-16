import { RotateCw } from "lucide-react";

export default function TopBar({ loadedCount, total, onRescan, rescanning }) {
  return (
    <header className="topbar">
      <div className="topbar-title">Photos</div>
      <div className="topbar-right">
        {total > 0 && (
          <span className="topbar-count">
            {loadedCount.toLocaleString()} of {total.toLocaleString()}
          </span>
        )}
        <button
          className={`icon-btn${rescanning ? " spinning" : ""}`}
          onClick={onRescan}
          title="Check for new photos"
          aria-label="Check for new photos"
        >
          <RotateCw size={16} />
        </button>
      </div>
    </header>
  );
}
