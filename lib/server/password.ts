import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${derived}`;
};

export const verifyPassword = (password: string, storedHash: string): boolean => {
  const [salt, stored] = storedHash.split(":");

  if (!salt || !stored) {
    return false;
  }

  const candidate = scryptSync(password, salt, KEYLEN).toString("hex");
  const storedBuffer = Buffer.from(stored, "hex");
  const candidateBuffer = Buffer.from(candidate, "hex");

  if (storedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, candidateBuffer);
};
