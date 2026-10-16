import { useEffect, useRef, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { fullUrl } from "../api";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function Lightbox({ items, index, onClose, onIndexChange, onNeedMore }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStart = useRef(null);
  const stageRef = useRef(null);

  const item = items[index];

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) {
      onIndexChange(index + 1);
      if (index > items.length - 15) onNeedMore();
    }
  }, [index, items.length, onIndexChange, onNeedMore]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext]);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleTouchStart(e) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setDragging(true);
  }

  function handleTouchMove(e) {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    // Only treat as a horizontal swipe if it's clearly more horizontal than vertical.
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(dx);
    }
  }

  function handleTouchEnd() {
    const threshold = 70;
    if (dragX > threshold) {
      goPrev();
    } else if (dragX < -threshold) {
      goNext();
    }
    setDragging(false);
    setDragX(0);
    touchStart.current = null;
  }

  if (!item) return null;

  return (
    <div className="lightbox">
      <div className="lightbox-topbar">
        <div className="lightbox-date">{dateFormatter.format(new Date(item.date))}</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div
        className="lightbox-stage"
        ref={stageRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {index > 0 && (
          <button className="lb-nav lb-prev" onClick={goPrev} aria-label="Previous">
            <ChevronLeft size={24} />
          </button>
        )}

        <img
          key={item.hash}
          src={fullUrl(item.hash)}
          alt=""
          className={dragging ? "swiping" : ""}
          style={dragging ? { transform: `translateX(${dragX}px)` } : undefined}
          draggable={false}
        />

        {index < items.length - 1 && (
          <button className="lb-nav lb-next" onClick={goNext} aria-label="Next">
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      <div className="lightbox-footer">
        {index + 1} of {items.length}
      </div>
    </div>
  );
}
