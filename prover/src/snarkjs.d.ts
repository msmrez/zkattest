// Minimal type declarations for the sampritipanda/snarkjs fork.
// snarkjs has no bundled .d.ts; this covers the surface we use.
declare module 'snarkjs' {
  export namespace groth16 {
    function fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFileName: string,
    ): Promise<{
      proof: {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
      };
      publicSignals: string[];
    }>;

    function verify(
      vkey: Record<string, unknown>,
      publicSignals: string[],
      proof: {
        pi_a: unknown[];
        pi_b: unknown[][];
        pi_c: unknown[];
        protocol: string;
      },
    ): Promise<boolean>;
  }
}
