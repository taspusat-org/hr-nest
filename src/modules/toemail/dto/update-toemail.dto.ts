import { z } from 'zod';
export const UpdateToemailSchema = z.object({
  nama: z.string().trim().min(1, { message: 'Nama is required' }).max(255),
  email: z.string().trim().email({ message: 'Invalid email format' }).max(255),
  statusaktif: z
    .number()
    .int({ message: 'Statusaktif must be an integer' })
    .default(1),
  modifiedby: z.string().nullable().optional(),
  lookupNama: z.string().nullable().optional(),
});
export type UpdateToemailDto = z.infer<typeof UpdateToemailSchema>;
