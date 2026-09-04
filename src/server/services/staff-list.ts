import "server-only";
import { prisma } from "@/server/db";
import { slugify } from "@/lib/slug";

export type PublicTherapist = {
  id: string;
  name: string;
  title: string | null;
  qualifications: string | null;
  bio: string | null;
  photoUrl: string | null;
  slug: string;
};

/**
 * Therapists the public site may show: active account, profile marked public.
 * slug derives from the name (staff_profiles has no slug column and there is
 * no migration in this slice); a same-name collision appends the profile id's
 * first 8 characters so URLs stay unique without a database change.
 * Receptionists have no public profile by convention (their staff_profiles row,
 * if one exists, stays publicVisible false) — the query does not filter by
 * role, it trusts the flag, so a future non-therapist public profile would
 * also render. That is deliberate: visibility is the flag's job, not the
 * role's.
 */
export async function listPublicTherapists(): Promise<PublicTherapist[]> {
  const profiles = await prisma.staffProfile.findMany({
    where: { publicVisible: true, user: { status: "active", deletedAt: null } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: "asc" }, { user: { name: "asc" } }],
  });

  const seen = new Map<string, number>();
  return profiles.map((p) => {
    const base = slugify(p.user.name) || "therapist";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return {
      id: p.user.id,
      name: p.user.name,
      title: p.title,
      qualifications: p.qualifications,
      bio: p.bio,
      photoUrl: p.photoUrl,
      slug: n === 0 ? base : `${base}-${p.user.id.slice(0, 8)}`,
    };
  });
}
