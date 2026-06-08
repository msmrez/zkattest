pragma circom 2.1.6;

include "@zk-email/circuits/email-verifier.circom";

/// Minimal real-zkEmail circuit for the zkAttest spike.
///
/// Verifies that a DKIM-signed email header is valid under an RSA-2048 public
/// key, without checking the body hash (ignoreBodyHashCheck=1). This keeps the
/// constraint count manageable while still proving the meaningful claim:
/// "this email header was signed by this DKIM key right now."
///
/// Public outputs (auto-public per Groth16):
///   pubkeyHash  Poseidon hash of the RSA pubkey chunks (look up in DKIM registry)
///   shaHi       upper 128 bits of SHA-256(header)
///   shaLo       lower 128 bits of SHA-256(header)
///
/// Body verification, masking, and soft-line-break handling are all off to
/// keep this spike small. The shape is deliberately picked so a Bounty-grade
/// upgrade just toggles parameters — no architectural change.
template ZkAttestEmail() {
    // 256 header bytes covers the relevant DKIM-signed slice for short test
    // emails. Production zkEmail apps use 1024+. Must be a multiple of 64.
    signal input emailHeader[256];
    signal input emailHeaderLength;

    // RSA-2048 split into k=17 chunks of n=121 bits (standard zkEmail layout).
    signal input pubkey[17];
    signal input signature[17];

    signal output pubkeyHash;
    signal output shaHi;
    signal output shaLo;

    component verifier = EmailVerifier(
        256,  // maxHeadersLength
        64,   // maxBodyLength (unused with ignoreBodyHashCheck=1, but must be a multiple of 64)
        121,  // n
        17,   // k
        1,    // ignoreBodyHashCheck
        0,    // enableHeaderMasking
        0,    // enableBodyMasking
        0     // removeSoftLineBreaks
    );
    verifier.emailHeader <== emailHeader;
    verifier.emailHeaderLength <== emailHeaderLength;
    verifier.pubkey <== pubkey;
    verifier.signature <== signature;

    pubkeyHash <== verifier.pubkeyHash;
    shaHi <== verifier.shaHi;
    shaLo <== verifier.shaLo;
}

component main = ZkAttestEmail();
