import "dotenv/config";
import { app } from "./app.js";
import { prisma } from "./db.js";

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () =>
  console.log(`VivaCare API em http://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  });
