// WebAuthn biometric authentication utilities

// Check if WebAuthn is supported
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  );
}

// Check if platform authenticator (Face ID, Touch ID, Windows Hello) is available
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Register biometric credential
export async function registerBiometric(
  userId: string,
  userName: string
): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn not supported');
  }

  try {
    // Get challenge from server
    const challengeResponse = await fetch('/api/auth/webauthn/register-challenge', {
      method: 'POST',
      credentials: 'include',
    });

    if (!challengeResponse.ok) {
      throw new Error('Failed to get registration challenge');
    }

    const { challenge, rpId, rpName } = await challengeResponse.json();

    // Create credential using platform authenticator
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: base64ToArrayBuffer(challenge),
        rp: {
          id: rpId,
          name: rpName,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Built-in biometric
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Credential creation failed');
    }

    const attestationResponse = credential.response as AuthenticatorAttestationResponse;

    // Send credential to server for storage
    const registerResponse = await fetch('/api/auth/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        credential: {
          id: credential.id,
          rawId: arrayBufferToBase64(credential.rawId),
          response: {
            attestationObject: arrayBufferToBase64(attestationResponse.attestationObject),
            clientDataJSON: arrayBufferToBase64(attestationResponse.clientDataJSON),
          },
          type: credential.type,
        },
      }),
    });

    return registerResponse.ok;
  } catch (error) {
    console.error('Biometric registration failed:', error);
    throw error;
  }
}

// Authenticate with biometric
export async function authenticateBiometric(): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    return false;
  }

  try {
    // Get challenge from server
    const challengeResponse = await fetch('/api/auth/webauthn/login-challenge', {
      credentials: 'include',
    });

    if (!challengeResponse.ok) {
      return false;
    }

    const { challenge, rpId, allowCredentials } = await challengeResponse.json();

    // Get credential using platform authenticator
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: base64ToArrayBuffer(challenge),
        rpId,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: allowCredentials?.map((cred: any) => ({
          id: base64ToArrayBuffer(cred.id),
          type: 'public-key',
        })),
      },
    }) as PublicKeyCredential;

    if (!credential) {
      return false;
    }

    const assertionResponse = credential.response as AuthenticatorAssertionResponse;

    // Verify with server
    const verifyResponse = await fetch('/api/auth/webauthn/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        credential: {
          id: credential.id,
          rawId: arrayBufferToBase64(credential.rawId),
          response: {
            authenticatorData: arrayBufferToBase64(assertionResponse.authenticatorData),
            clientDataJSON: arrayBufferToBase64(assertionResponse.clientDataJSON),
            signature: arrayBufferToBase64(assertionResponse.signature),
            userHandle: assertionResponse.userHandle
              ? arrayBufferToBase64(assertionResponse.userHandle)
              : null,
          },
          type: credential.type,
        },
      }),
    });

    return verifyResponse.ok;
  } catch (error) {
    console.error('Biometric authentication failed:', error);
    return false;
  }
}

// Check if user has registered biometric credentials
export async function hasBiometricCredential(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/webauthn/credentials', {
      credentials: 'include',
    });

    if (!response.ok) return false;

    const { credentials } = await response.json();
    return credentials?.length > 0;
  } catch {
    return false;
  }
}
