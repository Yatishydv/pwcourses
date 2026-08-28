import * as argon2 from 'argon2';
import crypto from 'crypto';

export const hashPin = async (pin: string): Promise<string> => {
  return argon2.hash(pin);
};

export const verifyPin = async (hash: string, pin: string): Promise<boolean> => {
  return argon2.verify(hash, pin);
};

export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
