import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "crypto";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const USERNAME_ADJECTIVES = [
  "amber",
  "coral",
  "dusk",
  "ember",
  "frost",
  "glow",
  "haze",
  "ivory",
  "jade",
  "lunar",
  "mist",
  "nova",
  "opal",
  "pearl",
  "quiet",
  "river",
  "solar",
  "tide",
  "violet",
  "willow",
];

const USERNAME_NOUNS = [
  "bird",
  "bloom",
  "coast",
  "drift",
  "echo",
  "field",
  "grove",
  "harbor",
  "island",
  "lake",
  "meadow",
  "orbit",
  "pine",
  "quest",
  "ridge",
  "stone",
  "trail",
  "vale",
  "wave",
  "zenith",
];

export function generateUsername(): string {
  const adj = USERNAME_ADJECTIVES[randomInt(USERNAME_ADJECTIVES.length)];
  const noun = USERNAME_NOUNS[randomInt(USERNAME_NOUNS.length)];
  const num = randomInt(1000, 9999);
  return `${adj}_${noun}_${num}`;
}

export function generateStrongPassword(length = 16): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
