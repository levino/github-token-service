import { webcrypto } from 'node:crypto';

const crypto = webcrypto as unknown as Crypto;

// COSE algorithm identifier for ES256
const COSE_ALG_ES256 = -7;
const COSE_KEY_TYPE_EC2 = 2;
const COSE_CURVE_P256 = 1;

// Factory function - returns authenticator with internal state
export function createSoftwareAuthenticator() {
  const credentials = new Map<string, CryptoKeyPair>();

  function generateCredentialId(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('base64url');
  }

  async function exportPublicKeyToCose(publicKey: CryptoKey): Promise<Uint8Array> {
    // Export public key as raw (uncompressed point format: 04 || x || y)
    const rawKey = await crypto.subtle.exportKey('raw', publicKey);
    const rawBytes = new Uint8Array(rawKey);

    // Skip the 0x04 prefix, extract x and y (32 bytes each)
    const x = rawBytes.slice(1, 33);
    const y = rawBytes.slice(33, 65);

    // Build COSE key structure (simplified CBOR encoding)
    // {1: 2, 3: -7, -1: 1, -2: x, -3: y}
    // key type = EC2 (2), alg = ES256 (-7), curve = P-256 (1)
    const coseKey = new Map<number, number | Uint8Array>();
    coseKey.set(1, COSE_KEY_TYPE_EC2);  // kty: EC2
    coseKey.set(3, COSE_ALG_ES256);     // alg: ES256
    coseKey.set(-1, COSE_CURVE_P256);   // crv: P-256
    coseKey.set(-2, x);                  // x coordinate
    coseKey.set(-3, y);                  // y coordinate

    return encodeCoseKey(coseKey);
  }

  function encodeCoseKey(map: Map<number, number | Uint8Array>): Uint8Array {
    const parts: Uint8Array[] = [];

    // CBOR map header (5 items)
    parts.push(new Uint8Array([0xa5]));

    for (const [key, value] of map) {
      // Encode key (integer)
      if (key >= 0) {
        if (key <= 23) {
          parts.push(new Uint8Array([key]));
        } else {
          parts.push(new Uint8Array([0x18, key]));
        }
      } else {
        const negKey = -1 - key;
        if (negKey <= 23) {
          parts.push(new Uint8Array([0x20 + negKey]));
        } else {
          parts.push(new Uint8Array([0x38, negKey]));
        }
      }

      // Encode value
      if (typeof value === 'number') {
        if (value >= 0) {
          if (value <= 23) {
            parts.push(new Uint8Array([value]));
          } else {
            parts.push(new Uint8Array([0x18, value]));
          }
        } else {
          const negVal = -1 - value;
          if (negVal <= 23) {
            parts.push(new Uint8Array([0x20 + negVal]));
          } else {
            parts.push(new Uint8Array([0x38, negVal]));
          }
        }
      } else {
        // Byte string
        const len = value.length;
        if (len <= 23) {
          parts.push(new Uint8Array([0x40 + len]));
        } else if (len <= 255) {
          parts.push(new Uint8Array([0x58, len]));
        } else {
          parts.push(new Uint8Array([0x59, len >> 8, len & 0xff]));
        }
        parts.push(value);
      }
    }

    // Concatenate all parts
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  async function exportPrivateKey(keyPair: CryptoKeyPair): Promise<string> {
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    return Buffer.from(JSON.stringify(jwk)).toString('base64');
  }

  async function hashRpId(rpId: string): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId));
    return new Uint8Array(hash);
  }

  return {
    // Create a new credential (like YubiKey would during registration)
    createCredential: async (rpId: string): Promise<{
      credentialId: string;
      publicKey: string;  // COSE format, base64
      privateKey: string; // JWK format, base64 (for signing in tests)
    }> => {
      // Generate ECDSA P-256 key pair
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true, // extractable
        ['sign', 'verify']
      );

      const credentialId = generateCredentialId();
      credentials.set(credentialId, keyPair);

      const publicKeyCose = await exportPublicKeyToCose(keyPair.publicKey);
      const privateKeyJwk = await exportPrivateKey(keyPair);

      // Store rpId for future signing (not used currently but could be useful)
      void rpId;

      return {
        credentialId,
        publicKey: Buffer.from(publicKeyCose).toString('base64'),
        privateKey: privateKeyJwk,
      };
    },

    // Sign a challenge for WebAuthn authentication
    signChallenge: async (
      credentialId: string,
      challenge: string,
      rpId: string,
      origin: string
    ): Promise<{
      id: string;
      rawId: string;
      response: {
        authenticatorData: string;
        clientDataJSON: string;
        signature: string;
      };
      type: 'public-key';
      clientExtensionResults: Record<string, never>;
      authenticatorAttachment: 'cross-platform';
    }> => {
      const keyPair = credentials.get(credentialId);
      if (!keyPair) {
        throw new Error(`Unknown credential: ${credentialId}`);
      }

      // Build client data JSON
      const clientData = {
        type: 'webauthn.get',
        challenge: challenge,
        origin: origin,
        crossOrigin: false,
      };
      const clientDataJSON = JSON.stringify(clientData);
      const clientDataJSONBytes = new TextEncoder().encode(clientDataJSON);

      // Build authenticator data
      const rpIdHash = await hashRpId(rpId);
      const flags = 0x05; // user present (0x01) + user verified (0x04)
      const counter = new Uint8Array([0, 0, 0, 1]);

      const authenticatorData = new Uint8Array(37);
      authenticatorData.set(rpIdHash, 0);
      authenticatorData[32] = flags;
      authenticatorData.set(counter, 33);

      // Client data hash
      const clientDataHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', clientDataJSONBytes)
      );

      // Data to sign: authenticatorData || clientDataHash
      const signData = new Uint8Array(authenticatorData.length + clientDataHash.length);
      signData.set(authenticatorData, 0);
      signData.set(clientDataHash, authenticatorData.length);

      // Sign with private key (returns IEEE P1363 format for P-256)
      const signatureP1363 = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          keyPair.privateKey,
          signData
        )
      );

      // Convert P1363 to DER format (WebAuthn expects DER)
      const signature = p1363ToDer(signatureP1363);

      return {
        id: credentialId,
        rawId: credentialId,
        response: {
          authenticatorData: Buffer.from(authenticatorData).toString('base64url'),
          clientDataJSON: Buffer.from(clientDataJSONBytes).toString('base64url'),
          signature: Buffer.from(signature).toString('base64url'),
        },
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'cross-platform',
      };
    },

    // Load a credential from stored private key (for testing)
    loadCredential: async (credentialId: string, privateKeyBase64: string): Promise<void> => {
      const jwk = JSON.parse(Buffer.from(privateKeyBase64, 'base64').toString('utf-8'));

      const privateKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );

      // Create public key JWK by removing private component and updating key_ops
      const publicJwk = { ...jwk, d: undefined, key_ops: ['verify'] };

      const publicKey = await crypto.subtle.importKey(
        'jwk',
        publicJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify']
      );

      credentials.set(credentialId, { privateKey, publicKey });
    },
  };
}

// Convert IEEE P1363 signature to DER format
function p1363ToDer(signature: Uint8Array): Uint8Array {
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);

  function encodeInteger(bytes: Uint8Array): Uint8Array {
    // Remove leading zeros
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) {
      start++;
    }
    let trimmed = bytes.slice(start);

    // Add leading zero if high bit is set
    if (trimmed[0] & 0x80) {
      const padded = new Uint8Array(trimmed.length + 1);
      padded[0] = 0;
      padded.set(trimmed, 1);
      trimmed = padded;
    }

    // DER INTEGER: 0x02 || length || value
    const result = new Uint8Array(2 + trimmed.length);
    result[0] = 0x02;
    result[1] = trimmed.length;
    result.set(trimmed, 2);
    return result;
  }

  const rDer = encodeInteger(r);
  const sDer = encodeInteger(s);

  // DER SEQUENCE: 0x30 || length || r || s
  const result = new Uint8Array(2 + rDer.length + sDer.length);
  result[0] = 0x30;
  result[1] = rDer.length + sDer.length;
  result.set(rDer, 2);
  result.set(sDer, 2 + rDer.length);

  return result;
}
