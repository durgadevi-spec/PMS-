// Debouncing Utility - OPTIMIZATION Phase 5
// Prevents excessive function calls during rapid events (typing, scrolling, etc.)

/**
 * Creates a debounced version of a function that delays execution
 * until after the specified delay has passed without new invocations
 * 
 * @param func - Function to debounce
 * @param delayMs - Delay in milliseconds before executing
 * @returns Debounced function
 * 
 * @example
 * const debouncedSearch = debounce((query) => api.search(query), 500);
 * input.addEventListener('change', () => debouncedSearch(input.value));
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delayMs: number = 300
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    // Clear the previous timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set a new timeout
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Creates a throttled version of a function that only executes
 * at most once every specified delay
 * 
 * @param func - Function to throttle
 * @param delayMs - Minimum delay between executions
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delayMs: number = 300
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delayMs) {
      func(...args);
      lastCall = now;
    } else {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        func(...args);
        lastCall = Date.now();
        timeoutId = null;
      }, delayMs - timeSinceLastCall);
    }
  };
}
