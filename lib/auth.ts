import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { randomBytes } from 'crypto'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'slopwork-dev-secret-change-in-production'
)

const JWT_ISSUER = 'slopwork'
const JWT_EXPIRY = '24h'

export interface AuthPayload extends JWTPayload {
  wallet: string
}

/** Generate a random nonce for wallet signature auth */
export function generateNonce(): string {
  return randomBytes(32).toString('hex')
}

/** Build the message string that wallets sign */
export function buildSignMessage(nonce: string): string {
  return `Sign this message to authenticate with Slopwork.\n\nNonce: ${nonce}`
}

/** Verify an ed25519 signature from a Solana wallet */
export function verifyWalletSignature(
  walletAddress: string,
  signature: string,
  nonce: string
): boolean {
  try {
    const message = buildSignMessage(nonce)
    const messageBytes = new TextEncoder().encode(message)
    const signatureBytes = bs58.decode(signature)
    const publicKeyBytes = bs58.decode(walletAddress)
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)
  } catch {
    return false
  }
}

/** Issue a JWT for an authenticated wallet */
export async function issueToken(walletAddress: string): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 24 * 60 * 60 // 24 hours

  const token = await new SignJWT({ wallet: walletAddress } as AuthPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET)

  return { token, expiresAt }
}

/** Verify and decode a JWT, returns the wallet address or null */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: JWT_ISSUER })
    const authPayload = payload as AuthPayload
    return authPayload.wallet || null
  } catch {
    return null
  }
}

/** Extract JWT from Authorization header */
export function extractToken(request: Request): string | null {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}

/** Authenticate a request, returns wallet address or null */
export async function authenticateRequest(request: Request): Promise<string | null> {
  const token = extractToken(request)
  if (!token) return null
  return verifyToken(token)
}
