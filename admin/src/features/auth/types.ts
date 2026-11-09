export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin';
  permissions?: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AdminLoginResult {
  user: AdminUser;
  tokenType: string;
  accessTokenExpiresAt: string;
  accessToken?: string;
}

