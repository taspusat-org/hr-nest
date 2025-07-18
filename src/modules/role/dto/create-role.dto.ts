import { z } from 'zod';

export const CreateRoleSchema = z.object({
  rolename: z
    .string()
    .min(1, { message: 'Rolename is required and cannot be empty' })
    .trim(), // Ensure no extra whitespace
  statusaktif: z
    .number()
    .int({ message: 'statusaktif must be an integer' })
    .nonnegative({ message: 'statusaktif must be a non-negative integer' }), // Ensure non-negative
  modifiedby: z.string().nullable().optional(),
});

export type CreateRoleDto = z.infer<typeof CreateRoleSchema>;
