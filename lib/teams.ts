import { z } from "zod";

// Body for creating or changing a team. `memberIds` is the full list of people in it (everyone not listed leaves);
// leave it out to keep the members as they are. `confirm` says "yes, I understand" to a change that gives a
// Manager the whole agency's view (see app/api/teams).
export const teamBodySchema = z.object({
  name: z.string().trim().min(2, "Give the team a name").max(60, "That name is too long").optional(),
  managerId: z.string().min(1).nullable().optional(),
  memberIds: z.array(z.string().min(1)).max(500).optional(),
  confirm: z.boolean().optional(),
});
export type TeamBody = z.infer<typeof teamBodySchema>;

export interface TeamDTO {
  id: string;
  name: string;
  manager: { id: string; name: string } | null;
  members: { id: string; name: string; role: string; avatarUrl: string | null; status: string }[];
}
