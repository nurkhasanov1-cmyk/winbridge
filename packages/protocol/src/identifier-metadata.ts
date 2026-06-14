export const SECRET_BEARING_PROTOCOL_IDENTIFIER_MARKERS = [
  "token",
  "credential",
  "password",
  "passphrase",
  "secret",
  "pairingcode",
  "apikey",
  "accesskey",
  "cookie",
  "privatekey",
  "sshkey",
  "authorization",
  "authorizationheader",
  "authheader",
  "proxyauthorization"
] as const;

export function hasSecretBearingProtocolIdentifierMetadata(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");

  return SECRET_BEARING_PROTOCOL_IDENTIFIER_MARKERS.some((marker) => normalized.includes(marker));
}
