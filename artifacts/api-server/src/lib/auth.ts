import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

function requireSecret(envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${envVar}. ` +
      `Set this secret before starting the server.`
    );
  }
  return value;
}

const USER_TOKEN_AUDIENCE = "opportunity-os:workspace";
const ADMIN_TOKEN_AUDIENCE = "opportunity-os:platform-admin";

export interface JWTPayload {
  userId: string;
  workspaceId: string;
  email: string;
}

export interface AdminJWTPayload {
  userId: string;
  email: string;
  isPlatformAdmin: true;
  platformRole: string | null;
}

export function signToken(payload: JWTPayload, rememberMe = false): string {
  return jwt.sign(payload, requireSecret("JWT_SECRET"), {
    expiresIn: rememberMe ? "30d" : "24h",
    audience: USER_TOKEN_AUDIENCE,
  });
}

export function signAdminToken(payload: AdminJWTPayload, rememberMe = false): string {
  return jwt.sign(payload, requireSecret("JWT_ADMIN_SECRET"), {
    expiresIn: rememberMe ? "30d" : "24h",
    audience: ADMIN_TOKEN_AUDIENCE,
  });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, requireSecret("JWT_SECRET"), {
    audience: USER_TOKEN_AUDIENCE,
  }) as JWTPayload;
}

export function verifyAdminToken(token: string): AdminJWTPayload {
  const payload = jwt.verify(token, requireSecret("JWT_ADMIN_SECRET"), {
    audience: ADMIN_TOKEN_AUDIENCE,
  }) as AdminJWTPayload;
  if (!payload.isPlatformAdmin) {
    throw new Error("Not a platform admin token");
  }
  return payload;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function extractToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}
