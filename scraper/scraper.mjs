#!/usr/bin/env node
/**
 * zkAttest DKIM Key Scraper
 *
 * Monitors DNS for active DKIM public keys across major email providers and
 * archives them to a local JSONL file before they rotate off. This archive
 * feeds the on-chain pallet-dkim-registry via governance proposals.
 *
 * Why this exists: major providers rotate keys every 6-12 months and do not
 * publish historical keys. Once a key rotates, emails signed under the old
 * key become unverifiable. By archiving keys when we first see them, we
 * preserve verifiability for recent emails.
 *
 * Output format (JSONL, one record per line):
 *   {"domain":"gmail.com","selector":"20230601","pubkey":"<base64 RSA modulus>","first_seen":"2026-05-24T...","last_seen":"...","n":"<hex modulus>","e":"65537"}
 *
 * Usage:
 *   node scraper.mjs                   # single run
 *   node scraper.mjs --watch 3600      # poll every 3600 seconds
 */

import dns from 'node:dns/promises';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const ARCHIVE_FILE = process.env.ARCHIVE_FILE || './dkim-archive.jsonl';
const WATCH_INTERVAL = parseInt(process.argv[3] || '0', 10); // seconds

// Known active selectors per domain. Updated manually when providers announce
// new selectors; the scraper validates each one at runtime.
//
// How to find selectors: inspect email headers (the DKIM-Signature header
// contains s=<selector>;d=<domain>). The selector list below is derived from
// public email header analysis and provider documentation.
const PROVIDERS = [
  // Gmail — date-stamped selectors, rotates every ~6 months
  { domain: 'gmail.com',       selectors: ['20230601', '20221208', '20210112'] },
  // Google Workspace — often uses 'google' or a date-stamped selector
  { domain: 'googlemail.com',  selectors: ['20230601', '20221208'] },
  // Microsoft 365 / Outlook — rotates between selector1 and selector2
  { domain: 'outlook.com',     selectors: ['selector1', 'selector2'] },
  { domain: 'hotmail.com',     selectors: ['selector1', 'selector2'] },
  // Yahoo
  { domain: 'yahoo.com',       selectors: ['s2048'] },
  // Apple
  { domain: 'icloud.com',      selectors: ['sig1'] },
  { domain: 'me.com',          selectors: ['sig1'] },
  // ProtonMail
  { domain: 'proton.me',       selectors: ['protonmail3', 'protonmail2', 'protonmail'] },
  { domain: 'protonmail.com',  selectors: ['protonmail3', 'protonmail2', 'protonmail'] },
  // Major transactional senders
  { domain: 'amazonses.com',   selectors: ['7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'nuwwmnnqqwvzxfpu'] },
  { domain: 'sendgrid.net',    selectors: ['s1', 's2'] },
  { domain: 'mailgun.org',     selectors: ['mailo'] },
];

/**
 * Fetch the DKIM public key for (domain, selector) from DNS.
 * Returns null if the record does not exist or cannot be parsed.
 */
async function fetchDkimKey(domain, selector) {
  const dkimDomain = `${selector}._domainkey.${domain}`;
  try {
    const records = await dns.resolveTxt(dkimDomain);
    const raw = records.flat().join('');

    // Parse the DKIM TXT record. It contains k=rsa; p=<base64 pubkey>
    // Some records span multiple strings — flat().join('') handles that.
    const pMatch = raw.match(/p=([A-Za-z0-9+/=]+)/);
    if (!pMatch || !pMatch[1]) return null;

    const pubkeyBase64 = pMatch[1];
    if (pubkeyBase64 === '') return null; // revoked key

    // Extract key type (default: rsa)
    const kMatch = raw.match(/k=(\w+)/);
    const keyType = kMatch ? kMatch[1] : 'rsa';

    // Compute a Poseidon-compatible identifier (using SHA-256 as a stand-in
    // until we integrate the Poseidon hasher — the on-chain registry uses the
    // raw modulus bytes, not a hash).
    const keyHash = createHash('sha256').update(pubkeyBase64).digest('hex');

    return {
      domain,
      selector,
      dkim_domain: dkimDomain,
      key_type: keyType,
      pubkey_base64: pubkeyBase64,
      key_hash_sha256: keyHash,
      raw_txt: raw,
    };
  } catch {
    return null; // NXDOMAIN or DNS error — key does not exist or is unavailable
  }
}

/**
 * Load existing archive into a map keyed by "domain:selector" for dedup.
 */
function loadArchive() {
  const map = new Map();
  if (!fs.existsSync(ARCHIVE_FILE)) return map;
  const lines = fs.readFileSync(ARCHIVE_FILE, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      map.set(`${record.domain}:${record.selector}`, record);
    } catch { /* skip malformed lines */ }
  }
  return map;
}

/**
 * Append a new record or update last_seen for an existing one.
 */
function upsertRecord(archive, fetched) {
  const key = `${fetched.domain}:${fetched.selector}`;
  const now = new Date().toISOString();

  if (archive.has(key)) {
    const existing = archive.get(key);
    if (existing.key_hash_sha256 === fetched.key_hash_sha256) {
      // Same key — just update last_seen
      existing.last_seen = now;
      return { action: 'updated', record: existing };
    } else {
      // Key rotated — archive the new one as a separate entry
      const newRecord = { ...fetched, first_seen: now, last_seen: now };
      // Keep old record too — mark it as rotated
      existing.rotated_at = now;
      return { action: 'rotated', record: newRecord, old: existing };
    }
  }

  const newRecord = { ...fetched, first_seen: now, last_seen: now };
  archive.set(key, newRecord);
  return { action: 'new', record: newRecord };
}

async function run() {
  const archive = loadArchive();
  const results = { new: 0, updated: 0, rotated: 0, missing: 0 };

  for (const { domain, selectors } of PROVIDERS) {
    for (const selector of selectors) {
      const fetched = await fetchDkimKey(domain, selector);
      if (!fetched) {
        results.missing++;
        continue;
      }

      const { action, record, old } = upsertRecord(archive, fetched);
      results[action]++;

      if (action === 'new' || action === 'rotated') {
        fs.appendFileSync(ARCHIVE_FILE, JSON.stringify(record) + '\n');
        console.log(`[${action.toUpperCase()}] ${domain} / ${selector} — hash ${record.key_hash_sha256.slice(0, 16)}...`);
        if (old) {
          // Rewrite old record with rotated_at marker
          rewriteRecord(old);
        }
      } else {
        console.log(`[OK]      ${domain} / ${selector} — unchanged`);
      }
    }
  }

  console.log(`\nRun complete: ${results.new} new, ${results.updated} updated, ${results.rotated} rotated, ${results.missing} missing`);
  return results;
}

function rewriteRecord(record) {
  // Rewrite the whole file to update the rotated record.
  // Simple approach: read all, replace matching line, write back.
  // For large archives, consider an append-only log with periodic compaction.
  if (!fs.existsSync(ARCHIVE_FILE)) return;
  const lines = fs.readFileSync(ARCHIVE_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const key = `${record.domain}:${record.selector}`;
  const updated = lines.map(line => {
    try {
      const r = JSON.parse(line);
      if (`${r.domain}:${r.selector}` === key && r.key_hash_sha256 === record.key_hash_sha256) {
        return JSON.stringify(record);
      }
    } catch { /* skip */ }
    return line;
  });
  fs.writeFileSync(ARCHIVE_FILE, updated.join('\n') + '\n');
}

// Entry point
if (WATCH_INTERVAL > 0) {
  console.log(`Watching — polling every ${WATCH_INTERVAL}s. Archive: ${ARCHIVE_FILE}`);
  run();
  setInterval(run, WATCH_INTERVAL * 1000);
} else {
  run().catch(console.error);
}
