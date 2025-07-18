import { z } from 'zod';
export const UpdateJabatanSchema = z.object({
  nama: z.string().trim().min(1, { message: 'Nama is required' }).max(255),
  keterangan: z.string().nullable().optional(),
  statusaktif: z.number().nullable().optional(),
  modifiedby: z.string().nullable().optional(),
  lookupNama: z.string().nullable().optional(),
});
export type UpdateJabatanDto = z.infer<typeof UpdateJabatanSchema>;
