export { AuthProvider, useAuth } from './AuthContext';
export type { AuthUser } from './types';
export { parseAuthUser } from './types';
export { getApiBaseUrl, fetchCurrentUser, refreshAccessToken, loadUserFromApi } from './authApi';
export {
  getGreetingName,
  getUserInitials,
  formatFcfaDots,
  getDisplayFullName,
} from './userDisplay';
