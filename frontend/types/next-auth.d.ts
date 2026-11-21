import "next-auth";
import "next-auth/jwt";

interface ProfileNames {
  firstName: string | null;
  lastName: string | null;
}

declare module "next-auth" {
  interface Session {
    user: ProfileNames & { id: string; name: string; image: string | null };
  }
  interface User extends ProfileNames {
    backendToken: string;
    backendExpiresAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends Partial<ProfileNames> {
    backendToken?: string;
    backendExpiresAt?: number;
  }
}
