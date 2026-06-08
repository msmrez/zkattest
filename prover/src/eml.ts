/**
 * EML parsing utilities.
 *
 * Extracts the DKIM-Signature header from a raw email and validates that the
 * email is structurally suitable for ZK proving (i.e., it has a DKIM signature
 * from a supported key type).
 */

export interface DkimHeader {
  /** Raw DKIM-Signature header value (unfolded). */
  raw: string;
  /** Signing domain (d= tag). */
  domain: string;
  /** Selector (s= tag). */
  selector: string;
  /** Key type (k= tag, default "rsa"). */
  keyType: string;
  /** Hashing algorithm (a= tag, e.g. "rsa-sha256"). */
  algorithm: string;
  /** Canonicalization (c= tag, e.g. "relaxed/relaxed"). */
  canonicalization: string;
  /** The base64 DKIM signature value (b= tag). */
  signature: string;
}

/**
 * Parse a raw .eml string and extract the first valid DKIM-Signature header.
 *
 * Returns null if no DKIM signature is found, or if the signature uses an
 * unsupported algorithm (we require rsa-sha256 — the standard zkEmail circuit
 * does not support rsa-sha1 or ed25519 yet).
 */
export function extractDkimHeader(eml: string): DkimHeader | null {
  // Unfold header lines (RFC 2822: continuation lines start with whitespace)
  const unfolded = eml.replace(/\r?\n[ \t]+/g, ' ');

  // Find the DKIM-Signature header (case-insensitive)
  const match = unfolded.match(/^DKIM-Signature:\s*(.+)$/im);
  if (!match) return null;

  const raw = match[1].trim();

  const tag = (name: string): string | null => {
    const m = raw.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`, 'i'));
    return m ? m[1].trim() : null;
  };

  const domain = tag('d');
  const selector = tag('s');
  const algorithm = tag('a') ?? 'rsa-sha256';
  const keyType = tag('k') ?? 'rsa';
  const canonicalization = tag('c') ?? 'simple/simple';
  const signature = tag('b');

  if (!domain || !selector || !signature) return null;

  // Only rsa-sha256 is supported by the standard zkEmail circuit
  if (!algorithm.toLowerCase().includes('sha256')) {
    throw new Error(
      `Unsupported DKIM algorithm: ${algorithm}. ` +
      `zkAttest requires rsa-sha256. This email cannot be proved.`
    );
  }

  return { raw, domain, selector, keyType, algorithm, canonicalization, signature };
}

/**
 * Split an email into headers and body sections.
 * Returns both parts as strings, preserving original line endings.
 */
export function splitHeadersBody(eml: string): { headers: string; body: string } {
  // Headers and body are separated by the first blank line
  const crlf = eml.indexOf('\r\n\r\n');
  const lf = eml.indexOf('\n\n');

  const separatorIdx =
    crlf !== -1 && (lf === -1 || crlf < lf) ? crlf : lf;

  if (separatorIdx === -1) {
    return { headers: eml, body: '' };
  }

  const sepLen = eml[separatorIdx] === '\r' ? 4 : 2;
  return {
    headers: eml.slice(0, separatorIdx),
    body: eml.slice(separatorIdx + sepLen),
  };
}
