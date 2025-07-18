import { z } from 'zod';

export const cutiSchema = z.object({
  tglcuti: z.string().nullable().optional(), // Foreign key, bisa kosong
  karyawan_id: z.number().nullable().optional(), // Foreign key, bisa kosong
  alasancuti: z.string().optional(), // Ikon opsional
  lampiran: z.array(z.any()).nullable().optional(), // Tanggal cuti wajib diisi
  tanggalcutidipilih: z
    .array(z.string()) // Validasi sebagai array string
    .optional()
    .refine((val) => val && val.length > 0, {
      message: 'tanggalcutidipilih harus berisi setidaknya satu tanggal',
    }), // Pastikan ada setidaknya satu tanggal
});

export type CreateCutiDto = z.infer<typeof cutiSchema>;
