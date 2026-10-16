import { useState, useEffect, useRef, useCallback } from "react";
import { ImageOff } from "lucide-react";
import TopBar from "./components/TopBar.jsx";
import PhotoGrid from "./components/PhotoGrid.jsx";
import YearNav from "./components/YearNav.jsx";
import Lightbox from "./components/Lightbox.jsx";
import { fetchPhotos, fetchYears, rescan } from "./api";

export default function App() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [years, setYears] = useState([]);
  const [activeYear, setActiveYear] = useState(null);
  const [rescanning, setRescanning] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [initError, setInitError] = useState(false);

  const sentinelRef = useRef(null);
  const itemsRef = useRef(items); // avoid stale closures inside the observer
  itemsRef.current = items;

  const loadMore = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const data = await fetchPhotos({
        offset: opts.reset ? 0 : nextOffset,
        startYear: opts.startYear ?? null,
      });
      setItems((prev) => (opts.reset ? data.items : [...prev, ...data.items]));
      setNextOffset(data.next_offset);
      setHasMore(data.has_more);
      setTotal(data.total);
      setInitError(false);
    } catch (e) {
      console.error(e);
      if (itemsRef.current.length === 0) setInitError(true);
    } finally {
      setLoading(false);
    }
  }, [nextOffset]);

  // Initial load + year index.
  useEffect(() => {
    loadMore({ reset: true });
    fetchYears().then(setYears).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll via IntersectionObserver.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: "1000px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // Track which year is currently in view, to highlight the year nav.
  useEffect(() => {
    if (!items.length) return;
    const headers = Array.from(document.querySelectorAll(".day-header"));
    if (!headers.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) {
          const year = new Date(visible.target.parentElement.dataset.date || Date.now()).getFullYear();
          if (!Number.isNaN(year)) setActiveYear(year);
        }
      },
      { rootMargin: "-56px 0px -80% 0px" }
    );
    headers.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  function handleJumpToYear(year) {
    setItems([]);
    setActiveYear(year);
    loadMore({ reset: true, startYear: year });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  async function handleRescan() {
    setRescanning(true);
    try {
      await rescan();
      const freshYears = await fetchYears();
      setYears(freshYears);
      setItems([]);
      await loadMore({ reset: true });
    } catch (e) {
      console.error(e);
    } finally {
      setRescanning(false);
    }
  }

  function handleOpenPhoto(item) {
    const idx = items.findIndex((i) => i.hash === item.hash);
    setLightboxIndex(idx);
  }

  function handleNeedMore() {
    if (hasMore && !loading) loadMore();
  }

  if (initError) {
    return (
      <div className="empty-state">
        <ImageOff size={40} strokeWidth={1.5} />
        <div>Couldn't reach the photo server. Check that it's running and try again.</div>
      </div>
    );
  }

  return (
    <>
      <TopBar
        loadedCount={items.length}
        total={total}
        onRescan={handleRescan}
        rescanning={rescanning}
      />

      {items.length === 0 && !loading ? (
        <div className="empty-state">
          <ImageOff size={40} strokeWidth={1.5} />
          <div>No photos found yet.</div>
        </div>
      ) : (
        <PhotoGrid items={items} onOpenPhoto={handleOpenPhoto} />
      )}

      <div ref={sentinelRef} className="sentinel" />

      {loading && <div className="loading-row">Loading…</div>}
      {!hasMore && items.length > 0 && (
        <div className="end-of-library">That's your whole library — {total.toLocaleString()} photos.</div>
      )}

      <YearNav years={years} activeYear={activeYear} onJump={handleJumpToYear} />

      {lightboxIndex !== null && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
          onNeedMore={handleNeedMore}
        />
      )}
    </>
  );
}
