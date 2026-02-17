import type { DecodedToken } from '../interface/DecodedToken';
import jwt from 'jsonwebtoken';

export const decodeInnerToken = (token: string): DecodedToken | null => {
  const decodeOuterToken = (jwt.decode(token) as { tokenString: string })?.tokenString;
  const decodeInnerToken = jwt.decode(decodeOuterToken);
  return decodeInnerToken as DecodedToken | null;
};
