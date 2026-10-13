import { PrismaClient } from "@prisma/client";
const p = new PrismaClient(); const l = await p.lead.findFirst({ where:{source:"META"}, select:{id:true} }); console.log(l.id); await p.$disconnect();
