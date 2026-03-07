import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  licenseId: string | null;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
