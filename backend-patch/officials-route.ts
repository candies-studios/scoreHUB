import { prisma } from '@/lib/db';
import { handle, ok } from '@/lib/api';

/**
 * Officials the sign-in screen can offer.
 *
 * Save as: src/app/api/auth/officials/route.ts
 *
 * The Next.js login page read this list straight from the database in a server
 * component. A static client has no server to do that in, so the list needs a
 * route of its own — and it must be reachable *before* a session exists, so it
 * deliberately does not call requireUser().
 *
 * What this exposes: the names, roles and ids of your officials. That is the
 * same trade the app already makes — sign-in is a choice of person, not a
 * credential, so anyone who can open the app can act as anyone in it. If the
 * static site is on a public URL, put it behind something (a VPN, an IP
 * allow-list, or a shared event PIN) exactly as src/lib/auth.ts advises.
 */
export const GET = handle(async () => {
  const officials = await prisma.user.findMany({
    where: { active: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    // No email or passwordHash — the client only needs enough to draw buttons.
    select: { id: true, name: true, role: true, active: true },
  });
  return ok(officials);
});
