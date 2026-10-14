import { PrismaClient, Role, SubscriptionStatus } from "@prisma/client";
import { addMonths } from "date-fns";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMeNow!123";
  const adminUsername = (process.env.ADMIN_USERNAME || "admin").toLowerCase();

  const adminHash = await hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      email: adminEmail,
      passwordHash: adminHash,
      role: Role.ADMIN,
      status: SubscriptionStatus.ACTIVE,
      subscriptionStart: new Date(),
      subscriptionEnd: addMonths(new Date(), 120),
    },
    create: {
      email: adminEmail,
      username: adminUsername,
      passwordHash: adminHash,
      role: Role.ADMIN,
      status: SubscriptionStatus.ACTIVE,
      bio: "Platform owner",
      subscriptionStart: new Date(),
      subscriptionEnd: addMonths(new Date(), 120),
    },
  });

  const demos = [
    {
      username: "demo_active",
      password: "DemoActive!123",
      status: SubscriptionStatus.ACTIVE,
      end: addMonths(new Date(), 1),
      bio: "Active demo subscriber",
    },
    {
      username: "demo_expired",
      password: "DemoExpired!123",
      status: SubscriptionStatus.EXPIRED,
      end: addMonths(new Date(), -1),
      bio: "Expired demo subscriber",
    },
    {
      username: "demo_suspended",
      password: "DemoSuspended!123",
      status: SubscriptionStatus.SUSPENDED,
      end: addMonths(new Date(), 1),
      bio: "Suspended demo subscriber",
    },
  ];

  for (const demo of demos) {
    const passwordHash = await hashPassword(demo.password);
    await prisma.user.upsert({
      where: { username: demo.username },
      update: {
        passwordHash,
        status: demo.status,
        subscriptionStart: addMonths(new Date(), -2),
        subscriptionEnd: demo.end,
        bio: demo.bio,
        role: Role.SUBSCRIBER,
      },
      create: {
        username: demo.username,
        passwordHash,
        status: demo.status,
        subscriptionStart: addMonths(new Date(), -2),
        subscriptionEnd: demo.end,
        bio: demo.bio,
        role: Role.SUBSCRIBER,
      },
    });
  }

  console.log("Seed complete");
  console.log(`Admin: ${admin.username} / (ADMIN_PASSWORD from env)`);
  console.log("Demo users:");
  for (const demo of demos) {
    console.log(`  ${demo.username} / ${demo.password} [${demo.status}]`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
