// import { getErrorMessage } from 'src/utils/utils.service';
import { z } from 'zod';

export const CreateToemailSchema = z.object({
  nama: z.string().trim().min(1, { message: 'Nama is required' }).max(255),
  // .superRefine(async (data, ctx) => {
  //     const errorMessage = await getErrorMessage('WI'); // Fetch error message asynchronously
  //     ctx.addIssue({
  //         code: z.ZodIssueCode.custom,
  //         message: errorMessage ?? 'Nama is required',
  //     });
  // }),
  email: z.string().trim().email({ message: 'Invalid email format' }).max(255),
  statusaktif: z
    .number({ message: 'status aktif harus berupa angka' })
    .int({ message: 'Statusaktif must be an integer' })
    .default(1),
  modifiedby: z.string().nullable().optional(),
});

// Function to validate asynchronously
// export async function validateCreateToemailDto(data: unknown) {
//   return await CreateToemailSchema.parseAsync(data);
// }

export type CreateToemailDto = z.infer<typeof CreateToemailSchema>;
