import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getUserById, updateUserProfile, type AppUser } from "@/lib/server/database";

interface UpdateProfileBody {
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
}

interface ProfilePayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
}

const MAX_NAME_LENGTH = 50;
const MAX_PHONE_LENGTH = 32;
const PHONE_PATTERN = /^[0-9+().\-\s]*$/;

const splitName = (name: string): { firstName: string; lastName: string } => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: "User",
      lastName: "",
    };
  }

  return {
    firstName: parts[0] ?? "User",
    lastName: parts.slice(1).join(" "),
  };
};

const toProfilePayload = (user: AppUser): ProfilePayload => {
  const { firstName, lastName } = splitName(user.name);
  return {
    firstName,
    lastName,
    email: user.email,
    phone: user.phone ?? "",
    country: user.country ?? "",
  };
};

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserById(auth.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json(
    { profile: toProfilePayload(user) },
    { status: 200 },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateProfileBody;
  try {
    body = (await request.json()) as UpdateProfileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const country = body.country?.trim() ?? "";

  if (!firstName) {
    return NextResponse.json(
      { error: "First name is required." },
      { status: 400 },
    );
  }

  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: "First name and last name must be 50 characters or fewer." },
      { status: 400 },
    );
  }

  if (phone.length > MAX_PHONE_LENGTH) {
    return NextResponse.json(
      { error: "Phone number must be 32 characters or fewer." },
      { status: 400 },
    );
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    return NextResponse.json(
      { error: "Phone number contains unsupported characters." },
      { status: 400 },
    );
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const user = await updateUserProfile(auth.user.id, {
    name: fullName,
    phone,
    country,
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      message: "Profile updated successfully.",
      profile: toProfilePayload(user),
    },
    { status: 200 },
  );
}
