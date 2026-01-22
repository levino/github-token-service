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

    // Sign a challenge (like YubiKey would during authentication)
    sign: async (credentialId: string, clientDataJSON: string, rpIdHash?: Uint8Array): Promise<{
      authenticatorData: string; // base64
      signature: string;         // base64
      clientDataJSON: string;    // base64
    }> => {
      const keyPair = credentials.get(credentialId);
      if (!keyPair) {
        throw new Error(`Unknown credential: ${credentialId}`);
      }

      // Use provided rpIdHash or create a dummy one
      const rpHash = rpIdHash ?? new Uint8Array(32);

      // Authenticator data: rpIdHash (32) + flags (1) + counter (4)
      const flags = 0x05; // user present (0x01) + user verified (0x04)
      const counter = new Uint8Array([0, 0, 0, 1]);

      const authenticatorData = new Uint8Array(37);
      authenticatorData.set(rpHash, 0);
      authenticatorData[32] = flags;
      authenticatorData.set(counter, 33);

      // Client data hash
      const clientDataHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', Buffer.from(clientDataJSON))
      );

      // Data to sign: authenticatorData || clientDataHash
      const signData = new Uint8Array(authenticatorData.length + clientDataHash.length);
      signData.set(authenticatorData, 0);
      signData.set(clientDataHash, authenticatorData.length);

      // Sign with private key
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          keyPair.privateKey,
          signData
        )
      );

      return {
        authenticatorData: Buffer.from(authenticatorData).toString('base64'),
        signature: Buffer.from(signature).toString('base64'),
        clientDataJSON: Buffer.from(clientDataJSON).toString('base64'),
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

      const publicKey = await crypto.subtle.importKey(
        'jwk',
        { ...jwk, d: undefined },
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify']
      );

      credentials.set(credentialId, { privateKey, publicKey });
    },
  };
}
