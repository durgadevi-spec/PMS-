import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, isValid } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatDate = (dateValue?: string | null) => {
  if (!dateValue || dateValue === "—") return "—";
  try {
    const d = parseISO(dateValue);
    if (isValid(d)) {
      return format(d, "dd/MM/yyyy");
    }
    return dateValue;
  } catch {
    return dateValue;
  }
};
