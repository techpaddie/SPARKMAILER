/**
 * Run: npx tsx scripts/create-admin.ts
 * Creates an admin user. Requires DATABASE_URL in .env
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@sparkmailer.local';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!@#';
  const hash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: 'ADMIN' },
    create: {
      email,
      passwordHash: hash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('Admin created:', admin.email);
  console.log('Password:', password);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
