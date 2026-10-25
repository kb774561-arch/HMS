import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../utils/password.js";

/**
 * Reset a user's password (and re-activate the account).
 *   npm run user:password -- <username> <password>
 */
const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 6) {
  console.error("Usage: npm run user:password -- <username> <password>   (password ≥ 6 characters)");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`User "${username}" not found`);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false, isActive: true, deletedAt: null },
  });
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  console.log(`✓ Password set for ${username}`);
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
