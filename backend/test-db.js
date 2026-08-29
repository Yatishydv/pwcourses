const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.message.count();
  console.log("Total messages in DB:", count);
  const messages = await prisma.message.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log("Latest messages:", messages.map(m => m.content));
}
main().catch(console.error).finally(() => prisma.$disconnect());
