export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: 'active' | 'disabled';
  version: number;
  onboardingCompleted: boolean;
  currentOnboardingStep: string | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'disabled';
  role?: 'admin' | 'member';
  onboarding?: 'completed' | 'pending';
  sort?: string;
  order?: 'asc' | 'desc';
}

