import { z } from 'zod';

export const CreateDaftaremailSchema = z.object({
  kode: z.string().max(255).optional(), // Nullable field
  ket: z.string().max(255).optional(), // Nullable field
  modifiedby: z.string().max(50).optional(), // Nullable field
  statusaktif: z.number().max(50).optional(), // Nullable field
});

export type CreateDaftaremailDto = z.infer<typeof CreateDaftaremailSchema>;
