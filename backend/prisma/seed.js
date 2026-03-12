const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@rubricheck.com" },
    update: {},
    create: {
      email: "admin@rubricheck.com",
      password: adminPassword,
      name: "Admin User",
      role: "ADMIN",
    },
  });

  console.log("Seed complete: admin@rubricheck.com / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
