import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  const className = clsx(inputs);

  try {
    return twMerge(className);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("tailwind-merge failed to process class names", {
        className,
        error
      });
    }

    return className;
  }
}
