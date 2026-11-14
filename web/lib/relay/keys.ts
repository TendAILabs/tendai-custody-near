export function recipientPublicKey(input: { chainHex: string; serverHex?: string | null }): {
  publicKeyHex: string;
  warning: string | null;
} {
  const chain = input.chainHex.trim().toLowerCase();
  const offered = input.serverHex?.trim().toLowerCase() ?? "";
  const warning =
    offered && offered !== chain
      ? "Server offered an encryption key that does not match the on-chain directory. Wrapping to the on-chain key."
      : null;
  return { publicKeyHex: chain, warning };
}

export function flipCiphertextByte(ciphertext: string): string {
  if (ciphertext.length === 0) return "A";
  const chars = ciphertext.split("");
  const last = chars.length - 1;
  chars[last] = chars[last] === "A" ? "B" : "A";
  return chars.join("");
}

export function rejectSwappedArtifact(servedHash: string, onChainHash: string): void {
  if (servedHash.toLowerCase() !== onChainHash.toLowerCase()) {
    throw new Error("envelope swap");
  }
}
