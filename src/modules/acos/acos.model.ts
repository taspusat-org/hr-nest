import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { dbMssql } from 'src/common/utils/db';
import { CreateAcosDto } from './dto/create-aco.dto';

export class AcosModel {
  static async syncAcos(username: string) {
    const controllersPath = 'src/modules/**/*.controller.ts';

    const files = glob.sync(controllersPath);

    const acosEntries: CreateAcosDto[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Refactored regex: Ignore text inside parentheses and capture all methods (GET, POST, PUT, DELETE, PATCH)
      const regex =
        /@((Get|Post|Put|Delete|Patch)\([^)]*\))[\s\S]*?\/\/@([\w\- ]+)/g;
      let match;

      // Capture all matches for HTTP methods and class names
      while ((match = regex.exec(content)) !== null) {
        const httpMethod = match[2].toUpperCase(); // Extract HTTP method type (GET, POST, etc.)
        const className = match[3].trim(); // Extract class name (APPROVAL-CUTI)

        // Debugging: Log match details
        // Ensure we associate the method with the correct class name
        if (httpMethod && className) {
          acosEntries.push({
            class: className,
            method: httpMethod,
            nama: `${className}->${httpMethod}`,
            modifiedby: username,
          });
        }
      }

      // Debugging: Log entries before inserting
    }

    if (acosEntries.length === 0) {
      return { success: false, message: 'No ACOS entries found.' };
    }

    try {
      // Create "OR" conditions for each class-method pair
      const conditions = acosEntries
        .map(
          (entry) =>
            `([class] = '${entry.class}' AND [method] = '${entry.method}')`,
        )
        .join(' OR ');

      // Debugging: Log the query condition
      // Query the database for existing entries based on the class-method pairs
      const existingEntries = await dbMssql('acos')
        .select('class', 'method')
        .whereRaw(conditions);

      // Debugging: Log existing entries from DB
      // Filter out entries that already exist
      const newEntries = acosEntries.filter(
        (entry) =>
          !existingEntries.some(
            (existing) =>
              existing.class === entry.class &&
              existing.method === entry.method,
          ),
      );

      // Debugging: Log new entries
      // Insert new entries if any
      if (newEntries.length > 0) {
        const result = await dbMssql('acos').insert(newEntries).returning('*');
        return { success: true, data: result };
      } else {
        return { success: true, message: 'No new ACOS entries to sync.' };
      }
    } catch (error) {
      console.error('Error syncing ACOS:', error);
      return { success: false, message: 'Failed to sync ACOS data.', error };
    }
  }
}
