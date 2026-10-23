import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "./db.js";

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
export const makeProtocol = () =>
  `VC-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
export const hashPassword = (plain) => bcrypt.hash(plain, 12);

export async function requireUser(req, res, next) {
  try {
    if (!req.session?.userId)
      return res.status(401).json({ error: "Autenticação necessária." });
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: { sectors: true },
    });
    if (!user?.active)
      return res.status(401).json({ error: "Sessão inválida." });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export const allowRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: "Acesso não autorizado." });
    next();
  };

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
