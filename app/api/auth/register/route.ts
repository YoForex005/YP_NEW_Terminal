import { NextResponse } from "next/server";
import { registerUser } from "@/lib/server/database";
import { hashPassword } from "@/lib/server/password";
import { issueSessionForCredentials, setSessionCookie } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { email, password, fullName, phone, country } = payload;

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: "Email, password, and full name are required." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 },
      );
    }

    try {
      const passwordHash = hashPassword(password);
      const user = await registerUser({
        email,
        name: fullName,
        phone,
        country,
        passwordHash,
      });

      // Automatically log them in after registration
      const authResult = await issueSessionForCredentials(email, password);
      if (!authResult) {
        return NextResponse.json(
          { error: "User registered but failed to log in." },
          { status: 500 },
        );
      }

      const response = NextResponse.json(
        {
          ok: true,
          message: "Registration successful",
          user: authResult.user,
        },
        { status: 201 },
      );

      setSessionCookie(response, authResult.token, authResult.session.expiresAt, request);
      return response;
    } catch (e) {
      // e.g., "User with this email already exists."
      if (e instanceof Error && e.message.includes("exists")) {
         return NextResponse.json(
          { error: e.message },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error during registration." },
      { status: 500 },
    );
  }
}
