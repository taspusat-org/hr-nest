import { z } from 'zod';

export const CreateJabatanSchema = z.object({
  nama: z.string().trim().min(1, { message: 'Nama is required' }).max(255),
  keterangan: z
    .string()
    .trim()
    .min(1, { message: 'Keterangan is required' })
    .max(255),
  // .superRefine(async (data, ctx) => {
  //     const errorMessage = await getErrorMessage('WI'); // Fetch error message asynchronously
  //     ctx.addIssue({
  //         code: z.ZodIssueCode.custom,
  //         message: errorMessage ?? 'Nama is required',
  //     });
  // }),
  statusaktif: z
    .number({ message: 'status aktif harus berupa angka' })
    .int({ message: 'Statusaktif must be an integer' })
    .default(1),
  modifiedby: z.string().nullable().optional(),
});

// Function to validate asynchronously
// export async function validateCreateJabatanDto(data: unknown) {
//   return await CreateJabatanSchema.parseAsync(data);
// }

export type CreateJabatanDto = z.infer<typeof CreateJabatanSchema>;
