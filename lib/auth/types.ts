export interface AuthUser {
  id: string;
  brokerId?: string;
  email: string;
  name: string;
  role: "admin" | "user";
  emailVerified?: string;
  mobileVerified?: string;
  profileVerified?: string;
  phone?: string;
  country?: string;
  kycData?: any;
}
