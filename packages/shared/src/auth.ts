export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  bio: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
}
