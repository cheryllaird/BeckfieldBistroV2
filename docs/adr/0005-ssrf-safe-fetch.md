# 0005. Fetch user-supplied URLs only through `safeFetch`

- **Status:** Accepted (back-filled from #148)
- **Date:** 2026-10-04

## Context

Recipe URL import fetches any URL a signed-in user gives it and returns the content. An
unguarded server-side fetch lets anyone read internal services: cloud metadata, localhost,
private networks. Hostname checks alone are defeated by DNS rebinding and redirects.

## Decision

All server-side fetches of user-influenced URLs use `api/_utils/safeFetch.ts`, which:

- validates the resolved address inside the socket's DNS lookup (so the checked address is the
  one connected to);
- blocks private, loopback, link-local, CGNAT and metadata ranges (IPv4 and IPv6);
- follows redirects manually, checking every hop;
- allows only web schemes and ports, and caps the body at 2 MB.

## Consequences

- New features that fetch remote content must reuse it, not `fetch` directly; reviewers and the
  `security-reviewer` agent check this.
- Fetched content is still untrusted (prompt injection into Gemini, HTML); it's data, never
  instructions.

## Alternatives considered

- **Hostname allow-list:** breaks "import from any recipe site".
- **Third-party fetch proxy:** cost and another party seeing users' URLs.
