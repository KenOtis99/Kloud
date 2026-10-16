export async function fetchPhotos({ offset = 0, startYear = null, limit = 150 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (startYear != null) {
    params.set("start_year", String(startYear));
  } else {
    params.set("offset", String(offset));
  }
  const res = await fetch(`/api/photos?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load photos (${res.status})`);
  return res.json();
}

export async function fetchYears() {
  const res = await fetch("/api/years");
  if (!res.ok) throw new Error(`Failed to load years (${res.status})`);
  return res.json();
}

export async function rescan() {
  const res = await fetch("/api/rescan", { method: "POST" });
  if (!res.ok) throw new Error(`Rescan failed (${res.status})`);
  return res.json();
}

export function thumbUrl(hash) {
  return `/thumb/${hash}.jpg`;
}

export function fullUrl(hash) {
  return `/full/${hash}.jpg`;
}
