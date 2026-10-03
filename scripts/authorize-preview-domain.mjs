// Adds a Vercel preview deployment's hostnames to Firebase Auth's authorized
// domains, so sign-in works on preview URLs. Firebase doesn't accept wildcards,
// so each hostname has to be added explicitly. Run by
// .github/workflows/authorize-preview-domain.yml after each preview deploy.
//
// Env:
//   DEPLOYMENT_URL      the deployment's URL, as reported to GitHub by Vercel
//   VERCEL_TOKEN        Vercel API token, to look up the branch alias
//   VERCEL_TEAM_ID      Vercel team the project belongs to
//   GOOGLE_ACCESS_TOKEN OAuth token for a service account with the
//                       "Firebase Authentication Admin" role
//   FIREBASE_PROJECT_ID Firebase / Google Cloud project id
//   MAX_PREVIEW_DOMAINS how many preview hostnames to keep (default 40)

const {
  DEPLOYMENT_URL,
  VERCEL_TOKEN,
  VERCEL_TEAM_ID,
  GOOGLE_ACCESS_TOKEN,
  FIREBASE_PROJECT_ID,
  MAX_PREVIEW_DOMAINS = '40',
} = process.env;

for (const [name, value] of Object.entries({
  DEPLOYMENT_URL,
  VERCEL_TOKEN,
  VERCEL_TEAM_ID,
  GOOGLE_ACCESS_TOKEN,
  FIREBASE_PROJECT_ID,
})) {
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
}

const hostOf = (url) => new URL(url.includes('://') ? url : `https://${url}`).hostname;

// Only preview hostnames are ever pruned: per-deploy URLs
// (beckfield-bistro-<hash>-<team>.vercel.app) and branch aliases
// (beckfield-bistro-git-<branch>-<team>.vercel.app). Production
// (beckfield-bistro.vercel.app), custom domains and localhost never match.
const isPreviewHost = (host) =>
  /^beckfield-bistro-(git-[a-z0-9-]+|[a-z0-9]{9})-[a-z0-9-]+\.vercel\.app$/.test(host);

async function vercelHosts() {
  const host = hostOf(DEPLOYMENT_URL);
  const res = await fetch(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(host)}?teamId=${VERCEL_TEAM_ID}`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
  );
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
  const deployment = await res.json();
  if (deployment.target === 'production') return [];
  // `alias` holds the branch URL (the one in the PR comment) alongside any others.
  return [...new Set([host, ...(deployment.alias ?? []).map(hostOf)])];
}

const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${FIREBASE_PROJECT_ID}/config`;
const googleHeaders = {
  Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'X-Goog-User-Project': FIREBASE_PROJECT_ID,
};

async function getAuthorizedDomains() {
  const res = await fetch(configUrl, { headers: googleHeaders });
  if (!res.ok) throw new Error(`Firebase config read ${res.status}: ${await res.text()}`);
  return (await res.json()).authorizedDomains ?? [];
}

async function setAuthorizedDomains(authorizedDomains) {
  const res = await fetch(`${configUrl}?updateMask=authorizedDomains`, {
    method: 'PATCH',
    headers: googleHeaders,
    body: JSON.stringify({ authorizedDomains }),
  });
  if (!res.ok) throw new Error(`Firebase config update ${res.status}: ${await res.text()}`);
}

const hosts = await vercelHosts();
if (!hosts.length) {
  console.log('Production deployment: nothing to authorize.');
  process.exit(0);
}

const current = await getAuthorizedDomains();
const toAdd = hosts.filter((h) => !current.includes(h));
if (!toAdd.length) {
  console.log(`Already authorized: ${hosts.join(', ')}`);
  process.exit(0);
}

// New domains go on the end, so the oldest preview hostnames come first and
// are the ones dropped once there are more than MAX_PREVIEW_DOMAINS.
let next = [...current, ...toAdd];
const previews = next.filter(isPreviewHost);
const excess = previews.length - Number(MAX_PREVIEW_DOMAINS);
if (excess > 0) {
  const drop = new Set(previews.filter((h) => !hosts.includes(h)).slice(0, excess));
  next = next.filter((h) => !drop.has(h));
  console.log(`Removed old preview domains: ${[...drop].join(', ')}`);
}

await setAuthorizedDomains(next);
console.log(`Authorized: ${toAdd.join(', ')}`);
