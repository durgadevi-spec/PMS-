/**
 * Data Integrity Validation Helpers
 * Ensures keysteps, tasks, and projects are saved correctly
 */

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export class DataValidator {
  /**
   * Validate project data before save
   */
  static validateProject(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!data.title || !String(data.title).trim()) {
      errors.push({ field: 'title', message: 'Project title is required' });
    }

    if (!data.startDate) {
      errors.push({ field: 'startDate', message: 'Start date is required' });
    }

    if (!data.endDate) {
      errors.push({ field: 'endDate', message: 'End date is required' });
    }

    // Date validation
    if (data.startDate && !this.isValidDate(data.startDate)) {
      errors.push({ field: 'startDate', message: 'Invalid date format', value: data.startDate });
    }

    if (data.endDate && !this.isValidDate(data.endDate)) {
      errors.push({ field: 'endDate', message: 'Invalid date format', value: data.endDate });
    }

    // Date comparison
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (start > end) {
        errors.push({
          field: 'dates',
          message: 'Start date must be before or equal to end date'
        });
      }
    }

    // Progress validation
    if (data.progress !== undefined) {
      const prog = Number(data.progress);
      if (isNaN(prog) || prog < 0 || prog > 100) {
        errors.push({
          field: 'progress',
          message: 'Progress must be a number between 0 and 100'
        });
      }
    }

    // Department validation
    if (Array.isArray(data.department)) {
      const invalidDepts = data.department.filter((d: any) => !d || !String(d).trim());
      if (invalidDepts.length > 0) {
        errors.push({
          field: 'department',
          message: 'All departments must be non-empty strings'
        });
      }
    }

    // Team validation
    if (Array.isArray(data.team)) {
      const invalidTeam = data.team.filter((t: any) => !t || !String(t).trim());
      if (invalidTeam.length > 0) {
        errors.push({
          field: 'team',
          message: 'All team member IDs must be non-empty strings'
        });
      }
    }

    // Vendor validation
    if (Array.isArray(data.vendors)) {
      const invalidVendors = data.vendors.filter((v: any) => !v || !String(v).trim());
      if (invalidVendors.length > 0) {
        errors.push({
          field: 'vendors',
          message: 'All vendor names must be non-empty strings'
        });
      }
    }

    // Hold reason required if project is on hold
    if (String(data.status || '').trim().toLowerCase() === 'on hold') {
      if (!data.holdReason || !String(data.holdReason).trim()) {
        errors.push({
          field: 'holdReason',
          message: 'Hold reason is required when project status is On Hold'
        });
      }
    }

    return errors;
  }

  /**
   * Validate keystep data before save
   */
  static validateKeystep(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!data.projectId) {
      errors.push({ field: 'projectId', message: 'Project ID is required' });
    }

    if (!data.title || !String(data.title).trim()) {
      errors.push({ field: 'title', message: 'Keystep title is required' });
    }





    // Date validation
    if (data.startDate && !this.isValidDate(data.startDate)) {
      errors.push({ field: 'startDate', message: 'Invalid date format', value: data.startDate });
    }

    if (data.endDate && !this.isValidDate(data.endDate)) {
      errors.push({ field: 'endDate', message: 'Invalid date format', value: data.endDate });
    }

    // Date comparison
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (start > end) {
        errors.push({
          field: 'dates',
          message: 'Start date must be before or equal to end date'
        });
      }
    }

    // Phase validation
    if (data.phase !== undefined) {
      const phase = Number(data.phase);
      if (isNaN(phase) || phase < 1) {
        errors.push({
          field: 'phase',
          message: 'Phase must be a positive integer'
        });
      }
    }

    // Status validation
    const validStatuses = ['pending', 'in-progress', 'completed', 'not started'];
    if (data.status && !validStatuses.includes(String(data.status).toLowerCase())) {
      errors.push({
        field: 'status',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    return errors;
  }

  /**
   * Validate task data before save
   */
  static validateTask(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!data.projectId) {
      errors.push({ field: 'projectId', message: 'Project ID is required' });
    }

    if (!data.taskName || !String(data.taskName).trim()) {
      errors.push({ field: 'taskName', message: 'Task name is required' });
    }

    // Date validation (optional but if provided must be valid)
    if (data.startDate && !this.isValidDate(data.startDate)) {
      errors.push({ field: 'startDate', message: 'Invalid date format', value: data.startDate });
    }

    if (data.endDate && !this.isValidDate(data.endDate)) {
      errors.push({ field: 'endDate', message: 'Invalid date format', value: data.endDate });
    }

    // Date comparison
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (start > end) {
        errors.push({
          field: 'dates',
          message: 'Start date must be before or equal to end date'
        });
      }
    }

    // Priority validation
    const validPriorities = ['low', 'medium', 'high'];
    if (data.priority && !validPriorities.includes(String(data.priority).toLowerCase())) {
      errors.push({
        field: 'priority',
        message: `Priority must be one of: ${validPriorities.join(', ')}`
      });
    }

    // Status validation
    const validStatuses = ['pending', 'in-progress', 'completed', 'not started', 'on hold'];
    if (data.status && !validStatuses.includes(String(data.status).toLowerCase())) {
      errors.push({
        field: 'status',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Task members validation
    if (Array.isArray(data.taskMembers)) {
      const invalidMembers = data.taskMembers.filter((m: any) => !m);
      if (invalidMembers.length > 0) {
        errors.push({
          field: 'taskMembers',
          message: 'All task member IDs must be non-empty'
        });
      }
    }

    // Subtasks validation
    if (Array.isArray(data.subtasks)) {
      data.subtasks.forEach((st: any, idx: number) => {
        if (!st.title || !String(st.title).trim()) {
          errors.push({
            field: `subtasks[${idx}].title`,
            message: 'Subtask title is required'
          });
        }

        if (Array.isArray(st.assignedTo)) {
          const invalidAssigned = st.assignedTo.filter((a: any) => !a);
          if (invalidAssigned.length > 0) {
            errors.push({
              field: `subtasks[${idx}].assignedTo`,
              message: 'All assigned employee IDs must be non-empty'
            });
          }
        }
      });
    }

    return errors;
  }

  /**
   * Helper: check if string is valid date
   */
  private static isValidDate(dateString: any): boolean {
    if (!dateString) return false;

    // Check YYYY-MM-DD format
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const date = new Date(dateString);
      return !isNaN(date.getTime());
    }

    // Check if it's a valid Date object or timestamp
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  static formatDate(dateInput: any): string | null {
    if (!dateInput) return null;

    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }

    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }
}

/**
 * Safe database operation wrapper with validation
 */
export async function safeDbOperation<T>(
  operation: () => Promise<T>,
  context: string
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const result = await operation();
    console.log(`✅ [${context}] Operation successful`);
    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ [${context}] Operation failed: ${message}`);
    return { success: false, error: message };
  }
}
