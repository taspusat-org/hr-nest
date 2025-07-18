import { z } from 'zod';

export const UpdateRoleSchema = z.object({
  rolename: z
    .string()
    .min(1, { message: 'Rolename is required and cannot be empty' })
    .trim()
    .optional(), // Make it optional for update
  statusaktif: z
    .number()
    .int({ message: 'statusaktif must be an integer' })
    .nonnegative({ message: 'statusaktif must be a non-negative integer' })
    .optional(), // Make it optional for update
  modifiedby: z.string().nullable().optional(), // Optional, as it could be set automatically
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
