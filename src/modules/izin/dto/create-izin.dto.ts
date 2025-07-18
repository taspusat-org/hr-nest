import { z } from 'zod';

export const CreateIzinSchema = z.object({
  tglpengajuan: z.string().nullable().optional(), // Nullable timestamp
  jampengajuan: z.string().nullable().optional(), // Nullable timestamp
  karyawan_id: z.number().int().nullable().optional(), // Nullable integer
  tglizin: z.string().nullable().optional(), // Nullable date
  alasanizin: z.string().nullable().optional(), // Nullable text
  jenisizin_id: z.number().int().nullable().optional(), // Nullable integer
  info: z.string().nullable().optional(), // Nullable text
  modifiedby: z.string().max(200).nullable().optional(), // Nullable string
});

export type CreateIzinDto = z.infer<typeof CreateIzinSchema>;
