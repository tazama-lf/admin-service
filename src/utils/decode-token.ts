import type { DecodedToken } from '../interface/DecodedToken';
import jwt from 'jsonwebtoken';

export const decodeInnerToken = (token: string): DecodedToken | null => {
  const tokenString = token?.split(' ')[1] ?? '';
  const decodeOuterToken = (jwt.decode(tokenString) as { tokenString: string })?.tokenString;

  const decodeInnerToken = jwt.decode(decodeOuterToken);
  return decodeInnerToken as DecodedToken | null;
};
