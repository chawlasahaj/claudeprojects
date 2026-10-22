// data.gov.sg's open-data API, shared by the download scripts.
// Set DATA_GOV_SG_API_KEY for higher rate limits; it isn't required.

import { fetchRetry, sleep } from "./io.mjs";

const headers = process.env.DATA_GOV_SG_API_KEY ? { "x-api-key": process.env.DATA_GOV_SG_API_KEY } : {};

export async function getJson(url) {
  const res = await fetchRetry(url, { headers });
  return res.json();
}

// The open-data download flow: initiate, then poll until a file URL appears.
export async function downloadUrl(id, { polls = 20 } = {}) {
  const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${id}`;
  try {
    await getJson(`${base}/initiate-download`);
  } catch (e) {
    console.warn(`initiate-download: ${e.message}`);
  }
  for (let i = 0; i < polls; i++) {
    const j = await getJson(`${base}/poll-download`);
    if (j?.data?.url) return j.data.url;
    await sleep(3000);
  }
  throw new Error("poll-download never returned a file URL");
}

export async function metadata(id) {
  try {
    const j = await getJson(`https://api-production.data.gov.sg/v2/public/api/datasets/${id}/metadata`);
    const d = j?.data ?? {};
    return { title: d.name ?? null, updated: d.lastUpdatedAt ?? null, coverageEnd: d.coverageEnd ?? null };
  } catch (e) {
    console.warn(`metadata: ${e.message}`);
    return { title: null, updated: null, coverageEnd: null };
  }
}
